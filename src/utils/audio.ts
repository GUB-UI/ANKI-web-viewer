/** Unlock and play card audio. iOS Safari only allows Audio.play() after a
 *  user gesture; once unlocked for the document, subsequent plays work. */

let unlocked = false
let unlockPromise: Promise<boolean> | null = null
let player: HTMLAudioElement | null = null

function getPlayer(): HTMLAudioElement {
  player ??= new Audio()
  return player
}

/** Call from a tap handler (学習開始 / rating / reveal) before async work. */
export function unlockAudio(): Promise<boolean> {
  if (unlocked) return Promise.resolve(true)
  if (unlockPromise) return unlockPromise

  unlockPromise = (async () => {
    try {
      // Tiny silent WAV keeps the gesture chain alive without audible noise.
      const silent =
        'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='
      const audio = getPlayer()
      audio.src = silent
      audio.volume = 0.001
      await audio.play()
      audio.pause()
      audio.currentTime = 0
      audio.volume = 1
      unlocked = true
      return true
    } catch {
      unlockPromise = null
      return false
    }
  })()

  return unlockPromise
}

export function isAudioUnlocked(): boolean {
  return unlocked
}

export function stopAudioPlayback(): void {
  if (!player) return
  player.pause()
}

/** Plays each URL in order. Returns false if the browser blocked playback. */
export async function playAudioUrls(
  urls: string[],
  signal?: { cancelled: boolean },
): Promise<boolean> {
  const audio = getPlayer()
  for (const url of urls) {
    if (signal?.cancelled) return true
    audio.pause()
    audio.src = url
    audio.currentTime = 0
    try {
      await audio.play()
    } catch {
      return false
    }
    await new Promise<void>((resolve) => {
      const finish = () => {
        audio.removeEventListener('ended', finish)
        audio.removeEventListener('error', finish)
        audio.removeEventListener('pause', finish)
        resolve()
      }
      audio.addEventListener('ended', finish, { once: true })
      audio.addEventListener('error', finish, { once: true })
      audio.addEventListener('pause', finish, { once: true })
      if (signal?.cancelled) {
        audio.pause()
        finish()
      }
    })
  }
  return true
}
