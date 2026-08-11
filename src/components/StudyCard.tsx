import { useMemo, useRef, useState } from 'react'
import type { RatingValue } from '../db/schema'
import { rewriteMediaUrls, type RenderedCard } from '../utils/cardRender'
import { useMediaUrls } from '../hooks/useMediaUrls'
import { RatingButtons } from './RatingButtons'

interface Props {
  rendered: RenderedCard
  showAnswer: boolean
  onReveal: () => void
  previews: Record<RatingValue, { label: string }>
  onRate: (rating: RatingValue) => void
  swipeEnabled: boolean
}

const SWIPE_THRESHOLD = 90

export function StudyCardView({
  rendered,
  showAnswer,
  onReveal,
  previews,
  onRate,
  swipeEnabled,
}: Props) {
  const allMedia = useMemo(() => {
    const names = new Set<string>(rendered.sounds)
    const html = `${rendered.frontHtml}${rendered.backHtml}`
    for (const m of html.matchAll(/src=["']([^"']+)["']/gi)) {
      const src = m[1]!
      if (!src.startsWith('http') && !src.startsWith('blob:') && !src.startsWith('data:')) {
        names.add(src.split(/[?#]/)[0]!)
      }
    }
    return [...names]
  }, [rendered])

  const urlMap = useMediaUrls(allMedia)
  const front = rewriteMediaUrls(rendered.frontHtml, urlMap)
  const back = rewriteMediaUrls(rendered.backHtml, urlMap)

  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [swiping, setSwiping] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)

  async function playSound(filename: string) {
    const url = urlMap.get(filename)
    if (!url) return
    const audio = new Audio(url)
    await audio.play().catch(() => undefined)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!showAnswer || !swipeEnabled) return
    start.current = { x: e.clientX, y: e.clientY }
    setSwiping(true)
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!start.current || !swiping) return
    setOffset({
      x: e.clientX - start.current.x,
      y: e.clientY - start.current.y,
    })
  }

  function onPointerUp() {
    if (!start.current || !swiping) return
    const { x, y } = offset
    const absX = Math.abs(x)
    const absY = Math.abs(y)
    let rating: RatingValue | null = null
    if (absX > absY && absX > SWIPE_THRESHOLD) {
      rating = x < 0 ? 1 : 3
    } else if (absY > absX && absY > SWIPE_THRESHOLD) {
      rating = y > 0 ? 2 : 4
    }
    start.current = null
    setSwiping(false)
    setOffset({ x: 0, y: 0 })
    if (rating) onRate(rating)
  }

  return (
    <div className="card-stage">
      <div
        className={`card-face ${swiping ? 'swiping' : ''}`}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) rotate(${offset.x / 40}deg)`,
          opacity: swiping ? 0.92 : 1,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="card-content"
          dangerouslySetInnerHTML={{ __html: front }}
        />
        {rendered.sounds.length > 0 && (
          <div className="audio-row">
            {rendered.sounds.map((s) => (
              <button
                key={s}
                type="button"
                className="audio-btn"
                aria-label="音声を再生"
                onClick={() => playSound(s)}
              >
                ♪
              </button>
            ))}
          </div>
        )}
        {showAnswer && (
          <>
            <div className="answer-divider" />
            <div
              className="card-content"
              dangerouslySetInnerHTML={{ __html: back }}
            />
          </>
        )}
      </div>

      {!showAnswer ? (
        <button type="button" className="btn btn-primary reveal-btn" onClick={onReveal}>
          答えを見る
        </button>
      ) : (
        <RatingButtons previews={previews} onRate={onRate} />
      )}
    </div>
  )
}
