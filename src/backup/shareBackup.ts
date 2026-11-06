import { downloadBlob } from './exportBackup'
import { todayKey } from '../utils/dates'

export function backupFilename(now = new Date()): string {
  return `kioku-backup-${todayKey(now)}.zip`
}

export type ShareBackupResult = 'shared' | 'cancelled' | 'unavailable'

export function isShareGestureError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotAllowedError'
}

/** True when this browser can hand a zip to the system share sheet. */
export function canShareBackupFile(file: File): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
  if (typeof navigator.canShare !== 'function') return true
  try {
    return navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

/**
 * Opens the system share sheet with the backup file.
 * The sheet is the one-tap handoff to whichever cloud app is installed
 * (Drive, Dropbox, OneDrive, Files, and the rest).
 * Pass only `files`: adding text or a URL makes Safari reject the share.
 */
export async function shareBackupFile(file: File): Promise<ShareBackupResult> {
  if (!canShareBackupFile(file)) return 'unavailable'
  try {
    await navigator.share({ files: [file] })
    return 'shared'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    throw error
  }
}

/** Hands a prepared zip to the share sheet, or downloads it when the sheet is missing. */
export async function deliverBackupFile(file: File): Promise<{ message: string; saved: boolean }> {
  try {
    const result = await shareBackupFile(file)
    if (result === 'shared') return { message: '共有シートを開きました。', saved: true }
    if (result === 'cancelled') return { message: '共有をキャンセルしました。', saved: false }
    downloadBlob(file, file.name)
    return { message: 'ファイルを書き出しました。', saved: true }
  } catch (error) {
    if (isShareGestureError(error)) return { message: 'もう一度タップしてください。', saved: false }
    throw error
  }
}
