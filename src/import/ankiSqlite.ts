import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

let sqlPromise: Promise<SqlJsStatic> | null = null

async function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({ locateFile: () => wasmUrl })
  }
  return sqlPromise
}

export async function openAnkiDb(data: Uint8Array): Promise<Database> {
  const SQL = await getSql()
  return new SQL.Database(data)
}

export function queryAll(
  db: Database,
  sql: string,
  params: SqlValue[] = [],
): Record<string, SqlValue>[] {
  const stmt = db.prepare(sql)
  try {
    if (params.length) stmt.bind(params)
    const rows: Record<string, SqlValue>[] = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    return rows
  } finally {
    stmt.free()
  }
}

export function queryOne(
  db: Database,
  sql: string,
  params: SqlValue[] = [],
): Record<string, SqlValue> | undefined {
  return queryAll(db, sql, params)[0]
}

export interface AnkiModel {
  id: string
  name: string
  type: number
  fields: string[]
  templates: { name: string; qfmt: string; afmt: string }[]
}

export interface AnkiDeckInfo {
  id: string
  name: string
  newPerDay: number
  configId: string
  newToday: number
}

export function parseModels(modelsJson: string): Map<string, AnkiModel> {
  const raw = JSON.parse(modelsJson) as Record<
    string,
    {
      id?: number | string
      name: string
      type?: number
      flds: { name: string }[]
      tmpls: { name: string; qfmt: string; afmt: string }[]
    }
  >
  const map = new Map<string, AnkiModel>()
  for (const [id, m] of Object.entries(raw)) {
    map.set(String(id), {
      id: String(m.id ?? id),
      name: m.name,
      type: m.type ?? 0,
      fields: m.flds.map((f) => f.name),
      templates: m.tmpls.map((t) => ({
        name: t.name,
        qfmt: t.qfmt,
        afmt: t.afmt,
      })),
    })
  }
  return map
}

export function parseDecks(decksJson: string): Map<string, AnkiDeckInfo> {
  const raw = JSON.parse(decksJson) as Record<
    string,
    {
      id?: number | string
      name: string
      newToday?: [number, number]
      conf?: number
    }
  >
  const map = new Map<string, AnkiDeckInfo>()
  for (const [id, d] of Object.entries(raw)) {
    if (d.name === 'Default' && Object.keys(raw).length > 1 && id === '1') {
      // keep Default; may be empty
    }
    map.set(String(id), {
      id: String(d.id ?? id),
      name: d.name,
      newPerDay: 20,
      configId: String(d.conf ?? 1),
      newToday: Math.max(0, d.newToday?.[1] ?? 0),
    })
  }
  return map
}

export function parseDconfNewLimits(
  dconfJson: string | null | undefined,
): Map<string, number> {
  const result = new Map<string, number>()
  if (!dconfJson) return result
  try {
    const raw = JSON.parse(dconfJson) as Record<
      string,
      { id?: number; new?: { perDay?: number } }
    >
    for (const [id, conf] of Object.entries(raw)) {
      result.set(String(conf.id ?? id), conf.new?.perDay ?? 20)
    }
  } catch {
    // ignore
  }
  return result
}

/** Minimal Mustache-like field substitution for Anki templates */
export function renderAnkiTemplate(
  template: string,
  fields: Record<string, string>,
): string {
  let out = template

  // Resolve nested conditionals from the inside out.
  const conditional =
    /\{\{([#^])\s*([^}]+?)\s*\}\}((?:(?!\{\{[#^]).)*?)\{\{\/\s*\2\s*\}\}/gs
  for (let i = 0; i < 20 && conditional.test(out); i++) {
    conditional.lastIndex = 0
    out = out.replace(
      conditional,
      (_match, mode: string, name: string, inner: string) => {
        const hasValue = Boolean(fields[name.trim()]?.trim())
        return mode === '#' ? (hasValue ? inner : '') : hasValue ? '' : inner
      },
    )
  }

  out = out.replace(/\{\{([^{}]+)\}\}/g, (_match, expression: string) => {
    const token = expression.trim()
    if (token.startsWith('#') || token.startsWith('^') || token.startsWith('/')) {
      return ''
    }
    const separator = token.indexOf(':')
    const filter = separator >= 0 ? token.slice(0, separator).toLowerCase() : ''
    const key = separator >= 0 ? token.slice(separator + 1).trim() : token
    const value = fields[key] ?? ''
    if (filter === 'text') {
      return value.replace(/<[^>]*>/g, '')
    }
    // cloze/type/hint filters still need their source field in Kioku's basic renderer.
    return value
  })
  return out
}
