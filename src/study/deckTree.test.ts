import { describe, expect, it } from 'vitest'
import type { Deck } from '../db/schema'
import {
  buildDeckForest,
  collectDescendantIds,
  computeDeckCounts,
} from './deckTree'

const decks: Deck[] = [
  { id: 'en', name: '英語', path: '英語', newCardsPerDay: 20, order: 0 },
  {
    id: 'tg',
    name: 'ターゲット',
    path: '英語::ターゲット',
    parentId: 'en',
    newCardsPerDay: 20,
    order: 0,
  },
  {
    id: 's1',
    name: 'Section1',
    path: '英語::ターゲット::Section1',
    parentId: 'tg',
    newCardsPerDay: 20,
    order: 0,
  },
  {
    id: 'vin',
    name: 'Vintage',
    path: '英語::Vintage',
    parentId: 'en',
    newCardsPerDay: 20,
    order: 1,
  },
]

describe('deckTree', () => {
  it('builds hierarchy', () => {
    const forest = buildDeckForest(decks)
    expect(forest).toHaveLength(1)
    expect(forest[0]!.children).toHaveLength(2)
    expect(forest[0]!.children[0]!.children[0]!.deck.name).toBe('Section1')
  })

  it('collects descendants including self', () => {
    expect(collectDescendantIds('tg', decks).sort()).toEqual(['s1', 'tg'].sort())
    expect(collectDescendantIds('en', decks)).toHaveLength(4)
  })

  it('aggregates counts to parents', () => {
    const now = Date.now()
    const counts = computeDeckCounts(
      decks,
      [
        { deckId: 's1', state: 'new', due: now },
        { deckId: 's1', state: 'review', due: now - 1000 },
        { deckId: 'vin', state: 'new', due: now },
      ],
      new Map([
        ['s1', 20],
        ['vin', 20],
        ['tg', 20],
        ['en', 20],
      ]),
      now,
    )
    expect(counts.get('s1')).toEqual({ new: 1, review: 1, learning: 0 })
    expect(counts.get('tg')!.new).toBe(1)
    expect(counts.get('en')!.new).toBe(2)
    expect(counts.get('en')!.review).toBe(1)
  })
})
