import { beforeEach, describe, expect, it } from 'vitest'
import { db, ensureSettings } from '../db/database'
import type { Card, Deck, Note, ReviewLog } from '../db/schema'
import { daysAgoMs } from '../utils/dates'
import {
  loadTodayFronts,
  todayFrontsFilename,
  todayFrontsMarkdown,
} from './todayFronts'

const deck: Deck = {
  id: 'd1',
  name: '英語',
  path: '英語',
  newCardsPerDay: 20,
  order: 0,
}

function note(id: string, front: string, back = '意味'): Note {
  return {
    id,
    noteType: 'Basic',
    fields: { Front: front, Back: back },
    fieldOrder: ['Front', 'Back'],
    tags: [],
  }
}

function card(id: string, noteId: string): Card {
  return {
    id,
    noteId,
    deckId: deck.id,
    active: 1,
    sortOrder: 0,
    templateOrd: 0,
    cardType: 'basic',
    state: 'review',
    due: Date.now(),
    stability: 1,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 1,
    learningSteps: 0,
    reps: 1,
    lapses: 0,
  }
}

function log(partial: Partial<ReviewLog> & Pick<ReviewLog, 'id' | 'cardId'>): ReviewLog {
  return {
    reviewedAt: Date.now(),
    rating: 3,
    source: 'normal',
    deckId: deck.id,
    ...partial,
  }
}

beforeEach(async () => {
  db.close()
  await db.delete()
  await db.open()
  await ensureSettings()
  await db.decks.put(deck)
  await db.notes.bulkPut([
    note('n1', '<b>ubiquitous</b>'),
    note('n2', 'abandon'),
    note('n3', 'precise'),
  ])
  await db.cards.bulkPut([card('c1', 'n1'), card('c2', 'n2'), card('c3', 'n3')])
})

describe('loadTodayFronts', () => {
  it('lists unique fronts for cards reviewed since local midnight, first-seen order', async () => {
    const now = Date.now()
    await db.reviewLogs.bulkPut([
      log({ id: 'old', cardId: 'c3', reviewedAt: daysAgoMs(1, new Date(now)) }),
      log({ id: 'a', cardId: 'c2', reviewedAt: now - 2000 }),
      log({ id: 'b', cardId: 'c1', reviewedAt: now - 1000 }),
      log({ id: 'again', cardId: 'c2', reviewedAt: now - 500, rating: 1 }),
    ])
    await expect(loadTodayFronts(now)).resolves.toEqual([
      { cardId: 'c2', text: 'abandon' },
      { cardId: 'c1', text: 'ubiquitous' },
    ])
  })
})

describe('todayFrontsMarkdown', () => {
  it('writes a dated heading and one front per line', () => {
    expect(
      todayFrontsMarkdown(
        [
          { cardId: 'c2', text: 'abandon' },
          { cardId: 'c1', text: 'ubiquitous' },
        ],
        '2026-08-20',
      ),
    ).toBe('# 今日の単語 2026-08-20\n\nabandon\nubiquitous\n')
    expect(todayFrontsFilename('2026-08-20')).toBe('今日の単語-2026-08-20.md')
  })
})
