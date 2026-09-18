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
 *
 * Keep-alive is scoped to an active study session. Hidden / completed /
 * unmounted sessions stop the timer and suspend the context once playback is idle.
 */

export type PlaybackSignal = { cancelled: boolean }

type WebkitWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext
  }

type MixableAudioSession = { type: string }

export const KEEP_ALIVE_MS = 2000
/** PCM bytes kept in the decoded-buffer LRU (16-bit stereo ≈ 2 bytes/frame/channel counted as f32). */
const DECODE_CACHE_MAX_BYTES = 12 * 1024 * 1024

function applyMixableAudioSession(): void {
  try {
    const session = (navigator as Navigator & { audioSession?: MixableAudioSession })
      .audioSession
    if (session) session.type = 'ambient'
  } catch {
    // older WebKit
  }
}

function AudioCtxCtor(): typeof AudioContext {
  const root = globalThis as WebkitWindow
  const Ctor = root.AudioContext ?? root.webkitAudioContext
  if (!Ctor) throw new Error('AudioContext unavailable')
  return Ctor
}

function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden
}

let unlocked = false
let unlockPromise: Promise<boolean> | null = null
let audioCtx: AudioContext | null = null
let masterGain: GainNode | null = null
/** 100% is above unity so quiet Anki clips are audible on iPhone. */
export const AUDIO_GAIN_AT_100 = 2.5
let outputVolume = AUDIO_GAIN_AT_100
let activeSource: AudioBufferSourceNode | null = null
let activeFinish: ((ok: boolean) => void) | null = null
let htmlPlayer: HTMLAudioElement | null = null
let htmlWaiter: ((ok: boolean) => void) | null = null
let keepAliveTimer: ReturnType<typeof setInterval> | null = null
let keepAliveGeneration = 0
let sessionWanted = false
let suspendWhenIdle = false
let visibilityHooked = false

type DecodeEntry = { buffer: AudioBuffer; bytes: number }
const decodeCache = new Map<string, DecodeEntry>()
const decodeInflight = new Map<string, Promise<AudioBuffer>>()
const blobCacheKeys = new WeakMap<Blob, string>()
let blobKeySeq = 0
let decodeCacheBytes = 0

function htmlVolume(): number {
  return Math.min(1, Math.max(0, outputVolume))
}

/** In-app loudness 0–100. Device hardware volume is separate. */
export function setAudioVolume(percent: number): void {
  const clamped = Number.isFinite(percent)
    ? Math.min(100, Math.max(0, Math.round(percent)))
    : 100
  outputVolume = (clamped / 100) * AUDIO_GAIN_AT_100
  if (masterGain) masterGain.gain.value = outputVolume
  if (htmlPlayer) htmlPlayer.volume = htmlVolume()
}

export function getAudioVolume(): number {
  return Math.round((outputVolume / AUDIO_GAIN_AT_100) * 100)
}

function getMasterGain(ctx: AudioContext): GainNode {
  if (masterGain && masterGain.context === ctx) return masterGain
  masterGain = ctx.createGain()
  masterGain.gain.value = outputVolume
  masterGain.connect(ctx.destination)
  return masterGain
}

function pcmBytes(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * 4
}

function blobDecodeKey(blob: Blob, explicit?: string): string {
  if (explicit) return explicit
  const existing = blobCacheKeys.get(blob)
  if (existing) return existing
  const key = `blob:${blob.size}:${blob.type}:${++blobKeySeq}`
  blobCacheKeys.set(blob, key)
  return key
}

function touchDecode(key: string): AudioBuffer | undefined {
  const entry = decodeCache.get(key)
  if (!entry) return undefined
  decodeCache.delete(key)
  decodeCache.set(key, entry)
  return entry.buffer
}

function storeDecode(key: string, buffer: AudioBuffer): void {
  const bytes = pcmBytes(buffer)
  if (bytes > DECODE_CACHE_MAX_BYTES) return
  while (decodeCacheBytes + bytes > DECODE_CACHE_MAX_BYTES && decodeCache.size > 0) {
    const oldest = decodeCache.keys().next().value
    if (oldest == null) break
    const removed = decodeCache.get(oldest)
    decodeCache.delete(oldest)
    if (removed) decodeCacheBytes -= removed.bytes
  }
  decodeCache.set(key, { buffer, bytes })
  decodeCacheBytes += bytes
}

export function invalidateDecodedAudio(): void {
  decodeCache.clear()
  decodeInflight.clear()
  decodeCacheBytes = 0
}

function tickSilence(ctx: AudioContext): void {
  try {
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 22050)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(0)
  } catch {
    // ignore
  }
}

function clearKeepAliveTimer(): void {
  if (keepAliveTimer == null) return
  clearInterval(keepAliveTimer)
  keepAliveTimer = null
}

function startKeepAlive(ctx: AudioContext): void {
  if (keepAliveTimer != null) return
  if (!sessionWanted || pageHidden()) return
  const generation = keepAliveGeneration
  keepAliveTimer = setInterval(() => {
    if (generation !== keepAliveGeneration) return
    if (!sessionWanted || pageHidden()) return
    applyMixableAudioSession()
    if (ctx.state === 'closed') return
    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => {
        if (generation !== keepAliveGeneration) return
        applyMixableAudioSession()
      })
    }
    tickSilence(ctx)
  }, KEEP_ALIVE_MS)
}

function hookVisibility(): void {
  if (visibilityHooked || typeof document === 'undefined') return
  visibilityHooked = true
  document.addEventListener('visibilitychange', onVisibilityChange)
}

function onVisibilityChange(): void {
  if (pageHidden()) {
    clearKeepAliveTimer()
    if (activeSource || htmlWaiter) suspendWhenIdle = true
    else void suspendContext()
    return
  }
  suspendWhenIdle = false
  if (!sessionWanted) return
  const ctx = audioCtx
  if (!ctx || ctx.state === 'closed') return
  const generation = keepAliveGeneration
  void ctx
    .resume()
    .then(() => {
      if (generation !== keepAliveGeneration || pageHidden() || !sessionWanted) return
      applyMixableAudioSession()
      startKeepAlive(ctx)
    })
    .catch(() => {
      // next user gesture will unlock again
    })
}

async function suspendContext(): Promise<void> {
  const ctx = audioCtx
  if (!ctx || ctx.state !== 'running') return
  try {
    await ctx.suspend()
  } catch {
    // ignore
  }
}

function maybeSuspendIdle(): void {
  if (!suspendWhenIdle) return
  if (activeSource || htmlWaiter) return
  suspendWhenIdle = false
  void suspendContext()
}

export function isAudioKeepAliveActive(): boolean {
  return keepAliveTimer != null
}

export function audioContextState(): AudioContextState | 'none' {
  return audioCtx?.state ?? 'none'
}

export function stopAudioKeepAlive(): void {
  keepAliveGeneration += 1
  sessionWanted = false
  clearKeepAliveTimer()
}

/** Stop ticks, cancel in-flight resume keep-alive, and suspend when idle. */
export function releaseAudioSession(): void {
  stopAudioKeepAlive()
  stopAudioPlayback()
  suspendWhenIdle = false
  void suspendContext()
}

function getContext(): AudioContext {
  applyMixableAudioSession()
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
  htmlPlayer.volume = htmlVolume()
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
  applyMixableAudioSession()
  sessionWanted = true
  hookVisibility()
  let ctx: AudioContext
  try {
    ctx = getContext()
  } catch {
    sessionWanted = false
    return Promise.resolve(false)
  }

  const generation = keepAliveGeneration

  // Always invoke resume() in this call stack — required on iOS even when we
  // think we are already unlocked (SPA navigation can suspend the context).
  const resume = ctx.resume()
  tickSilence(ctx)

  if (unlocked) {
    if (ctx.state === 'running') startKeepAlive(ctx)
    return resume
      .then(() => {
        applyMixableAudioSession()
        if (generation !== keepAliveGeneration) return true
        startKeepAlive(ctx)
        return true
      })
      .catch(() => true)
  }
  if (unlockPromise) return unlockPromise

  unlockPromise = resume
    .then(() => {
      unlocked = true
      applyMixableAudioSession()
      if (generation !== keepAliveGeneration) return true
      startKeepAlive(ctx)
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
  maybeSuspendIdle()
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
  applyMixableAudioSession()
  return ctx.state === 'closed' ? null : ctx
}

async function decodeBuffer(
  ctx: AudioContext,
  data: ArrayBuffer,
  key: string,
): Promise<AudioBuffer> {
  const cached = touchDecode(key)
  if (cached) return cached
  const pending = decodeInflight.get(key)
  if (pending) return pending

  const copy = data.slice(0)
  const work = ctx.decodeAudioData(copy).then((buffer) => {
    storeDecode(key, buffer)
    decodeInflight.delete(key)
    return buffer
  })
  decodeInflight.set(key, work)
  try {
    return await work
  } catch (error) {
    decodeInflight.delete(key)
    throw error
  }
}

async function playViaWebAudio(
  ctx: AudioContext,
  data: ArrayBuffer,
  signal?: PlaybackSignal,
  cacheKey?: string,
): Promise<boolean> {
  if (signal?.cancelled) return false

  let audioBuffer: AudioBuffer
  try {
    audioBuffer = await decodeBuffer(ctx, data, cacheKey ?? `anon:${data.byteLength}`)
  } catch {
    return false
  }
  if (signal?.cancelled) return false

  stopAudioPlayback()
  suspendWhenIdle = false

  return new Promise<boolean>((resolve) => {
    const source = ctx.createBufferSource()
    activeSource = source
    source.buffer = audioBuffer
    source.connect(getMasterGain(ctx))
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
      maybeSuspendIdle()
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
    audio.volume = htmlVolume()
    applyMixableAudioSession()
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
        maybeSuspendIdle()
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

export type PlayableSound = {
  blob: Blob
  /** Stable media id; same id must not outlive a content replacement. */
  cacheKey?: string
}

/** Play blobs in order (Web Audio first, HTMLAudio fallback). */
export async function playAudioBlobs(
  blobs: Blob[] | PlayableSound[],
  signal?: PlaybackSignal,
): Promise<boolean> {
  const items: PlayableSound[] = blobs.map((item) =>
    item instanceof Blob ? { blob: item } : item,
  )
  if (items.length === 0) return true
  const ctx = await ensureRunning(signal)
  if (!ctx) return false

  for (const item of items) {
    if (signal?.cancelled) return false
    let data: ArrayBuffer
    try {
      data = await item.blob.arrayBuffer()
    } catch {
      return false
    }
    if (signal?.cancelled) return false

    const key = blobDecodeKey(item.blob, item.cacheKey)
    const viaCtx = await playViaWebAudio(ctx, data, signal, key)
    if (viaCtx) continue

    const viaHtml = await playViaHtmlAudio(item.blob, signal)
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

export type SoundResolve =
  | { status: 'empty' }
  | { status: 'loading' }
  | { status: 'ready'; blobs: Blob[]; keys?: string[] }
  | { status: 'missing'; names: string[] }

/** Question-face audio: front tags first, otherwise back tags (play on show, not on flip). */
export function pickQuestionSounds(
  front: SoundResolve,
  back: SoundResolve,
): SoundResolve {
  if (front.status === 'loading' || back.status === 'loading') {
    return { status: 'loading' }
  }
  if (front.status === 'ready') return front
  if (back.status === 'ready') return back
  if (front.status === 'missing') return front
  if (back.status === 'missing') return back
  return { status: 'empty' }
}

/** Answer-face extras: filenames that were not already used as question audio. */
export function extraAnswerSounds(
  frontNames: string[],
  backNames: string[],
): string[] {
  if (backNames.length === 0) return []
  const used = new Set(frontNames.map((name) => name.toLowerCase()))
  if (frontNames.length === 0) return []
  return backNames.filter((name) => !used.has(name.toLowerCase()))
}
