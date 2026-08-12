import Dexie from 'dexie'
import { db } from '../db/database'
import type { Card, CardState, DeckCounts } from '../db/schema'

const DUE_STATES: CardState[] = ['learning', 'relearning', 'review']

function dueRange(deckId: string, state: CardState, now: number) {
  return db.cards
    .where('[deckId+active+state+due]')
    .between(
      [deckId, 1, state, Dexie.minKey],
      [deckId, 1, state, now],
      true,
      true,
    )
}

export async function fetchDueCardsByDeck(
  deckIds: string[],
  now = Date.now(),
): Promise<{ learning: Card[]; review: Card[] }> {
  const rows = await Promise.all(
    deckIds.flatMap((deckId) =>
      DUE_STATES.map((state) => dueRange(deckId, state, now).toArray()),
    ),
  )
  const cards = rows.flat()
  const learning = cards
    .filter((card) => card.state === 'learning' || card.state === 'relearning')
    .sort((a, b) => a.due - b.due)
  const review = cards
    .filter((card) => card.state === 'review')
    .sort((a, b) => a.due - b.due)
  return { learning, review }
}

export async function fetchDueCountsByDeck(
  deckIds: string[],
  now = Date.now(),
): Promise<Map<string, DeckCounts>> {
  const result = new Map<string, DeckCounts>()
  await Promise.all(
    deckIds.map(async (deckId) => {
      const [learning, relearning, review] = await Promise.all([
        dueRange(deckId, 'learning', now).count(),
        dueRange(deckId, 'relearning', now).count(),
        dueRange(deckId, 'review', now).count(),
      ])
      result.set(deckId, {
        new: 0,
        learning: learning + relearning,
        review,
      })
    }),
  )
  return result
}

export async function countActiveNewByDeck(
  deckIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  await Promise.all(
    deckIds.map(async (deckId) => {
      const count = await db.cards
        .where('[deckId+active+state]')
        .equals([deckId, 1, 'new'])
        .count()
      result.set(deckId, count)
    }),
  )
  return result
}

export async function fetchNewCardsByDeck(
  deckIds: string[],
  maxByDeck: Map<string, number>,
): Promise<Map<string, Card[]>> {
  const result = new Map<string, Card[]>()
  await Promise.all(
    deckIds.map(async (deckId) => {
      const limit = Math.max(0, Math.floor(maxByDeck.get(deckId) ?? 0))
      if (limit === 0) {
        result.set(deckId, [])
        return
      }
      const cards = await db.cards
        .where('[deckId+active+state+sortOrder]')
        .between(
          [deckId, 1, 'new', Dexie.minKey],
          [deckId, 1, 'new', Dexie.maxKey],
          true,
          true,
        )
        .limit(limit)
        .toArray()
      result.set(deckId, cards)
    }),
  )
  return result
}
