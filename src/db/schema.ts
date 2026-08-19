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
  /** 1 when available for study; 0 for suspended/buried Anki cards */
  active: 0 | 1
  /** Stable new-card ordering imported from Anki's due position */
  sortOrder: number
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
  /** Denormalized so daily limits do not need full-card scans */
  deckId?: string
  reviewedAt: number
  rating: RatingValue
  source: ReviewSource
  scheduledDays?: number
  elapsedDays?: number
  stateBefore?: CardState
  /** Time on the card, capped at 60s. Missing on older logs. */
  durationMs?: number
  /** Card interval in days just before this rating. Learning seconds → 0. */
  intervalBefore?: number
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
  /** Automatically reveal the answer after autoFlipSeconds */
  autoFlipEnabled: boolean
  /** Seconds to wait on the question face before auto-reveal (1–60) */
  autoFlipSeconds: number
  /** Card audio loudness, 0–100. Independent of the device hardware volume. */
  audioVolume: number
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
