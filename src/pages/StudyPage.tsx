import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { StudyCardView } from '../components/StudyCard'
import { db, ensureSettings } from '../db/database'
import type { Card, Note, RatingValue, ReviewSource } from '../db/schema'
import { previewRatings } from '../scheduler/fsrs'
import { renderCardContent } from '../utils/cardRender'
import { buildStudyQueue } from '../study/queue'
import { answerCard } from '../study/review'

/** Re-queue learning cards due within this window in the same session */
const LEARNING_REQUEUE_MS = 25 * 60 * 1000

export function StudyPage({ source = 'normal' as ReviewSource }) {
  const { deckId = '' } = useParams()
  const [queue, setQueue] = useState<Card[]>([])
  const [index, setIndex] = useState(0)
  const [note, setNote] = useState<Note | null>(null)
  const [deckPath, setDeckPath] = useState('')
  const [showAnswer, setShowAnswer] = useState(false)
  const [loading, setLoading] = useState(true)
  const [swipeEnabled, setSwipeEnabled] = useState(true)
  const [busy, setBusy] = useState(false)
  const [answered, setAnswered] = useState(0)

  const card = queue[index]

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const settings = await ensureSettings()
      if (!alive) return
      setSwipeEnabled(settings.swipeEnabled)

      if (source === 'custom') {
        const raw = sessionStorage.getItem(`customQueue:${deckId}`)
        const ids: string[] = raw ? (JSON.parse(raw) as string[]) : []
        const cards = (await db.cards.bulkGet(ids)).filter((c): c is Card => c != null)
        if (!alive) return
        setQueue(cards)
        setIndex(0)
        setAnswered(0)
        setShowAnswer(false)
        setLoading(false)
        return
      }

      const { cards } = await buildStudyQueue(deckId)
      if (!alive) return
      setQueue(cards)
      setIndex(0)
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

  const previews = useMemo(() => {
    if (!card || source === 'custom') {
      return {
        1: { label: '—', due: 0 },
        2: { label: '—', due: 0 },
        3: { label: '—', due: 0 },
        4: { label: '—', due: 0 },
      }
    }
    return previewRatings(card)
  }, [card, source])

  async function onRate(rating: RatingValue) {
    if (!card || busy) return
    setBusy(true)
    try {
      const updated = await answerCard(card, rating, source)
      setAnswered((n) => n + 1)
      setShowAnswer(false)

      if (source === 'normal') {
        const now = Date.now()
        const stillLearning =
          (updated.state === 'learning' || updated.state === 'relearning') &&
          updated.due <= now + LEARNING_REQUEUE_MS

        setQueue((prev) => {
          const rest = prev.slice(index + 1).filter((c) => c.id !== updated.id)
          if (stillLearning) {
            // Insert by due order among remaining
            const insertAt = rest.findIndex((c) => c.due > updated.due)
            if (insertAt === -1) rest.push(updated)
            else rest.splice(insertAt, 0, updated)
          }
          return rest
        })
        setIndex(0)
      } else {
        setIndex((i) => i + 1)
      }
    } finally {
      setBusy(false)
    }
  }

  const done = !loading && !card
  const remaining = useMemo(() => {
    const cards = source === 'custom' ? queue.slice(index) : queue
    let neu = 0
    let learning = 0
    let review = 0
    for (const item of cards) {
      if (item.state === 'new') neu += 1
      else if (item.state === 'learning' || item.state === 'relearning') learning += 1
      else review += 1
    }
    return { new: neu, learning, review }
  }, [queue, index, source])
  const totalHint = answered + queue.length
  const progress = totalHint ? answered / totalHint : 0

  return (
    <div className="app-shell study-screen">
      <header className="page-header" style={{ alignItems: 'center' }}>
        <Link to="/" className="icon-btn" aria-label="戻る">
          ←
        </Link>
        {/* Plain study needs no title; the reinforcement mode does, since it
            does not touch the schedule. */}
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
            onReveal={() => setShowAnswer(true)}
            previews={previews}
            onRate={onRate}
            swipeEnabled={swipeEnabled && showAnswer}
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
