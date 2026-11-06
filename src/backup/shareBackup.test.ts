import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  backupFilename,
  canShareBackupFile,
  isShareGestureError,
  shareBackupFile,
} from './shareBackup'

function zipFile() {
  return new File(['zip'], 'kioku-backup-2026-11-06.zip', { type: 'application/zip' })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('backupFilename', () => {
  it('uses the local calendar date', () => {
    expect(backupFilename(new Date(2026, 10, 6, 8, 30))).toBe('kioku-backup-2026-11-06.zip')
  })
})

describe('canShareBackupFile', () => {
  it('is false when the share API is missing', () => {
    vi.stubGlobal('navigator', {})
    expect(canShareBackupFile(zipFile())).toBe(false)
  })

  it('trusts share() when canShare is missing', () => {
    vi.stubGlobal('navigator', { share: vi.fn() })
    expect(canShareBackupFile(zipFile())).toBe(true)
  })

  it('is false when the browser rejects files', () => {
    vi.stubGlobal('navigator', {
      share: vi.fn(),
      canShare: vi.fn(() => false),
    })
    expect(canShareBackupFile(zipFile())).toBe(false)
  })

  it('is false when canShare throws', () => {
    vi.stubGlobal('navigator', {
      share: vi.fn(),
      canShare: vi.fn(() => {
        throw new Error('unsupported')
      }),
    })
    expect(canShareBackupFile(zipFile())).toBe(false)
  })
})

describe('shareBackupFile', () => {
  it('shares only the file', async () => {
    const share = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', {
      share,
      canShare: vi.fn(() => true),
    })
    const file = zipFile()
    await expect(shareBackupFile(file)).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith({ files: [file] })
  })

  it('treats a dismissed sheet as cancel', async () => {
    vi.stubGlobal('navigator', {
      share: vi.fn(async () => {
        throw new DOMException('cancelled', 'AbortError')
      }),
      canShare: vi.fn(() => true),
    })
    await expect(shareBackupFile(zipFile())).resolves.toBe('cancelled')
  })

  it('returns unavailable when files cannot be shared', async () => {
    const share = vi.fn()
    vi.stubGlobal('navigator', { share, canShare: vi.fn(() => false) })
    await expect(shareBackupFile(zipFile())).resolves.toBe('unavailable')
    expect(share).not.toHaveBeenCalled()
  })

  it('lets a lost user gesture surface so the caller can retry', async () => {
    const error = new DOMException('gesture', 'NotAllowedError')
    vi.stubGlobal('navigator', {
      share: vi.fn(async () => {
        throw error
      }),
      canShare: vi.fn(() => true),
    })
    await expect(shareBackupFile(zipFile())).rejects.toBe(error)
    expect(isShareGestureError(error)).toBe(true)
  })
})
