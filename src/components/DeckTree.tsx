import type { DeckCounts, Deck } from '../db/schema'
import { totalDue, type DeckNode } from '../study/deckTree'

interface Props {
  nodes: DeckNode[]
  counts: Map<string, DeckCounts>
  expanded: Set<string>
  onToggle: (deckId: string) => void
  onOpen: (deck: Deck) => void
  onLongPress?: (deck: Deck) => void
}

export function DeckTree({
  nodes,
  counts,
  expanded,
  onToggle,
  onOpen,
  onLongPress,
}: Props) {
  return (
    <div className="deck-list">
      {nodes.map((node) => (
        <DeckBranch
          key={node.deck.id}
          node={node}
          counts={counts}
          expanded={expanded}
          onToggle={onToggle}
          onOpen={onOpen}
          onLongPress={onLongPress}
        />
      ))}
    </div>
  )
}

function DeckBranch({
  node,
  counts,
  expanded,
  onToggle,
  onOpen,
  onLongPress,
}: {
  node: DeckNode
  counts: Map<string, DeckCounts>
  expanded: Set<string>
  onToggle: (deckId: string) => void
  onOpen: (deck: Deck) => void
  onLongPress?: (deck: Deck) => void
}) {
  const hasChildren = node.children.length > 0
  const isOpen = expanded.has(node.deck.id)
  const c = counts.get(node.deck.id) ?? { new: 0, review: 0, learning: 0 }
  const due = totalDue(c)

  let pressTimer: number | undefined

  return (
    <>
      <div
        className="deck-row"
        style={{ paddingLeft: node.depth * 14 }}
        onTouchStart={() => {
          if (!onLongPress) return
          pressTimer = window.setTimeout(() => onLongPress(node.deck), 480)
        }}
        onTouchEnd={() => {
          if (pressTimer) window.clearTimeout(pressTimer)
        }}
        onTouchMove={() => {
          if (pressTimer) window.clearTimeout(pressTimer)
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="deck-toggle"
            aria-label={isOpen ? '閉じる' : '開く'}
            onClick={() => onToggle(node.deck.id)}
          >
            {isOpen ? '▼' : '▶'}
          </button>
        ) : (
          <span className="deck-toggle" aria-hidden>
            ·
          </span>
        )}
        <button type="button" className="deck-main" onClick={() => onOpen(node.deck)}>
          <span className="deck-name">{node.deck.name}</span>
          <span className="deck-meta">
            {c.new} new · {c.review + c.learning} review
          </span>
        </button>
        <span className="deck-count">{due}</span>
        {onLongPress && (
          <button
            type="button"
            className="deck-toggle"
            aria-label="メニュー"
            onClick={() => onLongPress(node.deck)}
          >
            ···
          </button>
        )}
      </div>
      {hasChildren &&
        isOpen &&
        node.children.map((child) => (
          <DeckBranch
            key={child.deck.id}
            node={child}
            counts={counts}
            expanded={expanded}
            onToggle={onToggle}
            onOpen={onOpen}
            onLongPress={onLongPress}
          />
        ))}
    </>
  )
}
