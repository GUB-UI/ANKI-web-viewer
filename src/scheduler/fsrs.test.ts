import { describe, expect, it } from 'vitest'
import { applyFsrsDefaults, fromAnkiScheduling, scheduleCard } from './fsrs'
import type { Card } from '../db/schema'

function makeCard(partial: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    noteId: 'n1',
    deckId: 'd1',
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
    expect(scheduled.due).toBe((crt + dueDays) * 86400000)
  })
})
