import type { Card, Deck, DeckCounts } from '../db/schema'
import { startOfTodayMs } from '../utils/dates'

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
  const childrenMap = new Map<string, string[]>()
  for (const d of decks) {
    if (!d.parentId) continue
    const list = childrenMap.get(d.parentId) ?? []
    list.push(d.id)
    childrenMap.set(d.parentId, list)
  }
  const result: string[] = []
  const stack = [rootId]
  while (stack.length) {
    const id = stack.pop()!
    result.push(id)
    for (const child of childrenMap.get(id) ?? []) stack.push(child)
  }
  return result
}

export function isDueToday(card: Card, now = Date.now()): boolean {
  if (card.state === 'new') return false
  return card.due <= now
}

export function computeDeckCounts(
  decks: Deck[],
  cards: Pick<Card, 'deckId' | 'state' | 'due'>[],
  newLimits: Map<string, number>,
  now = Date.now(),
): Map<string, DeckCounts> {
  const todayStart = startOfTodayMs(new Date(now))
  void todayStart

  const direct = new Map<string, DeckCounts>()
  for (const d of decks) {
    direct.set(d.id, { new: 0, review: 0, learning: 0 })
  }

  const newSeen = new Map<string, number>()

  for (const card of cards) {
    const counts = direct.get(card.deckId)
    if (!counts) continue
    if (card.state === 'new') {
      const limit = newLimits.get(card.deckId) ?? 20
      const seen = newSeen.get(card.deckId) ?? 0
      if (seen < limit) {
        counts.new += 1
        newSeen.set(card.deckId, seen + 1)
      }
    } else if (card.state === 'learning' || card.state === 'relearning') {
      if (card.due <= now) counts.learning += 1
    } else if (card.state === 'review' && card.due <= now) {
      counts.review += 1
    }
  }

  // Aggregate to parents
  const byId = new Map(decks.map((d) => [d.id, d]))
  const aggregated = new Map<string, DeckCounts>()
  for (const d of decks) {
    aggregated.set(d.id, { ...(direct.get(d.id) ?? { new: 0, review: 0, learning: 0 }) })
  }

  // Process deepest first
  const sorted = [...decks].sort(
    (a, b) => b.path.split('::').length - a.path.split('::').length,
  )
  for (const deck of sorted) {
    if (!deck.parentId || !aggregated.has(deck.parentId)) continue
    const parent = aggregated.get(deck.parentId)!
    const child = aggregated.get(deck.id)!
    parent.new += child.new
    parent.review += child.review
    parent.learning += child.learning
    void byId
  }

  return aggregated
}

export function totalDue(counts: DeckCounts): number {
  return counts.new + counts.review + counts.learning
}
