import type { Deck, DeckCounts } from '../db/schema'
import {
  countSelectableNewForStudyRoot,
  type DailyNewContext,
} from './dailyNew'

export interface DeckNode {
  deck: Deck
  children: DeckNode[]
  counts: DeckCounts
  depth: number
}

export function buildDeckForest(decks: Deck[]): DeckNode[] {
  const byId = new Map<string, DeckNode>()
  for (const deck of decks) {
    byId.set(deck.id, {
      deck,
      children: [],
      counts: { new: 0, review: 0, learning: 0 },
      depth: 0,
    })
  }

  const roots: DeckNode[] = []
  for (const node of byId.values()) {
    const parentId = node.deck.parentId
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortRec = (nodes: DeckNode[], depth: number) => {
    nodes.sort(
      (a, b) => a.deck.order - b.deck.order || a.deck.name.localeCompare(b.deck.name),
    )
    for (const n of nodes) {
      n.depth = depth
      sortRec(n.children, depth + 1)
    }
  }
  sortRec(roots, 0)
  return roots
}

export function collectDescendantIds(rootId: string, decks: Deck[]): string[] {
  const byId = new Map(decks.map((deck) => [deck.id, deck]))
  const childrenMap = new Map<string, string[]>()
  for (const d of decks) {
    if (!d.parentId) continue
    const list = childrenMap.get(d.parentId) ?? []
    list.push(d.id)
    childrenMap.set(d.parentId, list)
  }
  for (const list of childrenMap.values()) {
    list.sort((leftId, rightId) => {
      const left = byId.get(leftId)!
      const right = byId.get(rightId)!
      return left.order - right.order || left.name.localeCompare(right.name)
    })
  }
  const result: string[] = []
  const visit = (deckId: string) => {
    result.push(deckId)
    for (const childId of childrenMap.get(deckId) ?? []) visit(childId)
  }
  if (byId.has(rootId)) visit(rootId)
  return result
}

export function computeDeckCounts(
  decks: Deck[],
  directDue: Map<string, DeckCounts>,
  availableNewByDeck: Map<string, number>,
  dailyNew: DailyNewContext,
): Map<string, DeckCounts> {
  const aggregated = new Map<string, DeckCounts>()
  for (const deck of decks) {
    const due = directDue.get(deck.id) ?? { new: 0, review: 0, learning: 0 }
    aggregated.set(deck.id, {
      new: countSelectableNewForStudyRoot(deck.id, availableNewByDeck, dailyNew),
      review: due.review,
      learning: due.learning,
    })
  }

  // Due cards aggregate to parents. New counts already use subtree-aware caps.
  const sorted = [...decks].sort(
    (a, b) => b.path.split('::').length - a.path.split('::').length,
  )
  for (const deck of sorted) {
    if (!deck.parentId || !aggregated.has(deck.parentId)) continue
    const parent = aggregated.get(deck.parentId)!
    const child = aggregated.get(deck.id)!
    parent.review += child.review
    parent.learning += child.learning
  }

  return aggregated
}

export function totalDue(counts: DeckCounts): number {
  return counts.new + counts.review + counts.learning
}
