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

export function formatDueInterval(ms: number, now = Date.now()): string {
  const diff = Math.max(0, ms - now)
  const minutes = Math.round(diff / 60000)
  if (minutes < 60) return `${Math.max(1, minutes)}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo`
  return `${Math.round(days / 365)}y`
}

export function formatBackupDate(ts?: number): string {
  if (!ts) return '未作成'
  return format(new Date(ts), 'yyyy/MM/dd HH:mm')
}
