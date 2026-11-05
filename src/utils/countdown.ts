/** Whole seconds remaining until a wall-clock deadline (ceil, never negative). */
export function remainingWholeSeconds(deadlineMs: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((deadlineMs - now) / 1000))
}

/** Delay until the displayed whole-second value should change. */
export function msUntilNextSecondChange(deadlineMs: number, now = Date.now()): number {
  const remaining = deadlineMs - now
  if (remaining <= 0) return 0
  const intoSecond = remaining % 1000
  return intoSecond === 0 ? 1000 : intoSecond
}
