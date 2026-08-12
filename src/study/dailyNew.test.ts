import { beforeEach, describe, expect, it } from 'vitest'
import { db, ensureSettings } from '../db/database'
import type { Card, Deck, Note, ReviewLog } from '../db/schema'
import { startOfTodayMs, todayKey } from '../utils/dates'
import {
  countSelectableNewForStudyRoot,
  loadDailyNewContext,
} from './dailyNew'

const decks: Deck[] = [
  { id: 'root', name: 'Root', path: 'Root', newCardsPerDay: 3, order: 0 },
  {
    id: 'a',
    name: 'A',
    path: 'Root::A',
    parentId: 'root',
    newCardsPerDay: 10,
    order: 0,
  },
  {
    id: 'b',
    name: 'B',
    path: 'Root::B',
    parentId: 'root',
    newCardsPerDay: 10,
    order: 1,
  },
]

const note: Note = {
  id: 'n1',
  fields: { Front: 'q', Back: 'a' },
  tags: [],
  noteType: 'Basic',
  fieldOrder: ['Front', 'Back'],
}

function card(id: string, deckId: string): Card {
  return {
    id,
    noteId: note.id,
    deckId,
    active: 1,
    sortOrder: 0,
    templateOrd: 0,
    cardType: 'basic',
    state: 'learning',
    due: Date.now(),
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 1,
    lapses: 0,
  }
}

beforeEach(async () => {
  db.close()
  await db.delete()
  await db.open()
  await ensureSettings()
  await db.decks.bulkPut(decks)
  await db.notes.put(note)
  await db.cards.bulkPut([card('c1', 'a'), card('c2', 'b')])
})

describe('daily new-card budgets', () => {
  it('subtracts only normal new introductions since local midnight', async () => {
    const now = Date.now()
    const logs: ReviewLog[] = [
      {
        id: 'today',
        cardId: 'c1',
        deckId: 'a',
        reviewedAt: now,
        rating: 3,
        source: 'normal',
        stateBefore: 'new',
      },
      {
        id: 'custom',
        cardId: 'c2',
        deckId: 'b',
        reviewedAt: now,
        rating: 1,
        source: 'custom',
        stateBefore: 'new',
      },
      {
        id: 'yesterday',
        cardId: 'c2',
        deckId: 'b',
        reviewedAt: startOfTodayMs(new Date(now)) - 1,
        rating: 3,
        source: 'normal',
        stateBefore: 'new',
      },
    ]
    await db.reviewLogs.bulkPut(logs)

    const context = await loadDailyNewContext(now, decks)
    expect(context.introducedInSubtree.get('root')).toBe(1)
    expect(context.remainingByDeck.get('root')).toBe(2)
    expect(
      countSelectableNewForStudyRoot(
        'root',
        new Map([
          ['a', 10],
          ['b', 10],
        ]),
        context,
      ),
    ).toBe(2)
  })

  it('applies one parent override without changing child limits', async () => {
    const date = todayKey()
    await db.dailyOverrides.put({
      id: `${date}_root`,
      date,
      deckId: 'root',
      newCardsLimit: 1,
    })
    const context = await loadDailyNewContext()
    expect(context.remainingByDeck.get('root')).toBe(1)
    expect(context.remainingByDeck.get('a')).toBe(10)
    expect(
      countSelectableNewForStudyRoot(
        'root',
        new Map([
          ['a', 10],
          ['b', 10],
        ]),
        context,
      ),
    ).toBe(1)
  })
})
