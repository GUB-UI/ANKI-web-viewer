import type { Card, DeckCounts, RatingValue, ReviewSource } from '../db/schema'
import { previewRatings } from '../scheduler/fsrs'
import { loadCustomQueue } from './customStudy'
import { buildStudyQueue } from './queue'
import { answerCard } from './review'

const EMPTY_PREVIEWS: Record<RatingValue, { label: string; due: number }> = {
  1: { label: '—', due: 0 },
  2: { label: '—', due: 0 },
  3: { label: '—', due: 0 },
  4: { label: '—', due: 0 },
}

/**
 * Rated cards leave this session. Same-session reappearance would make
 * Again / Hard look like successful recall. Reopen later to continue
 * cards that have become due.
 */
export function continueQueue(remaining: Card[], updated: Card): Card[] {
  return remaining.filter((card) => card.id !== updated.id)
}

export async function loadStudyCards(
  deckId: string,
  source: ReviewSource,
): Promise<Card[]> {
  if (source === 'custom') return loadCustomQueue(deckId)
  const { cards } = await buildStudyQueue(deckId)
  return cards
}

export async function applyRating(
  card: Card,
  rating: RatingValue,
  source: ReviewSource,
  queue: Card[],
  durationMs?: number,
): Promise<{ updated: Card; remaining: Card[] }> {
  const updated = await answerCard(card, rating, source, durationMs)
  return {
    updated,
    remaining: continueQueue(queue, updated),
  }
}

export function ratingPreviews(
  card: Card | null,
  source: ReviewSource,
): Record<RatingValue, { label: string; due: number }> {
  if (!card || source === 'custom') return EMPTY_PREVIEWS
  return previewRatings(card)
}

/** Counts the not-yet-answered queue, including the current card. */
export function remainingCounts(cards: Card[]): DeckCounts {
  const counts: DeckCounts = { new: 0, review: 0, learning: 0 }
  for (const item of cards) {
    if (item.state === 'new') counts.new += 1
    else if (item.state === 'learning' || item.state === 'relearning') {
      counts.learning += 1
    } else counts.review += 1
  }
  return counts
}
