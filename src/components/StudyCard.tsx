import { useEffect, useMemo, useRef, useState } from 'react'
import type { RatingValue } from '../db/schema'
import { rewriteMediaUrls, type RenderedCard } from '../utils/cardRender'
import { useMediaUrls } from '../hooks/useMediaUrls'
import { extractMediaFilenames } from '../utils/mediaRefs'
import { sanitizeCardHtml } from '../utils/sanitizeCardHtml'
import { playAudioUrls, unlockAudio } from '../utils/audio'
import { RatingButtons } from './RatingButtons'

interface Props {
  rendered: RenderedCard
  showAnswer: boolean
  onReveal: () => void
  previews: Record<RatingValue, { label: string }>
  onRate: (rating: RatingValue) => void
  swipeEnabled: boolean
  autoFlipEnabled: boolean
  autoFlipSeconds: number
}

const SWIPE_THRESHOLD = 96
const FLY_PX = 480

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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function StudyCardView({
  rendered,
  showAnswer,
  onReveal,
  previews,
  onRate,
  swipeEnabled,
  autoFlipEnabled,
  autoFlipSeconds,
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

  const [offsetX, setOffsetX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [flying, setFlying] = useState<'left' | 'right' | null>(null)
  const startX = useRef<number | null>(null)
  const offsetRef = useRef(0)
  const playedFront = useRef(false)
  const playedBack = useRef(false)
  const busyRef = useRef(false)

  useEffect(() => {
    playedFront.current = false
    playedBack.current = false
    busyRef.current = false
    setOffsetX(0)
    setSwiping(false)
    setFlying(null)
    offsetRef.current = 0
  }, [
    rendered.frontHtml,
    rendered.backHtml,
    rendered.frontSounds,
    rendered.backSounds,
  ])

  // Play the question the moment the card face is ready — not on reveal.
  useEffect(() => {
    if (showAnswer || playedFront.current) return
    const urls = resolveUrls(rendered.frontSounds, urlMap)
    if (!urls) return
    if (urls.length === 0) {
      playedFront.current = true
      return
    }
    const signal = { cancelled: false }
    void (async () => {
      await unlockAudio()
      if (signal.cancelled || playedFront.current) return
      const ok = await playAudioUrls(urls, signal)
      if (ok && !signal.cancelled) playedFront.current = true
    })()
    return () => {
      signal.cancelled = true
    }
  }, [urlMap, showAnswer, rendered.frontSounds])

  // Answer-side audio only after the answer is shown.
  useEffect(() => {
    if (!showAnswer || playedBack.current) return
    const urls = resolveUrls(rendered.backSounds, urlMap)
    if (!urls) return
    if (urls.length === 0) {
      playedBack.current = true
      return
    }
    const signal = { cancelled: false }
    void (async () => {
      await unlockAudio()
      if (signal.cancelled || playedBack.current) return
      const ok = await playAudioUrls(urls, signal)
      if (ok && !signal.cancelled) playedBack.current = true
    })()
    return () => {
      signal.cancelled = true
    }
  }, [urlMap, showAnswer, rendered.backSounds])

  // Auto-flip: reveal the answer after N seconds on the question face.
  useEffect(() => {
    if (!autoFlipEnabled || showAnswer || flying) return
    const ms = Math.max(1, autoFlipSeconds) * 1000
    const timer = window.setTimeout(() => {
      void unlockAudio()
      onReveal()
    }, ms)
    return () => window.clearTimeout(timer)
  }, [autoFlipEnabled, autoFlipSeconds, showAnswer, flying, onReveal, rendered])

  function onPointerDown(e: React.PointerEvent) {
    if (!showAnswer || !swipeEnabled || flying || busyRef.current) return
    startX.current = e.clientX
    setSwiping(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (startX.current == null || !swiping) return
    const next = e.clientX - startX.current
    offsetRef.current = next
    setOffsetX(next)
  }

  function finishSwipe(commit: boolean) {
    const x = offsetRef.current
    startX.current = null
    setSwiping(false)

    if (!commit || Math.abs(x) < SWIPE_THRESHOLD) {
      offsetRef.current = 0
      setOffsetX(0)
      return
    }

    // 右 = Again, 左 = Good
    const rating: RatingValue = x > 0 ? 1 : 3
    const direction: 'left' | 'right' = x > 0 ? 'right' : 'left'
    busyRef.current = true
    setFlying(direction)
    setOffsetX(direction === 'right' ? FLY_PX : -FLY_PX)
    void unlockAudio()
    window.setTimeout(() => {
      onRate(rating)
    }, 220)
  }

  function onPointerUp() {
    if (startX.current == null || !swiping) return
    finishSwipe(true)
  }

  function onPointerCancel() {
    if (startX.current == null) return
    finishSwipe(false)
  }

  function reveal() {
    void unlockAudio()
    onReveal()
  }

  function rate(rating: RatingValue) {
    if (busyRef.current || flying) return
    void unlockAudio()
    onRate(rating)
  }

  const progress = clamp01(Math.abs(offsetX) / SWIPE_THRESHOLD)
  const towardAgain = offsetX > 12
  const towardGood = offsetX < -12
  const againOpacity = towardAgain ? progress : 0
  const goodOpacity = towardGood ? progress : 0

  return (
    <div className="card-stage">
      <div
        className={`card-face glass${swiping ? ' swiping' : ''}${flying ? ` flying flying-${flying}` : ''}`}
        style={{
          transform: `translateX(${offsetX}px) rotate(${offsetX / 28}deg)`,
          opacity: flying ? 0 : 1,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {showAnswer && swipeEnabled && (
          <>
            <div
              className="swipe-badge again"
              style={{ opacity: againOpacity }}
              aria-hidden
            >
              Again
            </div>
            <div
              className="swipe-badge good"
              style={{ opacity: goodOpacity }}
              aria-hidden
            >
              Good
            </div>
            <div
              className="swipe-tint again"
              style={{ opacity: againOpacity * 0.22 }}
              aria-hidden
            />
            <div
              className="swipe-tint good"
              style={{ opacity: goodOpacity * 0.22 }}
              aria-hidden
            />
          </>
        )}
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
          {autoFlipEnabled && (
            <span className="reveal-hint">自動 {autoFlipSeconds}s</span>
          )}
        </button>
      ) : (
        <RatingButtons previews={previews} onRate={rate} />
      )}
    </div>
  )
}
