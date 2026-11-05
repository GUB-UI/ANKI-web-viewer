import { db } from './database'
import type { MediaFile } from './schema'
import {
  isKnownMissingName,
  mediaFilenameLower,
  rememberMissingNames,
} from './mediaCache'

export async function lookupMediaByFilenames(
  names: string[],
): Promise<MediaFile[]> {
  const unique = [...new Set(names.filter(Boolean))]
  if (unique.length === 0) return []

  const skip = unique.filter((name) => isKnownMissingName(name))
  const query = unique.filter((name) => !isKnownMissingName(name))
  if (query.length === 0) {
    rememberMissingNames(skip)
    return []
  }

  let rows = await db.media.where('filename').anyOf(query).toArray()
  const foundExact = new Set(rows.map((row) => row.filename))
  const unresolved = query.filter((name) => !foundExact.has(name))
  const needLower = [
    ...new Set(
      unresolved
        .map(mediaFilenameLower)
        .filter((lower) => !rows.some((row) => mediaFilenameLower(row.filename) === lower)),
    ),
  ]

  if (needLower.length > 0) {
    const extras = await db.media.where('filenameLower').anyOf(needLower).toArray()
    rows = rows.concat(extras)
  }

  const missing: string[] = []
  for (const name of unique) {
    const lower = mediaFilenameLower(name)
    const hit = rows.some(
      (row) => row.filename === name || mediaFilenameLower(row.filename) === lower,
    )
    if (!hit) missing.push(name)
  }
  rememberMissingNames(missing)
  return rows
}
