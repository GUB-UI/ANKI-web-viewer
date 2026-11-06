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
 * On iPhone the sheet includes 「ファイルに保存」, which can place the zip in iCloud Drive.
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
