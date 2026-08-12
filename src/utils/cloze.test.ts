import { describe, expect, it } from 'vitest'
import { extractClozeIndices, renderClozeBack, renderClozeFront } from './cloze'

describe('cloze', () => {
  const text = 'The capital of Japan is {{c1::Tokyo}} and {{c2::Osaka}} is large.'

  it('extracts indices', () => {
    expect(extractClozeIndices(text)).toEqual([1, 2])
  })

  it('renders front/back without lastIndex bugs after extract', () => {
    extractClozeIndices(text)
    expect(renderClozeFront(text, 1)).toBe(
      'The capital of Japan is [...] and Osaka is large.',
    )
    extractClozeIndices(text)
    expect(renderClozeBack(text, 1)).toContain('cloze-answer')
    expect(renderClozeBack(text, 1)).toContain('Tokyo')
    expect(renderClozeBack(text, 1)).toContain('Osaka')
  })

  it('supports colons and hints inside cloze text', () => {
    const withHint = '比率は {{c1::1:2::比率}} です'
    expect(extractClozeIndices(withHint)).toEqual([1])
    expect(renderClozeFront(withHint, 1)).toBe('比率は [比率] です')
    expect(renderClozeBack(withHint, 1)).toContain('1:2')
  })
})
