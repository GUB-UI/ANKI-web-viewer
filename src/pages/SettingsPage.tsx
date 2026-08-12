import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { downloadBlob, exportBackup } from '../backup/exportBackup'
import { restoreBackup } from '../backup/importBackup'
import { clearAllData, db, ensureSettings } from '../db/database'
import type { AppSettings, ThemeMode } from '../db/schema'
import { useTheme } from '../hooks/useTheme'
import { formatBackupDate } from '../utils/dates'

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const { mode, updateTheme } = useTheme()
  const backupInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    ensureSettings().then(setSettings)
  }, [])

  async function patch(partial: Partial<AppSettings>) {
    await db.settings.update('settings', partial)
    if (partial.newCardsPerDay != null) {
      const decks = await db.decks.toArray()
      await db.decks.bulkPut(
        decks.map((d) => ({ ...d, newCardsPerDay: partial.newCardsPerDay! })),
      )
    }
    setSettings((s) => (s ? { ...s, ...partial } : s))
  }

  async function onExport() {
    setBusy(true)
    setMessage('')
    try {
      const blob = await exportBackup()
      downloadBlob(blob, `kioku-backup-${new Date().toISOString().slice(0, 10)}.zip`)
      const s = await ensureSettings()
      setSettings(s)
      setMessage('バックアップを書き出しました。')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '書き出しに失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  async function onRestore(file: File | undefined) {
    if (!file) return
    if (
      !confirm(
        `バックアップ (${(file.size / 1024 / 1024).toFixed(1)} MB) を検証後、現在のデータと置き換えます。失敗時は元のデータが保持されます。続けますか？`,
      )
    ) {
      return
    }
    setBusy(true)
    setMessage('')
    try {
      await restoreBackup(file)
      const restored = await ensureSettings()
      setSettings(restored)
      await updateTheme(restored.theme)
      setMessage('復元が完了しました。')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '復元に失敗しました。')
    } finally {
      setBusy(false)
      if (backupInput.current) backupInput.current.value = ''
    }
  }

  async function onDelete() {
    if (!confirm('すべての学習データ・メディア・履歴を削除します。よろしいですか？')) {
      return
    }
    await clearAllData()
    setSettings(await ensureSettings())
    setMessage('データを削除しました。')
  }

  if (!settings) {
    return (
      <div className="app-shell">
        <p className="muted">読み込み中...</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="page-header">
        <Link to="/" className="icon-btn" aria-label="戻る">
          ←
        </Link>
        <h1>設定</h1>
        <div style={{ width: 48 }} />
      </header>

      <section className="section">
        <span className="eyebrow">01 Study</span>
        <h2>学習</h2>
        <div className="field">
          <label htmlFor="new-cards">1日の新規カード（デフォルト）</label>
          <input
            id="new-cards"
            type="number"
            min={0}
            value={settings.newCardsPerDay}
            onChange={(e) =>
              void patch({ newCardsPerDay: Math.max(0, Number(e.target.value) || 0) })
            }
          />
        </div>
        <div className="row-between" style={{ marginTop: 12 }}>
          <span>スワイプ操作</span>
          <select
            value={settings.swipeEnabled ? 'on' : 'off'}
            onChange={(e) => void patch({ swipeEnabled: e.target.value === 'on' })}
          >
            <option value="on">ON</option>
            <option value="off">OFF</option>
          </select>
        </div>
      </section>

      <section className="section">
        <span className="eyebrow">02 Appearance</span>
        <h2>表示</h2>
        <div className="row-between">
          <span>ダークモード</span>
          <select
            value={mode}
            onChange={(e) => void updateTheme(e.target.value as ThemeMode)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </section>

      <section className="section">
        <span className="eyebrow is-warm">03 Data</span>
        <h2>データ</h2>
        <p className="muted" style={{ marginTop: 0, lineHeight: 1.9 }}>
          最終バックアップ
          <br />
          {formatBackupDate(settings.lastBackupAt)}
        </p>
        <div className="stack">
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={busy}
            onClick={onExport}
          >
            バックアップを書き出す
          </button>
          <input
            ref={backupInput}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={(e) => void onRestore(e.target.files?.[0])}
          />
          <button
            type="button"
            className="btn btn-block"
            disabled={busy}
            onClick={() => backupInput.current?.click()}
          >
            バックアップから復元
          </button>
          <button
            type="button"
            className="btn btn-danger btn-block"
            disabled={busy}
            onClick={onDelete}
          >
            データ削除
          </button>
        </div>
        {message && (
          <p className="muted" style={{ marginTop: 12 }}>
            {message}
          </p>
        )}
      </section>
    </div>
  )
}
