import { db, ensureSettings } from '../db/database'
import type { Card, Deck } from '../db/schema'
import { todayKey } from '../utils/dates'
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

export async function getEffectiveNewLimit(deckId: string, deck?: Deck): Promise<number> {
  const d = deck ?? (await db.decks.get(deckId))
  const settings = await ensureSettings()
  const override = await db.dailyOverrides
    .where('[date+deckId]')
    .equals([todayKey(), deckId])
    .first()

  if (override) return override.newCardsLimit
  if (d?.newCardsPerDay != null) return d.newCardsPerDay
  return settings.newCardsPerDay
}

export async function buildStudyQueue(rootDeckId: string): Promise<{
  cards: Card[]
  deckIds: string[]
}> {
  const decks = await db.decks.toArray()
  const dailyNew = await loadDailyNewContext(Date.now(), decks)
  const deckIds = subtreeIds(rootDeckId, dailyNew)
  const now = Date.now()

  const [{ learning, review }, newByDeck] = await Promise.all([
    fetchDueCardsByDeck(deckIds, now),
    fetchNewCardsByDeck(deckIds, dailyNew.remainingByDeck),
  ])
  const newCards = selectNewCardsForStudyRoot(rootDeckId, newByDeck, dailyNew)

  // Intraday learning first, followed by due review and then bounded new cards.
  const cards = [...learning, ...review, ...newCards]
  return { cards, deckIds }
}

export async function getTodayTotals(): Promise<{ new: number; review: number }> {
  const decks = await db.decks.toArray()
  const now = Date.now()
  const deckIds = decks.map((deck) => deck.id)
  const dailyNew = await loadDailyNewContext(now, decks)
  const [dueByDeck, availableNewByDeck] = await Promise.all([
    fetchDueCountsByDeck(deckIds, now),
    countActiveNewByDeck(deckIds),
  ])
  const counts = computeDeckCounts(decks, dueByDeck, availableNewByDeck, dailyNew)
  const roots = decks.filter((deck) => !deck.parentId)
  return roots.reduce(
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
}
