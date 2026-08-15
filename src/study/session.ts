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
 * Anki requeues still-learning cards and, if they would appear immediately,
 * places them after the next card (`requeue_learning_entry`). Waiting out
 * the stored 15m due in-session is impractical, so Again/Hard come back
 * after a few review cards instead.
 */
export const LEARNING_REQUEUE_REVIEW_GAP = 3

function isLearning(card: Card): boolean {
  return card.state === 'learning' || card.state === 'relearning'
}

function insertAfterReviewGap(rest: Card[], updated: Card, gap: number): Card[] {
  let reviewsSeen = 0
  let lastReview = -1
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].state !== 'review') continue
    reviewsSeen += 1
    lastReview = i
    if (reviewsSeen >= gap) {
      return [...rest.slice(0, i + 1), updated, ...rest.slice(i + 1)]
    }
  }
  if (lastReview >= 0) {
    return [...rest.slice(0, lastReview + 1), updated, ...rest.slice(lastReview + 1)]
  }
  if (rest.length === 0) return []
  const skip = Math.min(gap, rest.length)
  return [...rest.slice(0, skip), updated, ...rest.slice(skip)]
}

export function continueQueue(
  remaining: Card[],
  updated: Card,
  source: ReviewSource,
): Card[] {
  const rest = remaining.filter((card) => card.id !== updated.id)
  if (source !== 'normal' || !isLearning(updated)) return rest
  return insertAfterReviewGap(rest, updated, LEARNING_REQUEUE_REVIEW_GAP)
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
    remaining: continueQueue(queue, updated, source),
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
