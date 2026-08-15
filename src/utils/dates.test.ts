import { describe, expect, it } from 'vitest'
import { formatPreviewLabel, formatScheduledDays } from './dates'

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
