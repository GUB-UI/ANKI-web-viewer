import type {
  ButtonStats,
  CalendarStats,
  CardCountStats,
  FutureDueStats,
  HistogramStats,
  HourlyBin,
  RetentionRow,
  RetrievabilityStats,
  StackedSeries,
} from '../stats'

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

export function StackedBars({
  series,
  unit,
}: {
  series: StackedSeries
  unit?: string
}) {
  if (series.buckets.every((bucket) => bucket.total === 0)) {
    return <p className="muted stats-empty">まだ記録がありません</p>
  }
  const peak = maxOf(series.buckets.map((bucket) => bucket.total))
  return (
    <div>
      <div className="stats-bars" role="img" aria-label="積み上げ棒グラフ">
        {series.buckets.map((bucket, index) => (
          <div key={bucket.key + index} className="stats-bar">
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
      {unit ? <p className="muted stats-note">{unit}</p> : null}
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
}: {
  data: HistogramStats
  showAverage?: boolean
}) {
  if (data.bins.every((bin) => bin.count === 0)) {
    return <p className="muted stats-empty">まだ記録がありません</p>
  }
  const peak = maxOf(data.bins.map((bin) => bin.count))
  return (
    <div>
      {showAverage ? (
        <p className="stats-avg numeric">平均 {formatAvg(data.average)}</p>
      ) : null}
      <div className="stats-bars stats-bars-wide" role="img" aria-label="分布">
        {data.bins.map((bin) => (
          <div key={bin.key} className="stats-bar">
            <div
              className="stats-bar-fill"
              style={{ height: `${(bin.count / peak) * 100}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export function FutureDueChart({ data }: { data: FutureDueStats }) {
  if (data.buckets.every((bucket) => bucket.due === 0) && data.overdue === 0) {
    return <p className="muted stats-empty">予定されている復習はありません</p>
  }
  const peak = maxOf(data.buckets.map((bucket) => bucket.due))
  return (
    <div>
      <p className="stats-avg numeric">
        Daily load {data.dailyLoad}
        {data.overdue > 0 ? ` · 遅れ ${data.overdue}` : ''}
      </p>
      <div className="stats-bars" role="img" aria-label="今後の復習">
        {data.buckets.map((bucket) => (
          <div key={bucket.offset} className="stats-bar">
            <div
              className="stats-bar-fill stats-seg-mature"
              style={{ height: `${(bucket.due / peak) * 100}%` }}
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
  if (hours.every((row) => row.count === 0)) {
    return <p className="muted stats-empty">まだ記録がありません</p>
  }
  const peak = maxOf(hours.map((row) => row.count))
  return (
    <div className="stats-hourly">
      {hours.map((row) => (
        <div key={row.hour} className="stats-hourly-col">
          <div
            className="stats-bar-fill"
            style={{ height: `${(row.count / peak) * 100}%` }}
          />
          <span className="stats-hourly-pass">{row.count ? `${Math.round(row.passPct)}` : ''}</span>
        </div>
      ))}
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
