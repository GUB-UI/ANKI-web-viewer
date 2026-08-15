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
  it('removes the rated card even when it is due again soon', () => {
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
    expect(continueQueue([...rest, updated], updated).map((item) => item.id)).toEqual(
      ['a', 'b'],
    )
  })

  it('does not reinsert an already-due learning card', () => {
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
    expect(continueQueue(rest, updated).map((item) => item.id)).toEqual(['soon', 'rev'])
  })

  it('ends the session when only the rated card remains', () => {
    const updated = card({
      id: 'learn',
      state: 'learning',
      due: Date.now() + 10 * 60 * 1000,
    })
    expect(continueQueue([updated], updated)).toEqual([])
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
