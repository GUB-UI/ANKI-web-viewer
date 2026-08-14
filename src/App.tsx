import { Navigate, Route, Routes } from 'react-router-dom'
import { DecksPage } from './pages/DecksPage'
import { ImportPage } from './pages/ImportPage'
import { SettingsPage } from './pages/SettingsPage'
import { CustomStudyPage } from './pages/CustomStudyPage'
import { CustomReviewPage, StudyPage } from './pages/StudyPage'
import { StatsPage } from './pages/StatsPage'

export default function App() {
  return (
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
  )
}
