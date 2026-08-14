import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { StudyCardView } from '../components/StudyCard'
import { db, ensureSettings } from '../db/database'
import type { Card, Note, RatingValue, ReviewSource } from '../db/schema'
import {
  applyRating,
  loadStudyCards,
  ratingPreviews,
  remainingCounts,
} from '../study'
import { renderCardContent } from '../utils/cardRender'

export function StudyPage({ source = 'normal' as ReviewSource }) {
  const { deckId = '' } = useParams()
  const [queue, setQueue] = useState<Card[]>([])
  const [note, setNote] = useState<Note | null>(null)
  const [deckPath, setDeckPath] = useState('')
  const [showAnswer, setShowAnswer] = useState(false)
  const [loading, setLoading] = useState(true)
  const [swipeEnabled, setSwipeEnabled] = useState(true)
  const [autoFlipEnabled, setAutoFlipEnabled] = useState(false)
  const [autoFlipSeconds, setAutoFlipSeconds] = useState(5)
  const [busy, setBusy] = useState(false)
  const [answered, setAnswered] = useState(0)

  const card = queue[0]

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const settings = await ensureSettings()
      if (!alive) return
      setSwipeEnabled(settings.swipeEnabled)
      setAutoFlipEnabled(settings.autoFlipEnabled)
      setAutoFlipSeconds(settings.autoFlipSeconds)

      const cards = await loadStudyCards(deckId, source)
      if (!alive) return
      setQueue(cards)
      setAnswered(0)
      setShowAnswer(false)
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [deckId, source])

  useEffect(() => {
    if (!card) {
      setNote(null)
      return
    }
    let alive = true
    ;(async () => {
      const [n, d] = await Promise.all([
        db.notes.get(card.noteId),
        db.decks.get(card.deckId),
      ])
      if (!alive) return
      setNote(n ?? null)
      setDeckPath(d?.path ?? '')
    })()
    return () => {
      alive = false
    }
  }, [card])

  const rendered = useMemo(() => {
    if (!card || !note) return null
    return renderCardContent(card, note, deckPath)
  }, [card, note, deckPath])

  const previews = useMemo(() => ratingPreviews(card ?? null, source), [card, source])
  const reveal = useCallback(() => setShowAnswer(true), [])

  async function onRate(rating: RatingValue) {
    if (!card || busy) return
    setBusy(true)
    try {
      const { remaining } = await applyRating(card, rating, source, queue)
      setAnswered((n) => n + 1)
      setShowAnswer(false)
      setQueue(remaining)
    } finally {
      setBusy(false)
    }
  }

  const done = !loading && !card
  const remaining = useMemo(() => remainingCounts(queue), [queue])
  const totalHint = answered + queue.length
  const progress = totalHint ? answered / totalHint : 0

  return (
    <div className="app-shell study-screen">
      <header className="page-header" style={{ alignItems: 'center' }}>
        <Link to="/" className="icon-btn" aria-label="戻る">
          ←
        </Link>
        <h1 className={source === 'custom' ? 'mode-chip' : 'sr-only'}>
          {source === 'custom' ? '補強復習' : '学習'}
        </h1>
        {!done && (
          <div
            className="study-counts"
            aria-label={`新規 ${remaining.new}、学習中 ${remaining.learning}、復習 ${remaining.review}`}
          >
            <span className="count-new">{remaining.new}</span>
            <span className="count-learn">{remaining.learning}</span>
            <span className="count-review">{remaining.review}</span>
          </div>
        )}
      </header>

      <div className="progress-line">
        <div style={{ width: `${Math.min(progress, 1) * 100}%` }} />
      </div>

      {loading ? (
        <p className="muted">読み込み中...</p>
      ) : done ? (
        <div className="done-panel">
          <div>
            <h2>完了</h2>
            <p className="muted">
              {source === 'custom'
                ? '補強復習はスケジュールを変更していません。'
                : '今日のカードはここまで。'}
            </p>
            <Link to="/" className="btn btn-primary btn-block" style={{ marginTop: 20 }}>
              デッキへ戻る
            </Link>
          </div>
        </div>
      ) : rendered ? (
        <>
          <div className="study-path">
            <span className="eyebrow" aria-hidden />
            {rendered.deckPathParts.join(' › ')}
          </div>
          <StudyCardView
            key={card!.id + ':' + answered}
            rendered={rendered}
            showAnswer={showAnswer}
            onReveal={reveal}
            previews={previews}
            onRate={onRate}
            answering={busy}
            swipeEnabled={swipeEnabled && showAnswer}
            autoFlipEnabled={autoFlipEnabled}
            autoFlipSeconds={autoFlipSeconds}
          />
        </>
      ) : (
        <p className="muted">カードを表示できません。</p>
      )}
    </div>
  )
}

export function CustomReviewPage() {
  return <StudyPage source="custom" />
}
