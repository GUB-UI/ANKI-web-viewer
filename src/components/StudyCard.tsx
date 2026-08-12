import { useEffect, useMemo, useRef, useState } from 'react'
import type { RatingValue } from '../db/schema'
import { rewriteMediaUrls, type RenderedCard } from '../utils/cardRender'
import { useMediaEntries } from '../hooks/useMediaUrls'
import { extractMediaFilenames } from '../utils/mediaRefs'
import { sanitizeCardHtml } from '../utils/sanitizeCardHtml'
import {
  playAudioBlobs,
  stopAudioPlayback,
  unlockAudio,
} from '../utils/audio'
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

type SoundResolve =
  | { status: 'empty' }
  | { status: 'loading' }
  | { status: 'missing'; names: string[] }
  | { status: 'ready'; blobs: Blob[] }

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

  const [offsetX, setOffsetX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [flying, setFlying] = useState<'left' | 'right' | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [audioFailed, setAudioFailed] = useState(false)
  const [audioBusy, setAudioBusy] = useState(false)
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
    setAudioFailed(false)
    setAudioBusy(false)
    offsetRef.current = 0
    stopAudioPlayback()
  }, [
    rendered.frontHtml,
    rendered.backHtml,
    rendered.frontSounds,
    rendered.backSounds,
  ])

  // Front audio: play when blobs are ready. Still play after reveal if we missed
  // the question face (auto-flip / slow IndexedDB on iPad).
  useEffect(() => {
    if (playedFront.current) return
    if (frontSounds.status === 'loading') return
    if (frontSounds.status === 'empty') {
      playedFront.current = true
      return
    }
    if (frontSounds.status === 'missing') {
      playedFront.current = true
      setAudioFailed(true)
      return
    }
    const signal = { cancelled: false }
    void (async () => {
      setAudioBusy(true)
      const ok = await playAudioBlobs(frontSounds.blobs, signal)
      if (signal.cancelled) return
      setAudioBusy(false)
      if (ok) {
        playedFront.current = true
        setAudioFailed(false)
      } else {
        setAudioFailed(true)
      }
    })()
    return () => {
      signal.cancelled = true
      stopAudioPlayback()
      setAudioBusy(false)
    }
  }, [frontSounds])

  // Answer-side audio only after the answer is shown.
  useEffect(() => {
    if (!showAnswer || playedBack.current) return
    if (backSounds.status === 'loading') return
    if (backSounds.status === 'empty') {
      playedBack.current = true
      return
    }
    if (backSounds.status === 'missing') {
      playedBack.current = true
      return
    }
    const signal = { cancelled: false }
    void (async () => {
      const ok = await playAudioBlobs(backSounds.blobs, signal)
      if (signal.cancelled) return
      if (ok) playedBack.current = true
    })()
    return () => {
      signal.cancelled = true
      stopAudioPlayback()
    }
  }, [backSounds, showAnswer])

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
      void unlockAudio()
      onReveal()
    }, seconds * 1000)
    return () => {
      window.clearInterval(ticker)
      window.clearTimeout(timer)
    }
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

  function replayAudio(which: 'front' | 'back') {
    const target = which === 'front' ? frontSounds : backSounds
    if (target.status !== 'ready') return
    // Unlock synchronously inside the tap — required on iOS / iPadOS.
    void unlockAudio()
    setAudioFailed(false)
    setAudioBusy(true)
    void (async () => {
      const ok = await playAudioBlobs(target.blobs)
      setAudioBusy(false)
      if (!ok) setAudioFailed(true)
      else if (which === 'front') playedFront.current = true
      else playedBack.current = true
    })()
  }

  const progress = clamp01(Math.abs(offsetX) / SWIPE_THRESHOLD)
  const towardAgain = offsetX > 12
  const towardGood = offsetX < -12
  const againOpacity = towardAgain ? progress : 0
  const goodOpacity = towardGood ? progress : 0

  const hasFrontAudio = rendered.frontSounds.length > 0
  const hasBackAudio = rendered.backSounds.length > 0
  const playableFront = frontSounds.status === 'ready'
  const playableBack = backSounds.status === 'ready'
  const missingAudio =
    frontSounds.status === 'missing' || backSounds.status === 'missing'

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

      {(hasFrontAudio || (showAnswer && hasBackAudio)) && (
        <div className="audio-bar">
          {hasFrontAudio && (
            <button
              type="button"
              className="btn btn-ghost audio-replay"
              disabled={!playableFront || audioBusy}
              onClick={() => replayAudio('front')}
            >
              表面の音声
            </button>
          )}
          {showAnswer && hasBackAudio && (
            <button
              type="button"
              className="btn btn-ghost audio-replay"
              disabled={!playableBack || audioBusy}
              onClick={() => replayAudio('back')}
            >
              裏面の音声
            </button>
          )}
          {missingAudio && (
            <span className="audio-missing">音声ファイルが見つかりません</span>
          )}
          {audioFailed && !missingAudio && (
            <span className="audio-missing">再生に失敗 — もう一度タップ</span>
          )}
        </div>
      )}

      {!showAnswer ? (
        <button type="button" className="btn btn-primary reveal-btn" onClick={reveal}>
          答えを見る
        </button>
      ) : (
        <RatingButtons previews={previews} onRate={rate} />
      )}
    </div>
  )
}
