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
      for (const name of filenames) {
        const row = await db.media.where('filename').equals(name).first()
        if (!row) continue
        const url = URL.createObjectURL(row.blob)
        urls.push(url)
        next.set(name, url)
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
