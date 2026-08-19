import { isMatureInterval } from '../db/reviewFields'
import type { ReviewLog } from '../db/schema'
import type { ReviewKind } from './types'

export function reviewKind(log: ReviewLog): ReviewKind {
  if (log.source === 'custom') return 'extra'
  if (log.stateBefore === 'relearning') return 'relearn'
  if (log.stateBefore === 'new' || log.stateBefore === 'learning') return 'learn'
  if (log.stateBefore === 'review') {
    return isMatureInterval(log.intervalBefore) ? 'mature' : 'young'
  }
  if (isMatureInterval(log.intervalBefore)) return 'mature'
  if ((log.intervalBefore ?? 0) > 0) return 'young'
  return 'learn'
}

export function buttonGroup(
  log: ReviewLog,
): 'learn' | 'young' | 'mature' | null {
  if (log.source === 'custom') return null
  if (
    log.stateBefore === 'new' ||
    log.stateBefore === 'learning' ||
    log.stateBefore === 'relearning'
  ) {
    return 'learn'
  }
  if (isMatureInterval(log.intervalBefore)) return 'mature'
  return 'young'
}

export function dailyLoadContribution(scheduledDays: number): number {
  if (!Number.isFinite(scheduledDays) || scheduledDays < 1) return 1
  return 1 / scheduledDays
}
