export type SoundResolve =
  | { status: 'empty' }
  | { status: 'loading' }
  | { status: 'missing'; names: string[] }
  | { status: 'ready'; blobs: Blob[] }

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
  // If the question face had no tags, back audio already played on show.
  if (frontNames.length === 0) return []
  return backNames.filter((name) => !used.has(name.toLowerCase()))
}
