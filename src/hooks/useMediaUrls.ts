import { useEffect, useRef, useState } from 'react'
import { lookupMediaByFilenames } from '../db/mediaLookup'
import { pickMediaRow, releaseMedia, retainMedia } from '../db/mediaCache'

export type ResolvedMedia = {
  url: string
  blob: Blob
}

/** Resolve media filenames to object URLs + typed blobs. */
export function useMediaUrls(filenames: string[]): Map<string, string> {
  const entries = useMediaEntries(filenames)
  return entries.urls
}

export function useMediaEntries(filenames: string[]): {
  urls: Map<string, string>
  blobs: Map<string, Blob>
  ids: Map<string, string>
  /** True once the async lookup for this key has settled. */
  ready: boolean
} {
  const [urls, setUrls] = useState<Map<string, string>>(() => new Map())
  const [blobs, setBlobs] = useState<Map<string, Blob>>(() => new Map())
  const [ids, setIds] = useState<Map<string, string>>(() => new Map())
  const [ready, setReady] = useState(filenames.length === 0)
  const heldRef = useRef<string[]>([])
  const key = filenames.join('\0')

  useEffect(() => {
    let cancelled = false
    setReady(false)

    ;(async () => {
      const unique = key ? [...new Set(key.split('\0').filter(Boolean))] : []

      if (unique.length === 0) {
        if (!cancelled) {
          releaseMedia(heldRef.current)
          heldRef.current = []
          setUrls(new Map())
          setBlobs(new Map())
          setIds(new Map())
          setReady(true)
        }
        return
      }

      const rows = await lookupMediaByFilenames(unique)
      if (cancelled) return

      releaseMedia(heldRef.current)
      const retained = retainMedia(rows, unique)
      heldRef.current = retained.ids
      const idMap = new Map<string, string>()
      for (const name of unique) {
        const row = pickMediaRow(rows, name)
        if (row) {
          idMap.set(name, row.id)
          idMap.set(name.toLowerCase(), row.id)
          idMap.set(row.filename, row.id)
        }
      }
      setUrls(retained.urls)
      setBlobs(retained.blobs)
      setIds(idMap)
      setReady(true)
    })()

    return () => {
      cancelled = true
    }
  }, [key])

  useEffect(
    () => () => {
      releaseMedia(heldRef.current)
      heldRef.current = []
    },
    [],
  )

  return { urls, blobs, ids, ready }
}
