import { capDurationMs } from '../db/reviewFields'
import { db } from '../db/database'
import type { Card, RatingValue, ReviewSource } from '../db/schema'
import { scheduleCard } from '../scheduler/fsrs'
import { createId } from '../utils/id'
import { recordCustomReview } from './customStudy'

export async function answerCard(
  card: Card,
  rating: RatingValue,
  source: ReviewSource,
  durationMs?: number,
): Promise<Card> {
  const duration = capDurationMs(durationMs)
  if (source === 'custom') {
    await recordCustomReview(card.id, card.deckId, rating, duration)
    return card
  }

  const { next, scheduledDays, elapsedDays } = scheduleCard(card, rating)
  const updated: Card = { ...card, ...next }

  await db.transaction('rw', db.cards, db.reviewLogs, async () => {
    await db.cards.put(updated)
    await db.reviewLogs.add({
      id: createId('rev'),
      cardId: card.id,
      deckId: card.deckId,
      reviewedAt: Date.now(),
      rating,
      source: 'normal',
      scheduledDays,
      elapsedDays,
      stateBefore: card.state,
      durationMs: duration,
      intervalBefore: card.scheduledDays,
    })
  })

  return updated
}
