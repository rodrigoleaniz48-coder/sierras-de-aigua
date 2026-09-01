import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabaseConfigured } from '../lib/supabase'

export function Login() {
  const { signIn, session } = useAuth()
  const nav = useNavigate()
  const loc = useLocation() as { state?: { from?: { pathname?: string } } }
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verPass, setVerPass] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (session) {
    nav(loc.state?.from?.pathname ?? '/', { replace: true })
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn(email.trim(), password)
    setLoading(false)
    if (error) setError(error)
    else nav(loc.state?.from?.pathname ?? '/', { replace: true })
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-oliva-50 via-white to-tierra-100 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img src={import.meta.env.BASE_URL + 'logo.webp'} alt="Sierras de Aiguá" className="mx-auto h-72 sm:h-96 w-auto" />
          <p className="mt-2 text-sm text-oliva-700">Gestión interna</p>
        </div>

        {!supabaseConfigured && (
          <div className="mb-4 card p-3 text-sm bg-yellow-50 border-yellow-300 text-yellow-900">
            Faltan credenciales de Supabase. Ver README, sección <em>Puesta en marcha</em>.
          </div>
        )}

        <form onSubmit={onSubmit} className="card p-5 space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <div className="relative">
              <input
                type={verPass ? 'text' : 'password'}
                className="input pr-20"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setVerPass((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-oliva-700 hover:text-oliva-900 px-2 py-1 rounded hover:bg-oliva-100"
                tabIndex={-1}
                aria-label={verPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {verPass ? '🙈 Ocultar' : '👁 Ver'}
              </button>
            </div>
          </div>
          {error && <div className="text-sm text-red-700">{error}</div>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
