import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, ensureSettings } from './database'
import { invalidateMediaCaches, withFilenameLower } from './mediaCache'
import { lookupMediaByFilenames } from './mediaLookup'
import type { MediaFile } from './schema'

function media(partial: Partial<MediaFile> & Pick<MediaFile, 'id' | 'filename'>): MediaFile {
  return withFilenameLower({
    mimeType: 'audio/mpeg',
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }),
    ...partial,
  })
}

beforeEach(async () => {
  invalidateMediaCaches()
  db.close()
  await db.delete()
  await db.open()
  await ensureSettings()
})

describe('lookupMediaByFilenames', () => {
  it('resolves a case-insensitive name through filenameLower without Collection.filter', async () => {
    await db.media.bulkPut([
      media({ id: 'm1', filename: 'Sound.mp3' }),
      media({ id: 'm2', filename: 'other.mp3' }),
    ])
    const filter = vi.spyOn(db.media, 'filter')
    const rows = await lookupMediaByFilenames(['sound.mp3'])
    expect(filter).not.toHaveBeenCalled()
    expect(rows.map((row) => row.id)).toEqual(['m1'])
  })

  it('prefers an exact filename when case variants both exist', async () => {
    await db.media.bulkPut([
      media({ id: 'lower', filename: 'sound.mp3' }),
      media({ id: 'exact', filename: 'Sound.mp3' }),
    ])
    const rows = await lookupMediaByFilenames(['Sound.mp3'])
    expect(rows.some((row) => row.id === 'exact')).toBe(true)
  })

  it('does not scan the table again for a known-missing name', async () => {
    await db.media.put(media({ id: 'm1', filename: 'keep.mp3' }))
    await expect(lookupMediaByFilenames(['gone.mp3'])).resolves.toEqual([])
    const where = vi.spyOn(db.media, 'where')
    await expect(lookupMediaByFilenames(['gone.mp3'])).resolves.toEqual([])
    expect(where).not.toHaveBeenCalled()
  })
})
