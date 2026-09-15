import { describe, expect, it } from 'vitest'
import { formatPreviewLabel, formatScheduledDays, formatStudyDuration } from './dates'

describe('formatScheduledDays', () => {
  it('keeps day counts instead of rounding 31d to 1 month', () => {
    expect(formatScheduledDays(8)).toBe('8d')
    expect(formatScheduledDays(31)).toBe('31d')
    expect(formatScheduledDays(39)).toBe('39d')
    expect(formatScheduledDays(120)).toBe('4mo')
  })
})

describe('formatPreviewLabel', () => {
  const now = Date.parse('2026-08-15T12:00:00Z')

  it('uses FSRS scheduled days for review cards', () => {
    expect(
      formatPreviewLabel({
        due: now + 39 * 86_400_000,
        now,
        scheduledDays: 39,
        learning: false,
      }),
    ).toBe('39d')
  })

  it('uses minutes for learning steps', () => {
    expect(
      formatPreviewLabel({
        due: now + 10 * 60_000,
        now,
        scheduledDays: 0,
        learning: true,
      }),
    ).toBe('10m')
  })
})

describe('formatStudyDuration', () => {
  it('formats seconds, minutes, and hours', () => {
    expect(formatStudyDuration(0)).toBe('0秒')
    expect(formatStudyDuration(12_000)).toBe('12秒')
    expect(formatStudyDuration(60_000)).toBe('1分')
    expect(formatStudyDuration(75_000)).toBe('1分 15秒')
    expect(formatStudyDuration(3_600_000)).toBe('1時間')
    expect(formatStudyDuration(3_720_000)).toBe('1時間 2分')
  })
})
