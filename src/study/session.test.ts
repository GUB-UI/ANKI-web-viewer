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
  it('puts an Again card after three reviews, not next and not at the end', () => {
    const now = Date.now()
    const updated = card({
      id: 'again',
      state: 'learning',
      due: now + 15 * 60 * 1000,
    })
    const rest = [
      card({ id: 'l1', state: 'learning', due: now }),
      card({ id: 'r1', state: 'review', due: now }),
      card({ id: 'r2', state: 'review', due: now }),
      card({ id: 'r3', state: 'review', due: now }),
      card({ id: 'r4', state: 'review', due: now }),
      card({ id: 'n1', state: 'new', due: 0 }),
    ]
    expect(continueQueue([...rest, updated], updated, 'normal').map((item) => item.id)).toEqual(
      ['l1', 'r1', 'r2', 'r3', 'again', 'r4', 'n1'],
    )
  })

  it('sits after the last review when fewer than three remain', () => {
    const now = Date.now()
    const updated = card({
      id: 'again',
      state: 'relearning',
      due: now + 15 * 60 * 1000,
    })
    const rest = [
      card({ id: 'r1', state: 'review', due: now }),
      card({ id: 'r2', state: 'review', due: now }),
      card({ id: 'n1', state: 'new', due: 0 }),
    ]
    expect(continueQueue(rest, updated, 'normal').map((item) => item.id)).toEqual(
      ['r1', 'r2', 'again', 'n1'],
    )
  })

  it('skips a few remaining cards when there are no reviews', () => {
    const now = Date.now()
    const updated = card({
      id: 'again',
      state: 'learning',
      due: now + 15 * 60 * 1000,
    })
    const rest = [
      card({ id: 'n1', state: 'new', due: 0 }),
      card({ id: 'n2', state: 'new', due: 0 }),
      card({ id: 'n3', state: 'new', due: 0 }),
    ]
    expect(continueQueue(rest, updated, 'normal').map((item) => item.id)).toEqual(
      ['n1', 'n2', 'n3', 'again'],
    )
  })

  it('ends the session when only the rated card remains', () => {
    const updated = card({
      id: 'learn',
      state: 'learning',
      due: Date.now() + 15 * 60 * 1000,
    })
    expect(continueQueue([updated], updated, 'normal')).toEqual([])
  })

  it('does not reinsert after a custom rating or a graduated card', () => {
    const now = Date.now()
    const learning = card({
      id: 'learn',
      state: 'learning',
      due: now + 15 * 60 * 1000,
    })
    const graduated = card({
      id: 'done',
      state: 'review',
      due: now + 8 * 86400000,
    })
    const rest = [card({ id: 'r1', state: 'review', due: now })]
    expect(continueQueue(rest, learning, 'custom').map((item) => item.id)).toEqual(['r1'])
    expect(continueQueue(rest, graduated, 'normal').map((item) => item.id)).toEqual(['r1'])
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
