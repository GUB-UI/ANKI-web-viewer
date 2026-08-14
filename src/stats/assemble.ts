import { addDays, startOfDay, startOfWeek } from 'date-fns'
import { isMatureInterval } from '../db/reviewFields'
import type { Card, ReviewLog } from '../db/schema'
import { cardRetrievability } from '../scheduler/fsrs'
import { todayKey } from '../utils/dates'
import { buttonGroup, dailyLoadContribution, reviewKind } from './classify'
import { dayOffset, rangeWindow } from './range'
import type {
  ButtonRow,
  ButtonStats,
  CalendarStats,
  CardCountStats,
  FutureDueStats,
  HistogramStats,
  HourlyBin,
  RetentionRow,
  RetrievabilityStats,
  ReviewKind,
  StackedBucket,
  StackedSeries,
  StatsRange,
  StatsSnapshot,
  TodayStats,
} from './types'

const EMPTY_STACK: Omit<StackedBucket, 'key'> = {
  learn: 0,
  young: 0,
  mature: 0,
  relearn: 0,
  extra: 0,
  total: 0,
}

function emptyButtons(): ButtonRow {
  return { again: 0, hard: 0, good: 0, easy: 0, correctPct: 0 }
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 1000) / 10
}

function nullablePct(part: number, whole: number): number | null {
  if (whole <= 0) return null
  return Math.round((part / whole) * 1000) / 10
}

function addKind(bucket: StackedBucket, kind: ReviewKind, amount: number) {
  bucket[kind] += amount
  bucket.total += amount
}

export function firstReviewsPerDay(logs: ReviewLog[]): ReviewLog[] {
  const sorted = [...logs].sort((a, b) => a.reviewedAt - b.reviewedAt)
  const seen = new Set<string>()
  const first: ReviewLog[] = []
  for (const log of sorted) {
    if (log.source !== 'normal') continue
    const key = `${log.cardId}:${todayKey(new Date(log.reviewedAt))}`
    if (seen.has(key)) continue
    seen.add(key)
    first.push(log)
  }
  return first
}

function stackedSeries(
  logs: ReviewLog[],
  start: number,
  end: number,
  chunkDays: number,
  value: (log: ReviewLog) => number,
): StackedSeries {
  if (end <= start) return { buckets: [], cumulative: [] }
  const span = Math.max(1, Math.ceil((end - start) / (chunkDays * 86_400_000)))
  const buckets: StackedBucket[] = []
  for (let i = 0; i < span; i++) {
    buckets.push({ key: String(i), ...EMPTY_STACK })
  }
  for (const log of logs) {
    if (log.reviewedAt < start || log.reviewedAt > end) continue
    const index = Math.min(
      buckets.length - 1,
      Math.max(0, Math.floor((log.reviewedAt - start) / (chunkDays * 86_400_000))),
    )
    addKind(buckets[index]!, reviewKind(log), value(log))
  }
  let running = 0
  const cumulative = buckets.map((bucket) => {
    running += bucket.total
    return running
  })
  return { buckets, cumulative }
}

function buildToday(logs: ReviewLog[], cards: Card[], now: Date): TodayStats {
  const start = startOfDay(now).getTime()
  const todayLogs = logs.filter((log) => log.reviewedAt >= start)
  const again = todayLogs.filter((log) => log.rating === 1).length
  const counts = { learn: 0, review: 0, relearn: 0, extra: 0 }
  let durationMs = 0
  for (const log of todayLogs) {
    durationMs += log.durationMs ?? 0
    const kind = reviewKind(log)
    if (kind === 'extra') counts.extra += 1
    else if (kind === 'relearn') counts.relearn += 1
    else if (kind === 'learn') counts.learn += 1
    else counts.review += 1
  }
  const overdue = cards.filter(
    (card) =>
      card.active === 1 && card.state !== 'new' && card.due <= now.getTime(),
  ).length
  return {
    reviews: todayLogs.length,
    again,
    correctPct: pct(todayLogs.length - again, todayLogs.length),
    ...counts,
    durationMs,
    overdue,
  }
}

function buildFutureDue(
  cards: Card[],
  horizonDays: number,
  now: Date,
): FutureDueStats {
  const buckets: FutureDueStats['buckets'] = []
  for (let offset = 0; offset < horizonDays; offset++) {
    buckets.push({ offset, due: 0, cumulative: 0 })
  }
  let overdue = 0
  let load = 0
  const nowMs = now.getTime()
  for (const card of cards) {
    if (card.active !== 1 || card.state === 'new') continue
    load += dailyLoadContribution(card.scheduledDays)
    if (card.due <= nowMs) {
      overdue += 1
      continue
    }
    const offset = dayOffset(card.due, now)
    if (offset < 0 || offset >= horizonDays) continue
    buckets[offset]!.due += 1
  }
  let running = 0
  for (const bucket of buckets) {
    running += bucket.due
    bucket.cumulative = running
  }
  return {
    buckets,
    dailyLoad: Math.round(load * 100) / 100,
    overdue,
  }
}

function buildCalendar(logs: ReviewLog[], range: StatsRange, now: Date): CalendarStats {
  const window = rangeWindow(range, now)
  const from =
    range === 'all'
      ? addDays(startOfDay(now), -364)
      : startOfDay(new Date(Math.max(window.start, addDays(now, -364).getTime())))
  const begin = startOfWeek(from, { weekStartsOn: 0 })
  const end = startOfDay(now)
  const counts = new Map<string, number>()
  for (const log of logs) {
    const key = todayKey(new Date(log.reviewedAt))
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const weeks: CalendarStats['weeks'] = []
  let cursor = begin
  let week: CalendarStats['weeks'][number] = []
  while (cursor.getTime() <= end.getTime() + 6 * 86_400_000) {
    week.push({
      date: todayKey(cursor),
      count: counts.get(todayKey(cursor)) ?? 0,
    })
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
    cursor = addDays(cursor, 1)
    if (weeks.length >= 53) break
  }
  if (week.length > 0) weeks.push(week)
  return { weeks }
}

function buildCardCounts(cards: Card[]): CardCountStats {
  const counts: CardCountStats = {
    new: 0,
    youngLearn: 0,
    mature: 0,
    suspended: 0,
    total: cards.length,
  }
  for (const card of cards) {
    if (card.active === 0) {
      counts.suspended += 1
      continue
    }
    if (card.state === 'new') counts.new += 1
    else if (card.state === 'review' && isMatureInterval(card.scheduledDays)) {
      counts.mature += 1
    } else counts.youngLearn += 1
  }
  return counts
}

function histogram(
  values: number[],
  bins: { key: string; test: (value: number) => boolean }[],
): HistogramStats {
  const counts = bins.map(() => 0)
  for (const value of values) {
    const index = bins.findIndex((bin) => bin.test(value))
    if (index >= 0) counts[index]! += 1
  }
  const total = values.length
  let running = 0
  return {
    bins: bins.map((bin, index) => {
      running += counts[index]!
      return {
        key: bin.key,
        count: counts[index]!,
        cumulativePct: pct(running, total),
      }
    }),
    average: total ? values.reduce((sum, value) => sum + value, 0) / total : 0,
  }
}

function intervalHistogram(cards: Card[], horizonDays: number): HistogramStats {
  const studied = cards.filter(
    (card) => card.active === 1 && card.state !== 'new',
  )
  const values = studied.map((card) => Math.max(0, card.scheduledDays))
  const max = horizonDays
  const bins = []
  if (max <= 31) {
    for (let day = 1; day <= max; day++) {
      const d = day
      bins.push({ key: `${d}d`, test: (value: number) => Math.round(value) === d })
    }
  } else if (max <= 90) {
    for (let week = 1; week <= Math.ceil(max / 7); week++) {
      const w = week
      bins.push({
        key: `${w}w`,
        test: (value: number) => Math.ceil(value / 7) === w,
      })
    }
  } else {
    for (let month = 1; month <= Math.ceil(max / 30); month++) {
      const m = month
      bins.push({
        key: `${m}mo`,
        test: (value: number) => Math.ceil(Math.max(value, 1) / 30) === m,
      })
    }
  }
  return histogram(values.filter((value) => value <= max), bins)
}

function stabilityHistogram(cards: Card[]): HistogramStats {
  const values = cards
    .filter((card) => card.active === 1 && card.state !== 'new')
    .map((card) => card.stability)
  const edges = [1, 2, 3, 7, 14, 30, 60, 120, 365]
  const bins = edges.map((edge, index) => {
    const prev = index === 0 ? 0 : edges[index - 1]!
    return {
      key: `${edge}d`,
      test: (value: number) => value > prev && value <= edge,
    }
  })
  bins.push({ key: '1y+', test: (value: number) => value > 365 })
  return histogram(values, bins)
}

function difficultyHistogram(cards: Card[]): HistogramStats {
  const values = cards
    .filter((card) => card.active === 1 && card.state !== 'new')
    .map((card) => card.difficulty)
  const bins = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1
    return {
      key: String(n),
      test: (value: number) => Math.min(10, Math.max(1, Math.round(value))) === n,
    }
  })
  return histogram(values, bins)
}

function retrievabilityStats(cards: Card[], now: Date): RetrievabilityStats {
  const studied = cards.filter(
    (card) => card.active === 1 && card.state !== 'new',
  )
  const values = studied
    .map((card) => cardRetrievability(card, now))
    .filter((value): value is number => value != null)
  const bins = Array.from({ length: 10 }, (_, i) => {
    const lo = i / 10
    const hi = (i + 1) / 10
    return {
      key: `${Math.round(hi * 100)}%`,
      test: (value: number) => value >= lo && (i === 9 ? value <= hi : value < hi),
    }
  })
  const base = histogram(values, bins)
  const average = base.average
  return {
    ...base,
    estimatedKnowledge: Math.round(average * studied.length * 10) / 10,
  }
}

function hourlyBreakdown(logs: ReviewLog[]): HourlyBin[] {
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
    passed: 0,
  }))
  for (const log of logs) {
    if (log.source !== 'normal') continue
    const hour = new Date(log.reviewedAt).getHours()
    hours[hour]!.count += 1
    if (log.rating !== 1) hours[hour]!.passed += 1
  }
  return hours.map((row) => ({
    hour: row.hour,
    count: row.count,
    passPct: pct(row.passed, row.count),
  }))
}

function buildButtons(logs: ReviewLog[]): ButtonStats {
  const stats: ButtonStats = {
    learn: emptyButtons(),
    young: emptyButtons(),
    mature: emptyButtons(),
  }
  for (const log of logs) {
    const group = buttonGroup(log)
    if (!group) continue
    const row = stats[group]
    if (log.rating === 1) row.again += 1
    else if (log.rating === 2) row.hard += 1
    else if (log.rating === 3) row.good += 1
    else row.easy += 1
  }
  for (const row of Object.values(stats)) {
    const total = row.again + row.hard + row.good + row.easy
    row.correctPct = pct(total - row.again, total)
  }
  return stats
}

function retentionRow(
  id: RetentionRow['id'],
  label: string,
  logs: ReviewLog[],
): RetentionRow {
  let youngPass = 0
  let youngFail = 0
  let maturePass = 0
  let matureFail = 0
  for (const log of logs) {
    const fail = log.rating === 1
    if (isMatureInterval(log.intervalBefore)) {
      if (fail) matureFail += 1
      else maturePass += 1
    } else if (fail) youngFail += 1
    else youngPass += 1
  }
  const youngTotal = youngPass + youngFail
  const matureTotal = maturePass + matureFail
  return {
    id,
    label,
    youngPass,
    youngFail,
    maturePass,
    matureFail,
    youngPct: nullablePct(youngPass, youngTotal),
    maturePct: nullablePct(maturePass, matureTotal),
    totalPct: nullablePct(youngPass + maturePass, youngTotal + matureTotal),
  }
}

export function buildRetention(logs: ReviewLog[], now: Date): RetentionRow[] {
  const first = firstReviewsPerDay(logs)
  const start = startOfDay(now).getTime()
  const inRange = (from: number, to: number) =>
    first.filter((log) => log.reviewedAt >= from && log.reviewedAt < to)
  return [
    retentionRow('today', '今日', inRange(start, start + 86_400_000)),
    retentionRow('yesterday', '昨日', inRange(start - 86_400_000, start)),
    retentionRow('week', '1週間', inRange(start - 7 * 86_400_000, start + 86_400_000)),
    retentionRow('month', '1ヶ月', inRange(start - 30 * 86_400_000, start + 86_400_000)),
    retentionRow('year', '1年', inRange(start - 365 * 86_400_000, start + 86_400_000)),
    retentionRow('all', 'すべて', first),
  ]
}

export function assembleStats(input: {
  title: string
  range: StatsRange
  cards: Card[]
  logs: ReviewLog[]
  now?: Date
}): StatsSnapshot {
  const now = input.now ?? new Date()
  const window = { ...rangeWindow(input.range, now) }
  if (input.range === 'all') {
    const times = input.logs.map((log) => log.reviewedAt)
    window.start = times.length
      ? Math.min(...times)
      : now.getTime() - 365 * 86_400_000
  }
  const rangedLogs = input.logs.filter(
    (log) => log.reviewedAt >= window.start && log.reviewedAt <= window.end,
  )
  return {
    title: input.title,
    range: input.range,
    today: buildToday(input.logs, input.cards, now),
    futureDue: buildFutureDue(input.cards, window.horizonDays, now),
    calendar: buildCalendar(input.logs, input.range, now),
    reviews: stackedSeries(rangedLogs, window.start, window.end, window.chunkDays, () => 1),
    reviewTime: stackedSeries(
      rangedLogs,
      window.start,
      window.end,
      window.chunkDays,
      (log) => (log.durationMs ?? 0) / 1000,
    ),
    cardCounts: buildCardCounts(input.cards),
    intervals: intervalHistogram(input.cards, window.horizonDays),
    stability: stabilityHistogram(input.cards),
    difficulty: difficultyHistogram(input.cards),
    retrievability: retrievabilityStats(input.cards, now),
    hourly: hourlyBreakdown(rangedLogs),
    buttons: buildButtons(rangedLogs),
    retention: buildRetention(input.logs, now),
    hasDuration: input.logs.some((log) => (log.durationMs ?? 0) > 0),
  }
}

export function emptyStats(title: string, range: StatsRange): StatsSnapshot {
  return assembleStats({ title, range, cards: [], logs: [] })
}
