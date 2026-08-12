import { useEffect, useMemo, useRef, useState } from 'react'
import type { RatingValue } from '../db/schema'
import { rewriteMediaUrls, type RenderedCard } from '../utils/cardRender'
import { useMediaUrls } from '../hooks/useMediaUrls'
import { extractMediaFilenames } from '../utils/mediaRefs'
import { sanitizeCardHtml } from '../utils/sanitizeCardHtml'
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

/** Plays each URL in order. Returns false if the browser blocked autoplay. */
async function playUrls(
  urls: string[],
  signal: { cancelled: boolean },
): Promise<boolean> {
  for (const url of urls) {
    if (signal.cancelled) return true
    const audio = new Audio(url)
    try {
      await audio.play()
    } catch {
      return false
    }
    await new Promise<void>((resolve) => {
      const finish = () => resolve()
      audio.addEventListener('ended', finish, { once: true })
      audio.addEventListener('error', finish, { once: true })
      if (signal.cancelled) {
        audio.pause()
        finish()
      }
    })
  }
  return true
}

function resolveUrls(
  filenames: string[],
  urlMap: Map<string, string>,
): string[] | null {
  if (filenames.length === 0) return []
  const urls = filenames
    .map((name) => urlMap.get(name))
    .filter((url): url is string => Boolean(url))
  return urls.length === filenames.length ? urls : null
}

export function StudyCardView({
  rendered,
  showAnswer,
  onReveal,
  previews,
  onRate,
  swipeEnabled,
}: Props) {
  const allMedia = useMemo(() => {
    const names = new Set<string>([
      ...rendered.frontSounds,
      ...rendered.backSounds,
    ])
    const html = `${rendered.frontHtml}${rendered.backHtml}`
    for (const filename of extractMediaFilenames(html)) names.add(filename)
    return [...names]
  }, [rendered])

  const urlMap = useMediaUrls(allMedia)
  const front = useMemo(
    () => sanitizeCardHtml(rewriteMediaUrls(rendered.frontHtml, urlMap)),
    [rendered.frontHtml, urlMap],
  )
  const back = useMemo(
    () => sanitizeCardHtml(rewriteMediaUrls(rendered.backHtml, urlMap)),
    [rendered.backHtml, urlMap],
  )

  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [swiping, setSwiping] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const playedFront = useRef(false)
  const playedBack = useRef(false)

  useEffect(() => {
    playedFront.current = false
    playedBack.current = false
  }, [
    rendered.frontHtml,
    rendered.backHtml,
    rendered.frontSounds,
    rendered.backSounds,
  ])

  useEffect(() => {
    const signal = { cancelled: false }
    const filenames = showAnswer ? rendered.backSounds : rendered.frontSounds
    const flag = showAnswer ? playedBack : playedFront
    if (flag.current) {
      return () => {
        signal.cancelled = true
      }
    }
    const urls = resolveUrls(filenames, urlMap)
    if (!urls || urls.length === 0) {
      if (urls && urls.length === 0) flag.current = true
      return () => {
        signal.cancelled = true
      }
    }

    void playUrls(urls, signal).then((ok) => {
      if (ok && !signal.cancelled) flag.current = true
    })

    return () => {
      signal.cancelled = true
    }
  }, [urlMap, showAnswer, rendered.frontSounds, rendered.backSounds])

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

  function reveal() {
    // A tap unlocks autoplay on iOS. If the question audio was blocked on
    // mount, play it now before flipping — Anki plays front then back.
    const frontUrls = resolveUrls(rendered.frontSounds, urlMap)
    if (!playedFront.current && frontUrls && frontUrls.length > 0) {
      playedFront.current = true
      void playUrls(frontUrls, { cancelled: false }).finally(() => onReveal())
      return
    }
    onReveal()
  }

  return (
    <div className="card-stage">
      <div
        className={`card-face glass${swiping ? ' swiping' : ''}`}
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
        <button type="button" className="btn btn-primary reveal-btn" onClick={reveal}>
          答えを見る
        </button>
      ) : (
        <RatingButtons previews={previews} onRate={onRate} />
      )}
    </div>
  )
}
