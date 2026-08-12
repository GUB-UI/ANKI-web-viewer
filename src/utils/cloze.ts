function clozeRe(): RegExp {
  // Fresh instance each call — shared /g RegExp lastIndex bugs otherwise
  return /\{\{c(\d+)::([\s\S]*?)(?:::(.*?))?\}\}/g
}

export function extractClozeIndices(text: string): number[] {
  const indices = new Set<number>()
  for (const match of text.matchAll(clozeRe())) {
    indices.add(Number(match[1]))
  }
  return [...indices].sort((a, b) => a - b)
}

export function renderClozeFront(text: string, clozeIndex: number): string {
  return text.replace(clozeRe(), (_full, index: string, answer: string, hint?: string) => {
    if (Number(index) === clozeIndex) return `[${hint?.trim() || '...'}]`
    return answer
  })
}

export function renderClozeBack(text: string, clozeIndex: number): string {
  return text.replace(clozeRe(), (_full, index: string, answer: string) => {
    if (Number(index) === clozeIndex) {
      return `<span class="cloze-answer">${answer}</span>`
    }
    return answer
  })
}
