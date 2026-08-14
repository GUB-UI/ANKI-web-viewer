import { describe, expect, it } from 'vitest'
import { extraAnswerSounds, pickQuestionSounds } from './audio'

const blob = new Blob([new Uint8Array([1])], { type: 'audio/mpeg' })

describe('pickQuestionSounds', () => {
  it('prefers ready front audio', () => {
    expect(
      pickQuestionSounds(
        { status: 'ready', blobs: [blob] },
        { status: 'ready', blobs: [blob] },
      ),
    ).toEqual({ status: 'ready', blobs: [blob] })
  })

  it('uses back audio on the question face when front has none', () => {
    expect(
      pickQuestionSounds({ status: 'empty' }, { status: 'ready', blobs: [blob] }),
    ).toEqual({ status: 'ready', blobs: [blob] })
  })

  it('falls back to back audio when front files are missing', () => {
    expect(
      pickQuestionSounds(
        { status: 'missing', names: ['gone.mp3'] },
        { status: 'ready', blobs: [blob] },
      ),
    ).toEqual({ status: 'ready', blobs: [blob] })
  })

  it('waits while either side is still loading', () => {
    expect(
      pickQuestionSounds({ status: 'empty' }, { status: 'loading' }),
    ).toEqual({ status: 'loading' })
  })
})

describe('extraAnswerSounds', () => {
  it('plays nothing extra on flip when the question had no tags', () => {
    expect(extraAnswerSounds([], ['only-back.mp3'])).toEqual([])
  })

  it('plays only back files that were not on the front', () => {
    expect(
      extraAnswerSounds(['front.mp3'], ['front.mp3', 'back.mp3']),
    ).toEqual(['back.mp3'])
  })
})
