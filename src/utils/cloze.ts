const CLOZE_RE = /\{\{c(\d+)::([^}:]+?)(?:::[^}]+)?\}\}/g

export function extractClozeIndices(text: string): number[] {
  const indices = new Set<number>()
  for (const match of text.matchAll(CLOZE_RE)) {
    indices.add(Number(match[1]))
  }
  return [...indices].sort((a, b) => a - b)
}

export function renderClozeFront(text: string, clozeIndex: number): string {
  return text.replace(CLOZE_RE, (_full, index: string, answer: string) => {
    if (Number(index) === clozeIndex) return '[...]'
    return answer
  })
}

export function renderClozeBack(text: string, clozeIndex: number): string {
  return text.replace(CLOZE_RE, (_full, index: string, answer: string) => {
    if (Number(index) === clozeIndex) {
      return `<span class="cloze-answer">${escapeHtml(answer)}</span>`
    }
    return escapeHtml(answer)
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
