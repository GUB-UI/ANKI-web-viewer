/** iOS Safari audio unlock + playback.
 *
 * WebKit only marks an HTMLAudioElement as user-approved when play() runs
 * inside a gesture call stack. After that, the SAME element can change src
 * and play later (even after awaits). Creating a new Audio() resets trust.
 *
 * Important iOS details:
 *  - Unlock with a near-silent volume, NOT muted — muted play does not unlock
 *    unmuted playback on WebKit.
 *  - play() must be invoked synchronously in the tap handler.
 *  - Pausing mid-wait must resolve the "ended" waiter or StrictMode cleanups
 *    leave playback hung forever.
 */

// Minimal valid PCM WAV (~1 frame of silence @ 44.1kHz mono 16-bit).
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=='

let unlocked = false
let unlockPromise: Promise<boolean> | null = null
let player: HTMLAudioElement | null = null
let playbackWaiter: ((ok: boolean) => void) | null = null

function getPlayer(): HTMLAudioElement {
  if (!player) {
    player = new Audio()
    player.preload = 'auto'
    player.setAttribute('playsinline', 'true')
    // Safari iOS
    ;(player as HTMLAudioElement & { playsInline?: boolean }).playsInline = true
  }
  return player
}

function isSilentSrc(src: string): boolean {
  return !src || src === SILENT_WAV || src.startsWith('data:audio/wav')
}

function finishWaiter(ok: boolean): void {
  if (!playbackWaiter) return
  const wait = playbackWaiter
  playbackWaiter = null
  wait(ok)
}

/** Call from a tap handler (学習開始 / rating / reveal) before async work. */
export function unlockAudio(): Promise<boolean> {
  if (unlocked) return Promise.resolve(true)
  if (unlockPromise) return unlockPromise

  const audio = getPlayer()
  // Keep a real track if one is already loaded — don't interrupt it with silence.
  if (isSilentSrc(audio.src)) {
    audio.src = SILENT_WAV
  }
  // Must NOT use muted=true — WebKit will not extend that approval to unmuted play.
  audio.muted = false
  audio.volume = 0.01

  // play() MUST be invoked synchronously here (still inside the gesture).
  const pending = audio.play()

  unlockPromise = pending
    .then(() => {
      if (isSilentSrc(audio.src)) {
        audio.pause()
        audio.currentTime = 0
      }
      audio.volume = 1
      unlocked = true
      return true
    })
    .catch(() => {
      audio.volume = 1
      unlockPromise = null
      return false
    })

  return unlockPromise
}

export function isAudioUnlocked(): boolean {
  return unlocked
}

export function stopAudioPlayback(): void {
  if (!player) return
  // Never cancel an in-flight unlock of the silent clip by blanking/pausing it
  // before play() settles — WebKit forgets the gesture approval.
  if (isSilentSrc(player.src) && !unlocked) return
  player.pause()
  finishWaiter(false)
}

function waitUntilEnded(
  audio: HTMLAudioElement,
  signal?: { cancelled: boolean },
): Promise<boolean> {
  if (signal?.cancelled) {
    audio.pause()
    return Promise.resolve(false)
  }

  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      if (playbackWaiter === finish) playbackWaiter = null
      resolve(ok)
    }
    const onEnded = () => finish(true)
    const onError = () => finish(false)
    playbackWaiter = finish
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    // Already finished (tiny clips / cached).
    if (audio.ended) {
      finish(true)
      return
    }
    if (signal?.cancelled || audio.paused) {
      finish(false)
    }
  })
}

async function loadAndPlay(
  audio: HTMLAudioElement,
  url: string,
  signal?: { cancelled: boolean },
): Promise<boolean> {
  if (signal?.cancelled) return false

  if (audio.src !== url) {
    audio.src = url
    audio.load()
  }

  // Wait until the blob is decodable — iOS often rejects play() before canplay.
  const haveFutureData =
    typeof HTMLMediaElement !== 'undefined'
      ? HTMLMediaElement.HAVE_FUTURE_DATA
      : 3
  if (audio.readyState < haveFutureData) {
    const ready = await new Promise<boolean>((resolve) => {
      const done = (ok: boolean) => {
        audio.removeEventListener('canplay', onReady)
        audio.removeEventListener('error', onError)
        resolve(ok)
      }
      const onReady = () => done(true)
      const onError = () => done(false)
      audio.addEventListener('canplay', onReady)
      audio.addEventListener('error', onError)
      if (signal?.cancelled) done(false)
      // readyState may have advanced synchronously after load().
      if (audio.readyState >= haveFutureData) done(true)
    })
    if (!ready || signal?.cancelled) return false
  }

  audio.muted = false
  audio.volume = 1
  try {
    audio.currentTime = 0
  } catch {
    // Some WebKit builds throw if the media is not seekable yet.
  }

  try {
    await audio.play()
  } catch {
    return false
  }

  return waitUntilEnded(audio, signal)
}

/** Plays each URL in order. Returns false if the browser blocked playback. */
export async function playAudioUrls(
  urls: string[],
  signal?: { cancelled: boolean },
): Promise<boolean> {
  if (urls.length === 0) return true
  // If the deck-tap unlock already succeeded this is a no-op. If not, we still
  // try — tap-to-replay callers invoke unlockAudio() synchronously first.
  if (!unlocked) {
    const ok = await unlockAudio()
    if (!ok) return false
  }
  if (signal?.cancelled) return false

  const audio = getPlayer()
  for (const url of urls) {
    if (signal?.cancelled) return false
    const ok = await loadAndPlay(audio, url, signal)
    if (!ok) return false
  }
  return true
}
