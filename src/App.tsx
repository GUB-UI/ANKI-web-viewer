import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { DecksPage } from './pages/DecksPage'
import { SettingsPage } from './pages/SettingsPage'
import { CustomStudyPage } from './pages/CustomStudyPage'
import { CustomReviewPage, StudyPage } from './pages/StudyPage'

const ImportPage = lazy(async () => {
  const module = await import('./pages/ImportPage')
  return { default: module.ImportPage }
})

const StatsPage = lazy(async () => {
  const module = await import('./pages/StatsPage')
  return { default: module.StatsPage }
})

export default function App() {
  return (
    <Suspense fallback={<p className="muted">読み込み中...</p>}>
      <Routes>
        <Route path="/" element={<DecksPage />} />
        <Route path="/study/:deckId" element={<StudyPage />} />
        <Route path="/custom/:deckId" element={<CustomStudyPage />} />
        <Route path="/custom-review/:deckId" element={<CustomReviewPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/stats/:deckId" element={<StatsPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
