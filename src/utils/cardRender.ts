import type { Card, Note } from '../db/schema'
import { renderClozeBack, renderClozeFront } from './cloze'
import { replaceSoundTags } from './mediaRefs'

export interface RenderedCard {
  frontHtml: string
  backHtml: string
  /** [sound:] tags from the question side — play when the card appears */
  frontSounds: string[]
  /** [sound:] tags from the answer side — play when the answer is revealed */
  backSounds: string[]
  deckPathParts: string[]
}

function fieldValue(note: Note, ...candidates: string[]): string {
  for (const name of candidates) {
    if (note.fields[name] != null && note.fields[name] !== '') {
      return note.fields[name]
    }
  }
  const values = note.fieldOrder.map((k) => note.fields[k] ?? '')
  return values[0] ?? ''
}

function secondField(note: Note): string {
  const values = note.fieldOrder
    .map((k) => note.fields[k] ?? '')
    .filter(Boolean)
  return values[1] ?? values[0] ?? ''
}

/**
 * Strips whitespace for comparison, keeping a map back to the source index.
 * Templates reflow the markup they emit, so only the non-space characters are
 * reliable when matching one rendering against another.
 */
function squeezeWithMap(html: string): { text: string; index: number[] } {
  let text = ''
  const index: number[] = []
  for (let i = 0; i < html.length; i++) {
    const ch = html[i]!
    if (/\s/.test(ch)) continue
    text += ch
    index.push(i)
  }
  return { text, index }
}

/**
 * Older imports baked {{FrontSide}} into the answer, and some templates repeat
 * the question themselves. Drop that leading copy so the answer shows once.
 */
export function stripRepeatedFront(front: string, back: string): string {
  const question = squeezeWithMap(front).text
  if (!question) return back
  const { text, index } = squeezeWithMap(back)
  if (text.length <= question.length || !text.startsWith(question)) return back
  const cut = index[question.length - 1]! + 1
  return back.slice(cut)
}

/** Anki's `<hr id=answer>` is redundant: the answer already sits below a divider. */
export function stripLeadingRule(html: string): string {
  return html.replace(/^(?:\s|<br\s*\/?>)*(?:<hr[^>]*>(?:\s|<br\s*\/?>)*)+/i, '')
}

export function renderCardContent(
  card: Card,
  note: Note,
  deckPath: string,
): RenderedCard {
  let frontRaw = ''
  let backRaw = ''

  if (card.front != null && card.back != null) {
    frontRaw = card.front
    backRaw = stripLeadingRule(stripRepeatedFront(card.front, card.back))
  } else if (card.cardType === 'cloze' && card.clozeIndex != null) {
    const text = fieldValue(note, 'Text', 'Front', ...note.fieldOrder)
    const extra = fieldValue(note, 'Back Extra', 'Extra')
    frontRaw = renderClozeFront(text, card.clozeIndex)
    backRaw = `${renderClozeBack(text, card.clozeIndex)}${extra ? `<div class="extra">${extra}</div>` : ''}`
  } else if (card.cardType === 'basic-reverse' || card.templateOrd === 1) {
    frontRaw = secondField(note)
    backRaw = fieldValue(note, 'Front', ...note.fieldOrder)
  } else {
    frontRaw = fieldValue(note, 'Front', 'Text', ...note.fieldOrder)
    backRaw = secondField(note)
    if (frontRaw === backRaw) {
      const vals = note.fieldOrder.map((k) => note.fields[k] ?? '')
      frontRaw = vals[0] ?? ''
      backRaw = vals[1] ?? vals[0] ?? ''
    }
  }

  const front = replaceSoundTags(frontRaw)
  const back = replaceSoundTags(backRaw)

  return {
    frontHtml: front.html,
    backHtml: back.html,
    frontSounds: [...new Set(front.sounds)],
    backSounds: [...new Set(back.sounds)],
    deckPathParts: deckPath.split('::').filter(Boolean),
  }
}

/** Rewrite media src attributes to blob object URLs */
export function rewriteMediaUrls(
  html: string,
  urlMap: Map<string, string>,
): string {
  const resolve = (raw: string): string | undefined => {
    const key = raw.trim().replace(/^\.\//, '').split(/[?#]/)[0]!
    let decoded = key
    try {
      decoded = decodeURIComponent(key)
    } catch {
      // Keep malformed legacy filenames as-is.
    }
    return urlMap.get(key) ?? urlMap.get(decoded)
  }

  return html.replace(
    /\b(src|srcset)\s*=\s*(["'])(.*?)\2/gi,
    (_full, attribute: string, quote: string, value: string) => {
      if (attribute.toLowerCase() === 'srcset') {
        const rewritten = value
          .split(',')
          .map((entry) => {
            const [url, ...descriptor] = entry.trim().split(/\s+/)
            const mapped = url ? resolve(url) : undefined
            return [mapped ?? url, ...descriptor].filter(Boolean).join(' ')
          })
          .join(', ')
        return `${attribute}=${quote}${rewritten}${quote}`
      }
      return `${attribute}=${quote}${resolve(value) ?? value}${quote}`
    },
  )
}
