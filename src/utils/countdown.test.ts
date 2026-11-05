import { describe, expect, it } from 'vitest'
import { msUntilNextSecondChange, remainingWholeSeconds } from './countdown'

describe('remainingWholeSeconds', () => {
  it('ceils to whole seconds and clamps at zero', () => {
    expect(remainingWholeSeconds(10_000, 10_000)).toBe(0)
    expect(remainingWholeSeconds(10_000, 9_500)).toBe(1)
    expect(remainingWholeSeconds(10_000, 5_500)).toBe(5)
    expect(remainingWholeSeconds(10_000, 12_000)).toBe(0)
  })
})

describe('msUntilNextSecondChange', () => {
  it('waits until the next integer-second boundary', () => {
    expect(msUntilNextSecondChange(10_000, 5_500)).toBe(500)
    expect(msUntilNextSecondChange(10_000, 6_000)).toBe(1000)
    expect(msUntilNextSecondChange(10_000, 9_500)).toBe(500)
    expect(msUntilNextSecondChange(10_000, 10_000)).toBe(0)
  })
})
