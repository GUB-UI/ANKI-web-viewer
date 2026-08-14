export type StatsRange = 'month' | 'year' | 'all'

export type ReviewKind = 'learn' | 'young' | 'mature' | 'relearn' | 'extra'

export interface TodayStats {
  reviews: number
  again: number
  correctPct: number
  learn: number
  review: number
  relearn: number
  extra: number
  durationMs: number
  overdue: number
}

export interface FutureDueBucket {
  offset: number
  due: number
  cumulative: number
}

export interface FutureDueStats {
  buckets: FutureDueBucket[]
  dailyLoad: number
  overdue: number
}

export interface CalendarCell {
  date: string
  count: number
}

export interface CalendarStats {
  weeks: CalendarCell[][]
}

export interface StackedBucket {
  key: string
  learn: number
  young: number
  mature: number
  relearn: number
  extra: number
  total: number
}

export interface StackedSeries {
  buckets: StackedBucket[]
  cumulative: number[]
}

export interface CardCountStats {
  new: number
  youngLearn: number
  mature: number
  suspended: number
  total: number
}

export interface HistogramBin {
  key: string
  count: number
  cumulativePct: number
}

export interface HistogramStats {
  bins: HistogramBin[]
  average: number
}

export interface RetrievabilityStats extends HistogramStats {
  estimatedKnowledge: number
}

export interface HourlyBin {
  hour: number
  count: number
  passPct: number
}

export interface ButtonRow {
  again: number
  hard: number
  good: number
  easy: number
  correctPct: number
}

export interface ButtonStats {
  learn: ButtonRow
  young: ButtonRow
  mature: ButtonRow
}

export interface RetentionRow {
  id: 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all'
  label: string
  youngPass: number
  youngFail: number
  maturePass: number
  matureFail: number
  youngPct: number | null
  maturePct: number | null
  totalPct: number | null
}

export interface StatsSnapshot {
  title: string
  range: StatsRange
  today: TodayStats
  futureDue: FutureDueStats
  calendar: CalendarStats
  reviews: StackedSeries
  reviewTime: StackedSeries
  cardCounts: CardCountStats
  intervals: HistogramStats
  stability: HistogramStats
  difficulty: HistogramStats
  retrievability: RetrievabilityStats
  hourly: HourlyBin[]
  buttons: ButtonStats
  retention: RetentionRow[]
  hasDuration: boolean
}
