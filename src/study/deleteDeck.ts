import { db } from '../db/database'
import type { Card, Note } from '../db/schema'
import { extractMediaFilenames } from '../utils/mediaRefs'
import { collectDescendantIds } from './deckTree'

const INDEX_CHUNK = 400

export interface DeckDeletion {
  decks: number
  cards: number
  notes: number
}

/** Delete a deck, its subdecks, their cards, and data nothing else still uses. */
export async function deleteDeck(deckId: string): Promise<DeckDeletion> {
  const removed = await db.transaction(
    'rw',
    [db.decks, db.notes, db.cards, db.reviewLogs, db.dailyOverrides],
    async () => {
      const decks = await db.decks.toArray()
      const deckIds = collectDescendantIds(deckId, decks)
      if (deckIds.length === 0) return null

      const cards = await db.cards.where('deckId').anyOf(deckIds).toArray()
      const cardIds = cards.map((card) => card.id)

      await deleteByKeys(cardIds, (chunk) =>
        db.reviewLogs.where('cardId').anyOf(chunk).delete(),
      )
      await deleteByKeys(deckIds, (chunk) =>
        db.reviewLogs.where('deckId').anyOf(chunk).delete(),
      )
      await deleteByKeys(deckIds, (chunk) =>
        db.dailyOverrides.where('deckId').anyOf(chunk).delete(),
      )
      await deleteByKeys(cardIds, (chunk) => db.cards.bulkDelete(chunk))

      const notes = await deleteOrphanNotes(cards)
      await db.decks.bulkDelete(deckIds)

      return { deckCount: deckIds.length, cards, notes }
    },
  )
  if (!removed) return { decks: 0, cards: 0, notes: 0 }

  // Media cleanup must not roll back the deck delete. iOS can abort a long
  // IndexedDB transaction while scanning every remaining card.
  try {
    await deleteUnreferencedMedia(removed.notes, removed.cards)
  } catch (error) {
    console.error(error)
  }

  return {
    decks: removed.deckCount,
    cards: removed.cards.length,
    notes: removed.notes.length,
  }
}

async function deleteByKeys(
  keys: string[],
  remove: (chunk: string[]) => Promise<unknown>,
): Promise<void> {
  for (let index = 0; index < keys.length; index += INDEX_CHUNK) {
    await remove(keys.slice(index, index + INDEX_CHUNK))
  }
}

async function deleteOrphanNotes(removedCards: Card[]): Promise<Note[]> {
  const noteIds = [...new Set(removedCards.map((card) => card.noteId))]
  if (noteIds.length === 0) return []

  const stillUsed = new Set<string>()
  await db.cards.where('noteId').anyOf(noteIds).each((card) => {
    stillUsed.add(card.noteId)
  })
  const orphanIds = noteIds.filter((id) => !stillUsed.has(id))
  if (orphanIds.length === 0) return []

  const notes = (await db.notes.bulkGet(orphanIds)).filter(
    (note): note is Note => note != null,
  )
  await db.notes.bulkDelete(orphanIds)
  return notes
}

async function deleteUnreferencedMedia(
  removedNotes: Note[],
  removedCards: Card[],
): Promise<void> {
  const candidates = new Set<string>()
  const collect = (html: unknown) => {
    if (typeof html !== 'string' || html === '') return
    for (const name of extractMediaFilenames(html)) {
      candidates.add(name.toLowerCase())
    }
  }
  for (const note of removedNotes) {
    for (const value of Object.values(note.fields)) collect(value)
  }
  for (const card of removedCards) {
    collect(card.front)
    collect(card.back)
  }
  if (candidates.size === 0) return

  const stillUsed = new Set<string>()
  const keep = (html: unknown) => {
    if (typeof html !== 'string' || html === '') return
    for (const name of extractMediaFilenames(html)) {
      const key = name.toLowerCase()
      if (candidates.has(key)) stillUsed.add(key)
    }
  }
  await db.notes.each((note) => {
    for (const value of Object.values(note.fields)) keep(value)
  })
  await db.cards.each((card) => {
    keep(card.front)
    keep(card.back)
  })

  const filenames = (await db.media.orderBy('filename').keys()) as string[]
  const unused = filenames.filter((filename) => {
    const key = filename.toLowerCase()
    return candidates.has(key) && !stillUsed.has(key)
  })
  await deleteByKeys(unused, (chunk) =>
    db.media.where('filename').anyOf(chunk).delete(),
  )
}
