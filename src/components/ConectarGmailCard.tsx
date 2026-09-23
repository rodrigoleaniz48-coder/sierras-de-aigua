import { useState, useEffect } from 'react'
import {
  obtenerCuentaCorreo,
  conectarGmail,
  desconectarGmail,
  type CuentaCorreo,
} from '../lib/gmail'

export function ConectarGmailCard({ recargar }: { recargar?: boolean }) {
  const [cuenta, setCuenta] = useState<CuentaCorreo | null>(null)
  const [cargando, setCargando] = useState(true)
  const [conectando, setConectando] = useState(false)
  const [desconectando, setDesconectando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cargar() {
    setCargando(true)
    const c = await obtenerCuentaCorreo()
    setCuenta(c)
    setCargando(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  useEffect(() => {
    if (recargar) cargar()
  }, [recargar])

  async function handleConectar() {
    setConectando(true)
    setError(null)
    const result = await conectarGmail()
    if (result.error) {
      setError(result.error)
      setConectando(false)
      return
    }
    if (result.url) {
      window.location.href = result.url
    }
  }

  async function handleDesconectar() {
    if (!confirm('Desconectar la cuenta de Gmail? Los correos ya importados se mantienen.')) return
    setDesconectando(true)
    setError(null)
    const result = await desconectarGmail()
    setDesconectando(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setCuenta(null)
  }

  if (cargando) {
    return (
      <div className="card p-4 text-sm text-oliva-600">Cargando…</div>
    )
  }

  // Estado: sin cuenta conectada → onboarding
  if (!cuenta) {
    return (
      <div className="card p-5 space-y-3 border-dashed border-2 border-oliva-200 bg-oliva-50/40">
        <div className="flex items-start gap-3">
          <div className="text-2xl mt-0.5">📧</div>
          <div>
            <div className="font-semibold text-oliva-900">Conectar Gmail</div>
            <div className="text-xs text-oliva-600 mt-0.5">
              Conecta la cuenta de correo de la empresa para detectar facturas, impuestos y
              obligaciones automaticamente.
            </div>
          </div>
        </div>
        <div className="text-[11px] text-oliva-500 bg-oliva-100 rounded px-3 py-2">
          Solo lectura — la app no puede enviar, borrar ni modificar correos. Podes desconectar en
          cualquier momento.
        </div>
        {error && (
          <div className="text-sm text-red-700 bg-red-50 rounded px-3 py-2">{error}</div>
        )}
        <button className="btn-primary" onClick={handleConectar} disabled={conectando}>
          {conectando ? 'Abriendo Google…' : 'Conectar cuenta de Gmail'}
        </button>
      </div>
    )
  }

  // Estado: cuenta conectada
  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${cuenta.estado === 'activa' ? 'bg-green-500' : 'bg-red-500'}`}
          />
          <span className="font-medium text-oliva-900 truncate">{cuenta.email}</span>
          <span className="tag tag-neutral text-[9px]">solo lectura</span>
        </div>
        <button
          className="text-xs text-red-700 hover:underline shrink-0"
          onClick={handleDesconectar}
          disabled={desconectando}
        >
          {desconectando ? 'Desconectando…' : 'Desconectar'}
        </button>
      </div>
      {cuenta.ultima_sync && (
        <div className="text-xs text-oliva-600">
          Ultima sincronizacion: {new Date(cuenta.ultima_sync).toLocaleString('es-UY')}
        </div>
      )}
      {cuenta.estado === 'error_token' && (
        <div className="text-xs text-red-700 bg-red-50 rounded px-3 py-2">
          Error de autenticacion: {cuenta.error_detalle ?? 'Token expirado'}. Desconecta y volve a
          conectar.
        </div>
      )}
      {error && (
        <div className="text-sm text-red-700 bg-red-50 rounded px-3 py-2">{error}</div>
      )}
    </div>
  )
}
