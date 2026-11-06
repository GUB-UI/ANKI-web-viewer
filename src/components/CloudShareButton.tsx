import { useEffect, useState } from 'react'
import { markBackupExported } from '../backup/exportBackup'
import { preparedBackup } from '../backup/preparedBackup'
import { deliverBackupFile } from '../backup/shareBackup'

export function CloudShareButton({
  disabled = false,
  onSaved,
}: {
  disabled?: boolean
  onSaved?: () => void
}) {
  const [snap, setSnap] = useState(() => preparedBackup.snapshot())
  const [message, setMessage] = useState('')

  useEffect(() => preparedBackup.subscribe(() => setSnap(preparedBackup.snapshot())), [])
  useEffect(() => {
    preparedBackup.refresh()
  }, [])

  function onClick() {
    if (disabled) return
    const file = preparedBackup.snapshot().file
    if (!file) {
      preparedBackup.refresh()
      return
    }
    setMessage('')
    void deliverBackupFile(file)
      .then(async (result) => {
        if (result.saved) {
          await markBackupExported()
          onSaved?.()
        }
        setMessage(result.message)
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : '共有に失敗しました。')
      })
  }

  const ready = snap.file !== null
  const failed = snap.status === 'error' && !ready
  const label = ready ? 'クラウドに共有' : failed ? '共有をやり直す' : '準備しています…'

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={disabled || (!ready && !failed)}
        onClick={onClick}
      >
        {label}
      </button>
      {(message || failed) && (
        <p className="muted" role="status">
          {message || snap.errorMessage}
        </p>
      )}
    </>
  )
}
