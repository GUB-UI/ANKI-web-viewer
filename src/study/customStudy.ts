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
  await db.dailyOverrides.put({
    id: `${date}_${deckId}`,
    date,
    deckId,
    newCardsLimit,
  })
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
    .where('[rating+source+reviewedAt]')
    .between(
      [1, 'normal', cutoff],
      [1, 'normal', Date.now()],
      true,
      true,
    )
    .toArray()

  const uniqueIds = [...new Set(logs.map((log) => log.cardId))]
  const cards = await db.cards.bulkGet(uniqueIds)
  const cardSet = new Set(
    cards
      .filter((card): card is Card => card != null)
      .filter((card) => card.active === 1 && deckIds.has(card.deckId))
      .map((card) => card.id),
  )

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
  deckId: string,
  rating: RatingValue,
): Promise<void> {
  await db.reviewLogs.add({
    id: createId('rev'),
    cardId,
    deckId,
    reviewedAt: Date.now(),
    rating,
    source: 'custom',
  })
}
