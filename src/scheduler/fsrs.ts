import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card as FsrsCard,
  type Grade,
} from 'ts-fsrs'
import type { Card, CardState, RatingValue } from '../db/schema'
import { formatDueInterval } from '../utils/dates'

const scheduler = fsrs()

const STATE_TO_FSRS: Record<CardState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
}

const FSRS_TO_STATE: Record<State, CardState> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
}

export const RATING_LABELS: Record<RatingValue, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
}

function toFsrsCard(card: Card): FsrsCard {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_TO_FSRS[card.state],
    last_review: card.lastReview ? new Date(card.lastReview) : undefined,
  }
}

export function applyFsrsDefaults(partial?: Partial<Card>): Pick<
  Card,
  | 'state'
  | 'due'
  | 'stability'
  | 'difficulty'
  | 'scheduledDays'
  | 'learningSteps'
  | 'reps'
  | 'lapses'
  | 'elapsedDays'
  | 'lastReview'
> {
  const empty = createEmptyCard(new Date())
  return {
    state: FSRS_TO_STATE[empty.state],
    due: empty.due.getTime(),
    stability: empty.stability,
    difficulty: empty.difficulty,
    scheduledDays: empty.scheduled_days,
    learningSteps: empty.learning_steps,
    reps: empty.reps,
    lapses: empty.lapses,
    elapsedDays: empty.elapsed_days,
    lastReview: empty.last_review?.getTime(),
    ...partial,
  }
}

export function previewRatings(
  card: Card,
  now = new Date(),
): Record<RatingValue, { due: number; label: string }> {
  const preview = scheduler.repeat(toFsrsCard(card), now)
  const result = {} as Record<RatingValue, { due: number; label: string }>
  for (const grade of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[]) {
    const item = preview[grade]
    const due = item.card.due.getTime()
    result[grade as RatingValue] = {
      due,
      label: formatDueInterval(due, now.getTime()),
    }
  }
  return result
}

export function scheduleCard(
  card: Card,
  rating: RatingValue,
  now = new Date(),
): {
  next: Pick<
    Card,
    | 'state'
    | 'due'
    | 'stability'
    | 'difficulty'
    | 'scheduledDays'
    | 'learningSteps'
    | 'reps'
    | 'lapses'
    | 'elapsedDays'
    | 'lastReview'
  >
  scheduledDays: number
  elapsedDays: number
} {
  const { card: next, log } = scheduler.next(toFsrsCard(card), now, rating as Grade)
  return {
    next: {
      state: FSRS_TO_STATE[next.state],
      due: next.due.getTime(),
      stability: next.stability,
      difficulty: next.difficulty,
      scheduledDays: next.scheduled_days,
      learningSteps: next.learning_steps,
      reps: next.reps,
      lapses: next.lapses,
      elapsedDays: next.elapsed_days,
      lastReview: next.last_review?.getTime() ?? now.getTime(),
    },
    scheduledDays: log.scheduled_days,
    elapsedDays: log.elapsed_days,
  }
}

/** Convert Anki interval/due into approximate FSRS card state for import. */
export function fromAnkiScheduling(opts: {
  type: number
  queue: number
  due: number
  ivl: number
  reps: number
  lapses: number
  /** Collection creation time (unix seconds) — used for review due days */
  crt?: number
  now?: Date
}): ReturnType<typeof applyFsrsDefaults> {
  const now = opts.now ?? new Date()
  const nowMs = now.getTime()
  const base = applyFsrsDefaults({
    reps: opts.reps,
    lapses: opts.lapses,
  })

  // Anki type: 0=new, 1=learning, 2=review, 3=relearning
  if (opts.type === 0 || opts.queue === 0) {
    return { ...base, state: 'new', due: nowMs }
  }

  if (opts.type === 1 || opts.queue === 1 || opts.queue === 3) {
    // learning: due is usually unix seconds; day-learn queue=3 may be day number
    const dueMs =
      opts.due > 1_000_000_000
        ? opts.due * 1000
        : opts.crt != null
          ? (opts.crt + opts.due) * 86400000
          : nowMs
    return {
      ...base,
      state: opts.type === 3 || opts.queue === 3 ? 'relearning' : 'learning',
      due: dueMs,
      lastReview: nowMs,
    }
  }

  // Review: due is days since collection creation; ivl is days
  const intervalDays = Math.max(1, opts.ivl || 1)
  const stability = Math.max(0.1, intervalDays)
  const dueMs =
    opts.crt != null ? (opts.crt + opts.due) * 86400000 : nowMs
  return {
    ...base,
    state: 'review',
    due: dueMs,
    stability,
    difficulty: 5,
    scheduledDays: intervalDays,
    reps: opts.reps,
    lapses: opts.lapses,
    lastReview: dueMs - intervalDays * 86400000,
  }
}
