import type { RatingValue } from '../db/schema'
import { RATING_LABELS } from '../scheduler/fsrs'

interface Props {
  previews: Record<RatingValue, { label: string }>
  onRate: (rating: RatingValue) => void
  disabled?: boolean
}

const ORDER: RatingValue[] = [2, 1, 3, 4]
const CLASS: Record<RatingValue, string> = {
  1: 'again',
  2: 'hard',
  3: 'good',
  4: 'easy',
}

export function RatingButtons({ previews, onRate, disabled }: Props) {
  return (
    <div className="rating-dock glass-raised">
      {ORDER.map((rating) => (
        <button
          key={rating}
          type="button"
          className={`rating-btn ${CLASS[rating]}`}
          disabled={disabled}
          onClick={() => onRate(rating)}
        >
          {RATING_LABELS[rating]}
          <small>{previews[rating]?.label ?? ''}</small>
        </button>
      ))}
    </div>
  )
}
