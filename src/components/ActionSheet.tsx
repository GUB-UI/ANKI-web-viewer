interface Action {
  label: string
  /** Return false to keep the sheet open (for example after cancelling a confirm). */
  onClick: () => void | false
  danger?: boolean
}

interface Props {
  title?: string
  message?: string
  actions: Action[]
  onClose: () => void
}

export function ActionSheet({ title, message, actions, onClose }: Props) {
  return (
    <div className="menu-sheet" onClick={onClose} role="presentation">
      <div
        className="menu-sheet-inner glass-raised"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="sheet-grabber" aria-hidden />
        {title && <div className="sheet-title">{title}</div>}
        {message && <p className="sheet-message">{message}</p>}
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            style={a.danger ? { color: 'var(--danger)' } : undefined}
            onClick={() => {
              if (a.onClick() === false) return
              onClose()
            }}
          >
            {a.label}
          </button>
        ))}
        <button type="button" onClick={onClose}>
          キャンセル
        </button>
      </div>
    </div>
  )
}
