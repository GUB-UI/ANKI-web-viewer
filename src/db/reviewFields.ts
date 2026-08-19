import type { CardState } from './schema'

export const MAX_ANSWER_MS = 60_000
export const MATURE_INTERVAL_DAYS = 21

/** Anki records at most 60 seconds per answer. */
export function capDurationMs(ms: number | undefined): number | undefined {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return undefined
  return Math.min(MAX_ANSWER_MS, Math.round(ms))
}

/** Positive Anki ivl is days. Negative ivl is learning seconds — not mature. */
export function intervalDaysFromAnkiIvl(ivl: number): number {
  if (!Number.isFinite(ivl) || ivl < 0) return 0
  return ivl
}

/** Anki revlog type: 0 learn, 1 review, 2 relearn. 3 filtered is left unset. */
export function stateBeforeFromAnkiType(type: number): CardState | undefined {
  if (type === 0) return 'learning'
  if (type === 1) return 'review'
  if (type === 2) return 'relearning'
  return undefined
}

export function isMatureInterval(days: number | undefined): boolean {
  return (days ?? 0) >= MATURE_INTERVAL_DAYS
}
