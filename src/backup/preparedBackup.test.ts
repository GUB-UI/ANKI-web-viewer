import { describe, expect, it, vi } from 'vitest'
import { createPreparedBackup } from './preparedBackup'

function zip(contents: string) {
  return new File([contents], `${contents}.zip`, { type: 'application/zip' })
}

describe('createPreparedBackup', () => {
  it('keeps the newest file when a second refresh is requested mid-flight', async () => {
    let releaseFirst: (file: File) => void = () => {}
    const first = new Promise<File>((resolve) => {
      releaseFirst = resolve
    })
    let calls = 0
    const backup = createPreparedBackup(() => {
      calls += 1
      return calls === 1 ? first : Promise.resolve(zip('fresh'))
    })

    backup.refresh()
    backup.refresh()
    expect(backup.snapshot().status).toBe('preparing')
    expect(calls).toBe(1)

    releaseFirst(zip('stale'))
    await vi.waitUntil(() => backup.snapshot().file?.name === 'fresh.zip')
    expect(calls).toBe(2)
    expect(backup.snapshot().status).toBe('ready')
  })

  it('drops an in-flight file after invalidate', async () => {
    let release: (file: File) => void = () => {}
    const backup = createPreparedBackup(
      () =>
        new Promise<File>((resolve) => {
          release = resolve
        }),
    )
    backup.refresh()
    backup.invalidate()
    release(zip('late'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(backup.snapshot()).toMatchObject({ file: null, status: 'idle' })
  })

  it('reports an error when the first prepare fails', async () => {
    const backup = createPreparedBackup(async () => {
      throw new Error('zip failed')
    })
    backup.refresh()
    await vi.waitUntil(() => backup.snapshot().status === 'error')
    expect(backup.snapshot().errorMessage).toBe('zip failed')
    expect(backup.snapshot().file).toBeNull()
  })
})
