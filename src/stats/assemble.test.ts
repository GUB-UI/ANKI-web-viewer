import { describe, expect, it } from 'vitest'
import { applyFsrsDefaults } from '../scheduler/fsrs'
import type { Card, ReviewLog } from '../db/schema'
import { assembleStats, firstReviewsPerDay } from './assemble'
import { dailyLoadContribution, reviewKind } from './classify'

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

function log(partial: Partial<ReviewLog>): ReviewLog {
  return {
    id: 'r1',
    cardId: 'c1',
    deckId: 'd1',
    reviewedAt: Date.now(),
    rating: 3,
    source: 'normal',
    ...partial,
  }
}

describe('dailyLoadContribution', () => {
  it('treats sub-day intervals as 1', () => {
    expect(dailyLoadContribution(0)).toBe(1)
    expect(dailyLoadContribution(10)).toBe(0.1)
    expect(dailyLoadContribution(50)).toBe(0.02)
  })
})

describe('reviewKind', () => {
  it('keeps custom reviews in the extra stack', () => {
    expect(reviewKind(log({ source: 'custom' }))).toBe('extra')
  })

  it('uses intervalBefore for mature reviews', () => {
    expect(
      reviewKind(log({ stateBefore: 'review', intervalBefore: 21 })),
    ).toBe('mature')
    expect(
      reviewKind(log({ stateBefore: 'review', intervalBefore: 7 })),
    ).toBe('young')
  })
})

describe('firstReviewsPerDay', () => {
  it('keeps only the first normal review per card per local day', () => {
    const day = new Date('2026-08-14T10:00:00').getTime()
    const logs = [
      log({ id: 'a', cardId: 'c1', reviewedAt: day, rating: 1 }),
      log({ id: 'b', cardId: 'c1', reviewedAt: day + 3_600_000, rating: 3 }),
      log({ id: 'c', cardId: 'c2', reviewedAt: day, rating: 3 }),
      log({ id: 'd', cardId: 'c3', source: 'custom', reviewedAt: day }),
    ]
    expect(firstReviewsPerDay(logs).map((item) => item.id)).toEqual(['a', 'c'])
  })
})

describe('assembleStats', () => {
  const now = new Date('2026-08-14T15:00:00')

  it('omits overdue cards from future-due bars and reports the backlog', () => {
    const snapshot = assembleStats({
      title: 't',
      range: 'month',
      now,
      cards: [
        card({
          id: 'over',
          state: 'review',
          due: now.getTime() - 86_400_000,
          scheduledDays: 10,
        }),
        card({
          id: 'tomorrow',
          state: 'review',
          due: now.getTime() + 86_400_000,
          scheduledDays: 10,
        }),
      ],
      logs: [],
    })
    expect(snapshot.futureDue.overdue).toBe(1)
    expect(snapshot.futureDue.buckets[0]?.due).toBe(0)
    expect(snapshot.futureDue.buckets[1]?.due).toBe(1)
    expect(snapshot.today.overdue).toBe(1)
  })

  it('counts today reviews and true-retention first-pass', () => {
    const start = new Date('2026-08-14T00:00:00').getTime()
    const snapshot = assembleStats({
      title: 't',
      range: 'month',
      now,
      cards: [card({ id: 'c1', state: 'review', scheduledDays: 30 })],
      logs: [
        log({
          id: 'fail',
          cardId: 'c1',
          reviewedAt: start + 3_600_000,
          rating: 1,
          intervalBefore: 30,
          stateBefore: 'review',
        }),
        log({
          id: 'later',
          cardId: 'c1',
          reviewedAt: start + 4_000_000,
          rating: 3,
          intervalBefore: 30,
          stateBefore: 'review',
        }),
      ],
    })
    expect(snapshot.today.reviews).toBe(2)
    expect(snapshot.today.again).toBe(1)
    const today = snapshot.retention.find((row) => row.id === 'today')
    expect(today?.matureFail).toBe(1)
    expect(today?.maturePass).toBe(0)
  })

  it('excludes custom reviews from buttons and retention', () => {
    const snapshot = assembleStats({
      title: 't',
      range: 'month',
      now,
      cards: [],
      logs: [
        log({
          source: 'custom',
          rating: 1,
          reviewedAt: now.getTime() - 1000,
        }),
      ],
    })
    expect(snapshot.today.extra).toBe(1)
    expect(snapshot.buttons.learn.again).toBe(0)
    expect(snapshot.retention[0]?.totalPct).toBeNull()
  })
})
