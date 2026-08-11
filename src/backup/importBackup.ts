import JSZip from 'jszip'
import { clearAllData, db } from '../db/database'
import type {
  AppSettings,
  Card,
  DailyOverride,
  Deck,
  Note,
  ReviewLog,
} from '../db/schema'

export async function restoreBackup(file: File | Blob): Promise<void> {
  const zip = await JSZip.loadAsync(file)
  const metaRaw = await zip.file('backup.json')?.async('string')
  if (!metaRaw) {
    throw new Error('backup.json が見つかりません。Kiokuのバックアップファイルですか？')
  }
  const meta = JSON.parse(metaRaw) as { version?: number; app?: string }
  if (meta.app && meta.app !== 'kioku') {
    throw new Error(`未知のバックアップ形式です: ${meta.app}`)
  }

  const decks = JSON.parse(
    (await zip.file('decks.json')?.async('string')) ?? '[]',
  ) as Deck[]
  const notes = JSON.parse(
    (await zip.file('notes.json')?.async('string')) ?? '[]',
  ) as Note[]
  const cards = JSON.parse(
    (await zip.file('cards.json')?.async('string')) ?? '[]',
  ) as Card[]
  const reviews = JSON.parse(
    (await zip.file('reviews.json')?.async('string')) ?? '[]',
  ) as ReviewLog[]
  const settingsPack = JSON.parse(
    (await zip.file('settings.json')?.async('string')) ?? '{}',
  ) as { settings?: AppSettings; dailyOverrides?: DailyOverride[] }
  const mediaIndex = JSON.parse(
    (await zip.file('media-index.json')?.async('string')) ?? '[]',
  ) as { id: string; filename: string; mimeType: string }[]

  await clearAllData()

  await db.transaction(
    'rw',
    [db.decks, db.notes, db.cards, db.reviewLogs, db.media, db.settings, db.dailyOverrides],
    async () => {
      if (decks.length) await db.decks.bulkPut(decks)
      if (notes.length) await db.notes.bulkPut(notes)
      if (cards.length) await db.cards.bulkPut(cards)
      if (reviews.length) {
        const chunk = 1000
        for (let i = 0; i < reviews.length; i += chunk) {
          await db.reviewLogs.bulkPut(reviews.slice(i, i + chunk))
        }
      }
      if (settingsPack.settings) {
        await db.settings.put({ ...settingsPack.settings, id: 'settings' })
      }
      if (settingsPack.dailyOverrides?.length) {
        await db.dailyOverrides.bulkPut(settingsPack.dailyOverrides)
      }

      for (const item of mediaIndex) {
        const entry = zip.file(`media/${item.id}`)
        if (!entry) continue
        const buf = await entry.async('arraybuffer')
        await db.media.put({
          id: item.id,
          filename: item.filename,
          mimeType: item.mimeType,
          blob: new Blob([buf], { type: item.mimeType }),
        })
      }
    },
  )
}
