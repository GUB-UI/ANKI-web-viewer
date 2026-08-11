interface Action {
  label: string
  onClick: () => void
  danger?: boolean
}

interface Props {
  title?: string
  actions: Action[]
  onClose: () => void
}

export function ActionSheet({ title, actions, onClose }: Props) {
  return (
    <div className="menu-sheet" onClick={onClose} role="presentation">
      <div
        className="menu-sheet-inner"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div className="muted" style={{ padding: '10px 16px 6px', fontSize: '0.9rem' }}>
            {title}
          </div>
        )}
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            style={a.danger ? { color: 'var(--danger)' } : undefined}
            onClick={() => {
              a.onClick()
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
