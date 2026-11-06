import { exportBackup } from './exportBackup'
import { backupFilename } from './shareBackup'

export type PreparedStatus = 'idle' | 'preparing' | 'ready' | 'error'

export interface PreparedSnapshot {
  file: File | null
  status: PreparedStatus
  errorMessage: string
}

export function createPreparedBackup(load: () => Promise<File>) {
  let revision = 0
  let running = false
  let queued = false
  let file: File | null = null
  let status: PreparedStatus = 'idle'
  let errorMessage = ''
  const listeners = new Set<() => void>()

  function snapshot(): PreparedSnapshot {
    return { file, status, errorMessage }
  }

  function emit() {
    for (const listener of listeners) listener()
  }

  function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  function refresh() {
    if (running) {
      queued = true
      return
    }
    running = true
    const rev = ++revision
    file = null
    status = 'preparing'
    errorMessage = ''
    emit()
    void load()
      .then((next) => {
        if (rev !== revision) return
        file = next
        status = 'ready'
        errorMessage = ''
      })
      .catch((error: unknown) => {
        if (rev !== revision) return
        errorMessage = error instanceof Error ? error.message : '準備に失敗しました。'
        status = file ? 'ready' : 'error'
      })
      .finally(() => {
        if (rev !== revision) {
          running = false
          if (queued) {
            queued = false
            refresh()
          }
          return
        }
        running = false
        emit()
        if (queued) {
          queued = false
          refresh()
        }
      })
  }

  function invalidate() {
    revision += 1
    file = null
    status = 'idle'
    errorMessage = ''
    queued = false
    emit()
  }

  return { refresh, invalidate, subscribe, snapshot }
}

export const preparedBackup = createPreparedBackup(async () => {
  const blob = await exportBackup({ record: false })
  return new File([blob], backupFilename(), { type: 'application/zip' })
})

export function refreshPreparedBackup() {
  preparedBackup.refresh()
}

export function invalidatePreparedBackup() {
  preparedBackup.invalidate()
}
