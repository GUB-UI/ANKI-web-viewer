import { afterEach, describe, expect, it, vi } from 'vitest'

class FakeAudio {
  static instances: FakeAudio[] = []
  src = ''
  muted = false
  volume = 1
  currentTime = 0
  paused = true
  ended = false
  readyState = 4
  preload = 'auto'
  playsInline = true
  listeners = new Map<string, Set<() => void>>()

  constructor() {
    FakeAudio.instances.push(this)
  }

  setAttribute() {}
  load() {
    this.readyState = 4
  }
  addEventListener(type: string, fn: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
  }
  removeEventListener(type: string, fn: () => void) {
    this.listeners.get(type)?.delete(fn)
  }
  dispatch(type: string) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn()
  }
  play() {
    this.paused = false
    this.ended = false
    return Promise.resolve()
  }
  pause() {
    this.paused = true
  }
}

async function loadAudioModule() {
  vi.resetModules()
  FakeAudio.instances = []
  vi.stubGlobal('Audio', FakeAudio)
  return import('./audio')
}

describe('audio unlock/playback', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
    FakeAudio.instances = []
  })

  it('unlocks with near-silent volume rather than muted', async () => {
    const mod = await loadAudioModule()
    const ok = await mod.unlockAudio()
    expect(ok).toBe(true)
    expect(mod.isAudioUnlocked()).toBe(true)
    const audio = FakeAudio.instances[0]!
    expect(audio.muted).toBe(false)
    expect(audio.volume).toBe(1)
    expect(audio.src.startsWith('data:audio/wav')).toBe(true)
  })

  it('resolves waiters when stop interrupts playback', async () => {
    const mod = await loadAudioModule()
    await mod.unlockAudio()

    const playing = mod.playAudioUrls(['blob:test-1'])
    await vi.waitFor(() => {
      expect(FakeAudio.instances[0]?.paused).toBe(false)
    })
    mod.stopAudioPlayback()
    await expect(playing).resolves.toBe(false)
  })

  it('resolves true when ended fires', async () => {
    const mod = await loadAudioModule()
    await mod.unlockAudio()
    const playing = mod.playAudioUrls(['blob:test-2'])
    await vi.waitFor(() => {
      expect(FakeAudio.instances[0]?.paused).toBe(false)
    })
    const audio = FakeAudio.instances[0]!
    audio.ended = true
    audio.dispatch('ended')
    await expect(playing).resolves.toBe(true)
  })
})
