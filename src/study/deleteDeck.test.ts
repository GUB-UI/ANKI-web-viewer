import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/database'
import type { Card, Deck, Note, ReviewLog } from '../db/schema'
import { deleteDeck } from './deleteDeck'

const parent: Deck = {
  id: 'en',
  name: '英語',
  path: '英語',
  newCardsPerDay: 20,
  order: 0,
}
const child: Deck = {
  id: 'tg',
  name: 'ターゲット',
  path: '英語::ターゲット',
  parentId: 'en',
  newCardsPerDay: 20,
  order: 0,
}
const other: Deck = {
  id: 'jp',
  name: '国語',
  path: '国語',
  newCardsPerDay: 20,
  order: 1,
}

function note(id: string, front: string): Note {
  return {
    id,
    fields: { Front: front, Back: '意味' },
    tags: [],
    noteType: 'Basic',
    fieldOrder: ['Front', 'Back'],
  }
}

function card(
  id: string,
  deckId: string,
  noteId: string,
  extra: Partial<Card> = {},
): Card {
  return {
    id,
    noteId,
    deckId,
    active: 1,
    sortOrder: 0,
    templateOrd: 0,
    cardType: 'basic',
    state: 'review',
    due: 1,
    stability: 1,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 1,
    learningSteps: 0,
    reps: 1,
    lapses: 0,
    ...extra,
  }
}

function log(id: string, cardId: string, deckId?: string): ReviewLog {
  return {
    id,
    cardId,
    deckId,
    reviewedAt: 1,
    rating: 3,
    source: 'normal',
  }
}

beforeEach(async () => {
  db.close()
  await db.delete()
  await db.open()
  await db.decks.bulkPut([parent, child, other])
  await db.notes.bulkPut([
    note('n-child', '<img src="Gone.PNG">'),
    note('n-shared', '<img src="keep.png">'),
    note('n-other', '[sound:other.mp3]'),
  ])
  await db.cards.bulkPut([
    card('c-child', 'tg', 'n-child', { front: '<img src="card-only.jpg">' }),
    card('c-shared-child', 'tg', 'n-shared'),
    card('c-shared-other', 'jp', 'n-shared'),
    card('c-other', 'jp', 'n-other'),
  ])
  await db.reviewLogs.bulkPut([
    log('r-child', 'c-child', 'tg'),
    log('r-legacy', 'c-child'),
    log('r-other', 'c-other', 'jp'),
  ])
  await db.dailyOverrides.bulkPut([
    { id: '2026-10-30_tg', date: '2026-10-30', deckId: 'tg', newCardsLimit: 5 },
    { id: '2026-10-30_jp', date: '2026-10-30', deckId: 'jp', newCardsLimit: 8 },
  ])
  await db.media.bulkPut([
    {
      id: 'm-gone',
      filename: 'gone.png',
      mimeType: 'image/png',
      blob: new Blob(['gone']),
    },
    {
      id: 'm-card',
      filename: 'card-only.jpg',
      mimeType: 'image/jpeg',
      blob: new Blob(['card']),
    },
    {
      id: 'm-keep',
      filename: 'Keep.PNG',
      mimeType: 'image/png',
      blob: new Blob(['keep']),
    },
    {
      id: 'm-other',
      filename: 'other.mp3',
      mimeType: 'audio/mpeg',
      blob: new Blob(['other']),
    },
  ])
})

describe('deleteDeck', () => {
  it('removes a subdeck and leaves sibling data in place', async () => {
    await expect(deleteDeck('tg')).resolves.toEqual({
      decks: 1,
      cards: 2,
      notes: 1,
    })

    expect((await db.decks.toArray()).map((deck) => deck.id).sort()).toEqual([
      'en',
      'jp',
    ])
    expect((await db.cards.toArray()).map((item) => item.id).sort()).toEqual([
      'c-other',
      'c-shared-other',
    ])
    expect(await db.notes.get('n-child')).toBeUndefined()
    expect(await db.notes.get('n-shared')).toBeDefined()
    expect(await db.reviewLogs.get('r-child')).toBeUndefined()
    expect(await db.reviewLogs.get('r-legacy')).toBeUndefined()
    expect(await db.reviewLogs.get('r-other')).toBeDefined()
    expect(await db.dailyOverrides.get('2026-10-30_tg')).toBeUndefined()
    expect(await db.dailyOverrides.get('2026-10-30_jp')).toBeDefined()
    expect(await db.media.get('m-gone')).toBeUndefined()
    expect(await db.media.get('m-card')).toBeUndefined()
    expect(await db.media.get('m-keep')).toBeDefined()
    expect(await db.media.get('m-other')).toBeDefined()
  })

  it('removes a parent together with its subdecks', async () => {
    const result = await deleteDeck('en')
    expect(result.decks).toBe(2)
    expect((await db.decks.toArray()).map((deck) => deck.id)).toEqual(['jp'])
    expect(await db.cards.get('c-child')).toBeUndefined()
    expect(await db.cards.get('c-shared-child')).toBeUndefined()
    expect(await db.cards.get('c-other')).toBeDefined()
    expect(await db.notes.get('n-shared')).toBeDefined()
  })

  it('does nothing when the deck is already gone', async () => {
    await expect(deleteDeck('missing')).resolves.toEqual({
      decks: 0,
      cards: 0,
      notes: 0,
    })
    expect(await db.decks.count()).toBe(3)
    expect(await db.cards.count()).toBe(4)
  })
})
