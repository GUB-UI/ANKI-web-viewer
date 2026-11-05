import { afterEach, describe, expect, it, vi } from 'vitest'

class FakeBufferSource {
  buffer: AudioBuffer | null = null
  onended: ((ev?: Event) => void) | null = null
  connect() {
    return this
  }
  disconnect() {}
  start() {
    queueMicrotask(() => this.onended?.(new Event('ended')))
  }
  stop() {
    this.onended?.(new Event('ended'))
  }
}

class FakeAudioContext {
  state: AudioContextState = 'running'
  sampleRate = 44100
  destination = {} as AudioDestinationNode
  resumeCalls = 0
  suspendCalls = 0
  decodeCalls = 0
  resumeGate: Promise<void> | null = queuedResumeGate

  resume() {
    this.resumeCalls += 1
    const gate = this.resumeGate ?? Promise.resolve()
    return gate.then(() => {
      this.state = 'running'
    })
  }

  suspend() {
    this.suspendCalls += 1
    this.state = 'suspended'
    return Promise.resolve()
  }

  createBuffer(channels: number, length: number, rate: number) {
    return {
      duration: length / rate,
      length,
      numberOfChannels: channels,
      sampleRate: rate,
      getChannelData: () => new Float32Array(length),
      copyFromChannel() {},
      copyToChannel() {},
    } as AudioBuffer
  }

  createBufferSource() {
    return new FakeBufferSource() as unknown as AudioBufferSourceNode
  }

  createGain() {
    const node = {
      gain: { value: 1 },
      connect() {
        return node
      },
      disconnect() {},
      context: this as unknown as AudioContext,
    }
    return node as unknown as GainNode
  }

  decodeAudioData(data: ArrayBuffer) {
    this.decodeCalls += 1
    if (data.byteLength === 0) return Promise.reject(new Error('empty'))
    return Promise.resolve(this.createBuffer(1, 8, this.sampleRate))
  }

  close() {
    this.state = 'closed'
    return Promise.resolve()
  }
}

let lastCtx: FakeAudioContext | null = null
let queuedResumeGate: Promise<void> | null = null
const intervals: { fn: () => void; ms: number }[] = []

async function loadAudioModule(hidden = false) {
  vi.resetModules()
    lastCtx = null
    intervals.length = 0
  vi.stubGlobal(
    'document',
    {
      hidden,
      addEventListener() {},
      removeEventListener() {},
    } as Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>,
  )
  vi.stubGlobal(
    'setInterval',
    (fn: () => void, ms: number) => {
      const handle = { fn, ms }
      intervals.push(handle)
      return handle
    },
  )
  vi.stubGlobal('clearInterval', (handle: { fn: () => void; ms: number }) => {
    const index = intervals.indexOf(handle)
    if (index >= 0) intervals.splice(index, 1)
  })
  vi.stubGlobal(
    'AudioContext',
    class extends FakeAudioContext {
      constructor() {
        super()
        lastCtx = this
      }
    },
  )
  vi.stubGlobal('webkitAudioContext', FakeAudioContext)
  vi.stubGlobal(
    'Audio',
    class {
      src = ''
      muted = false
      volume = 1
      currentTime = 0
      paused = true
      ended = false
      preload = 'auto'
      setAttribute() {}
      load() {}
      play() {
        return Promise.resolve()
      }
      pause() {}
      addEventListener() {}
      removeEventListener() {}
    },
  )
  return import('./audio')
}

describe('audio unlock/playback (Web Audio)', () => {
  afterEach(() => {
    queuedResumeGate = null
    vi.unstubAllGlobals()
    vi.resetModules()
    Reflect.deleteProperty(navigator, 'audioSession')
  })

  it('unlocks via AudioContext.resume inside gesture', async () => {
    const mod = await loadAudioModule()
    const ok = await mod.unlockAudio()
    expect(ok).toBe(true)
    expect(mod.isAudioUnlocked()).toBe(true)
  })

  it('plays a typed blob through decodeAudioData', async () => {
    const mod = await loadAudioModule()
    await mod.unlockAudio()
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const blob = new Blob([bytes], { type: 'audio/mpeg' })
    await expect(mod.playAudioBlobs([blob])).resolves.toBe(true)
  })

  it('clamps in-app volume and keeps playback working', async () => {
    const mod = await loadAudioModule()
    mod.setAudioVolume(40)
    expect(mod.getAudioVolume()).toBe(40)
    mod.setAudioVolume(150)
    expect(mod.getAudioVolume()).toBe(100)
    mod.setAudioVolume(-4)
    expect(mod.getAudioVolume()).toBe(0)
    await mod.unlockAudio()
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/mpeg' })
    await expect(mod.playAudioBlobs([blob])).resolves.toBe(true)
    expect(mod.AUDIO_GAIN_AT_100).toBeGreaterThanOrEqual(2)
  })

  it('stopAudioPlayback is safe before and after unlock', async () => {
    const mod = await loadAudioModule()
    expect(() => mod.stopAudioPlayback()).not.toThrow()
    await mod.unlockAudio()
    expect(() => mod.stopAudioPlayback()).not.toThrow()
  })

  it('sets the iOS audio session to ambient so other music can keep playing', async () => {
    const session = { type: 'playback' }
    Object.defineProperty(navigator, 'audioSession', {
      configurable: true,
      value: session,
    })
    const mod = await loadAudioModule()
    await mod.unlockAudio()
    expect(session.type).toBe('ambient')
  })

  it('starts a 2s keep-alive on unlock and leaves it running after stopAudioPlayback', async () => {
    const mod = await loadAudioModule()
    await mod.unlockAudio()
    expect(intervals).toHaveLength(1)
    expect(intervals[0]?.ms).toBe(mod.KEEP_ALIVE_MS)
    expect(mod.isAudioKeepAliveActive()).toBe(true)
    mod.stopAudioPlayback()
    expect(mod.isAudioKeepAliveActive()).toBe(true)
  })

  it('releaseAudioSession clears keep-alive and suspends the context', async () => {
    const mod = await loadAudioModule()
    await mod.unlockAudio()
    expect(lastCtx?.suspendCalls).toBe(0)
    mod.releaseAudioSession()
    await Promise.resolve()
    expect(mod.isAudioKeepAliveActive()).toBe(false)
    expect(intervals).toHaveLength(0)
    expect(lastCtx?.suspendCalls).toBe(1)
    expect(mod.audioContextState()).toBe('suspended')
  })

  it('does not resurrect keep-alive when resume settles after release', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    queuedResumeGate = gate
    const mod = await loadAudioModule()
    const pending = mod.unlockAudio()
    mod.releaseAudioSession()
    release()
    await pending
    await Promise.resolve()
    expect(mod.isAudioKeepAliveActive()).toBe(false)
    expect(intervals).toHaveLength(0)
  })

  it('restarts keep-alive on a later unlock after release', async () => {
    const mod = await loadAudioModule()
    await mod.unlockAudio()
    mod.releaseAudioSession()
    await Promise.resolve()
    expect(mod.isAudioKeepAliveActive()).toBe(false)
    await mod.unlockAudio()
    expect(mod.isAudioKeepAliveActive()).toBe(true)
  })

  it('decodes the same blob once and reuses the AudioBuffer', async () => {
    const mod = await loadAudioModule()
    await mod.unlockAudio()
    const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], {
      type: 'audio/mpeg',
    })
    await mod.playAudioBlobs([blob])
    await mod.playAudioBlobs([blob])
    await mod.playAudioBlobs([blob])
    expect(lastCtx?.decodeCalls).toBe(1)
  })

  it('does not resume from keep-alive ticks while the page is hidden', async () => {
    const mod = await loadAudioModule(true)
    await mod.unlockAudio()
    expect(mod.isAudioKeepAliveActive()).toBe(false)
    const resumes = lastCtx?.resumeCalls ?? 0
    lastCtx!.state = 'suspended'
    for (const handle of [...intervals]) handle.fn()
    expect(lastCtx?.resumeCalls).toBe(resumes)
  })
})
