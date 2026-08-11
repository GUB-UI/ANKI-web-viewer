import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { liveQuery } from 'dexie'
import { ActionSheet } from '../components/ActionSheet'
import { DeckTree } from '../components/DeckTree'
import { db, ensureSettings, requestPersistentStorage } from '../db/database'
import type { Deck } from '../db/schema'
import {
  buildDeckForest,
  computeDeckCounts,
  totalDue,
} from '../study/deckTree'
import { getEffectiveNewLimit, getTodayTotals } from '../study/queue'

export function DecksPage() {
  const navigate = useNavigate()
  const [decks, setDecks] = useState<Deck[]>([])
  const [counts, setCounts] = useState<Map<string, import('../db/schema').DeckCounts>>(
    new Map(),
  )
  const [today, setToday] = useState({ new: 0, review: 0 })
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [menuDeck, setMenuDeck] = useState<Deck | null>(null)

  useEffect(() => {
    void ensureSettings()
    void requestPersistentStorage()
  }, [])

  useEffect(() => {
    const sub = liveQuery(async () => {
      const [deckList, cards] = await Promise.all([
        db.decks.toArray(),
        db.cards.toArray(),
      ])
      const limits = new Map<string, number>()
      for (const d of deckList) {
        limits.set(d.id, await getEffectiveNewLimit(d.id, d))
      }
      const c = computeDeckCounts(deckList, cards, limits)
      const t = await getTodayTotals()
      return { deckList, c, t }
    }).subscribe({
      next: ({ deckList, c, t }) => {
        setDecks(deckList)
        setCounts(c)
        setToday(t)
        setExpanded((prev) => {
          if (prev.size > 0) return prev
          // expand top-level by default
          return new Set(deckList.filter((d) => !d.parentId).map((d) => d.id))
        })
      },
      error: console.error,
    })
    return () => sub.unsubscribe()
  }, [])

  const forest = useMemo(() => buildDeckForest(decks), [decks])

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openDeck(deck: Deck) {
    const due = totalDue(counts.get(deck.id) ?? { new: 0, review: 0, learning: 0 })
    if (due === 0) {
      setMenuDeck(deck)
      return
    }
    navigate(`/study/${deck.id}`)
  }

  return (
    <div className="app-shell">
      <header className="page-header">
        <div>
          <div className="brand">
            Kio<span>ku</span>
          </div>
          <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
            開く → 覚える → 閉じる
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/import" className="icon-btn" aria-label="インポート">
            ＋
          </Link>
          <Link to="/settings" className="icon-btn" aria-label="設定">
            ⚙
          </Link>
        </div>
      </header>

      {decks.length === 0 ? (
        <div className="empty-state">
          <h2 style={{ marginTop: 0 }}>デッキがありません</h2>
          <p>Ankiの .apkg を読み込んで、このiPhoneだけで復習を続けましょう。</p>
          <Link to="/import" className="btn btn-primary btn-block" style={{ marginTop: 20 }}>
            .apkg を読み込む
          </Link>
        </div>
      ) : (
        <>
          <DeckTree
            nodes={forest}
            counts={counts}
            expanded={expanded}
            onToggle={toggle}
            onOpen={openDeck}
            onLongPress={setMenuDeck}
          />
          <div className="today-bar">
            <div className="today-item">
              <div className="label">今日 · 新規</div>
              <div className="value">{today.new}</div>
            </div>
            <div className="today-item">
              <div className="label">今日 · 復習</div>
              <div className="value">{today.review}</div>
            </div>
          </div>
        </>
      )}

      {menuDeck && (
        <ActionSheet
          title={menuDeck.path}
          actions={[
            {
              label: '学習開始',
              onClick: () => navigate(`/study/${menuDeck.id}`),
            },
            {
              label: 'カスタム学習',
              onClick: () => navigate(`/custom/${menuDeck.id}`),
            },
          ]}
          onClose={() => setMenuDeck(null)}
        />
      )}
    </div>
  )
}
