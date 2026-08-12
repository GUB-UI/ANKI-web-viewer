import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/database'
import type { Card, Deck, Note } from '../db/schema'
import {
  countActiveNewByDeck,
  fetchDueCardsByDeck,
  fetchDueCountsByDeck,
  fetchNewCardsByDeck,
} from './cardQueries'

const deck: Deck = {
  id: 'd1',
  name: 'Large',
  path: 'Large',
  newCardsPerDay: 20,
  order: 0,
}
const note: Note = {
  id: 'n1',
  fields: { Front: 'q', Back: 'a' },
  tags: [],
  noteType: 'Basic',
  fieldOrder: ['Front', 'Back'],
}

function makeCard(id: number, partial: Partial<Card>): Card {
  return {
    id: `c${id}`,
    noteId: note.id,
    deckId: deck.id,
    active: 1,
    sortOrder: id,
    templateOrd: 0,
    cardType: 'basic',
    state: 'review',
    due: Date.now() + 86400000,
    stability: 1,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 1,
    learningSteps: 0,
    reps: 1,
    lapses: 0,
    ...partial,
  }
}

beforeEach(async () => {
  db.close()
  await db.delete()
  await db.open()
  await db.decks.put(deck)
  await db.notes.put(note)
})

describe('indexed card queries', () => {
  it('returns only due cards from a 10k-card deck', async () => {
    const now = Date.now()
    const cards = Array.from({ length: 10_000 }, (_, index) =>
      makeCard(index, {
        due: index < 5 ? now - index : now + 86400000 + index,
      }),
    )
    await db.cards.bulkPut(cards)
    const result = await fetchDueCardsByDeck([deck.id], now)
    expect(result.review).toHaveLength(5)
    expect(result.learning).toHaveLength(0)
  })

  it('counts the indexed new pool but fetches only the requested slice', async () => {
    await db.cards.bulkPut(
      Array.from({ length: 1000 }, (_, index) =>
        makeCard(index, { state: 'new', due: 0 }),
      ),
    )
    expect((await countActiveNewByDeck([deck.id])).get(deck.id)).toBe(1000)
    const result = await fetchNewCardsByDeck([deck.id], new Map([[deck.id, 3]]))
    expect(result.get(deck.id)).toHaveLength(3)
    expect(result.get(deck.id)?.map((card) => card.sortOrder)).toEqual([0, 1, 2])
  })

  it('restores a future learning step within the session horizon', async () => {
    const now = Date.now()
    await db.cards.bulkPut([
      makeCard(1, { state: 'learning', due: now + 10 * 60 * 1000 }),
      makeCard(2, { state: 'learning', due: now + 60 * 60 * 1000 }),
    ])

    const result = await fetchDueCardsByDeck(
      [deck.id],
      now,
      now + 25 * 60 * 1000,
    )
    expect(result.learning.map((card) => card.id)).toEqual(['c1'])

    const counts = await fetchDueCountsByDeck(
      [deck.id],
      now,
      now + 25 * 60 * 1000,
    )
    expect(counts.get(deck.id)?.learning).toBe(1)
  })
})
