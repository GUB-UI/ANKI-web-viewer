export type CardState = 'new' | 'learning' | 'review' | 'relearning'

export type RatingValue = 1 | 2 | 3 | 4

export type ReviewSource = 'normal' | 'custom'

export type ThemeMode = 'system' | 'light' | 'dark'

export interface Deck {
  id: string
  name: string
  parentId?: string
  path: string
  newCardsPerDay: number
  order: number
}

export interface Note {
  id: string
  fields: Record<string, string>
  tags: string[]
  noteType: string
  /** Field names in order for rendering */
  fieldOrder: string[]
}

export interface Card {
  id: string
  noteId: string
  deckId: string
  /** Template ordinal (0 = forward, 1 = reverse, cloze index, etc.) */
  templateOrd: number
  cardType: 'basic' | 'basic-reverse' | 'cloze' | 'other'
  clozeIndex?: number
  state: CardState
  due: number
  stability: number
  difficulty: number
  scheduledDays: number
  learningSteps: number
  reps: number
  lapses: number
  elapsedDays: number
  lastReview?: number
  front?: string
  back?: string
}

export interface ReviewLog {
  id: string
  cardId: string
  reviewedAt: number
  rating: RatingValue
  source: ReviewSource
  scheduledDays?: number
  elapsedDays?: number
  stateBefore?: CardState
}

export interface MediaFile {
  id: string
  filename: string
  mimeType: string
  blob: Blob
}

export interface AppSettings {
  id: 'settings'
  newCardsPerDay: number
  swipeEnabled: boolean
  theme: ThemeMode
  lastBackupAt?: number
}

export interface DailyOverride {
  id: string
  date: string
  deckId: string
  newCardsLimit: number
}

export interface DeckCounts {
  new: number
  review: number
  learning: number
}
