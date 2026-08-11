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
  }
}

export const db = new KiokuDB()

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'settings',
  newCardsPerDay: 20,
  swipeEnabled: true,
  theme: 'system',
}

export async function ensureSettings(): Promise<AppSettings> {
  const existing = await db.settings.get('settings')
  if (existing) return existing
  await db.settings.put(DEFAULT_SETTINGS)
  return DEFAULT_SETTINGS
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
