import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
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

interface ThemeContextValue {
  mode: ThemeMode
  resolved: 'light' | 'dark'
  updateTheme(next: ThemeMode): Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
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
    const color = resolved === 'dark' ? '#000000' : '#f6f7f9'
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.setAttribute('content', color)
    })
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

  return createElement(
    ThemeContext.Provider,
    { value: { mode, resolved, updateTheme } },
    children,
  )
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside ThemeProvider')
  return value
}
