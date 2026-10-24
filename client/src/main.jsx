import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './config/sessionRequests'
import { AuthProvider } from './auth/auth'
import 'react-toastify/dist/ReactToastify.css'
import './index.css'
import './i18n'
import App from './App.jsx'
import { TranslationProvider } from './context/TranslationContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <TranslationProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <App />
        </BrowserRouter>
      </TranslationProvider>
    </AuthProvider>
  </StrictMode>,
)
