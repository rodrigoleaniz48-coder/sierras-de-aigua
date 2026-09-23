import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'

// Capturar params de OAuth callback ANTES de que Supabase o React los limpien.
// Google redirige a /contabilidad?code=XXX&state=YYY — los guardamos en sessionStorage
// para que Contabilidad los lea después de montar.
;(() => {
  const p = new URLSearchParams(window.location.search)
  const code = p.get('code')
  const state = p.get('state')
  if (code && state && window.location.pathname.includes('contabilidad')) {
    sessionStorage.setItem('gmail_oauth_code', code)
    sessionStorage.setItem('gmail_oauth_state', state)
    const url = new URL(window.location.href)
    url.search = ''
    window.history.replaceState({}, '', url.toString())
  }
})()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
