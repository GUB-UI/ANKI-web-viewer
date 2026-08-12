import { db, ensureSettings } from '../db/database'
import type { Card, Deck, ReviewLog } from '../db/schema'
import { startOfTodayMs, todayKey } from '../utils/dates'

export interface DailyNewContext {
  decks: Deck[]
  deckById: Map<string, Deck>
  childrenOf: Map<string, string[]>
  limitByDeck: Map<string, number>
  introducedByDeck: Map<string, number>
  introducedInSubtree: Map<string, number>
  remainingByDeck: Map<string, number>
}

function buildChildren(decks: Deck[]): Map<string, string[]> {
  const children = new Map<string, string[]>()
  for (const deck of decks) {
    if (!deck.parentId) continue
    const list = children.get(deck.parentId) ?? []
    list.push(deck.id)
    children.set(deck.parentId, list)
  }
  const byId = new Map(decks.map((deck) => [deck.id, deck]))
  for (const list of children.values()) {
    list.sort((a, b) => {
      const left = byId.get(a)!
      const right = byId.get(b)!
      return left.order - right.order || left.name.localeCompare(right.name)
    })
  }
  return children
}

async function resolveMissingDeckIds(logs: ReviewLog[]): Promise<void> {
  const missing = logs.filter((log) => !log.deckId)
  if (missing.length === 0) return
  const cards = await db.cards.bulkGet([...new Set(missing.map((log) => log.cardId))])
  const deckByCard = new Map(
    cards.filter((card): card is Card => card != null).map((card) => [card.id, card.deckId]),
  )
  for (const log of missing) log.deckId = deckByCard.get(log.cardId)
}

export async function loadDailyNewContext(
  now = Date.now(),
  suppliedDecks?: Deck[],
): Promise<DailyNewContext> {
  const decks = suppliedDecks ?? (await db.decks.toArray())
  const [settings, overrides, introducedLogs] = await Promise.all([
    ensureSettings(),
    db.dailyOverrides.where('date').equals(todayKey(new Date(now))).toArray(),
    db.reviewLogs
      .where('[stateBefore+reviewedAt]')
      .between(['new', startOfTodayMs(new Date(now))], ['new', now], true, true)
      .filter((log) => log.source === 'normal')
      .toArray(),
  ])

  await resolveMissingDeckIds(introducedLogs)

  const overrideByDeck = new Map(overrides.map((override) => [override.deckId, override]))
  const limitByDeck = new Map(
    decks.map((deck) => [
      deck.id,
      Math.max(
        0,
        overrideByDeck.get(deck.id)?.newCardsLimit ??
          deck.newCardsPerDay ??
          settings.newCardsPerDay,
      ),
    ]),
  )

  // Count each newly introduced card once, even if malformed logs contain duplicates.
  const seenByDeck = new Map<string, Set<string>>()
  for (const log of introducedLogs) {
    if (!log.deckId) continue
    const seen = seenByDeck.get(log.deckId) ?? new Set<string>()
    seen.add(log.cardId)
    seenByDeck.set(log.deckId, seen)
  }
  const introducedByDeck = new Map(
    [...seenByDeck].map(([deckId, cardIds]) => [deckId, cardIds.size]),
  )

  const deckById = new Map(decks.map((deck) => [deck.id, deck]))
  const childrenOf = buildChildren(decks)
  const introducedInSubtree = new Map<string, number>()

  const sumIntroduced = (deckId: string): number => {
    const cached = introducedInSubtree.get(deckId)
    if (cached != null) return cached
    let total = introducedByDeck.get(deckId) ?? 0
    for (const childId of childrenOf.get(deckId) ?? []) {
      total += sumIntroduced(childId)
    }
    introducedInSubtree.set(deckId, total)
    return total
  }

  const remainingByDeck = new Map<string, number>()
  for (const deck of decks) {
    remainingByDeck.set(
      deck.id,
      Math.max(0, (limitByDeck.get(deck.id) ?? settings.newCardsPerDay) - sumIntroduced(deck.id)),
    )
  }

  return {
    decks,
    deckById,
    childrenOf,
    limitByDeck,
    introducedByDeck,
    introducedInSubtree,
    remainingByDeck,
  }
}

export function subtreeIds(rootId: string, context: DailyNewContext): string[] {
  const result: string[] = []
  const visit = (deckId: string) => {
    result.push(deckId)
    for (const childId of context.childrenOf.get(deckId) ?? []) visit(childId)
  }
  if (context.deckById.has(rootId)) visit(rootId)
  return result
}

function scopeChain(
  deckId: string,
  rootId: string,
  context: DailyNewContext,
): string[] {
  const chain: string[] = []
  let current: Deck | undefined = context.deckById.get(deckId)
  while (current) {
    chain.push(current.id)
    if (current.id === rootId) return chain
    current = current.parentId ? context.deckById.get(current.parentId) : undefined
  }
  return []
}

function availableRoom(
  chain: string[],
  selectedByScope: Map<string, number>,
  context: DailyNewContext,
): number {
  if (chain.length === 0) return 0
  return Math.min(
    ...chain.map(
      (scopeId) =>
        (context.remainingByDeck.get(scopeId) ?? 0) -
        (selectedByScope.get(scopeId) ?? 0),
    ),
  )
}

export function selectNewCardsForStudyRoot(
  rootId: string,
  newByDeck: Map<string, Card[]>,
  context: DailyNewContext,
): Card[] {
  const selected: Card[] = []
  const selectedByScope = new Map<string, number>()

  for (const deckId of subtreeIds(rootId, context)) {
    const chain = scopeChain(deckId, rootId, context)
    const room = Math.max(0, availableRoom(chain, selectedByScope, context))
    const cards = (newByDeck.get(deckId) ?? []).slice(0, room)
    selected.push(...cards)
    for (const scopeId of chain) {
      selectedByScope.set(scopeId, (selectedByScope.get(scopeId) ?? 0) + cards.length)
    }
  }
  return selected
}

export function countSelectableNewForStudyRoot(
  rootId: string,
  availableByDeck: Map<string, number>,
  context: DailyNewContext,
): number {
  let selected = 0
  const selectedByScope = new Map<string, number>()

  for (const deckId of subtreeIds(rootId, context)) {
    const chain = scopeChain(deckId, rootId, context)
    const take = Math.max(
      0,
      Math.min(availableByDeck.get(deckId) ?? 0, availableRoom(chain, selectedByScope, context)),
    )
    selected += take
    for (const scopeId of chain) {
      selectedByScope.set(scopeId, (selectedByScope.get(scopeId) ?? 0) + take)
    }
  }
  return selected
}
