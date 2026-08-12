import { describe, expect, it } from 'vitest'
import type { Deck, DeckCounts } from '../db/schema'
import type { DailyNewContext } from './dailyNew'
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

function dailyContext(remaining = 20): DailyNewContext {
  return {
    decks,
    deckById: new Map(decks.map((deck) => [deck.id, deck])),
    childrenOf: new Map([
      ['en', ['tg', 'vin']],
      ['tg', ['s1']],
    ]),
    limitByDeck: new Map(decks.map((deck) => [deck.id, remaining])),
    introducedByDeck: new Map(),
    introducedInSubtree: new Map(decks.map((deck) => [deck.id, 0])),
    remainingByDeck: new Map(decks.map((deck) => [deck.id, remaining])),
  }
}

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
    const directDue = new Map<string, DeckCounts>([
      ['s1', { new: 0, review: 1, learning: 0 }],
    ])
    const counts = computeDeckCounts(
      decks,
      directDue,
      new Map([
        ['s1', 1],
        ['vin', 1],
      ]),
      dailyContext(),
    )
    expect(counts.get('s1')).toEqual({ new: 1, review: 1, learning: 0 })
    expect(counts.get('tg')!.new).toBe(1)
    expect(counts.get('en')!.new).toBe(2)
    expect(counts.get('en')!.review).toBe(1)
  })

  it('uses a parent daily limit as one shared subtree cap', () => {
    const context = dailyContext()
    context.remainingByDeck.set('en', 1)
    const counts = computeDeckCounts(
      decks,
      new Map(),
      new Map([
        ['s1', 10],
        ['vin', 10],
      ]),
      context,
    )
    expect(counts.get('en')!.new).toBe(1)
    expect(counts.get('s1')!.new).toBe(10)
  })
})
