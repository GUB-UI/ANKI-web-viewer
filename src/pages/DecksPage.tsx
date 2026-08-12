import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { liveQuery } from 'dexie'
import { ActionSheet } from '../components/ActionSheet'
import { DeckTree } from '../components/DeckTree'
import { db, ensureSettings, requestPersistentStorage } from '../db/database'
import type { Deck } from '../db/schema'
import {
  countActiveNewByDeck,
  fetchDueCountsByDeck,
} from '../study/cardQueries'
import { loadDailyNewContext } from '../study/dailyNew'
import {
  buildDeckForest,
  computeDeckCounts,
  totalDue,
} from '../study/deckTree'

export function DecksPage() {
  const navigate = useNavigate()
  const [decks, setDecks] = useState<Deck[]>([])
  const [counts, setCounts] = useState<Map<string, import('../db/schema').DeckCounts>>(
    new Map(),
  )
  const [today, setToday] = useState({ new: 0, review: 0 })
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [menuDeck, setMenuDeck] = useState<Deck | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    void ensureSettings()
    void requestPersistentStorage()
  }, [])

  useEffect(() => {
    const sub = liveQuery(async () => {
      const deckList = await db.decks.toArray()
      const deckIds = deckList.map((deck) => deck.id)
      const dailyNew = await loadDailyNewContext(Date.now(), deckList)
      const [dueByDeck, availableNewByDeck] = await Promise.all([
        fetchDueCountsByDeck(deckIds),
        countActiveNewByDeck(deckIds),
      ])
      const c = computeDeckCounts(
        deckList,
        dueByDeck,
        availableNewByDeck,
        dailyNew,
      )
      const t = deckList
        .filter((deck) => !deck.parentId)
        .reduce(
          (total, root) => {
            const count = c.get(root.id)
            if (count) {
              total.new += count.new
              total.review += count.review + count.learning
            }
            return total
          },
          { new: 0, review: 0 },
        )
      return { deckList, c, t }
    }).subscribe({
      next: ({ deckList, c, t }) => {
        setLoadError('')
        setDecks(deckList)
        setCounts(c)
        setToday(t)
        setExpanded((prev) => {
          if (prev.size > 0) return prev
          // expand top-level by default
          return new Set(deckList.filter((d) => !d.parentId).map((d) => d.id))
        })
      },
      error: (error) => {
        console.error(error)
        setLoadError('デッキを読み込めませんでした。アプリを再起動してください。')
      },
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
        <div className="brand-block">
          <span className="eyebrow">Local Deck</span>
          <div className="brand">
            Kio<span>ku</span>
          </div>
          <span className="brand-jp">記憶</span>
        </div>
        <div className="header-actions">
          <Link to="/import" className="icon-btn" aria-label="インポート">
            ＋
          </Link>
          <Link to="/settings" className="icon-btn" aria-label="設定">
            ⚙
          </Link>
        </div>
      </header>

      {loadError ? (
        <div className="empty-state glass">
          <h2 style={{ marginTop: 0, color: 'var(--danger)' }}>読み込みエラー</h2>
          <p>{loadError}</p>
        </div>
      ) : decks.length === 0 ? (
        <div className="empty-state glass">
          <h2 style={{ marginTop: 0 }}>デッキがありません</h2>
          <p>Ankiの .apkg を読み込んで、このiPhoneだけで復習を続けましょう。</p>
          <Link to="/import" className="btn btn-primary btn-block" style={{ marginTop: 20 }}>
            .apkg を読み込む
          </Link>
        </div>
      ) : (
        <>
          <div className="panel glass">
            <div className="panel-head">
              <span className="eyebrow">Decks</span>
              <span className="index numeric">{decks.length}</span>
            </div>
            <DeckTree
              nodes={forest}
              counts={counts}
              expanded={expanded}
              onToggle={toggle}
              onOpen={openDeck}
              onLongPress={setMenuDeck}
            />
          </div>
          <div className="today-bar">
            <div className="today-item glass">
              <div className="label">今日 · 新規</div>
              <div className="value">{today.new}</div>
            </div>
            <div className="today-item glass">
              <div className="label">今日 · 復習</div>
              <div className="value">{today.review}</div>
            </div>
          </div>
          <footer className="shell-footer">
            <span>Sumiwatari</span>
            <span>Designed with care</span>
          </footer>
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
