/** Card audio for iOS / iPadOS Safari PWAs.
 *
 * HTMLAudioElement + blob: URLs is unreliable on WebKit (empty Blob.type after
 * IndexedDB, canplay hangs, gesture approval quirks). Web Audio API is the
 * reliable path:
 *
 *  1. On a user gesture: create/resume AudioContext and play a 1-sample buffer
 *  2. Later: decodeAudioData(arrayBuffer) and BufferSource.start()
 *
 * HTMLAudioElement remains a fallback when decodeAudioData rejects a format.
 */

export type PlaybackSignal = { cancelled: boolean }

type WebkitWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext
  }

function AudioCtxCtor(): typeof AudioContext {
  const root = globalThis as WebkitWindow
  const Ctor = root.AudioContext ?? root.webkitAudioContext
  if (!Ctor) throw new Error('AudioContext unavailable')
  return Ctor
}

let unlocked = false
let unlockPromise: Promise<boolean> | null = null
let audioCtx: AudioContext | null = null
let activeSource: AudioBufferSourceNode | null = null
let activeFinish: ((ok: boolean) => void) | null = null
let htmlPlayer: HTMLAudioElement | null = null
let htmlWaiter: ((ok: boolean) => void) | null = null

function getContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (AudioCtxCtor())()
  }
  return audioCtx
}

function getHtmlPlayer(): HTMLAudioElement {
  if (!htmlPlayer) {
    htmlPlayer = new Audio()
    htmlPlayer.preload = 'auto'
    htmlPlayer.setAttribute('playsinline', 'true')
    ;(htmlPlayer as HTMLAudioElement & { playsInline?: boolean }).playsInline =
      true
  }
  return htmlPlayer
}

function finishHtmlWaiter(ok: boolean): void {
  if (!htmlWaiter) return
  const wait = htmlWaiter
  htmlWaiter = null
  wait(ok)
}

/** Call synchronously from a tap handler before any await. */
export function unlockAudio(): Promise<boolean> {
  if (unlocked && audioCtx && audioCtx.state === 'running') {
    return Promise.resolve(true)
  }
  if (unlockPromise) return unlockPromise

  let ctx: AudioContext
  try {
    ctx = getContext()
  } catch {
    return Promise.resolve(false)
  }

  // resume() must be kicked off inside the gesture call stack.
  const resume = ctx.resume()

  // 1-sample silent buffer — proves the graph is allowed to emit audio.
  try {
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 22050)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(0)
  } catch {
    // Non-fatal; resume() may still unlock.
  }

  unlockPromise = resume
    .then(() => {
      unlocked = ctx.state === 'running' || ctx.state === 'suspended'
      // suspended can still become running on the next play; treat resume ok as unlock.
      if (ctx.state === 'running') unlocked = true
      unlocked = true
      return true
    })
    .catch(() => {
      unlockPromise = null
      return false
    })

  return unlockPromise
}

export function isAudioUnlocked(): boolean {
  return unlocked
}

export function stopAudioPlayback(): void {
  if (activeSource) {
    const source = activeSource
    activeSource = null
    source.onended = null
    try {
      source.stop()
    } catch {
      // already stopped
    }
    try {
      source.disconnect()
    } catch {
      // ignore
    }
  }
  if (activeFinish) {
    const finish = activeFinish
    activeFinish = null
    finish(false)
  }
  if (htmlPlayer) {
    htmlPlayer.pause()
    finishHtmlWaiter(false)
  }
}

async function ensureRunning(
  signal?: PlaybackSignal,
): Promise<AudioContext | null> {
  if (!unlocked) {
    const ok = await unlockAudio()
    if (!ok) return null
  }
  if (signal?.cancelled) return null
  const ctx = getContext()
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      return null
    }
  }
  return ctx.state === 'closed' ? null : ctx
}

async function playViaWebAudio(
  ctx: AudioContext,
  data: ArrayBuffer,
  signal?: PlaybackSignal,
): Promise<boolean> {
  if (signal?.cancelled) return false

  // Safari detaches the buffer; always copy first.
  const copy = data.slice(0)
  let audioBuffer: AudioBuffer
  try {
    audioBuffer = await ctx.decodeAudioData(copy)
  } catch {
    return false
  }
  if (signal?.cancelled) return false

  stopAudioPlayback()

  return new Promise<boolean>((resolve) => {
    const source = ctx.createBufferSource()
    activeSource = source
    source.buffer = audioBuffer
    source.connect(ctx.destination)
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      if (activeSource === source) activeSource = null
      if (activeFinish === finish) activeFinish = null
      try {
        source.disconnect()
      } catch {
        // ignore
      }
      resolve(ok)
    }
    activeFinish = finish
    source.onended = () => finish(true)
    try {
      source.start(0)
    } catch {
      finish(false)
      return
    }
    if (signal?.cancelled) {
      try {
        source.onended = null
        source.stop()
      } catch {
        // ignore
      }
      finish(false)
    }
  })
}

async function playViaHtmlAudio(
  blob: Blob,
  signal?: PlaybackSignal,
): Promise<boolean> {
  if (signal?.cancelled) return false
  const audio = getHtmlPlayer()
  const url = URL.createObjectURL(blob)
  try {
    audio.src = url
    audio.load()
    audio.muted = false
    audio.volume = 1
    try {
      await audio.play()
    } catch {
      return false
    }
    if (signal?.cancelled) {
      audio.pause()
      return false
    }
    return await new Promise<boolean>((resolve) => {
      let settled = false
      const finish = (ok: boolean) => {
        if (settled) return
        settled = true
        audio.removeEventListener('ended', onEnded)
        audio.removeEventListener('error', onError)
        if (htmlWaiter === finish) htmlWaiter = null
        resolve(ok)
      }
      const onEnded = () => finish(true)
      const onError = () => finish(false)
      htmlWaiter = finish
      audio.addEventListener('ended', onEnded)
      audio.addEventListener('error', onError)
      if (audio.ended) finish(true)
      else if (audio.paused) finish(false)
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Play blobs in order (Web Audio first, HTMLAudio fallback). */
export async function playAudioBlobs(
  blobs: Blob[],
  signal?: PlaybackSignal,
): Promise<boolean> {
  if (blobs.length === 0) return true
  const ctx = await ensureRunning(signal)
  if (!ctx) return false

  for (const blob of blobs) {
    if (signal?.cancelled) return false
    const typed =
      blob.type && blob.type !== 'application/octet-stream'
        ? blob
        : blob
    let data: ArrayBuffer
    try {
      data = await typed.arrayBuffer()
    } catch {
      return false
    }
    if (signal?.cancelled) return false

    const viaCtx = await playViaWebAudio(ctx, data, signal)
    if (viaCtx) continue

    // decodeAudioData rejected (unsupported codec) — try HTMLAudioElement.
    const viaHtml = await playViaHtmlAudio(typed, signal)
    if (!viaHtml) return false
  }
  return true
}

/** @deprecated Prefer playAudioBlobs — kept for any leftover URL-based callers. */
export async function playAudioUrls(
  urls: string[],
  signal?: PlaybackSignal,
): Promise<boolean> {
  if (urls.length === 0) return true
  const blobs: Blob[] = []
  for (const url of urls) {
    try {
      const res = await fetch(url)
      blobs.push(await res.blob())
    } catch {
      return false
    }
  }
  return playAudioBlobs(blobs, signal)
}
