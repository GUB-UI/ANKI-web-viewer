import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ButtonTable,
  CardCountList,
  FutureDueChart,
  Heatmap,
  HistogramBars,
  HourlyChart,
  RetentionTable,
  RetrievabilityBlock,
  StackedBars,
} from '../components/StatsCharts'
import {
  loadStats,
  type StatsRange,
  type StatsSnapshot,
} from '../stats'

function formatStudyTime(ms: number): string {
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}秒`
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  if (min < 60) return rem ? `${min}分 ${rem}秒` : `${min}分`
  return `${Math.floor(min / 60)}時間 ${min % 60}分`
}

export function StatsPage() {
  const { deckId } = useParams()
  const navigate = useNavigate()
  const [range, setRange] = useState<StatsRange>('year')
  const [snapshot, setSnapshot] = useState<StatsSnapshot | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setSnapshot(null)
    const scope = deckId
      ? ({ kind: 'deck', deckId } as const)
      : ({ kind: 'collection' } as const)
    loadStats(scope, range)
      .then((next) => {
        if (alive) {
          setError('')
          setSnapshot(next)
        }
      })
      .catch((err: unknown) => {
        console.error(err)
        if (alive) setError('統計を読み込めませんでした。')
      })
    return () => {
      alive = false
    }
  }, [deckId, range])

  return (
    <div className="app-shell">
      <header className="page-header">
        <Link to="/" className="icon-btn" aria-label="戻る">
          ←
        </Link>
        <h1>統計</h1>
        <div style={{ width: 48 }} />
      </header>

      <div className="stats-toolbar">
        <div className="stats-chips" role="group" aria-label="範囲">
          <button
            type="button"
            className={!deckId ? 'is-on' : ''}
            onClick={() => navigate('/stats')}
          >
            コレクション
          </button>
          {deckId ? (
            <button type="button" className="is-on">
              このデッキ
            </button>
          ) : null}
        </div>
        <div className="stats-chips" role="group" aria-label="期間">
          {(
            [
              ['month', '1ヶ月'],
              ['year', '1年'],
              ['all', 'すべて'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={range === id ? 'is-on' : ''}
              onClick={() => setRange(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="muted">{error}</p> : null}
      {!snapshot && !error ? <p className="muted">読み込み中...</p> : null}

      {snapshot ? (
        <>
          <p className="muted numeric stats-scope">{snapshot.title}</p>

          <section className="section">
            <span className="eyebrow">01 Today</span>
            <h2>今日</h2>
            <p className="stats-today">
              {snapshot.today.reviews} 回 · Again {snapshot.today.again}（正答{' '}
              {snapshot.today.correctPct}%）
            </p>
            <p className="muted stats-note">
              学習 {snapshot.today.learn} · 復習 {snapshot.today.review} · 再学習{' '}
              {snapshot.today.relearn}
              {snapshot.today.extra ? ` · 補強 ${snapshot.today.extra}` : ''}
            </p>
            <p className="muted stats-note">
              学習時間 {formatStudyTime(snapshot.today.durationMs)}
              {snapshot.today.overdue ? ` · 遅れ ${snapshot.today.overdue}` : ''}
            </p>
          </section>

          <section className="section">
            <span className="eyebrow">02 Forecast</span>
            <h2>今後の復習</h2>
            <FutureDueChart data={snapshot.futureDue} />
          </section>

          <section className="section">
            <span className="eyebrow">03 Calendar</span>
            <h2>カレンダー</h2>
            <Heatmap calendar={snapshot.calendar} />
          </section>

          <section className="section">
            <span className="eyebrow">04 Reviews</span>
            <h2>復習数</h2>
            <StackedBars series={snapshot.reviews} />
          </section>

          <section className="section">
            <span className="eyebrow">05 Cards</span>
            <h2>カード内訳</h2>
            <CardCountList data={snapshot.cardCounts} />
          </section>

          <section className="section">
            <span className="eyebrow">06 Time</span>
            <h2>学習時間</h2>
            {!snapshot.hasDuration ? (
              <p className="muted stats-note">
                所要時間はこれ以降の学習から記録します。取り込み済みの履歴は Anki の time がある分だけ含みます。
              </p>
            ) : null}
            <StackedBars series={snapshot.reviewTime} unit="秒" />
          </section>

          <section className="section">
            <span className="eyebrow">07 Intervals</span>
            <h2>間隔</h2>
            <HistogramBars data={snapshot.intervals} />
          </section>

          <section className="section">
            <span className="eyebrow">08 FSRS</span>
            <h2>安定性</h2>
            <HistogramBars data={snapshot.stability} />
            <h2 style={{ marginTop: 28 }}>難易度</h2>
            <HistogramBars data={snapshot.difficulty} />
            <h2 style={{ marginTop: 28 }}>Retrievability</h2>
            <RetrievabilityBlock data={snapshot.retrievability} />
          </section>

          <section className="section">
            <span className="eyebrow">09 Hourly</span>
            <h2>時間帯</h2>
            <HourlyChart hours={snapshot.hourly} />
          </section>

          <section className="section">
            <span className="eyebrow">10 Buttons</span>
            <h2>回答ボタン</h2>
            <ButtonTable data={snapshot.buttons} />
          </section>

          <section className="section">
            <span className="eyebrow">11 Retention</span>
            <h2>真の定着率</h2>
            <p className="muted stats-note">
              1日1枚の最初の回答のみ。Again が Fail、Mature は間隔 21 日以上。
            </p>
            <RetentionTable rows={snapshot.retention} />
          </section>
        </>
      ) : null}
    </div>
  )
}
