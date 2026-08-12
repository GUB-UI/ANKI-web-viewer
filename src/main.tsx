import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './styles/index.css'
import App from './App'
import { ThemeProvider } from './hooks/useTheme'

registerSW({ immediate: true })

// HashRouter works reliably on GitHub Pages without server rewrite rules
const Router = import.meta.env.BASE_URL === './' ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </Router>
  </StrictMode>,
)
