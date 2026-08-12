import { useEffect, useRef, useState } from 'react'
import { db } from '../db/database'

/** Resolve media filenames to object URLs; revokes previous set when replaced. */
export function useMediaUrls(filenames: string[]): Map<string, string> {
  const [map, setMap] = useState<Map<string, string>>(new Map())
  const createdRef = useRef<string[]>([])
  // Stable dependency — array identity changes every render even when contents match.
  const key = filenames.join('\0')

  useEffect(() => {
    let cancelled = false
    const created: string[] = []

    ;(async () => {
      const next = new Map<string, string>()
      const unique = key ? [...new Set(key.split('\0').filter(Boolean))] : []
      if (unique.length === 0) {
        if (!cancelled) {
          for (const url of createdRef.current) URL.revokeObjectURL(url)
          createdRef.current = []
          setMap(next)
        }
        return
      }

      let rows = await db.media.where('filename').anyOf(unique).toArray()

      // Case-insensitive fallback when the package and sound tags disagree on case.
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
        const url = URL.createObjectURL(row.blob)
        created.push(url)
        next.set(name, url)
        next.set(row.filename, url)
        next.set(name.toLowerCase(), url)
        next.set(row.filename.toLowerCase(), url)
      }

      if (cancelled) {
        for (const url of created) URL.revokeObjectURL(url)
        return
      }

      // Revoke the previous generation only after the next set is ready so an
      // in-flight <audio> / <img> is not pointing at a dead blob URL.
      for (const url of createdRef.current) URL.revokeObjectURL(url)
      createdRef.current = created
      setMap(next)
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

  return map
}
