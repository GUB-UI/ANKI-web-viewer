import { useEffect, useState } from 'react'
import { db } from '../db/database'

/** Resolve media filenames to object URLs; revokes on cleanup */
export function useMediaUrls(filenames: string[]): Map<string, string> {
  const [map, setMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    let cancelled = false
    const urls: string[] = []

    ;(async () => {
      const next = new Map<string, string>()
      const unique = [...new Set(filenames)]
      const rows = unique.length
        ? await db.media.where('filename').anyOf(unique).toArray()
        : []
      for (const row of rows) {
        const url = URL.createObjectURL(row.blob)
        urls.push(url)
        next.set(row.filename, url)
      }
      if (!cancelled) setMap(next)
    })()

    return () => {
      cancelled = true
      for (const u of urls) URL.revokeObjectURL(u)
    }
  }, [filenames.join('|')])

  return map
}
