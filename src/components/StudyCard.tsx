import { useEffect, useMemo, useRef, useState } from 'react'
import type { RatingValue } from '../db/schema'
import { rewriteMediaUrls, type RenderedCard } from '../utils/cardRender'
import { useMediaEntries } from '../hooks/useMediaUrls'
import { extractMediaFilenames } from '../utils/mediaRefs'
import { sanitizeCardHtml } from '../utils/sanitizeCardHtml'
import {
  extraAnswerSounds,
  pickQuestionSounds,
  playAudioBlobs,
  stopAudioPlayback,
  unlockAudio,
  type SoundResolve,
} from '../utils/audio'
import { RatingButtons } from './RatingButtons'

interface Props {
  rendered: RenderedCard
  showAnswer: boolean
  onReveal: () => void
  previews: Record<RatingValue, { label: string }>
  onRate: (rating: RatingValue) => void
  answering?: boolean
  swipeEnabled: boolean
  autoFlipEnabled: boolean
  autoFlipSeconds: number
}

const SWIPE_THRESHOLD = 96
const FLY_PX = 480
const RATING_FREEZE_MS = 500

function resolveSounds(
  filenames: string[],
  blobs: Map<string, Blob>,
  ready: boolean,
): SoundResolve {
  if (filenames.length === 0) return { status: 'empty' }
  if (!ready) return { status: 'loading' }
  const resolved: Blob[] = []
  const missing: string[] = []
  for (const name of filenames) {
    const blob = blobs.get(name) ?? blobs.get(name.toLowerCase())
    if (blob) resolved.push(blob)
    else missing.push(name)
  }
  if (missing.length > 0) return { status: 'missing', names: missing }
  return { status: 'ready', blobs: resolved }
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
  answering = false,
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

  const { urls: urlMap, blobs: blobMap, ready: mediaReady } =
    useMediaEntries(allMedia)

  const front = useMemo(
    () => sanitizeCardHtml(rewriteMediaUrls(rendered.frontHtml, urlMap)),
    [rendered.frontHtml, urlMap],
  )
  const back = useMemo(
    () => sanitizeCardHtml(rewriteMediaUrls(rendered.backHtml, urlMap)),
    [rendered.backHtml, urlMap],
  )

  const frontSounds = useMemo(
    () => resolveSounds(rendered.frontSounds, blobMap, mediaReady),
    [rendered.frontSounds, blobMap, mediaReady],
  )
  const backSounds = useMemo(
    () => resolveSounds(rendered.backSounds, blobMap, mediaReady),
    [rendered.backSounds, blobMap, mediaReady],
  )

  const questionSounds = useMemo(
    () => pickQuestionSounds(frontSounds, backSounds),
    [frontSounds, backSounds],
  )

  const answerExtraNames = useMemo(
    () => extraAnswerSounds(rendered.frontSounds, rendered.backSounds),
    [rendered.frontSounds, rendered.backSounds],
  )
  const answerExtraSounds = useMemo(
    () => resolveSounds(answerExtraNames, blobMap, mediaReady),
    [answerExtraNames, blobMap, mediaReady],
  )

  const questionPlayKey =
    questionSounds.status === 'ready'
      ? `q:${rendered.frontSounds.join('|')}:${rendered.backSounds.join('|')}:${questionSounds.blobs.length}`
      : questionSounds.status

  const answerPlayKey =
    answerExtraSounds.status === 'ready'
      ? `a:${answerExtraNames.join('|')}:${answerExtraSounds.blobs.length}`
      : answerExtraSounds.status

  const [offsetX, setOffsetX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [flying, setFlying] = useState<'left' | 'right' | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [ratingFrozen, setRatingFrozen] = useState(false)
  const startX = useRef<number | null>(null)
  const offsetRef = useRef(0)
  const playedQuestion = useRef(false)
  const playedBack = useRef(false)
  const busyRef = useRef(false)
  const freezeTimerRef = useRef<number | null>(null)

  function startRatingFreeze() {
    setRatingFrozen(true)
    if (freezeTimerRef.current != null) window.clearTimeout(freezeTimerRef.current)
    freezeTimerRef.current = window.setTimeout(() => {
      setRatingFrozen(false)
      freezeTimerRef.current = null
    }, RATING_FREEZE_MS)
  }

  useEffect(() => {
    playedQuestion.current = false
    playedBack.current = false
    busyRef.current = false
    setOffsetX(0)
    setSwiping(false)
    setFlying(null)
    setRatingFrozen(false)
    if (freezeTimerRef.current != null) {
      window.clearTimeout(freezeTimerRef.current)
      freezeTimerRef.current = null
    }
    offsetRef.current = 0
    stopAudioPlayback()
  }, [
    rendered.frontHtml,
    rendered.backHtml,
    rendered.frontSounds,
    rendered.backSounds,
  ])

  useEffect(
    () => () => {
      if (freezeTimerRef.current != null) window.clearTimeout(freezeTimerRef.current)
    },
    [],
  )

  // Play as soon as the front face is up and media is ready — never after flip.
  // Do not stop() in cleanup: StrictMode / object-identity reruns were killing
  // front audio, so the first audible play became the reveal gesture.
  useEffect(() => {
    if (showAnswer) {
      if (questionSounds.status !== 'loading') playedQuestion.current = true
      return
    }
    if (playedQuestion.current) return
    if (questionSounds.status === 'loading') return
    if (
      questionSounds.status === 'empty' ||
      questionSounds.status === 'missing'
    ) {
      playedQuestion.current = true
      return
    }

    const signal = { cancelled: false }
    const blobs = questionSounds.blobs
    void (async () => {
      const ok = await playAudioBlobs(blobs, signal)
      if (signal.cancelled) return
      if (ok) playedQuestion.current = true
    })()

    return () => {
      signal.cancelled = true
    }
  }, [questionPlayKey, showAnswer, questionSounds])

  // Only files that were not already used as question audio.
  useEffect(() => {
    if (!showAnswer || playedBack.current) return
    if (answerExtraSounds.status === 'loading') return
    if (
      answerExtraSounds.status === 'empty' ||
      answerExtraSounds.status === 'missing'
    ) {
      playedBack.current = true
      return
    }
    const signal = { cancelled: false }
    const blobs = answerExtraSounds.blobs
    void (async () => {
      const ok = await playAudioBlobs(blobs, signal)
      if (signal.cancelled) return
      if (ok) playedBack.current = true
    })()
    return () => {
      signal.cancelled = true
    }
  }, [answerPlayKey, showAnswer, answerExtraSounds])

  useEffect(() => {
    if (!autoFlipEnabled || showAnswer || flying) {
      setCountdown(null)
      return
    }
    const seconds = Math.max(1, autoFlipSeconds)
    const deadline = Date.now() + seconds * 1000
    setCountdown(seconds)
    const ticker = window.setInterval(() => {
      setCountdown(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    }, 200)
    const timer = window.setTimeout(() => {
      setCountdown(0)
      stopAudioPlayback()
      playedQuestion.current = true
      void unlockAudio()
      startRatingFreeze()
      onReveal()
    }, seconds * 1000)
    return () => {
      window.clearInterval(ticker)
      window.clearTimeout(timer)
    }
  }, [autoFlipEnabled, autoFlipSeconds, showAnswer, flying, onReveal, rendered])

  function onPointerDown(e: React.PointerEvent) {
    if (!showAnswer || !swipeEnabled || flying || busyRef.current || ratingFrozen) return
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
    stopAudioPlayback()
    playedQuestion.current = true
    void unlockAudio()
    startRatingFreeze()
    onReveal()
  }

  function rate(rating: RatingValue) {
    if (busyRef.current || flying || answering || ratingFrozen) return
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
        className={`card-face glass${swiping ? ' swiping' : ''}${flying ? ` flying flying-${flying}` : ''}${countdown != null ? ' auto-flipping' : ''}`}
        style={{
          transform: `translateX(${offsetX}px) rotate(${offsetX / 28}deg)`,
          opacity: flying ? 0 : 1,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {!showAnswer && countdown != null && (
          <div
            className="auto-flip-countdown"
            aria-label={`自動めくりまで ${countdown} 秒`}
          >
            <span>{countdown}</span>
            <small>s</small>
          </div>
        )}
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
        </button>
      ) : (
        <RatingButtons
          previews={previews}
          onRate={rate}
          disabled={answering || Boolean(flying) || ratingFrozen}
        />
      )}
    </div>
  )
}
