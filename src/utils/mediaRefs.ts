const MEDIA_SRC_RE =
  /(?:src|srcset)=["']([^"']+)["']|\[sound:([^\]]+)\]/gi

const SOUND_RE = /\[sound:([^\]]+)\]/gi

export function extractMediaFilenames(html: string): string[] {
  const names = new Set<string>()
  for (const match of html.matchAll(MEDIA_SRC_RE)) {
    const name = match[1] || match[2]
    if (name && !name.startsWith('http') && !name.startsWith('data:')) {
      names.add(name.split(/[?#]/)[0]!)
    }
  }
  return [...names]
}

export function replaceSoundTags(html: string): {
  html: string
  sounds: string[]
} {
  const sounds: string[] = []
  const cleaned = html.replace(SOUND_RE, (_full, filename: string) => {
    sounds.push(filename)
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
