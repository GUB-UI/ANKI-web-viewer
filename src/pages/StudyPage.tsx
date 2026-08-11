import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { StudyCardView } from '../components/StudyCard'
import { db, ensureSettings } from '../db/database'
import type { Card, Note, RatingValue, ReviewSource } from '../db/schema'
import { previewRatings } from '../scheduler/fsrs'
import { renderCardContent } from '../utils/cardRender'
import { buildStudyQueue } from '../study/queue'
import { answerCard } from '../study/review'

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

  const card = queue[index]

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const settings = await ensureSettings()
      if (!alive) return
      setSwipeEnabled(settings.swipeEnabled)

      if (source === 'custom') {
        // queue injected via sessionStorage by CustomStudyPage
        const raw = sessionStorage.getItem(`customQueue:${deckId}`)
        const ids: string[] = raw ? (JSON.parse(raw) as string[]) : []
        const cards = (await db.cards.bulkGet(ids)).filter((c): c is Card => c != null)
        if (!alive) return
        setQueue(cards)
        setIndex(0)
        setShowAnswer(false)
        setLoading(false)
        return
      }

      const { cards } = await buildStudyQueue(deckId)
      if (!alive) return
      setQueue(cards)
      setIndex(0)
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
      await answerCard(card, rating, source)
      setShowAnswer(false)
      setIndex((i) => i + 1)
    } finally {
      setBusy(false)
    }
  }

  const done = !loading && (!card || index >= queue.length)
  const progress = queue.length ? Math.min(index / queue.length, 1) : 0

  return (
    <div className="app-shell study-screen">
      <header className="page-header">
        <Link to="/" className="icon-btn" aria-label="戻る">
          ←
        </Link>
        <h1>{source === 'custom' ? '補強復習' : '学習'}</h1>
        <div className="muted" style={{ minWidth: 48, textAlign: 'right' }}>
          {Math.min(index + (done ? 0 : 1), queue.length)}/{queue.length}
        </div>
      </header>

      <div className="progress-line">
        <div style={{ width: `${progress * 100}%` }} />
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
          <div className="study-path">{rendered.deckPathParts.join(' › ')}</div>
          <StudyCardView
            key={card!.id}
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
