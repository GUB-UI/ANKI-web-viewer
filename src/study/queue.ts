import { db } from '../db/database'
import type { Card, Deck, DeckCounts } from '../db/schema'
import {
  countActiveNewByDeck,
  fetchDueCardsByDeck,
  fetchDueCountsByDeck,
  fetchNewCardsByDeck,
} from './cardQueries'
import {
  loadDailyNewContext,
  selectNewCardsForStudyRoot,
  subtreeIds,
} from './dailyNew'
import { computeDeckCounts } from './deckTree'

/** Keep near-term learning steps available when a study session is reopened. */
export const LEARNING_RESTORE_WINDOW_MS = 25 * 60 * 1000

export async function buildStudyQueue(rootDeckId: string): Promise<{
  cards: Card[]
  deckIds: string[]
}> {
  const decks = await db.decks.toArray()
  const dailyNew = await loadDailyNewContext(Date.now(), decks)
  const deckIds = subtreeIds(rootDeckId, dailyNew)
  const now = Date.now()

  const [{ learning, review }, newByDeck] = await Promise.all([
    fetchDueCardsByDeck(deckIds, now, now + LEARNING_RESTORE_WINDOW_MS),
    fetchNewCardsByDeck(deckIds, dailyNew.remainingByDeck),
  ])
  const newCards = selectNewCardsForStudyRoot(rootDeckId, newByDeck, dailyNew)

  // Intraday learning first, followed by due review and then bounded new cards.
  const cards = [...learning, ...review, ...newCards]
  return { cards, deckIds }
}

export async function snapshotHomeState(now = Date.now()): Promise<{
  decks: Deck[]
  counts: Map<string, DeckCounts>
  today: { new: number; review: number }
}> {
  const decks = await db.decks.toArray()
  const deckIds = decks.map((deck) => deck.id)
  const dailyNew = await loadDailyNewContext(now, decks)
  const [dueByDeck, availableNewByDeck] = await Promise.all([
    fetchDueCountsByDeck(deckIds, now, now + LEARNING_RESTORE_WINDOW_MS),
    countActiveNewByDeck(deckIds),
  ])
  const counts = computeDeckCounts(decks, dueByDeck, availableNewByDeck, dailyNew)
  const today = decks
    .filter((deck) => !deck.parentId)
    .reduce(
      (total, root) => {
        const count = counts.get(root.id)
        if (count) {
          total.new += count.new
          total.review += count.review + count.learning
        }
        return total
      },
      { new: 0, review: 0 },
    )
  return { decks, counts, today }
}
