interface Props {
  id: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  'aria-label'?: string
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.floor(value)))
}

export function NumberStepper({
  id,
  value,
  min = 0,
  max = 999,
  step = 1,
  onChange,
  'aria-label': ariaLabel,
}: Props) {
  const safe = clamp(value, min, max)

  function bump(delta: number) {
    onChange(clamp(safe + delta, min, max))
  }

  return (
    <div className="number-stepper" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        className="stepper-btn"
        aria-label="減らす"
        disabled={safe <= min}
        onClick={() => bump(-step)}
      >
        −
      </button>
      <input
        id={id}
        className="stepper-value"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        enterKeyHint="done"
        autoComplete="off"
        value={String(safe)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '')
          if (digits === '') {
            onChange(min)
            return
          }
          onChange(clamp(Number(digits), min, max))
        }}
        onBlur={() => onChange(safe)}
      />
      <button
        type="button"
        className="stepper-btn"
        aria-label="増やす"
        disabled={safe >= max}
        onClick={() => bump(step)}
      >
        ＋
      </button>
    </div>
  )
}
