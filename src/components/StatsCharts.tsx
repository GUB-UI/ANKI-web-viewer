import { useRef, useState, type PointerEvent } from 'react'
import type {
  ButtonStats,
  CalendarStats,
  CardCountStats,
  FutureDueStats,
  HistogramStats,
  HourlyBin,
  RetentionRow,
  RetrievabilityStats,
  StackedBucket,
  StackedSeries,
} from '../stats'
import { barIndexAt } from './barScrub'

const STACK_KEYS = ['learn', 'young', 'mature', 'relearn', 'extra'] as const
const STACK_LABEL: Record<(typeof STACK_KEYS)[number], string> = {
  learn: '学習',
  young: 'Young',
  mature: 'Mature',
  relearn: '再学習',
  extra: '補強',
}

function maxOf(values: number[]): number {
  return Math.max(1, ...values)
}

function useBarScrub(count: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState<number | null>(null)

  function pick(event: PointerEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el || count <= 0) return
    const rect = el.getBoundingClientRect()
    setIndex(barIndexAt(event.clientX - rect.left, rect.width, count))
  }

  return {
    ref,
    index,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        pick(event)
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        pick(event)
      },
    },
  }
}

function ScrubReadout({
  text,
  hint,
}: {
  text: string | null
  hint: string
}) {
  return (
    <p className={`stats-avg numeric${text ? ' is-live' : ''}`} aria-live="polite">
      {text ?? hint}
    </p>
  )
}

export function StackedBars({
  series,
  unit,
  labelOf,
}: {
  series: StackedSeries
  unit?: string
  labelOf?: (index: number, bucket: StackedBucket) => string
}) {
  const { ref, index, handlers } = useBarScrub(series.buckets.length)
  if (series.buckets.every((bucket) => bucket.total === 0)) {
    return <p className="muted stats-empty">まだ記録がありません</p>
  }
  const peak = maxOf(series.buckets.map((bucket) => bucket.total))
  const active = index != null ? series.buckets[index] : undefined
  const parts = active
    ? STACK_KEYS.filter((key) => active[key] > 0)
        .map((key) => `${STACK_LABEL[key]} ${formatAvg(active[key])}`)
        .join(' · ')
    : ''
  const title =
    active && index != null
      ? (labelOf?.(index, active) ?? `区間 ${index + 1}`)
      : null
  const detail = active
    ? `${title} · ${formatAvg(active.total)}${unit ? unit : ''}${parts ? `（${parts}）` : ''}`
    : null
  return (
    <div>
      <ScrubReadout text={detail} hint="棒をなぞると詳細" />
      <div
        ref={ref}
        className={`stats-bars${index != null ? ' is-scrubbing' : ''}`}
        role="img"
        aria-label="積み上げ棒グラフ"
        {...handlers}
      >
        {series.buckets.map((bucket, barIndex) => (
          <div
            key={bucket.key + barIndex}
            className={`stats-bar${index === barIndex ? ' is-active' : ''}`}
          >
            <div className="stats-bar-stack" style={{ height: `${(bucket.total / peak) * 100}%` }}>
              {STACK_KEYS.map((key) =>
                bucket[key] > 0 ? (
                  <span
                    key={key}
                    className={`stats-seg stats-seg-${key}`}
                    style={{ flexGrow: bucket[key] }}
                  />
                ) : null,
              )}
            </div>
          </div>
        ))}
      </div>
      <ul className="stats-legend">
        {STACK_KEYS.map((key) => (
          <li key={key}>
            <i className={`stats-dot stats-seg-${key}`} />
            {STACK_LABEL[key]}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Heatmap({ calendar }: { calendar: CalendarStats }) {
  const max = maxOf(calendar.weeks.flat().map((cell) => cell.count))
  const hasAny = calendar.weeks.some((week) => week.some((cell) => cell.count > 0))
  if (!hasAny) return <p className="muted stats-empty">まだ記録がありません</p>
  return (
    <div className="stats-heat" role="img" aria-label="学習カレンダー">
      {calendar.weeks.map((week, wi) => (
        <div key={wi} className="stats-heat-week">
          {week.map((cell) => {
            const level =
              cell.count <= 0 ? 0 : Math.min(4, Math.ceil((cell.count / max) * 4))
            return (
              <span
                key={cell.date}
                className={`stats-heat-cell lv-${level}`}
                title={`${cell.date} · ${cell.count}`}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function HistogramBars({
  data,
  showAverage = true,
  unit = '枚',
}: {
  data: HistogramStats
  showAverage?: boolean
  unit?: string
}) {
  const { ref, index, handlers } = useBarScrub(data.bins.length)
  if (data.bins.every((bin) => bin.count === 0)) {
    return <p className="muted stats-empty">まだ記録がありません</p>
  }
  const peak = maxOf(data.bins.map((bin) => bin.count))
  const bin = index != null ? data.bins[index] : undefined
  const detail = bin
    ? `${bin.key} · ${bin.count}${unit} · 累積 ${bin.cumulativePct}%`
    : null
  const hint = showAverage ? `平均 ${formatAvg(data.average)} · なぞると詳細` : '棒をなぞると詳細'
  return (
    <div>
      <ScrubReadout text={detail} hint={hint} />
      <div
        ref={ref}
        className={`stats-bars stats-bars-wide${index != null ? ' is-scrubbing' : ''}`}
        role="img"
        aria-label="分布"
        {...handlers}
      >
        {data.bins.map((item, barIndex) => (
          <div
            key={item.key}
            className={`stats-bar${index === barIndex ? ' is-active' : ''}`}
          >
            <div
              className="stats-bar-fill"
              style={{ height: `${(item.count / peak) * 100}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export function FutureDueChart({ data }: { data: FutureDueStats }) {
  const { ref, index, handlers } = useBarScrub(data.buckets.length)
  if (data.buckets.every((bucket) => bucket.due === 0) && data.overdue === 0) {
    return <p className="muted stats-empty">予定されている復習はありません</p>
  }
  const peak = maxOf(data.buckets.map((bucket) => bucket.due))
  const bucket = index != null ? data.buckets[index] : undefined
  const when =
    bucket == null
      ? null
      : bucket.offset === 0
        ? '今日'
        : bucket.offset === 1
          ? '明日'
          : `${bucket.offset}日後`
  const detail = bucket
    ? `${when} · ${bucket.due}枚 · 累積 ${bucket.cumulative}`
    : null
  const hint = `Daily load ${data.dailyLoad}${data.overdue > 0 ? ` · 遅れ ${data.overdue}` : ''} · なぞると詳細`
  return (
    <div>
      <ScrubReadout text={detail} hint={hint} />
      <div
        ref={ref}
        className={`stats-bars${index != null ? ' is-scrubbing' : ''}`}
        role="img"
        aria-label="今後の復習"
        {...handlers}
      >
        {data.buckets.map((item, barIndex) => (
          <div
            key={item.offset}
            className={`stats-bar${index === barIndex ? ' is-active' : ''}`}
          >
            <div
              className="stats-bar-fill stats-seg-mature"
              style={{ height: `${(item.due / peak) * 100}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export function CardCountList({ data }: { data: CardCountStats }) {
  if (data.total === 0) return <p className="muted stats-empty">カードがありません</p>
  const rows = [
    ['new', '新規', data.new],
    ['young', 'Young / 学習', data.youngLearn],
    ['mature', 'Mature', data.mature],
    ['extra', '停止', data.suspended],
  ] as const
  return (
    <div>
      <div className="stats-count-bar">
        {rows.map(([key, , count]) =>
          count > 0 ? (
            <span
              key={key}
              className={`stats-seg stats-seg-${key}`}
              style={{ flexGrow: count }}
            />
          ) : null,
        )}
      </div>
      <ul className="stats-legend">
        {rows.map(([key, label, count]) => (
          <li key={key}>
            <i className={`stats-dot stats-seg-${key}`} />
            {label} {count}
          </li>
        ))}
      </ul>
      <p className="muted stats-note">合計 {data.total}</p>
    </div>
  )
}

export function HourlyChart({ hours }: { hours: HourlyBin[] }) {
  const { ref, index, handlers } = useBarScrub(hours.length)
  if (hours.every((row) => row.count === 0)) {
    return <p className="muted stats-empty">まだ記録がありません</p>
  }
  const peak = maxOf(hours.map((row) => row.count))
  const row = index != null ? hours[index] : undefined
  const detail = row
    ? `${row.hour}時 · ${row.count}回 · 正答 ${Math.round(row.passPct)}%`
    : null
  return (
    <div>
      <ScrubReadout text={detail} hint="棒をなぞると詳細" />
      <div
        ref={ref}
        className={`stats-hourly${index != null ? ' is-scrubbing' : ''}`}
        role="img"
        aria-label="時間帯"
        {...handlers}
      >
        {hours.map((item, barIndex) => (
          <div
            key={item.hour}
            className={`stats-hourly-col${index === barIndex ? ' is-active' : ''}`}
          >
            <div
              className="stats-bar-fill"
              style={{ height: `${(item.count / peak) * 100}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export function ButtonTable({ data }: { data: ButtonStats }) {
  const rows = [
    ['学習', data.learn],
    ['Young', data.young],
    ['Mature', data.mature],
  ] as const
  return (
    <table className="stats-table">
      <thead>
        <tr>
          <th />
          <th>Again</th>
          <th>Hard</th>
          <th>Good</th>
          <th>Easy</th>
          <th>%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, row]) => (
          <tr key={label}>
            <th>{label}</th>
            <td>{row.again}</td>
            <td>{row.hard}</td>
            <td>{row.good}</td>
            <td>{row.easy}</td>
            <td>{row.correctPct}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function RetentionTable({ rows }: { rows: RetentionRow[] }) {
  return (
    <table className="stats-table">
      <thead>
        <tr>
          <th />
          <th>Young</th>
          <th>Mature</th>
          <th>合計</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <th>{row.label}</th>
            <td>{fmtPct(row.youngPct)}</td>
            <td>{fmtPct(row.maturePct)}</td>
            <td>{fmtPct(row.totalPct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function RetrievabilityBlock({ data }: { data: RetrievabilityStats }) {
  return (
    <div>
      <p className="stats-avg numeric">
        推定知識 {data.estimatedKnowledge} · 平均 {Math.round(data.average * 1000) / 10}%
      </p>
      <HistogramBars data={data} showAverage={false} />
    </div>
  )
}

function fmtPct(value: number | null): string {
  return value == null ? '—' : `${value}%`
}

function formatAvg(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0'
  return String(Math.round(value * 10) / 10)
}
