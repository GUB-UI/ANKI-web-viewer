import { db } from '../db/database'
import type { Card, Deck, Note, ReviewLog } from '../db/schema'
import { htmlToPlainText, renderCardContent } from '../utils/cardRender'
import { startOfTodayMs, todayKey } from '../utils/dates'

export interface TodayFront {
  cardId: string
  text: string
}

const frontTextCache = new Map<string, { generation: string; text: string }>()

function noteGeneration(note: Note): string {
  return `${note.id}:${note.fieldOrder.join(',')}:${note.fieldOrder.map((key) => note.fields[key] ?? '').join('\x1f')}`
}

function cardGeneration(card: Card, note: Note): string {
  return `${card.id}:${card.templateOrd}:${card.cardType}:${card.clozeIndex ?? ''}:${noteGeneration(note)}`
}

export function invalidateTodayFrontCache(): void {
  frontTextCache.clear()
}

export async function frontsFromTodayLogs(
  logs: ReviewLog[],
  now: number,
  decks: Deck[],
): Promise<TodayFront[]> {
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
  const notes = await db.notes.bulkGet(noteIds)
  const noteById = new Map(
    notes.filter((note): note is Note => note != null).map((note) => [note.id, note]),
  )
  const pathByDeck = new Map(decks.map((deck) => [deck.id, deck.path]))

  const fronts: TodayFront[] = []
  for (const card of present) {
    const note = noteById.get(card.noteId)
    if (!note) continue
    const generation = cardGeneration(card, note)
    const cached = frontTextCache.get(card.id)
    let text = cached?.generation === generation ? cached.text : ''
    if (!text) {
      const rendered = renderCardContent(card, note, pathByDeck.get(card.deckId) ?? '')
      text = htmlToPlainText(rendered.frontHtml)
      if (text) frontTextCache.set(card.id, { generation, text })
    }
    if (!text) continue
    fronts.push({ cardId: card.id, text })
  }
  return fronts
}

export async function loadTodayFronts(now = Date.now()): Promise<TodayFront[]> {
  const start = startOfTodayMs(new Date(now))
  const [logs, decks] = await Promise.all([
    db.reviewLogs.where('reviewedAt').aboveOrEqual(start).toArray(),
    db.decks.toArray(),
  ])
  return frontsFromTodayLogs(logs, now, decks)
}

export function todayFrontsFilename(date = todayKey()): string {
  return `今日の単語-${date}.md`
}

export function todayFrontsMarkdown(fronts: TodayFront[], date = todayKey()): string {
  const body = fronts.map((item) => item.text).join('\n')
  return `# 今日の単語 ${date}\n\n${body}\n`
}
