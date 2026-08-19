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
  resume() {
    this.state = 'running'
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
    if (data.byteLength === 0) return Promise.reject(new Error('empty'))
    return Promise.resolve(this.createBuffer(1, 8, this.sampleRate))
  }
  close() {
    this.state = 'closed'
    return Promise.resolve()
  }
}

async function loadAudioModule() {
  vi.resetModules()
  vi.stubGlobal('AudioContext', FakeAudioContext)
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
    vi.unstubAllGlobals()
    vi.resetModules()
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
})
