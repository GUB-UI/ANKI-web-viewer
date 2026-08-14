import type { Card, DeckCounts, RatingValue, ReviewSource } from '../db/schema'
import { previewRatings } from '../scheduler/fsrs'
import { loadCustomQueue } from './customStudy'
import { buildStudyQueue, LEARNING_RESTORE_WINDOW_MS } from './queue'
import { answerCard } from './review'

const EMPTY_PREVIEWS: Record<RatingValue, { label: string; due: number }> = {
  1: { label: '—', due: 0 },
  2: { label: '—', due: 0 },
  3: { label: '—', due: 0 },
  4: { label: '—', due: 0 },
}

function isLearning(card: Card): boolean {
  return card.state === 'learning' || card.state === 'relearning'
}

function stillDueThisSession(card: Card, now: number): boolean {
  return isLearning(card) && card.due <= now + LEARNING_RESTORE_WINDOW_MS
}

/** Rebuild the remaining queue after a rating. Keeps learning cards first. */
export function continueQueue(
  remaining: Card[],
  updated: Card,
  source: ReviewSource,
  now = Date.now(),
): Card[] {
  const rest = remaining.filter((card) => card.id !== updated.id)
  if (source !== 'normal' || !stillDueThisSession(updated, now)) return rest

  const learning: Card[] = []
  const tail: Card[] = []
  for (const card of rest) {
    if (isLearning(card)) learning.push(card)
    else tail.push(card)
  }
  const insertAt = learning.findIndex((card) => card.due > updated.due)
  if (insertAt === -1) learning.push(updated)
  else learning.splice(insertAt, 0, updated)
  return [...learning, ...tail]
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
