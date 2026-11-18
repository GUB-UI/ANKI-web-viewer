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
): Promise<Card | null> {
  const duration = capDurationMs(durationMs)
  if (source === 'custom') {
    await recordCustomReview(card.id, card.deckId, rating, duration)
    return card
  }

  return db.transaction('rw', db.cards, db.reviewLogs, async () => {
    const current = await db.cards.get(card.id)
    if (
      !current ||
      !current.active ||
      current.reps !== card.reps ||
      current.lastReview !== card.lastReview ||
      current.due !== card.due ||
      current.state !== card.state
    ) {
      return null
    }

    const { next, scheduledDays, elapsedDays } = scheduleCard(current, rating)
    const updated = { ...current, ...next }
    await db.cards.put(updated)
    await db.reviewLogs.add({
      id: createId('rev'),
      cardId: card.id,
      deckId: current.deckId,
      reviewedAt: Date.now(),
      rating,
      source: 'normal',
      scheduledDays,
      elapsedDays,
      stateBefore: current.state,
      durationMs: duration,
      intervalBefore: current.scheduledDays,
    })
    return updated
  })
}
