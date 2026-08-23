import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  abierto: boolean
  onClose: () => void
}

export function CambiarPasswordDialog({ abierto, onClose }: Props) {
  const [pass1, setPass1] = useState('')
  const [pass2, setPass2] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  if (!abierto) return null

  const cerrar = () => {
    setPass1(''); setPass2(''); setMostrar(false); setError(null); setOk(false)
    onClose()
  }

  const guardar = async () => {
    setError(null); setOk(false)
    if (pass1.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return }
    if (pass1 !== pass2) { setError('Las contraseñas no coinciden.'); return }
    setGuardando(true)
    const { error: err } = await supabase.auth.updateUser({ password: pass1 })
    setGuardando(false)
    if (err) {
      setError(err.message || 'No se pudo actualizar la contraseña.')
      return
    }
    setOk(true)
    setPass1(''); setPass2('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={cerrar}>
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-oliva-900">Cambiar contraseña</h2>
        <p className="mt-1 text-xs text-oliva-600">
          Elegí una nueva contraseña. Vas a seguir logueado en esta sesión.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-oliva-800">Nueva contraseña</span>
            <input
              type={mostrar ? 'text' : 'password'}
              className="mt-1 w-full rounded-md border border-oliva-200 px-3 py-2 text-sm"
              value={pass1}
              onChange={(e) => setPass1(e.target.value)}
              autoComplete="new-password"
              autoFocus
            />
          </label>
          <label className="block text-sm">
            <span className="text-oliva-800">Repetir contraseña</span>
            <input
              type={mostrar ? 'text' : 'password'}
              className="mt-1 w-full rounded-md border border-oliva-200 px-3 py-2 text-sm"
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-oliva-700">
            <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} />
            Mostrar contraseñas
          </label>

          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
          {ok && <div className="rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">Contraseña actualizada.</div>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded-md px-3 py-2 text-sm text-oliva-800 hover:bg-oliva-100"
            onClick={cerrar}
          >
            {ok ? 'Cerrar' : 'Cancelar'}
          </button>
          {!ok && (
            <button
              className="rounded-md bg-oliva-700 px-3 py-2 text-sm text-white hover:bg-oliva-800 disabled:opacity-50"
              onClick={guardar}
              disabled={guardando}
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
