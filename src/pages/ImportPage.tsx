import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { importApkg, ImportError, type ImportProgress, type ImportResult } from '../import/apkg'

export function ImportPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<{ message: string; detail: string } | null>(
    null,
  )
  const [running, setRunning] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  async function onFile(file: File | undefined) {
    if (!file) return
    setRunning(true)
    setError(null)
    setResult(null)
    setProgress({
      phase: 'unzip',
      cardsDone: 0,
      cardsTotal: 0,
      mediaDone: 0,
      mediaTotal: 0,
      message: '開始...',
    })
    try {
      const res = await importApkg(file, setProgress)
      setResult(res)
      setProgress((p) => (p ? { ...p, phase: 'done' } : p))
    } catch (e) {
      if (e instanceof ImportError) {
        setError({ message: e.message, detail: e.detail })
      } else {
        setError({
          message: 'Import failed',
          detail: e instanceof Error ? e.message : String(e),
        })
      }
      setProgress((p) => (p ? { ...p, phase: 'error' } : p))
    } finally {
      setRunning(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function copyDetail() {
    if (!error) return
    void navigator.clipboard.writeText(`${error.message}\n${error.detail}`)
  }

  const cardPct =
    progress && progress.cardsTotal
      ? Math.round((progress.cardsDone / progress.cardsTotal) * 100)
      : 0
  const mediaPct =
    progress && progress.mediaTotal
      ? Math.round((progress.mediaDone / progress.mediaTotal) * 100)
      : 0

  return (
    <div className="app-shell">
      <header className="page-header">
        <Link to="/" className="icon-btn" aria-label="戻る">
          ←
        </Link>
        <h1>Import</h1>
        <div style={{ width: 48 }} />
      </header>

      {!result && !error && (
        <>
          <span className="eyebrow">Object · もの</span>
          <h2 className="display" style={{ margin: '12px 0 10px', fontWeight: 400 }}>
            Ankiデッキを読み込む
          </h2>
          <p className="muted" style={{ lineHeight: 1.9, fontSize: '0.93rem' }}>
            PCのAnkiから書き出した .apkg を選択してください。データはこの端末だけに保存されます。
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".apkg,application/zip,application/octet-stream"
            hidden
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <div
            className={`drop-zone glass${dragOver ? ' over' : ''}`}
            onDragEnter={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const file = e.dataTransfer.files?.[0]
              void onFile(file)
            }}
          >
            <p className="muted" style={{ margin: '0 0 14px' }}>
              ファイルをここにドロップ
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={running}
              onClick={() => inputRef.current?.click()}
            >
              .apkgを選択
            </button>
          </div>
        </>
      )}

      {progress && running && (
        <div style={{ marginTop: 28 }}>
          <p>{progress.message ?? 'Import中...'}</p>
          <div className="progress-block">
            <div className="row-between">
              <span>Cards</span>
              <span className="muted">
                {progress.cardsDone} / {progress.cardsTotal || '—'}
              </span>
            </div>
            <div className="bar">
              <i style={{ width: `${cardPct}%` }} />
            </div>
          </div>
          <div className="progress-block">
            <div className="row-between">
              <span>Media</span>
              <span className="muted">
                {progress.mediaDone} / {progress.mediaTotal || '—'}
              </span>
            </div>
            <div className="bar">
              <i style={{ width: `${mediaPct}%` }} />
            </div>
          </div>
        </div>
      )}

      {result && (
        <div style={{ marginTop: 24 }} className="stack">
          <span className="eyebrow">Complete</span>
          <h2 className="display" style={{ margin: 0, fontWeight: 400 }}>
            Import完了
          </h2>
          <div className="today-bar" style={{ marginTop: 4 }}>
            <div className="today-item glass">
              <div className="label">Cards</div>
              <div className="value">{result.cards}</div>
            </div>
            <div className="today-item glass">
              <div className="label">Decks</div>
              <div className="value">{result.decks}</div>
            </div>
          </div>
          <div className="today-item glass">
            <div className="label">Media</div>
            <div className="value">{result.media}</div>
          </div>
          {result.warnings.length > 0 && (
            <details className="error-box" style={{ marginTop: 12 }}>
              <summary>一部の項目を取り込めませんでした ({result.warnings.length})</summary>
              <ul>
                {result.warnings.slice(0, 10).map((warning, index) => (
                  <li key={`${index}-${warning}`}>{warning}</li>
                ))}
              </ul>
            </details>
          )}
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => navigate('/')}
          >
            デッキを見る
          </button>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 24 }} className="stack">
          <span className="eyebrow is-warm">Error</span>
          <h2 className="display" style={{ margin: 0, fontWeight: 400, color: 'var(--danger)' }}>
            Import失敗
          </h2>
          <p>{error.message}</p>
          {error.detail && (
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                padding: 14,
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                lineHeight: 1.7,
                overflow: 'auto',
              }}
            >
              {error.detail}
            </pre>
          )}
          <button type="button" className="btn btn-block" onClick={copyDetail}>
            エラー詳細をコピー
          </button>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => {
              setError(null)
              setProgress(null)
            }}
          >
            やり直す
          </button>
        </div>
      )}
    </div>
  )
}
