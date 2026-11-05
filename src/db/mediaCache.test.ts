import { describe, expect, it } from 'vitest'
import { pickMediaRow } from './mediaCache'
import type { MediaFile } from './schema'

function row(id: string, filename: string): MediaFile {
  return {
    id,
    filename,
    filenameLower: filename.toLowerCase(),
    mimeType: 'audio/mpeg',
    blob: new Blob(),
  }
}

describe('pickMediaRow', () => {
  it('prefers exact filename then stable id order', () => {
    const rows = [row('b', 'Sound.mp3'), row('a', 'sound.mp3'), row('c', 'Sound.mp3')]
    expect(pickMediaRow(rows, 'Sound.mp3')?.id).toBe('b')
    expect(pickMediaRow(rows, 'SOUND.MP3')?.id).toBe('a')
  })
})
