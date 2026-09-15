import { db } from '../db/database'
import type { Card, Note } from '../db/schema'
import { htmlToPlainText, renderCardContent } from '../utils/cardRender'
import { startOfTodayMs, todayKey } from '../utils/dates'

export interface TodayFront {
  cardId: string
  text: string
}

export async function loadTodayFronts(now = Date.now()): Promise<TodayFront[]> {
  const start = startOfTodayMs(new Date(now))
  const logs = await db.reviewLogs.where('reviewedAt').aboveOrEqual(start).toArray()
  const firstSeen = new Map<string, number>()
  for (const log of logs) {
    if (log.reviewedAt > now) continue
    const previous = firstSeen.get(log.cardId)
    if (previous == null || log.reviewedAt < previous) {
      firstSeen.set(log.cardId, log.reviewedAt)
    }
  }
  const cardIds = [...firstSeen.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id)
  if (cardIds.length === 0) return []

  const cards = await db.cards.bulkGet(cardIds)
  const present = cards.filter((card): card is Card => card != null)
  const noteIds = [...new Set(present.map((card) => card.noteId))]
  const [notes, decks] = await Promise.all([
    db.notes.bulkGet(noteIds),
    db.decks.toArray(),
  ])
  const noteById = new Map(
    notes.filter((note): note is Note => note != null).map((note) => [note.id, note]),
  )
  const pathByDeck = new Map(decks.map((deck) => [deck.id, deck.path]))

  const fronts: TodayFront[] = []
  for (const card of present) {
    const note = noteById.get(card.noteId)
    if (!note) continue
    const rendered = renderCardContent(card, note, pathByDeck.get(card.deckId) ?? '')
    const text = htmlToPlainText(rendered.frontHtml)
    if (!text) continue
    fronts.push({ cardId: card.id, text })
  }
  return fronts
}

export function todayFrontsFilename(date = todayKey()): string {
  return `今日の単語-${date}.md`
}

export function todayFrontsMarkdown(fronts: TodayFront[], date = todayKey()): string {
  const body = fronts.map((item) => item.text).join('\n')
  return `# 今日の単語 ${date}\n\n${body}\n`
}
