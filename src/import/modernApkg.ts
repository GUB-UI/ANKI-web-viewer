import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import type { AnkiDeckInfo, AnkiModel } from './ankiSqlite'

export interface ModernAnkiSource {
  crt: number
  models: Map<string, AnkiModel>
  decks: Map<string, AnkiDeckInfo>
  noteRows: Record<string, unknown>[]
  cardRows: Record<string, unknown>[]
  revlogRows: Record<string, unknown>[]
  mediaFilenames: string[]
  warnings: string[]
  getMediaFile(filename: string): Promise<Uint8Array>
  cleanup(): Promise<void>
}

interface PrivateCollection {
  crt?: number
  dconf?: Record<string, { new?: { perDay?: number } }>
}

interface PackageInternals {
  databaseContents?: {
    collection?: PrivateCollection
  }
}

let configured = false

export async function openModernApkg(file: Blob): Promise<ModernAnkiSource> {
  const module = await import('srs-converter')
  if (!configured) {
    module.configureSqlJs({ locateFile: () => sqlWasmUrl })
    configured = true
  }

  const result = await module.AnkiPackage.fromAnkiExport(
    new Uint8Array(await file.arrayBuffer()),
    { errorHandling: 'best-effort' },
  )
  if (!result.data || result.status === 'failure') {
    const detail = result.issues.map((issue) => issue.message).join(' / ')
    throw new Error(`現行Ankiパッケージを解析できませんでした。${detail}`)
  }

  const pkg = result.data
  const collection = (pkg as unknown as PackageInternals).databaseContents?.collection
  const crt = collection?.crt
  if (typeof crt !== 'number' || !Number.isFinite(crt)) {
    await pkg.cleanup()
    throw new Error('Ankiコレクションの作成日時を読み取れませんでした。')
  }

  const models = new Map<string, AnkiModel>()
  for (const model of pkg.getNoteTypes()) {
    models.set(String(model.id), {
      id: String(model.id),
      name: model.name,
      type: model.type,
      fields: [...model.flds]
        .sort((a, b) => a.ord - b.ord)
        .map((field) => field.name),
      templates: [...model.tmpls]
        .sort((a, b) => a.ord - b.ord)
        .map((template) => ({
          name: template.name,
          qfmt: template.qfmt,
          afmt: template.afmt,
        })),
    })
  }

  const dconf = collection?.dconf ?? {}
  const decks = new Map<string, AnkiDeckInfo>()
  for (const deck of pkg.getDecks()) {
    const config = dconf[String(deck.conf)]
    decks.set(String(deck.id), {
      id: String(deck.id),
      name: deck.name.replaceAll('\x1f', '::'),
      newPerDay: Math.max(
        0,
        deck.newLimit ?? config?.new?.perDay ?? 20,
      ),
      configId: String(deck.conf),
      newToday: Math.max(0, deck.newToday?.[1] ?? 0),
    })
  }

  return {
    crt,
    models,
    decks,
    noteRows: pkg.getNotes() as unknown as Record<string, unknown>[],
    cardRows: pkg.getCards() as unknown as Record<string, unknown>[],
    revlogRows: pkg.getReviews() as unknown as Record<string, unknown>[],
    mediaFilenames: pkg.listMediaFiles(),
    warnings: result.issues.map((issue) => issue.message),
    getMediaFile: (filename) => pkg.getMediaFile(filename),
    cleanup: async () => {
      await pkg.cleanup()
    },
  }
}
