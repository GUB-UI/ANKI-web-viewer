import JSZip from 'jszip'
import { db } from '../db/database'
import type {
  AppSettings,
  Card,
  DailyOverride,
  Deck,
  MediaFile,
  Note,
  ReviewLog,
} from '../db/schema'

export type RestoreErrorCode =
  | 'INVALID_ZIP'
  | 'MISSING_ENTRY'
  | 'INVALID_FORMAT'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_DATA'
  | 'MISSING_MEDIA'
  | 'QUOTA_EXCEEDED'
  | 'RESTORE_IN_PROGRESS'
  | 'COMMIT_FAILED'

export class RestoreError extends Error {
  code: RestoreErrorCode

  constructor(
    code: RestoreErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'RestoreError'
    this.code = code
  }
}

interface BackupPayload {
  decks: Deck[]
  notes: Note[]
  cards: Card[]
  reviews: ReviewLog[]
  settings: AppSettings
  dailyOverrides: DailyOverride[]
  media: MediaFile[]
  estimatedBytes: number
}

let restoreInProgress = false

function fail(code: RestoreErrorCode, message: string): never {
  throw new RestoreError(code, message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

async function readJson(zip: JSZip, path: string): Promise<unknown> {
  const entry = zip.file(path)
  if (!entry) fail('MISSING_ENTRY', `${path} がバックアップにありません。`)
  try {
    return JSON.parse(await entry.async('string')) as unknown
  } catch {
    fail('INVALID_FORMAT', `${path} が壊れています。`)
  }
}

function requireArray<T>(value: unknown, path: string): T[] {
  if (!Array.isArray(value)) fail('INVALID_DATA', `${path} は配列ではありません。`)
  return value as T[]
}

function uniqueIds(rows: { id: string }[], path: string): Set<string> {
  const ids = new Set<string>()
  for (const row of rows) {
    if (!isRecord(row) || typeof row.id !== 'string' || row.id === '') {
      fail('INVALID_DATA', `${path} に不正なIDがあります。`)
    }
    if (ids.has(row.id)) fail('INVALID_DATA', `${path} に重複ID ${row.id} があります。`)
    ids.add(row.id)
  }
  return ids
}

async function parseAndValidate(zip: JSZip): Promise<BackupPayload> {
  const [metaRaw, decksRaw, notesRaw, cardsRaw, reviewsRaw, settingsRaw, mediaRaw] =
    await Promise.all([
      readJson(zip, 'backup.json'),
      readJson(zip, 'decks.json'),
      readJson(zip, 'notes.json'),
      readJson(zip, 'cards.json'),
      readJson(zip, 'reviews.json'),
      readJson(zip, 'settings.json'),
      readJson(zip, 'media-index.json'),
    ])

  if (!isRecord(metaRaw) || metaRaw.app !== 'kioku') {
    fail('INVALID_FORMAT', 'Kiokuのバックアップではありません。')
  }
  if (metaRaw.version !== 1) {
    fail(
      'UNSUPPORTED_VERSION',
      `未対応のバックアップバージョンです: ${String(metaRaw.version)}`,
    )
  }

  const decks = requireArray<Deck>(decksRaw, 'decks.json')
  const notes = requireArray<Note>(notesRaw, 'notes.json')
  const rawCards = requireArray<Card>(cardsRaw, 'cards.json')
  const reviews = requireArray<ReviewLog>(reviewsRaw, 'reviews.json')
  const mediaIndex = requireArray<{ id: string; filename: string; mimeType: string }>(
    mediaRaw,
    'media-index.json',
  )
  if (!isRecord(settingsRaw) || !isRecord(settingsRaw.settings)) {
    fail('INVALID_DATA', 'settings.json に設定がありません。')
  }
  const settings = settingsRaw.settings as unknown as AppSettings
  const dailyOverrides = requireArray<DailyOverride>(
    settingsRaw.dailyOverrides,
    'settings.json.dailyOverrides',
  )

  const deckIds = uniqueIds(decks, 'decks.json')
  const noteIds = uniqueIds(notes, 'notes.json')
  for (const note of notes) {
    if (
      !isRecord(note.fields) ||
      !Array.isArray(note.tags) ||
      !Array.isArray(note.fieldOrder) ||
      typeof note.noteType !== 'string'
    ) {
      fail('INVALID_DATA', `ノート ${note.id} の構造が不正です。`)
    }
  }
  const cards = rawCards.map((card, index) => ({
    ...card,
    active: card.active === 0 ? 0 : 1,
    sortOrder: Number.isFinite(card.sortOrder) ? card.sortOrder : index,
    learningSteps: Number.isFinite(card.learningSteps) ? card.learningSteps : 0,
  })) as Card[]
  const cardIds = uniqueIds(cards, 'cards.json')
  const deckByCard = new Map(cards.map((card) => [card.id, card.deckId]))
  uniqueIds(reviews, 'reviews.json')
  uniqueIds(dailyOverrides, 'settings.json.dailyOverrides')
  uniqueIds(mediaIndex, 'media-index.json')

  for (const deck of decks) {
    if (
      typeof deck.name !== 'string' ||
      typeof deck.path !== 'string' ||
      !Number.isFinite(deck.order) ||
      (deck.parentId && !deckIds.has(deck.parentId))
    ) {
      fail('INVALID_DATA', `デッキ ${deck.id} の構造が不正です。`)
    }
  }
  const parentByDeck = new Map(decks.map((deck) => [deck.id, deck.parentId]))
  for (const deck of decks) {
    const visited = new Set<string>()
    let current: string | undefined = deck.id
    while (current) {
      if (visited.has(current)) {
        fail('INVALID_DATA', `デッキ ${deck.id} の階層が循環しています。`)
      }
      visited.add(current)
      current = parentByDeck.get(current)
    }
  }
  for (const card of cards) {
    if (
      !noteIds.has(card.noteId) ||
      !deckIds.has(card.deckId) ||
      !['new', 'learning', 'review', 'relearning'].includes(card.state) ||
      !Number.isFinite(card.due) ||
      !Number.isFinite(card.sortOrder) ||
      ![0, 1].includes(card.active)
    ) {
      fail('INVALID_DATA', `カード ${card.id} の参照または学習状態が不正です。`)
    }
  }
  for (const review of reviews) {
    if (
      !cardIds.has(review.cardId) ||
      ![1, 2, 3, 4].includes(review.rating) ||
      !['normal', 'custom'].includes(review.source) ||
      !Number.isFinite(review.reviewedAt)
    ) {
      fail('INVALID_DATA', `復習履歴 ${review.id} が不正です。`)
    }
    review.deckId ??= deckByCard.get(review.cardId)
  }
  for (const override of dailyOverrides) {
    if (
      !deckIds.has(override.deckId) ||
      typeof override.date !== 'string' ||
      !Number.isFinite(override.newCardsLimit) ||
      override.newCardsLimit < 0
    ) {
      fail('INVALID_DATA', `日次上限 ${override.id} が不正です。`)
    }
  }
  if (
    settings.id !== 'settings' ||
    !Number.isFinite(settings.newCardsPerDay) ||
    typeof settings.swipeEnabled !== 'boolean' ||
    !['system', 'light', 'dark'].includes(settings.theme)
  ) {
    fail('INVALID_DATA', '設定内容が不正です。')
  }
  // Older backups omit auto-flip fields — fill defaults rather than reject.
  if (typeof settings.autoFlipEnabled !== 'boolean') {
    settings.autoFlipEnabled = false
  }
  if (
    !Number.isFinite(settings.autoFlipSeconds) ||
    settings.autoFlipSeconds < 1 ||
    settings.autoFlipSeconds > 60
  ) {
    settings.autoFlipSeconds = 5
  } else {
    settings.autoFlipSeconds = Math.round(settings.autoFlipSeconds)
  }

  const filenameSet = new Set<string>()
  const media: MediaFile[] = []
  let estimatedBytes =
    new TextEncoder().encode(
      JSON.stringify({ decks, notes, cards, reviews, settings, dailyOverrides }),
    ).byteLength
  for (const item of mediaIndex) {
    if (
      typeof item.filename !== 'string' ||
      item.filename === '' ||
      typeof item.mimeType !== 'string' ||
      filenameSet.has(item.filename)
    ) {
      fail('INVALID_DATA', `メディア索引 ${item.id} が不正または重複しています。`)
    }
    filenameSet.add(item.filename)
    const entry = zip.file(`media/${item.id}`)
    if (!entry) fail('MISSING_MEDIA', `メディア ${item.filename} がありません。`)
    const bytes = await entry.async('arraybuffer')
    estimatedBytes += bytes.byteLength
    media.push({
      id: item.id,
      filename: item.filename,
      mimeType: item.mimeType,
      blob: new Blob([bytes], { type: item.mimeType }),
    })
  }

  return {
    decks,
    notes,
    cards,
    reviews,
    settings: { ...settings, id: 'settings' },
    dailyOverrides,
    media,
    estimatedBytes,
  }
}

async function assertStorageAvailable(estimatedBytes: number): Promise<void> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.storage?.estimate
  ) {
    return
  }
  const { usage = 0, quota = 0 } = await navigator.storage.estimate()
  if (quota > 0 && estimatedBytes * 1.1 > quota - usage) {
    fail(
      'QUOTA_EXCEEDED',
      '端末の空き容量が不足しています。空き容量を増やしてから再試行してください。',
    )
  }
}

async function commitPayload(payload: BackupPayload): Promise<void> {
  const tables = [
    db.decks,
    db.notes,
    db.cards,
    db.reviewLogs,
    db.media,
    db.settings,
    db.dailyOverrides,
  ]

  await db.transaction('rw', tables, async () => {
    // Clear and write in the same IndexedDB transaction: any failure rolls back both.
    await Promise.all(tables.map((table) => table.clear()))
    if (payload.decks.length) await db.decks.bulkPut(payload.decks)
    if (payload.notes.length) await db.notes.bulkPut(payload.notes)
    if (payload.cards.length) await db.cards.bulkPut(payload.cards)
    for (let index = 0; index < payload.reviews.length; index += 1000) {
      await db.reviewLogs.bulkPut(payload.reviews.slice(index, index + 1000))
    }
    await db.settings.put(payload.settings)
    if (payload.dailyOverrides.length) {
      await db.dailyOverrides.bulkPut(payload.dailyOverrides)
    }
    for (let index = 0; index < payload.media.length; index += 50) {
      await db.media.bulkPut(payload.media.slice(index, index + 50))
    }
  })
}

export async function restoreBackup(file: File | Blob): Promise<void> {
  if (restoreInProgress) {
    fail('RESTORE_IN_PROGRESS', '別の復元処理が実行中です。')
  }
  restoreInProgress = true
  try {
    let zip: JSZip
    try {
      zip = await JSZip.loadAsync(new Uint8Array(await file.arrayBuffer()))
    } catch {
      fail('INVALID_ZIP', 'ZIPとして読み込めませんでした。')
    }

    const payload = await parseAndValidate(zip)
    await assertStorageAvailable(payload.estimatedBytes)
    try {
      await commitPayload(payload)
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === 'QuotaExceededError' || error.name === 'UnknownError')
      ) {
        fail(
          'QUOTA_EXCEEDED',
          '端末の空き容量が不足しています。元のデータは変更されていません。',
        )
      }
      throw new RestoreError(
        'COMMIT_FAILED',
        `復元に失敗しました。元のデータは変更されていません。${
          error instanceof Error ? ` (${error.message})` : ''
        }`,
      )
    }
  } finally {
    restoreInProgress = false
  }
}
