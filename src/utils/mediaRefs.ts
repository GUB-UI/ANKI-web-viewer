const MEDIA_ATTR_RE =
  /\b(src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi

const SOUND_RE = /\[sound:([^\]]+)\]/gi

function addLocalName(names: Set<string>, candidate: string): void {
  const value = candidate.trim().replace(/^\.\//, '')
  if (
    !value ||
    /^(?:https?:|data:|blob:|javascript:|\/\/)/i.test(value)
  ) {
    return
  }
  names.add(value.split(/[?#]/)[0]!)
}

export function extractMediaFilenames(html: string): string[] {
  const names = new Set<string>()
  for (const match of html.matchAll(MEDIA_ATTR_RE)) {
    const attribute = match[1]?.toLowerCase()
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    if (attribute === 'srcset') {
      for (const entry of value.split(',')) {
        addLocalName(names, entry.trim().split(/\s+/)[0] ?? '')
      }
    } else {
      addLocalName(names, value)
    }
  }
  for (const match of html.matchAll(SOUND_RE)) addLocalName(names, match[1] ?? '')
  return [...names]
}

function normalizeMediaName(raw: string): string {
  const trimmed = raw.trim().replace(/^\.\//, '').split(/[?#]/)[0] ?? ''
  try {
    return decodeURIComponent(trimmed)
  } catch {
    return trimmed
  }
}

export function replaceSoundTags(html: string): {
  html: string
  sounds: string[]
} {
  const sounds: string[] = []
  const cleaned = html.replace(SOUND_RE, (_full, filename: string) => {
    const name = normalizeMediaName(filename)
    if (name) sounds.push(name)
    return ''
  })
  return { html: cleaned, sounds }
}

export function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    opus: 'audio/opus',
  }
  return map[ext] ?? 'application/octet-stream'
}

export function isSupportedMedia(filename: string): boolean {
  const mime = guessMimeType(filename)
  return mime.startsWith('image/') || mime.startsWith('audio/')
}
