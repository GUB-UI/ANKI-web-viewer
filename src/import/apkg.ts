import JSZip from 'jszip'
import { db } from '../db/database'
import type { Card, Deck, Note, ReviewLog } from '../db/schema'
import { applyFsrsDefaults, fromAnkiScheduling } from '../scheduler/fsrs'
import { extractClozeIndices } from '../utils/cloze'
import { createId } from '../utils/id'
import { guessMimeType, isSupportedMedia } from '../utils/mediaRefs'
import {
  openAnkiDb,
  parseDconfNewLimits,
  parseDecks,
  parseModels,
  queryAll,
  queryOne,
  renderAnkiTemplate,
  type AnkiDeckInfo,
  type AnkiModel,
} from './ankiSqlite'
import { parseAnkiCardMemory } from './cardData'
import { openModernApkg } from './modernApkg'

export interface ImportProgress {
  phase: 'unzip' | 'cards' | 'media' | 'done' | 'error'
  cardsDone: number
  cardsTotal: number
  mediaDone: number
  mediaTotal: number
  message?: string
  errorDetail?: string
}

export interface ImportResult {
  cards: number
  decks: number
  media: number
  notes: number
  warnings: string[]
}

export class ImportError extends Error {
  detail: string
  constructor(message: string, detail = '') {
    super(message)
    this.name = 'ImportError'
    this.detail = detail
  }
}

function buildDeckHierarchy(
  ankiDecks: Map<string, { id: string; name: string; newPerDay: number }>,
  defaultNew: number,
): { decks: Deck[]; ankiIdToOurs: Map<string, string> } {
  const paths = [...ankiDecks.values()]
    .map((d) => d.name)
    .filter((n) => n !== '')
    .sort((a, b) => a.localeCompare(b))

  // Ensure intermediate parents exist
  const pathSet = new Set<string>()
  for (const path of paths) {
    const parts = path.split('::')
    for (let i = 0; i < parts.length; i++) {
      pathSet.add(parts.slice(0, i + 1).join('::'))
    }
  }

  const pathToId = new Map<string, string>()
  const decks: Deck[] = []
  let order = 0
  const sortedPaths = [...pathSet].sort(
    (a, b) => a.split('::').length - b.split('::').length || a.localeCompare(b),
  )

  for (const path of sortedPaths) {
    const parts = path.split('::')
    const name = parts[parts.length - 1]!
    const parentPath = parts.slice(0, -1).join('::')
    const id = createId('deck')
    pathToId.set(path, id)
    const anki = [...ankiDecks.values()].find((d) => d.name === path)
    decks.push({
      id,
      name,
      path,
      parentId: parentPath ? pathToId.get(parentPath) : undefined,
      newCardsPerDay: anki?.newPerDay ?? defaultNew,
      order: order++,
    })
  }

  const ankiIdToOurs = new Map<string, string>()
  for (const [ankiId, info] of ankiDecks) {
    const ours = pathToId.get(info.name)
    if (ours) ankiIdToOurs.set(ankiId, ours)
  }

  return { decks, ankiIdToOurs }
}

function detectNoteType(model: AnkiModel): {
  noteType: string
  cardType: Card['cardType']
} {
  const name = model.name.toLowerCase()
  if (model.type === 1 || name.includes('cloze')) {
    return { noteType: model.name, cardType: 'cloze' }
  }
  if (name.includes('basic') && (name.includes('reverse') || name.includes('reversed'))) {
    return { noteType: model.name, cardType: 'basic-reverse' }
  }
  if (name.includes('basic')) {
    return { noteType: model.name, cardType: 'basic' }
  }
  return { noteType: model.name, cardType: 'other' }
}

interface ImportSource {
  crt: number
  models: Map<string, AnkiModel>
  ankiDecks: Map<string, AnkiDeckInfo>
  noteRows: Record<string, unknown>[]
  cardRows: Record<string, unknown>[]
  revlogRows: Record<string, unknown>[]
  mediaEntries: {
    filename: string
    bytes: () => Promise<Uint8Array>
  }[]
  warnings: string[]
  close(): Promise<void>
}

async function openImportSource(file: File | Blob, zip: JSZip): Promise<ImportSource> {
  // Modern exports include a dummy collection.anki2; always prefer the real anki21b.
  if (zip.file('collection.anki21b')) {
    const modern = await openModernApkg(file)
    return {
      crt: modern.crt,
      models: modern.models,
      ankiDecks: modern.decks,
      noteRows: modern.noteRows,
      cardRows: modern.cardRows,
      revlogRows: modern.revlogRows,
      mediaEntries: modern.mediaFilenames
        .filter(isSupportedMedia)
        .map((filename) => ({
          filename,
          bytes: () => modern.getMediaFile(filename),
        })),
      warnings: modern.warnings,
      close: modern.cleanup,
    }
  }

  const collectionName =
    ['collection.anki21', 'collection.anki2'].find((name) => zip.file(name)) ?? null
  if (!collectionName) {
    throw new ImportError(
      '対応するAnkiコレクションが見つかりません。',
      `見つかったファイル: ${Object.keys(zip.files).slice(0, 20).join(', ')}`,
    )
  }

  const dbBytes = await zip.file(collectionName)!.async('uint8array')
  const ankiDb = await openAnkiDb(dbBytes)
  try {
    const col = queryOne(ankiDb, 'SELECT ver, models, decks, dconf, crt FROM col')
    if (!col) throw new ImportError('コレクション情報が空です。')

    const models = parseModels(String(col.models))
    const ankiDecks = parseDecks(String(col.decks))
    const dconfLimits = parseDconfNewLimits(
      col.dconf != null ? String(col.dconf) : undefined,
    )
    for (const deck of ankiDecks.values()) {
      deck.newPerDay = dconfLimits.get(deck.configId) ?? 20
    }

    let revlogRows: Record<string, unknown>[] = []
    try {
      revlogRows = queryAll(
        ankiDb,
        'SELECT id, cid, ease, ivl, lastIvl, time, type FROM revlog ORDER BY id ASC',
      )
    } catch {
      // Revlog is optional in some exported shared decks.
    }

    let mediaMap: Record<string, string> = {}
    const mediaFile = zip.file('media')
    if (mediaFile) {
      try {
        mediaMap = JSON.parse(await mediaFile.async('string')) as Record<string, string>
      } catch {
        mediaMap = {}
      }
    }

    return {
      crt: Number(col.crt ?? 0),
      models,
      ankiDecks,
      noteRows: queryAll(ankiDb, 'SELECT id, mid, tags, flds FROM notes'),
      cardRows: queryAll(
        ankiDb,
        'SELECT id, nid, did, ord, type, queue, due, ivl, reps, lapses, odid, data FROM cards',
      ),
      revlogRows,
      mediaEntries: Object.entries(mediaMap)
        .filter(([, filename]) => isSupportedMedia(filename))
        .flatMap(([zipName, filename]) => {
          const entry = zip.file(zipName)
          return entry
            ? [{ filename, bytes: () => entry.async('uint8array') }]
            : []
        }),
      warnings: [],
      close: async () => {
        ankiDb.close()
      },
    }
  } catch (error) {
    ankiDb.close()
    throw error
  }
}

export async function importApkg(
  file: File | Blob,
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const report = (p: Partial<ImportProgress> & Pick<ImportProgress, 'phase'>) => {
    onProgress?.({
      cardsDone: 0,
      cardsTotal: 0,
      mediaDone: 0,
      mediaTotal: 0,
      ...p,
    })
  }

  report({ phase: 'unzip', message: 'ZIPを展開中...' })

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch (e) {
    throw new ImportError(
      'ZIPとして読み込めませんでした。',
      e instanceof Error ? e.message : String(e),
    )
  }

  let source: ImportSource
  try {
    source = await openImportSource(file, zip)
  } catch (error) {
    if (error instanceof ImportError) throw error
    throw new ImportError(
      'Ankiコレクションを開けませんでした。',
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    )
  }

  try {
    const { decks, ankiIdToOurs } = buildDeckHierarchy(source.ankiDecks, 20)
    if (decks.length === 0) {
      throw new ImportError('取り込めるデッキがありません。')
    }
    const { models, noteRows, cardRows, revlogRows } = source

    report({
      phase: 'cards',
      cardsTotal: cardRows.length,
      message: 'カードを変換中...',
    })

    const notes: Note[] = []
    const noteIdMap = new Map<string, string>()
    const noteById = new Map<string, Note>()
    const noteMidByOurs = new Map<string, string>()

    for (const row of noteRows) {
      const mid = String(row.mid)
      const model = models.get(mid)
      const fieldNames = model?.fields ?? ['Front', 'Back']
      const flds = String(row.flds ?? '').split('\x1f')
      const fields: Record<string, string> = {}
      fieldNames.forEach((name, i) => {
        fields[name] = flds[i] ?? ''
      })
      // preserve extras
      for (let i = fieldNames.length; i < flds.length; i++) {
        fields[`Field${i + 1}`] = flds[i] ?? ''
      }

      const { noteType } = model
        ? detectNoteType(model)
        : { noteType: 'Unknown' }
      const id = createId('note')
      noteIdMap.set(String(row.id), id)
      noteMidByOurs.set(id, mid)
      const note: Note = {
        id,
        fields,
        tags: String(row.tags ?? '')
          .split(' ')
          .map((t) => t.trim())
          .filter(Boolean),
        noteType,
        fieldOrder: Object.keys(fields),
      }
      notes.push(note)
      noteById.set(id, note)
    }

    const cards: Card[] = []
    const ankiCardIdMap = new Map<string, string>()
    const cardsPerDeck = new Map<string, number>()

    for (let i = 0; i < cardRows.length; i++) {
      const row = cardRows[i]!
      const noteOurs = noteIdMap.get(String(row.nid))
      if (!noteOurs) continue
      const note = noteById.get(noteOurs)!
      const model = models.get(noteMidByOurs.get(noteOurs) ?? '')
      const { cardType } = model
        ? detectNoteType(model)
        : { cardType: 'other' as const }

      const originalDeckId = Number(row.odid ?? 0) > 0 ? row.odid : row.did
      const deckOurs =
        ankiIdToOurs.get(String(originalDeckId)) ??
        decks[0]?.id ??
        createId('deck')
      const ord = Number(row.ord ?? 0)
      const queue = Number(row.queue ?? 0)
      const memory = parseAnkiCardMemory(row.data)
      const scheduling = fromAnkiScheduling({
        type: Number(row.type ?? 0),
        queue,
        due: Number(row.due ?? 0),
        ivl: Number(row.ivl ?? 0),
        reps: Number(row.reps ?? 0),
        lapses: Number(row.lapses ?? 0),
        crt: source.crt || undefined,
        stability: memory.stability,
        difficulty: memory.difficulty,
        lastReviewTime: memory.lastReviewTime,
      })

      let clozeIndex: number | undefined
      let front: string | undefined
      let back: string | undefined

      if (cardType === 'cloze') {
        const text = note.fields.Text ?? note.fields[note.fieldOrder[0]!] ?? ''
        const indices = extractClozeIndices(text)
        clozeIndex = indices[ord] ?? ord + 1
      } else if (model?.templates[ord]) {
        const tmpl = model.templates[ord]!
        front = renderAnkiTemplate(tmpl.qfmt, note.fields)
        // Kioku keeps the question on screen above the answer, so {{FrontSide}}
        // would render it a second time.
        back = renderAnkiTemplate(tmpl.afmt, {
          ...note.fields,
          FrontSide: '',
        })
      }

      const id = createId('card')
      ankiCardIdMap.set(String(row.id), id)
      cards.push({
        id,
        noteId: noteOurs,
        deckId: deckOurs,
        active: queue < 0 ? 0 : 1,
        sortOrder:
          memory.position ??
          (Number(row.type ?? 0) === 0 ? Number(row.due ?? i) : i),
        templateOrd: ord,
        cardType,
        clozeIndex,
        front,
        back,
        ...applyFsrsDefaults(scheduling),
      })
      cardsPerDeck.set(deckOurs, (cardsPerDeck.get(deckOurs) ?? 0) + 1)

      if (i % 200 === 0 || i === cardRows.length - 1) {
        report({
          phase: 'cards',
          cardsDone: i + 1,
          cardsTotal: cardRows.length,
        })
      }
    }

    const deckByCardId = new Map(cards.map((card) => [card.id, card.deckId]))
    const reviews: ReviewLog[] = []
    for (const row of revlogRows) {
      const cardId = ankiCardIdMap.get(String(row.cid))
      if (!cardId) continue
      const ease = Number(row.ease ?? 0)
      const reviewType = Number(row.type ?? 0)
      // Manual/rescheduling rows and ease=0 are not learning answers.
      if (ease < 1 || ease > 4 || reviewType === 4 || reviewType === 5) continue
      const rating = ease as 1 | 2 | 3 | 4
      // revlog id is timestamp in milliseconds historically
      const reviewedAt = Number(row.id)
      reviews.push({
        id: createId('rev'),
        cardId,
        deckId: deckByCardId.get(cardId),
        reviewedAt: reviewedAt > 1e12 ? reviewedAt : reviewedAt * 1000,
        rating,
        source: 'normal',
        scheduledDays: Math.abs(Number(row.ivl ?? 0)),
        elapsedDays: Math.abs(Number(row.lastIvl ?? 0)),
      })
    }

    report({
      phase: 'media',
      cardsDone: cards.length,
      cardsTotal: cards.length,
      mediaTotal: source.mediaEntries.length,
      message: 'メディアを取り込み中...',
    })

    const mediaRows: {
      id: string
      filename: string
      mimeType: string
      blob: Blob
    }[] = []

    for (let i = 0; i < source.mediaEntries.length; i++) {
      const { filename, bytes } = source.mediaEntries[i]!
      const buf = await bytes()
      const mimeType = guessMimeType(filename)
      mediaRows.push({
        id: createId('media'),
        filename,
        mimeType,
        blob: new Blob([buf.slice()], { type: mimeType }),
      })
      if (i % 50 === 0 || i === source.mediaEntries.length - 1) {
        report({
          phase: 'media',
          cardsDone: cards.length,
          cardsTotal: cards.length,
          mediaDone: i + 1,
          mediaTotal: source.mediaEntries.length,
        })
      }
    }

    // Keep empty leaf decks only if they sit on a path that has cards
    const keepDeckIds = new Set<string>()
    const deckById = new Map(decks.map((deck) => [deck.id, deck]))
    for (const deck of decks) {
      if ((cardsPerDeck.get(deck.id) ?? 0) > 0) {
        let cur: Deck | undefined = deck
        while (cur) {
          keepDeckIds.add(cur.id)
          cur = cur.parentId ? deckById.get(cur.parentId) : undefined
        }
      }
    }
    const decksToSave = decks.filter((d) => keepDeckIds.has(d.id))
    const usedNoteIds = new Set(cards.map((card) => card.noteId))
    const notesToSave = notes.filter((note) => usedNoteIds.has(note.id))

    // Persist — merge decks by path if already exist
    await db.transaction(
      'rw',
      [db.decks, db.notes, db.cards, db.reviewLogs, db.media],
      async () => {
        const existingDecks = await db.decks.toArray()
        const pathToExisting = new Map(existingDecks.map((d) => [d.path, d.id]))
        const deckIdRemap = new Map<string, string>()

        for (const deck of decksToSave) {
          const existingId = pathToExisting.get(deck.path)
          if (existingId) {
            deckIdRemap.set(deck.id, existingId)
          } else {
            // remap parent too
            if (deck.parentId && deckIdRemap.has(deck.parentId)) {
              deck.parentId = deckIdRemap.get(deck.parentId)
            } else if (deck.parentId) {
              const parentDeck = decks.find((d) => d.id === deck.parentId)
              if (parentDeck && pathToExisting.has(parentDeck.path)) {
                deck.parentId = pathToExisting.get(parentDeck.path)
              }
            }
            await db.decks.put(deck)
            pathToExisting.set(deck.path, deck.id)
          }
        }

        const remapDeck = (id: string) => deckIdRemap.get(id) ?? id

        await db.notes.bulkPut(notesToSave)
        await db.cards.bulkPut(
          cards.map((c) => ({ ...c, deckId: remapDeck(c.deckId) })),
        )
        if (reviews.length) {
          // chunk large revlogs
          const chunk = 1000
          for (let i = 0; i < reviews.length; i += chunk) {
            await db.reviewLogs.bulkPut(
              reviews.slice(i, i + chunk).map((review) => ({
                ...review,
                deckId: review.deckId ? remapDeck(review.deckId) : undefined,
              })),
            )
          }
        }
        if (mediaRows.length) {
          // replace same filename
          for (const m of mediaRows) {
            const old = await db.media.where('filename').equals(m.filename).first()
            if (old) await db.media.delete(old.id)
          }
          await db.media.bulkPut(mediaRows)
        }
      },
    )

    report({
      phase: 'done',
      cardsDone: cards.length,
      cardsTotal: cards.length,
      mediaDone: mediaRows.length,
      mediaTotal: mediaRows.length,
      message: 'Import完了',
    })

    return {
      cards: cards.length,
      decks: decksToSave.length,
      media: mediaRows.length,
      notes: notesToSave.length,
      warnings: source.warnings,
    }
  } catch (e) {
    if (e instanceof ImportError) throw e
    throw new ImportError(
      'Import中にエラーが発生しました。',
      e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    )
  } finally {
    await source.close()
  }
}
