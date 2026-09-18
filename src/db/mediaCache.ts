import type { MediaFile } from './schema'
import { guessMimeType } from '../utils/mediaRefs'

type HeldMedia = {
  id: string
  filename: string
  blob: Blob
  url: string
  refs: number
}

const byId = new Map<string, HeldMedia>()
const missingLower = new Set<string>()
const MAX_IDLE = 64

export function mediaFilenameLower(filename: string): string {
  return filename.toLowerCase()
}

export function withFilenameLower<T extends { filename: string }>(
  row: T,
): T & { filenameLower: string } {
  return { ...row, filenameLower: mediaFilenameLower(row.filename) }
}

export function typedMediaBlob(filename: string, blob: Blob, mimeType?: string): Blob {
  const type =
    (mimeType && mimeType !== 'application/octet-stream' && mimeType) ||
    (blob.type && blob.type !== 'application/octet-stream' && blob.type) ||
    guessMimeType(filename)
  if (blob.type === type) return blob
  return new Blob([blob], { type })
}

export function rememberMissingNames(names: string[]): void {
  for (const name of names) missingLower.add(mediaFilenameLower(name))
}

export function isKnownMissingName(name: string): boolean {
  return missingLower.has(mediaFilenameLower(name))
}

export function forgetMissingName(name: string): void {
  missingLower.delete(mediaFilenameLower(name))
}

/** Exact filename wins; case-insensitive ties pick the smallest id. */
export function pickMediaRow(
  rows: MediaFile[],
  name: string,
): MediaFile | undefined {
  const exact = rows.filter((row) => row.filename === name)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) {
    return exact.slice().sort((a, b) => a.id.localeCompare(b.id))[0]
  }
  const lower = mediaFilenameLower(name)
  const folded = rows.filter(
    (row) => mediaFilenameLower(row.filename) === lower,
  )
  if (folded.length === 0) return undefined
  return folded.slice().sort((a, b) => a.id.localeCompare(b.id))[0]
}

function trimIdle(): void {
  const idle = [...byId.values()].filter((entry) => entry.refs <= 0)
  const overflow = idle.length - MAX_IDLE
  if (overflow <= 0) return
  idle.sort((a, b) => a.id.localeCompare(b.id))
  for (const entry of idle.slice(0, overflow)) {
    URL.revokeObjectURL(entry.url)
    byId.delete(entry.id)
  }
}

export function retainMedia(
  rows: MediaFile[],
  requested: string[],
): {
  urls: Map<string, string>
  blobs: Map<string, Blob>
  ids: string[]
} {
  const urls = new Map<string, string>()
  const blobs = new Map<string, Blob>()
  const ids: string[] = []

  for (const name of requested) {
    const row = pickMediaRow(rows, name)
    if (!row) continue
    let entry = byId.get(row.id)
    if (!entry) {
      const blob = typedMediaBlob(row.filename, row.blob, row.mimeType)
      entry = {
        id: row.id,
        filename: row.filename,
        blob,
        url: URL.createObjectURL(blob),
        refs: 0,
      }
      byId.set(row.id, entry)
    }
    entry.refs += 1
    ids.push(row.id)
    const keys = new Set([
      name,
      row.filename,
      mediaFilenameLower(name),
      mediaFilenameLower(row.filename),
    ])
    for (const key of keys) {
      urls.set(key, entry.url)
      blobs.set(key, entry.blob)
    }
  }
  return { urls, blobs, ids }
}

export function releaseMedia(ids: string[]): void {
  for (const id of ids) {
    const entry = byId.get(id)
    if (!entry) continue
    entry.refs = Math.max(0, entry.refs - 1)
  }
  trimIdle()
}

export function invalidateMediaCaches(): void {
  for (const entry of byId.values()) URL.revokeObjectURL(entry.url)
  byId.clear()
  missingLower.clear()
}

export function mediaCacheSizeForTests(): number {
  return byId.size
}
