import { describe, expect, it } from 'vitest'
import type { Card, Note } from '../db/schema'
import {
  renderCardContent,
  stripLeadingRule,
  stripRepeatedFront,
} from './cardRender'

function makeNote(): Note {
  return {
    id: 'note1',
    noteType: 'Basic',
    fields: { Front: 'extent', Back: 'ある程度' },
    fieldOrder: ['Front', 'Back'],
    tags: [],
  }
}

function makeCard(front: string, back: string): Card {
  return {
    id: 'card1',
    noteId: 'note1',
    deckId: 'deck1',
    active: 1,
    sortOrder: 0,
    templateOrd: 0,
    cardType: 'basic',
    front,
    back,
    state: 'new',
    due: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    learningSteps: 0,
    lastReview: undefined,
  }
}

describe('stripRepeatedFront', () => {
  it('drops a leading copy of the question', () => {
    const front = '<div>extent</div>\n<div class="phrase">increase to some extent</div>'
    const back = `${front}\n\n<hr id=answer>\n\n<div>ある程度まで増える</div>`
    expect(stripRepeatedFront(front, back)).toBe(
      '\n\n<hr id=answer>\n\n<div>ある程度まで増える</div>',
    )
  })

  it('ignores whitespace differences introduced by templates', () => {
    const front = '<div>extent</div>'
    const back = '<div>  extent  </div><div>answer</div>'
    expect(stripRepeatedFront(front, back)).toBe('<div>answer</div>')
  })

  it('keeps answers that merely start with similar markup', () => {
    const front = '<div>extent</div>'
    const back = '<div>extentional</div>'
    expect(stripRepeatedFront(front, back)).toBe(back)
  })

  it('keeps an answer that is only the question', () => {
    const front = '<div>extent</div>'
    expect(stripRepeatedFront(front, '<div>extent</div>')).toBe('<div>extent</div>')
  })
})

describe('stripLeadingRule', () => {
  it('removes the template answer rule so only one divider shows', () => {
    expect(stripLeadingRule('\n<hr id=answer>\n<div>答え</div>')).toBe(
      '<div>答え</div>',
    )
    expect(stripLeadingRule('<br><hr><br><hr/><div>答え</div>')).toBe('<div>答え</div>')
  })

  it('leaves rules that separate answer content alone', () => {
    expect(stripLeadingRule('<div>答え</div><hr><div>補足</div>')).toBe(
      '<div>答え</div><hr><div>補足</div>',
    )
  })
})

describe('renderCardContent', () => {
  it('shows the answer once for cards imported with FrontSide baked in', () => {
    const card = makeCard('extent', 'extent<hr id=answer>ある程度まで増える')
    const rendered = renderCardContent(card, makeNote(), '英語::ターゲット')
    expect(rendered.frontHtml).toBe('extent')
    expect(rendered.backHtml).toBe('ある程度まで増える')
    expect(rendered.deckPathParts).toEqual(['英語', 'ターゲット'])
  })
})
