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
  it('does not put a not-yet-due Again card ahead of due reviews', () => {
    const now = Date.now()
    const updated = card({
      id: 'learn',
      state: 'learning',
      due: now + 5 * 60 * 1000,
    })
    const rest = [
      card({ id: 'a', state: 'review', due: now }),
      card({ id: 'b', state: 'new', due: 0 }),
    ]
    expect(continueQueue(rest, updated, 'normal', now).map((item) => item.id)).toEqual(
      ['a', 'b', 'learn'],
    )
  })

  it('inserts an already-due learning card among other due learning', () => {
    const now = Date.now()
    const updated = card({
      id: 'now',
      state: 'learning',
      due: now - 1000,
    })
    const rest = [
      card({ id: 'soon', state: 'learning', due: now + 60 * 1000 }),
      card({ id: 'rev', state: 'review', due: now }),
    ]
    expect(continueQueue(rest, updated, 'normal', now).map((item) => item.id)).toEqual(
      ['now', 'rev', 'soon'],
    )
  })

  it('ends the session when only a future learning card remains', () => {
    const now = Date.now()
    const updated = card({
      id: 'learn',
      state: 'learning',
      due: now + 10 * 60 * 1000,
    })
    expect(continueQueue([], updated, 'normal', now)).toEqual([])
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
