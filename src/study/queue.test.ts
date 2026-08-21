import { beforeEach, describe, expect, it } from 'vitest'
import { db, ensureSettings } from '../db/database'
import type { Deck, ReviewLog } from '../db/schema'
import { daysAgoMs } from '../utils/dates'
import { snapshotHomeState } from './queue'

const deck: Deck = {
  id: 'root',
  name: '英語',
  path: '英語',
  newCardsPerDay: 20,
  order: 0,
}

beforeEach(async () => {
  db.close()
  await db.delete()
  await db.open()
  await ensureSettings()
  await db.decks.put(deck)
})

describe('snapshotHomeState', () => {
  it('sums today review durations and ignores yesterday', async () => {
    const now = Date.now()
    const logs: ReviewLog[] = [
      {
        id: 'today',
        cardId: 'c1',
        deckId: deck.id,
        reviewedAt: now - 1000,
        rating: 3,
        source: 'normal',
        durationMs: 12_000,
      },
      {
        id: 'custom',
        cardId: 'c2',
        deckId: deck.id,
        reviewedAt: now - 500,
        rating: 1,
        source: 'custom',
        durationMs: 8_000,
      },
      {
        id: 'old',
        cardId: 'c3',
        deckId: deck.id,
        reviewedAt: daysAgoMs(1, new Date(now)),
        rating: 3,
        source: 'normal',
        durationMs: 40_000,
      },
    ]
    await db.reviewLogs.bulkPut(logs)
    const snapshot = await snapshotHomeState(now)
    expect(snapshot.today.durationMs).toBe(20_000)
  })
})
