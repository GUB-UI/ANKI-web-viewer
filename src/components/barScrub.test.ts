import { describe, expect, it } from 'vitest'
import { barIndexAt } from './barScrub'

describe('barIndexAt', () => {
  it('picks the first and last buckets at the edges', () => {
    expect(barIndexAt(0, 100, 10)).toBe(0)
    expect(barIndexAt(99, 100, 10)).toBe(9)
    expect(barIndexAt(100, 100, 10)).toBe(9)
  })

  it('maps the middle of a bucket to that index', () => {
    expect(barIndexAt(25, 100, 4)).toBe(1)
    expect(barIndexAt(74, 100, 4)).toBe(2)
  })

  it('clamps outside the track', () => {
    expect(barIndexAt(-10, 100, 5)).toBe(0)
    expect(barIndexAt(200, 100, 5)).toBe(4)
  })
})
