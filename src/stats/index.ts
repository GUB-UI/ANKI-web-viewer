/**
 * Statistics domain — pages should import only from here.
 *
 * Hides Dexie scans, day buckets, mature/young rules, and FSRS histograms.
 */
export { loadStats, type StatsScope } from './queries'
export { emptyStats } from './assemble'
export type {
  StatsRange,
  StatsSnapshot,
  TodayStats,
  FutureDueStats,
  CalendarStats,
  StackedSeries,
  CardCountStats,
  HistogramStats,
  RetrievabilityStats,
  HourlyBin,
  ButtonStats,
  RetentionRow,
} from './types'
