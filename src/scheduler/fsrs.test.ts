import { describe, expect, it } from 'vitest'
import { applyFsrsDefaults, fromAnkiScheduling, scheduleCard } from './fsrs'
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
})
