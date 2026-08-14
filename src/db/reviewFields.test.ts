import { describe, expect, it } from 'vitest'
import {
  capDurationMs,
  intervalDaysFromAnkiIvl,
  isMatureInterval,
  stateBeforeFromAnkiType,
} from './reviewFields'

describe('reviewFields', () => {
  it('caps answer time at 60 seconds', () => {
    expect(capDurationMs(12_345)).toBe(12_345)
    expect(capDurationMs(90_000)).toBe(60_000)
    expect(capDurationMs(0)).toBeUndefined()
    expect(capDurationMs(-5)).toBeUndefined()
  })

  it('treats negative Anki ivl as not-mature days', () => {
    expect(intervalDaysFromAnkiIvl(21)).toBe(21)
    expect(intervalDaysFromAnkiIvl(-600)).toBe(0)
    expect(isMatureInterval(21)).toBe(true)
    expect(isMatureInterval(20)).toBe(false)
    expect(isMatureInterval(0)).toBe(false)
  })

  it('maps Anki revlog types to Kioku states', () => {
    expect(stateBeforeFromAnkiType(0)).toBe('learning')
    expect(stateBeforeFromAnkiType(1)).toBe('review')
    expect(stateBeforeFromAnkiType(2)).toBe('relearning')
    expect(stateBeforeFromAnkiType(3)).toBeUndefined()
  })
})
