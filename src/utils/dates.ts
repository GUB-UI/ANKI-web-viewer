import { format, startOfDay } from 'date-fns'

/** Local calendar date key YYYY-MM-DD */
export function todayKey(date = new Date()): string {
  return format(date, 'yyyy-MM-dd')
}

export function startOfTodayMs(date = new Date()): number {
  return startOfDay(date).getTime()
}

export function daysAgoMs(days: number, from = new Date()): number {
  return from.getTime() - days * 24 * 60 * 60 * 1000
}

/** Wall-clock delay for learning steps (sub-day). */
export function formatShortDelay(ms: number): string {
  const minutes = Math.round(Math.max(0, ms) / 60_000)
  if (minutes < 60) return `${Math.max(1, minutes)}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  return formatScheduledDays(hours / 24)
}

/** FSRS scheduled_days for review cards — do not round via hours. */
export function formatScheduledDays(days: number): string {
  const whole = Math.max(1, Math.round(days))
  if (whole < 100) return `${whole}d`
  if (whole < 365) return `${Math.round(whole / 30)}mo`
  return `${Math.round(whole / 365)}y`
}

export function formatPreviewLabel(opts: {
  due: number
  now: number
  scheduledDays: number
  learning: boolean
}): string {
  if (!opts.learning && opts.scheduledDays >= 1) {
    return formatScheduledDays(opts.scheduledDays)
  }
  return formatShortDelay(opts.due - opts.now)
}

export function formatDueInterval(ms: number, now = Date.now()): string {
  return formatShortDelay(ms - now)
}

export function formatBackupDate(ts?: number): string {
  if (!ts) return '未作成'
  return format(new Date(ts), 'yyyy/MM/dd HH:mm')
}
