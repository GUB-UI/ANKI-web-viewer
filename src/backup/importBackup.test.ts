import JSZip from 'jszip'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, ensureSettings } from '../db/database'
import type { Card, Deck, Note } from '../db/schema'
import { RestoreError, restoreBackup } from './importBackup'

const oldDeck: Deck = {
  id: 'old-deck',
  name: 'Old',
  path: 'Old',
  newCardsPerDay: 20,
  order: 0,
}
const oldNote: Note = {
  id: 'old-note',
  fields: { Front: 'old', Back: 'data' },
  tags: [],
  noteType: 'Basic',
  fieldOrder: ['Front', 'Back'],
}
const oldCard: Card = {
  id: 'old-card',
  noteId: oldNote.id,
  deckId: oldDeck.id,
  active: 1,
  sortOrder: 0,
  templateOrd: 0,
  cardType: 'basic',
  state: 'new',
  due: 0,
  stability: 0,
  difficulty: 0,
  elapsedDays: 0,
  scheduledDays: 0,
  learningSteps: 0,
  reps: 0,
  lapses: 0,
}

async function seedOldData() {
  await db.decks.put(oldDeck)
  await db.notes.put(oldNote)
  await db.cards.put(oldCard)
}

async function makeBackup(options?: {
  omit?: string
  mediaWithoutBlob?: boolean
}): Promise<Blob> {
  const zip = new JSZip()
  const nextDeck = { ...oldDeck, id: 'new-deck', name: 'New', path: 'New' }
  const nextNote = { ...oldNote, id: 'new-note' }
  const nextCard = {
    ...oldCard,
    id: 'new-card',
    noteId: nextNote.id,
    deckId: nextDeck.id,
  }
  const entries: Record<string, string> = {
    'backup.json': JSON.stringify({ app: 'kioku', version: 1, exportedAt: Date.now() }),
    'decks.json': JSON.stringify([nextDeck]),
    'notes.json': JSON.stringify([nextNote]),
    'cards.json': JSON.stringify([nextCard]),
    'reviews.json': JSON.stringify([]),
    'settings.json': JSON.stringify({
      settings: {
        id: 'settings',
        newCardsPerDay: 20,
        swipeEnabled: true,
        theme: 'system',
      },
      dailyOverrides: [],
    }),
    'media-index.json': JSON.stringify(
      options?.mediaWithoutBlob
        ? [{ id: 'm1', filename: 'image.png', mimeType: 'image/png' }]
        : [],
    ),
  }
  for (const [path, value] of Object.entries(entries)) {
    if (path !== options?.omit) zip.file(path, value)
  }
  return zip.generateAsync({ type: 'blob' })
}

beforeEach(async () => {
  vi.restoreAllMocks()
  db.close()
  await db.delete()
  await db.open()
  await ensureSettings()
  await seedOldData()
})

describe('restoreBackup', () => {
  it('validates every required entry before changing current data', async () => {
    await expect(restoreBackup(await makeBackup({ omit: 'cards.json' }))).rejects.toMatchObject({
      code: 'MISSING_ENTRY',
    } satisfies Partial<RestoreError>)
    expect(await db.decks.get(oldDeck.id)).toBeDefined()
    expect(await db.cards.get(oldCard.id)).toBeDefined()
  })

  it('rejects a missing media blob without changing current data', async () => {
    await expect(
      restoreBackup(await makeBackup({ mediaWithoutBlob: true })),
    ).rejects.toMatchObject({ code: 'MISSING_MEDIA' } satisfies Partial<RestoreError>)
    expect(await db.decks.get(oldDeck.id)).toBeDefined()
  })

  it('atomically replaces all tables after validation', async () => {
    await restoreBackup(await makeBackup())
    expect(await db.decks.get(oldDeck.id)).toBeUndefined()
    expect(await db.decks.get('new-deck')).toBeDefined()
    expect(await db.cards.get('new-card')).toBeDefined()
  })

  it('rolls back clears when a write fails', async () => {
    vi.spyOn(db.cards, 'bulkPut').mockRejectedValueOnce(new Error('write failed'))
    await expect(restoreBackup(await makeBackup())).rejects.toMatchObject({
      code: 'COMMIT_FAILED',
    } satisfies Partial<RestoreError>)
    expect(await db.decks.get(oldDeck.id)).toBeDefined()
    expect(await db.cards.get(oldCard.id)).toBeDefined()
  })
})
