import type { Card, Note } from '../db/schema'
import { renderClozeBack, renderClozeFront } from './cloze'
import { replaceSoundTags } from './mediaRefs'

export interface RenderedCard {
  frontHtml: string
  backHtml: string
  sounds: string[]
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

export function renderCardContent(
  card: Card,
  note: Note,
  deckPath: string,
): RenderedCard {
  let frontRaw = ''
  let backRaw = ''

  if (card.front != null && card.back != null) {
    frontRaw = card.front
    backRaw = card.back
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
  const sounds = [...new Set([...front.sounds, ...back.sounds])]

  return {
    frontHtml: front.html,
    backHtml: back.html,
    sounds,
    deckPathParts: deckPath.split('::').filter(Boolean),
  }
}

/** Rewrite media src attributes to blob object URLs */
export function rewriteMediaUrls(
  html: string,
  urlMap: Map<string, string>,
): string {
  return html.replace(
    /(src=["'])([^"']+)(["'])/gi,
    (_full, pre: string, src: string, post: string) => {
      const key = src.split(/[?#]/)[0]!
      const mapped = urlMap.get(key) ?? urlMap.get(decodeURIComponent(key))
      if (mapped) return `${pre}${mapped}${post}`
      return `${pre}${src}${post}`
    },
  )
}
