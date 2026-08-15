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

function insertByDue(cards: Card[], updated: Card): Card[] {
  const insertAt = cards.findIndex((card) => card.due > updated.due)
  if (insertAt === -1) return [...cards, updated]
  return [...cards.slice(0, insertAt), updated, ...cards.slice(insertAt)]
}

/**
 * After a rating, keep a still-learning card in this session only if it
 * is due again within the restore window. Cards that are not due yet go
 * behind already-due reviews/new — they must not jump to the front.
 * If nothing else remains and the card is not due yet, end the session
 * (reopen within 25 minutes to continue).
 */
export function continueQueue(
  remaining: Card[],
  updated: Card,
  source: ReviewSource,
  now = Date.now(),
): Card[] {
  const rest = remaining.filter((card) => card.id !== updated.id)
  if (source !== 'normal' || !stillDueThisSession(updated, now)) return rest

  const dueNow = rest.filter((card) => !(isLearning(card) && card.due > now))
  const later = rest.filter((card) => isLearning(card) && card.due > now)

  if (updated.due <= now) {
    const learning = dueNow.filter((card) => isLearning(card))
    const tail = dueNow.filter((card) => !isLearning(card))
    return [...insertByDue(learning, updated), ...tail, ...later]
  }

  if (rest.length === 0) return rest
  return [...dueNow, ...insertByDue(later, updated)]
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
