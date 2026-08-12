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
        className="menu-sheet-inner glass-raised"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="sheet-grabber" aria-hidden />
        {title && <div className="sheet-title">{title}</div>}
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
