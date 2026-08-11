import { useEffect, useState } from 'react'
import { db, ensureSettings } from '../db/database'
import type { ThemeMode } from '../db/schema'

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }
  return mode
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>('system')
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    resolveTheme('system'),
  )

  useEffect(() => {
    let alive = true
    ensureSettings().then((s) => {
      if (!alive) return
      setMode(s.theme)
      setResolved(resolveTheme(s.theme))
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
  }, [resolved])

  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => setResolved(resolveTheme('system'))
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  async function updateTheme(next: ThemeMode) {
    setMode(next)
    setResolved(resolveTheme(next))
    await db.settings.update('settings', { theme: next })
  }

  return { mode, resolved, updateTheme }
}
