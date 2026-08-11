import JSZip from 'jszip'
import { db, ensureSettings } from '../db/database'

export async function exportBackup(): Promise<Blob> {
  const [decks, notes, cards, reviewLogs, media, settings, dailyOverrides] =
    await Promise.all([
      db.decks.toArray(),
      db.notes.toArray(),
      db.cards.toArray(),
      db.reviewLogs.toArray(),
      db.media.toArray(),
      ensureSettings(),
      db.dailyOverrides.toArray(),
    ])

  const zip = new JSZip()
  zip.file(
    'backup.json',
    JSON.stringify({
      version: 1,
      app: 'kioku',
      exportedAt: Date.now(),
    }),
  )
  zip.file('decks.json', JSON.stringify(decks))
  zip.file('notes.json', JSON.stringify(notes))
  zip.file('cards.json', JSON.stringify(cards))
  zip.file('reviews.json', JSON.stringify(reviewLogs))
  zip.file('settings.json', JSON.stringify({ settings, dailyOverrides }))

  const mediaFolder = zip.folder('media')!
  const mediaIndex: { id: string; filename: string; mimeType: string }[] = []
  for (const m of media) {
    mediaIndex.push({ id: m.id, filename: m.filename, mimeType: m.mimeType })
    mediaFolder.file(m.id, m.blob)
  }
  zip.file('media-index.json', JSON.stringify(mediaIndex))

  await db.settings.update('settings', { lastBackupAt: Date.now() })

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
