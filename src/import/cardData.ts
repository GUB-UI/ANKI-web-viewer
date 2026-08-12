export interface AnkiCardMemory {
  position?: number
  stability?: number
  difficulty?: number
  lastReviewTime?: number
}

export function parseAnkiCardMemory(value: unknown): AnkiCardMemory {
  if (typeof value !== 'string' || value.trim() === '') return {}
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const data = parsed as Record<string, unknown>
    const number = (key: string) =>
      typeof data[key] === 'number' && Number.isFinite(data[key])
        ? (data[key] as number)
        : undefined
    return {
      position: number('pos'),
      stability: number('s'),
      difficulty: number('d'),
      lastReviewTime: number('lrt'),
    }
  } catch {
    return {}
  }
}
