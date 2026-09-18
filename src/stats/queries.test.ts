import { beforeEach, describe, expect, it } from 'vitest'
import { db, ensureSettings } from '../db/database'
import type { Deck, ReviewLog } from '../db/schema'
import { loadScopedLogs } from './queries'

const english: Deck = {
  id: 'en',
  name: '英語',
  path: '英語',
  newCardsPerDay: 20,
  order: 0,
}

const japanese: Deck = {
  id: 'ja',
  name: '日本語',
  path: '日本語',
  newCardsPerDay: 20,
  order: 1,
}

function log(
  partial: Partial<ReviewLog> & Pick<ReviewLog, 'id' | 'cardId' | 'deckId' | 'reviewedAt'>,
): ReviewLog {
  return {
    rating: 3,
    source: 'normal',
    ...partial,
  }
}

beforeEach(async () => {
  db.close()
  await db.delete()
  await db.open()
  await ensureSettings()
  await db.decks.bulkPut([english, japanese])
})

describe('loadScopedLogs', () => {
  it('reads only the requested deck via [deckId+reviewedAt]', async () => {
    const now = Date.parse('2026-09-18T12:00:00')
    await db.reviewLogs.bulkPut([
      log({ id: 'en-new', cardId: 'c1', deckId: english.id, reviewedAt: now - 1000 }),
      log({ id: 'en-old', cardId: 'c2', deckId: english.id, reviewedAt: now - 90 * 86_400_000 }),
      log({ id: 'ja-new', cardId: 'c3', deckId: japanese.id, reviewedAt: now - 1000 }),
    ])
    const month = await loadScopedLogs([english.id], now - 31 * 86_400_000)
    expect(month.map((item) => item.id)).toEqual(['en-new'])
    const all = await loadScopedLogs([english.id], 0)
    expect(all.map((item) => item.id).sort()).toEqual(['en-new', 'en-old'])
  })
})
