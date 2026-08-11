import { db } from '../db/database'
import type { Card, RatingValue } from '../db/schema'
import { daysAgoMs, todayKey } from '../utils/dates'
import { createId } from '../utils/id'
import { collectDescendantIds } from './deckTree'

export async function setDailyNewOverride(
  deckId: string,
  newCardsLimit: number,
): Promise<void> {
  const date = todayKey()
  const id = `${date}_${deckId}`
  await db.dailyOverrides.put({ id, date, deckId, newCardsLimit })
}

export async function getDailyNewOverride(
  deckId: string,
): Promise<number | undefined> {
  const row = await db.dailyOverrides
    .where('[date+deckId]')
    .equals([todayKey(), deckId])
    .first()
  return row?.newCardsLimit
}

export async function countFailedCards(
  rootDeckId: string,
  days: number,
): Promise<{ count: number; againCounts: Map<string, number> }> {
  const decks = await db.decks.toArray()
  const deckIds = new Set(collectDescendantIds(rootDeckId, decks))
  const cutoff = daysAgoMs(days)

  const logs = await db.reviewLogs
    .where('reviewedAt')
    .aboveOrEqual(cutoff)
    .filter(
      (log) =>
        log.rating === 1 &&
        log.source === 'normal' &&
        log.reviewedAt >= cutoff,
    )
    .toArray()

  const cards = await db.cards.where('deckId').anyOf([...deckIds]).toArray()
  const cardSet = new Set(cards.map((c) => c.id))

  const againCounts = new Map<string, number>()
  for (const log of logs) {
    if (!cardSet.has(log.cardId)) continue
    againCounts.set(log.cardId, (againCounts.get(log.cardId) ?? 0) + 1)
  }

  return { count: againCounts.size, againCounts }
}

export async function buildFailedCardsQueue(
  rootDeckId: string,
  days: number,
): Promise<Card[]> {
  const { againCounts } = await countFailedCards(rootDeckId, days)
  const ids = [...againCounts.keys()]
  if (ids.length === 0) return []
  const cards = await db.cards.bulkGet(ids)
  return cards.filter((c): c is Card => c != null)
}

export async function recordCustomReview(
  cardId: string,
  rating: RatingValue,
): Promise<void> {
  await db.reviewLogs.add({
    id: createId('rev'),
    cardId,
    reviewedAt: Date.now(),
    rating,
    source: 'custom',
  })
}
