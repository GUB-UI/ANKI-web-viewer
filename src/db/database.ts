import Dexie, { type EntityTable } from 'dexie'
import type {
  AppSettings,
  Card,
  DailyOverride,
  Deck,
  MediaFile,
  Note,
  ReviewLog,
} from './schema'

export class KiokuDB extends Dexie {
  decks!: EntityTable<Deck, 'id'>
  notes!: EntityTable<Note, 'id'>
  cards!: EntityTable<Card, 'id'>
  reviewLogs!: EntityTable<ReviewLog, 'id'>
  media!: EntityTable<MediaFile, 'id'>
  settings!: EntityTable<AppSettings, 'id'>
  dailyOverrides!: EntityTable<DailyOverride, 'id'>

  constructor() {
    super('kioku')
    this.version(1).stores({
      decks: 'id, parentId, path, order',
      notes: 'id, noteType',
      cards: 'id, noteId, deckId, state, due, [deckId+state], [deckId+due]',
      reviewLogs: 'id, cardId, reviewedAt, rating, source, [rating+source+reviewedAt]',
      media: 'id, filename',
      settings: 'id',
      dailyOverrides: 'id, date, deckId, [date+deckId]',
    })

    this.version(2)
      .stores({
        decks: 'id, parentId, path, order',
        notes: 'id, noteType',
        cards:
          'id, noteId, deckId, active, state, due, [deckId+active+state], ' +
          '[active+state+due], [deckId+active+state+due], ' +
          '[deckId+active+state+sortOrder]',
        reviewLogs:
          'id, cardId, deckId, reviewedAt, rating, source, stateBefore, ' +
          '[rating+source+reviewedAt], [stateBefore+reviewedAt], ' +
          '[deckId+stateBefore+reviewedAt]',
        media: 'id, filename',
        settings: 'id',
        dailyOverrides: 'id, date, deckId, [date+deckId]',
      })
      .upgrade(async (transaction) => {
        let sortOrder = 0
        await transaction
          .table<Card>('cards')
          .toCollection()
          .modify((card) => {
            card.active ??= 1
            card.sortOrder ??= sortOrder++
          })

        const cards = await transaction.table<Card>('cards').toArray()
        const deckByCard = new Map(cards.map((card) => [card.id, card.deckId]))
        await transaction
          .table<ReviewLog>('reviewLogs')
          .toCollection()
          .modify((log) => {
            log.deckId ??= deckByCard.get(log.cardId)
          })
      })

    this.version(3).stores({
      decks: 'id, parentId, path, order',
      notes: 'id, noteType',
      cards:
        'id, noteId, deckId, active, state, due, [deckId+active+state], ' +
        '[active+state+due], [deckId+active+state+due], ' +
        '[deckId+active+state+sortOrder]',
      reviewLogs:
        'id, cardId, deckId, reviewedAt, rating, source, stateBefore, ' +
        '[rating+source+reviewedAt], [stateBefore+reviewedAt], ' +
        '[deckId+stateBefore+reviewedAt], [deckId+reviewedAt]',
      media: 'id, filename',
      settings: 'id',
      dailyOverrides: 'id, date, deckId, [date+deckId]',
    })
  }
}

export const db = new KiokuDB()

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'settings',
  newCardsPerDay: 20,
  swipeEnabled: true,
  autoFlipEnabled: false,
  autoFlipSeconds: 5,
  theme: 'system',
}

export async function ensureSettings(): Promise<AppSettings> {
  const existing = await db.settings.get('settings')
  if (!existing) {
    await db.settings.put(DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  }
  const merged: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...existing,
    autoFlipEnabled: existing.autoFlipEnabled ?? DEFAULT_SETTINGS.autoFlipEnabled,
    autoFlipSeconds: clampAutoFlipSeconds(
      existing.autoFlipSeconds ?? DEFAULT_SETTINGS.autoFlipSeconds,
    ),
  }
  if (
    existing.autoFlipEnabled == null ||
    existing.autoFlipSeconds == null ||
    existing.autoFlipSeconds !== merged.autoFlipSeconds
  ) {
    await db.settings.put(merged)
  }
  return merged
}

function clampAutoFlipSeconds(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.autoFlipSeconds
  return Math.min(60, Math.max(1, Math.round(value)))
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      return await navigator.storage.persist()
    }
  } catch {
    // ignore
  }
  return false
}

export async function clearAllData(): Promise<void> {
  await Promise.all([
    db.decks.clear(),
    db.notes.clear(),
    db.cards.clear(),
    db.reviewLogs.clear(),
    db.media.clear(),
    db.dailyOverrides.clear(),
  ])
  await db.settings.put(DEFAULT_SETTINGS)
}
