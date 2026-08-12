import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../db/database'
import type { Deck } from '../db/schema'
import {
  buildFailedCardsQueue,
  countFailedCards,
  getDailyNewOverride,
  setDailyNewOverride,
} from '../study/customStudy'
import { getEffectiveNewLimit } from '../study/queue'

export function CustomStudyPage() {
  const { deckId = '' } = useParams()
  const navigate = useNavigate()
  const [deck, setDeck] = useState<Deck | null>(null)
  const [newLimit, setNewLimit] = useState(20)
  const [overrideInput, setOverrideInput] = useState(20)
  const [days, setDays] = useState(7)
  const [failedCount, setFailedCount] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const d = await db.decks.get(deckId)
      if (!alive || !d) return
      setDeck(d)
      const effective = await getEffectiveNewLimit(deckId, d)
      const ov = await getDailyNewOverride(deckId)
      setNewLimit(effective)
      setOverrideInput(ov ?? effective)
      const { count } = await countFailedCards(deckId, days)
      if (alive) setFailedCount(count)
    })()
    return () => {
      alive = false
    }
  }, [deckId])

  useEffect(() => {
    let alive = true
    countFailedCards(deckId, days).then(({ count }) => {
      if (alive) setFailedCount(count)
    })
    return () => {
      alive = false
    }
  }, [deckId, days])

  async function saveOverride() {
    setSaving(true)
    try {
      await setDailyNewOverride(deckId, Math.max(0, Math.floor(overrideInput)))
      setNewLimit(Math.max(0, Math.floor(overrideInput)))
    } finally {
      setSaving(false)
    }
  }

  async function startFailedReview() {
    const cards = await buildFailedCardsQueue(deckId, days)
    sessionStorage.setItem(
      `customQueue:${deckId}`,
      JSON.stringify(cards.map((c) => c.id)),
    )
    navigate(`/custom-review/${deckId}`)
  }

  return (
    <div className="app-shell">
      <header className="page-header">
        <Link to="/" className="icon-btn" aria-label="戻る">
          ←
        </Link>
        <h1>カスタム学習</h1>
        <div style={{ width: 48 }} />
      </header>

      <p className="muted" style={{ marginTop: 0 }}>
        {deck?.path ?? '—'}
      </p>

      <section className="section">
        <h2>今日の新規カード</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          デッキ設定は変えず、このデッキと配下の合計上限を今日だけ上書きします。
          現在の有効値: {newLimit}
        </p>
        <div className="field">
          <label htmlFor="new-limit">今日だけ</label>
          <input
            id="new-limit"
            type="number"
            min={0}
            inputMode="numeric"
            value={overrideInput}
            onChange={(e) => setOverrideInput(Number(e.target.value))}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary btn-block"
          style={{ marginTop: 12 }}
          disabled={saving}
          onClick={saveOverride}
        >
          今日の上限を保存
        </button>
      </section>

      <section className="section">
        <h2>間違えたカードを復習</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          通常学習で Again したカードだけ。FSRS予定は変更しません。
        </p>
        <div className="field">
          <label htmlFor="failed-days">過去 N 日</label>
          <input
            id="failed-days"
            type="number"
            min={1}
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
        <p style={{ margin: '12px 0' }}>
          対象 <strong>{failedCount}</strong> cards
        </p>
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={failedCount === 0}
          onClick={startFailedReview}
        >
          復習する
        </button>
      </section>
    </div>
  )
}
