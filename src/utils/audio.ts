/** Unlock and play card audio. iOS Safari only allows Audio.play() after a
 *  user gesture; once unlocked for the document, subsequent plays work. */

let unlocked = false
let unlockPromise: Promise<boolean> | null = null

/** Call from a tap handler (学習開始 / rating / reveal) before async work. */
export function unlockAudio(): Promise<boolean> {
  if (unlocked) return Promise.resolve(true)
  if (unlockPromise) return unlockPromise

  unlockPromise = (async () => {
    try {
      // Tiny silent WAV keeps the gesture chain alive without audible noise.
      const silent =
        'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='
      const audio = new Audio(silent)
      audio.volume = 0.001
      await audio.play()
      audio.pause()
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

/** Plays each URL in order. Returns false if the browser blocked playback. */
export async function playAudioUrls(
  urls: string[],
  signal?: { cancelled: boolean },
): Promise<boolean> {
  for (const url of urls) {
    if (signal?.cancelled) return true
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
      if (signal?.cancelled) {
        audio.pause()
        finish()
      }
    })
  }
  return true
}
