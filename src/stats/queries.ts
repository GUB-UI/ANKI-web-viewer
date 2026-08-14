import { db } from '../db/database'
import type { Card, Deck, ReviewLog } from '../db/schema'
import { collectDescendantIds } from '../study/deckTree'
import { assembleStats } from './assemble'
import { rangeWindow } from './range'
import type { StatsRange, StatsSnapshot } from './types'

export type StatsScope = { kind: 'collection' } | { kind: 'deck'; deckId: string }

export async function loadStats(
  scope: StatsScope,
  range: StatsRange,
  now = new Date(),
): Promise<StatsSnapshot> {
  const decks = await db.decks.toArray()
  const deckIds = scopedDeckIds(scope, decks)
  const title =
    scope.kind === 'collection'
      ? 'コレクション'
      : (decks.find((deck) => deck.id === scope.deckId)?.path ?? 'デッキ')

  const window = rangeWindow(range, now)
  const [cards, logs] = await Promise.all([
    loadScopedCards(deckIds),
    loadScopedLogs(deckIds, window.start),
  ])
  return assembleStats({ title, range, cards, logs, now })
}

function scopedDeckIds(scope: StatsScope, decks: Deck[]): string[] | null {
  if (scope.kind === 'collection') return null
  return collectDescendantIds(scope.deckId, decks)
}

async function loadScopedCards(deckIds: string[] | null): Promise<Card[]> {
  if (!deckIds) return db.cards.toArray()
  if (deckIds.length === 0) return []
  return db.cards.where('deckId').anyOf(deckIds).toArray()
}

async function loadScopedLogs(
  deckIds: string[] | null,
  since: number,
): Promise<ReviewLog[]> {
  const logs =
    since > 0
      ? await db.reviewLogs.where('reviewedAt').aboveOrEqual(since).toArray()
      : await db.reviewLogs.toArray()
  if (!deckIds) return logs
  const allowed = new Set(deckIds)
  return logs.filter((log) => log.deckId != null && allowed.has(log.deckId))
}
