import { describe, expect, it } from 'vitest'
import { applyFsrsDefaults } from '../scheduler/fsrs'
import type { Card } from '../db/schema'
import { continueQueue, remainingCounts } from './session'

function card(partial: Partial<Card>): Card {
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

describe('continueQueue', () => {
  it('reinserts a near-term learning card after a normal rating', () => {
    const updated = card({
      id: 'learn',
      state: 'learning',
      due: Date.now() + 5 * 60 * 1000,
    })
    const rest = [
      card({ id: 'a', state: 'review', due: Date.now() }),
      card({ id: 'b', state: 'new', due: 0 }),
    ]
    const next = continueQueue(rest, updated, 'normal')
    expect(next.map((item) => item.id)).toEqual(['learn', 'a', 'b'])
  })

  it('keeps reinserted learning cards ahead of review and new', () => {
    const now = Date.now()
    const updated = card({
      id: 'later',
      state: 'learning',
      due: now + 10 * 60 * 1000,
    })
    const rest = [
      card({ id: 'soon', state: 'learning', due: now + 60 * 1000 }),
      card({ id: 'rev', state: 'review', due: now }),
    ]
    expect(continueQueue(rest, updated, 'normal', now).map((item) => item.id)).toEqual(
      ['soon', 'later', 'rev'],
    )
  })

  it('does not reinsert after a custom rating', () => {
    const updated = card({
      id: 'learn',
      state: 'learning',
      due: Date.now() + 5 * 60 * 1000,
    })
    const rest = [card({ id: 'a', state: 'review', due: Date.now() })]
    expect(continueQueue(rest, updated, 'custom').map((item) => item.id)).toEqual(
      ['a'],
    )
  })
})

describe('remainingCounts', () => {
  it('counts every card still in the session queue', () => {
    const queue = [
      card({ id: '1', state: 'review' }),
      card({ id: '2', state: 'new' }),
      card({ id: '3', state: 'learning' }),
    ]
    expect(remainingCounts(queue)).toEqual({
      new: 1,
      review: 1,
      learning: 1,
    })
  })
})
