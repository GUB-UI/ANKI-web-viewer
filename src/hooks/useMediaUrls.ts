import { useEffect, useRef, useState } from 'react'
import { db } from '../db/database'
import { guessMimeType } from '../utils/mediaRefs'

export type ResolvedMedia = {
  url: string
  blob: Blob
}

function typedBlob(filename: string, blob: Blob, mimeType?: string): Blob {
  const type =
    (mimeType && mimeType !== 'application/octet-stream' && mimeType) ||
    (blob.type && blob.type !== 'application/octet-stream' && blob.type) ||
    guessMimeType(filename)
  if (blob.type === type) return blob
  return new Blob([blob], { type })
}

/** Resolve media filenames to object URLs + typed blobs. */
export function useMediaUrls(filenames: string[]): Map<string, string> {
  const entries = useMediaEntries(filenames)
  return entries.urls
}

export function useMediaEntries(filenames: string[]): {
  urls: Map<string, string>
  blobs: Map<string, Blob>
  /** True once the async lookup for this key has settled. */
  ready: boolean
} {
  const [urls, setUrls] = useState<Map<string, string>>(() => new Map())
  const [blobs, setBlobs] = useState<Map<string, Blob>>(() => new Map())
  const [ready, setReady] = useState(filenames.length === 0)
  const createdRef = useRef<string[]>([])
  const key = filenames.join('\0')

  useEffect(() => {
    let cancelled = false
    const created: string[] = []
    setReady(false)

    ;(async () => {
      const nextUrls = new Map<string, string>()
      const nextBlobs = new Map<string, Blob>()
      const unique = key ? [...new Set(key.split('\0').filter(Boolean))] : []

      if (unique.length === 0) {
        if (!cancelled) {
          for (const url of createdRef.current) URL.revokeObjectURL(url)
          createdRef.current = []
          setUrls(nextUrls)
          setBlobs(nextBlobs)
          setReady(true)
        }
        return
      }

      let rows = await db.media.where('filename').anyOf(unique).toArray()

      if (rows.length < unique.length) {
        const found = new Set(rows.map((row) => row.filename.toLowerCase()))
        const missing = unique.filter((name) => !found.has(name.toLowerCase()))
        if (missing.length > 0) {
          const missingLower = new Set(missing.map((name) => name.toLowerCase()))
          const extras = await db.media
            .filter((row) => missingLower.has(row.filename.toLowerCase()))
            .toArray()
          rows = rows.concat(extras)
        }
      }

      const byLower = new Map(
        rows.map((row) => [row.filename.toLowerCase(), row] as const),
      )

      for (const name of unique) {
        const row =
          rows.find((item) => item.filename === name) ??
          byLower.get(name.toLowerCase())
        if (!row) continue
        const blob = typedBlob(row.filename, row.blob, row.mimeType)
        const url = URL.createObjectURL(blob)
        created.push(url)
        const keys = new Set([
          name,
          row.filename,
          name.toLowerCase(),
          row.filename.toLowerCase(),
        ])
        for (const k of keys) {
          nextUrls.set(k, url)
          nextBlobs.set(k, blob)
        }
      }

      if (cancelled) {
        for (const url of created) URL.revokeObjectURL(url)
        return
      }

      for (const url of createdRef.current) URL.revokeObjectURL(url)
      createdRef.current = created
      setUrls(nextUrls)
      setBlobs(nextBlobs)
      setReady(true)
    })()

    return () => {
      cancelled = true
    }
  }, [key])

  useEffect(
    () => () => {
      for (const url of createdRef.current) URL.revokeObjectURL(url)
      createdRef.current = []
    },
    [],
  )

  return { urls, blobs, ready }
}
