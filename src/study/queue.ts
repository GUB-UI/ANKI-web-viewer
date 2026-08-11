import { db, ensureSettings } from '../db/database'
import type { Card, Deck } from '../db/schema'
import { todayKey } from '../utils/dates'
import { collectDescendantIds } from './deckTree'

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
  const deckIds = collectDescendantIds(rootDeckId, decks)
  const now = Date.now()

  const allCards = await db.cards.where('deckId').anyOf(deckIds).toArray()

  const learning: Card[] = []
  const review: Card[] = []
  const newsByDeck = new Map<string, Card[]>()

  for (const card of allCards) {
    if (card.state === 'learning' || card.state === 'relearning') {
      if (card.due <= now) learning.push(card)
    } else if (card.state === 'review' && card.due <= now) {
      review.push(card)
    } else if (card.state === 'new') {
      const list = newsByDeck.get(card.deckId) ?? []
      list.push(card)
      newsByDeck.set(card.deckId, list)
    }
  }

  learning.sort((a, b) => a.due - b.due)
  review.sort((a, b) => a.due - b.due)

  const newCards: Card[] = []
  for (const deckId of deckIds) {
    const limit = await getEffectiveNewLimit(deckId)
    const list = (newsByDeck.get(deckId) ?? []).sort((a, b) =>
      a.id.localeCompare(b.id),
    )
    newCards.push(...list.slice(0, limit))
  }

  // Interleave: learning first, then mix review/new (review priority)
  const cards = [...learning, ...review, ...newCards]
  return { cards, deckIds }
}

export async function getTodayTotals(): Promise<{ new: number; review: number }> {
  const decks = await db.decks.toArray()
  const cards = await db.cards.toArray()
  const now = Date.now()
  let review = 0
  const newByDeck = new Map<string, number>()

  for (const card of cards) {
    if (
      (card.state === 'learning' || card.state === 'relearning' || card.state === 'review') &&
      card.due <= now
    ) {
      review += 1
    } else if (card.state === 'new') {
      newByDeck.set(card.deckId, (newByDeck.get(card.deckId) ?? 0) + 1)
    }
  }

  let newCount = 0
  for (const deck of decks) {
    const available = newByDeck.get(deck.id) ?? 0
    const limit = await getEffectiveNewLimit(deck.id, deck)
    newCount += Math.min(available, limit)
  }

  return { new: newCount, review }
}
