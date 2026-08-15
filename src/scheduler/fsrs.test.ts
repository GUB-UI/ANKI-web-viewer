import { describe, expect, it } from 'vitest'
import {
  applyFsrsDefaults,
  fromAnkiScheduling,
  scheduleCard,
  cardRetrievability,
  previewRatings,
  MIN_LEARNING_DUE_MS,
} from './fsrs'
import type { Card } from '../db/schema'

function makeCard(partial: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    noteId: 'n1',
    deckId: 'd1',
    active: 1,
    sortOrder: 0,
    templateOrd: 0,
    cardType: 'basic',
    ...applyFsrsDefaults(),
    ...partial,
  }
}

describe('fsrs scheduler', () => {
  it('schedules normal review and advances due', () => {
    const card = makeCard({ state: 'new' })
    const { next } = scheduleCard(card, 3)
    expect(next.reps).toBeGreaterThanOrEqual(1)
    expect(next.due).toBeGreaterThan(Date.now() - 1000)
  })

  it('preserves review due from Anki crt + due days', () => {
    const crt = Math.floor(Date.UTC(2026, 0, 1) / 1000)
    const dueDays = 40
    const scheduled = fromAnkiScheduling({
      type: 2,
      queue: 2,
      due: dueDays,
      ivl: 10,
      reps: 5,
      lapses: 0,
      crt,
    })
    expect(scheduled.state).toBe('review')
    expect(scheduled.due).toBe(crt * 1000 + dueDays * 86400000)
  })

  it('preserves imported FSRS memory and day-learning due date', () => {
    const crt = Math.floor(Date.UTC(2026, 0, 1) / 1000)
    const scheduled = fromAnkiScheduling({
      type: 1,
      queue: 3,
      due: 2,
      ivl: -600,
      reps: 2,
      lapses: 0,
      crt,
      stability: 4.5,
      difficulty: 6.2,
      lastReviewTime: crt + 60,
    })
    expect(scheduled.state).toBe('learning')
    expect(scheduled.due).toBe(crt * 1000 + 2 * 86400000)
    expect(scheduled.stability).toBe(4.5)
    expect(scheduled.difficulty).toBe(6.2)
    expect(scheduled.lastReview).toBe((crt + 60) * 1000)
  })

  it('keeps learning Again/Hard at least 15 minutes on new cards', () => {
    const now = new Date('2026-08-15T12:00:00Z')
    const card = makeCard({ state: 'new' })
    const labels = previewRatings(card, now)
    expect(labels[1].label).toBe('15m')
    expect(labels[2].label).toBe('23m')
    expect(labels[4].label).toBe('8d')

    const again = scheduleCard(card, 1, now)
    expect(again.next.state).toBe('learning')
    expect(again.next.due).toBeGreaterThanOrEqual(now.getTime() + MIN_LEARNING_DUE_MS)

    const reviewAgain = scheduleCard(
      makeCard({
        state: 'review',
        stability: 10,
        difficulty: 5,
        lastReview: now.getTime() - 86400000,
        elapsedDays: 1,
        scheduledDays: 10,
      }),
      1,
      now,
    )
    expect(reviewAgain.next.state).toBe('relearning')
    expect(reviewAgain.next.due).toBeGreaterThanOrEqual(now.getTime() + MIN_LEARNING_DUE_MS)
  })

  it('returns retrievability for a reviewed card', () => {
    const reviewed = makeCard({
      state: 'review',
      stability: 10,
      difficulty: 5,
      lastReview: Date.now() - 86400000,
      elapsedDays: 1,
      scheduledDays: 10,
    })
    const r = cardRetrievability(reviewed)
    expect(r).toBeGreaterThan(0)
    expect(r).toBeLessThanOrEqual(1)
    expect(cardRetrievability(makeCard({ state: 'new' }))).toBeNull()
  })
})
