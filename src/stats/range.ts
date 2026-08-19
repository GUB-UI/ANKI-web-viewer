import { addDays, startOfDay } from 'date-fns'
import type { StatsRange } from './types'

const DAY_MS = 86_400_000

export interface RangeWindow {
  start: number
  end: number
  chunkDays: number
  horizonDays: number
}

export function rangeWindow(range: StatsRange, now = new Date()): RangeWindow {
  const end = now.getTime()
  if (range === 'month') {
    return { start: end - 31 * DAY_MS, end, chunkDays: 1, horizonDays: 31 }
  }
  if (range === 'year') {
    return { start: end - 365 * DAY_MS, end, chunkDays: 7, horizonDays: 365 }
  }
  return { start: 0, end, chunkDays: 30, horizonDays: 365 }
}

export function dayOffset(at: number, from: Date): number {
  const start = startOfDay(from).getTime()
  return Math.floor((startOfDay(new Date(at)).getTime() - start) / DAY_MS)
}

export function addLocalDays(from: Date, days: number): Date {
  return addDays(startOfDay(from), days)
}
