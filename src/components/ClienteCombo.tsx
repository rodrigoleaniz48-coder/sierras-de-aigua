import { useEffect, useMemo, useRef, useState } from 'react'
import type { Cliente } from './ClienteDialog'

interface Props {
  clientes: Cliente[]
  clienteId: string
  onCambiar: (id: string) => void
  onNuevo?: () => void
  disabled?: boolean
  placeholderVacio?: string
}

/**
 * Selector de cliente con búsqueda por nombre / teléfono / localidad.
 * Ideal cuando hay muchos clientes cargados (el <select> nativo se vuelve incómodo).
 * El valor vacío ('') significa "sin cliente".
 */
export function ClienteCombo({ clientes, clienteId, onCambiar, onNuevo, disabled, placeholderVacio }: Props) {
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const seleccionado = useMemo(
    () => (clienteId ? clientes.find((c) => c.id === Number(clienteId)) : null),
    [clientes, clienteId],
  )

  // Cerrar dropdown al clic afuera
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return clientes.slice(0, 100)
    return clientes
      .filter((c) =>
        c.nombre.toLowerCase().includes(t) ||
        (c.telefono ?? '').includes(t) ||
        (c.whatsapp ?? '').includes(t) ||
        (c.localidad ?? '').toLowerCase().includes(t)
      )
      .slice(0, 100)
  }, [clientes, q])

  function elegir(id: string) {
    onCambiar(id)
    setQ('')
    setAbierto(false)
  }

  const label = seleccionado
    ? `${seleccionado.nombre} (${seleccionado.tipo})`
    : (placeholderVacio ?? 'Buscar cliente…')

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-1">
        <input
          type="text"
          className="input flex-1"
          value={abierto ? q : (seleccionado ? label : q)}
          placeholder={placeholderVacio ?? 'Buscar por nombre, teléfono o localidad…'}
          onFocus={() => { setAbierto(true); setQ('') }}
          onChange={(e) => { setQ(e.target.value); setAbierto(true) }}
          disabled={disabled}
        />
        {seleccionado && !disabled && (
          <button
            type="button"
            className="text-oliva-600 hover:text-red-700 px-2 text-lg"
            title="Quitar cliente"
            onClick={() => { onCambiar(''); setQ('') }}
          >
            ×
          </button>
        )}
      </div>

      {abierto && !disabled && (
        <div className="absolute z-20 mt-1 left-0 right-0 max-h-72 overflow-y-auto rounded-lg border border-oliva-200 bg-white shadow-lg">
          <button
            type="button"
            className="block w-full text-left px-3 py-2 text-sm text-oliva-700 hover:bg-oliva-50 italic border-b border-oliva-100"
            onClick={() => elegir('')}
          >
            — sin cliente (venta de feria / mostrador) —
          </button>
          {onNuevo && (
            <button
              type="button"
              className="block w-full text-left px-3 py-2 text-sm text-oliva-800 hover:bg-oliva-50 border-b border-oliva-100 font-medium"
              onMouseDown={(e) => { e.preventDefault(); onNuevo(); setAbierto(false) }}
            >
              + Nuevo cliente
            </button>
          )}
          {filtrados.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`block w-full text-left px-3 py-2 text-sm hover:bg-oliva-50 ${clienteId === String(c.id) ? 'bg-oliva-100 text-oliva-900' : 'text-oliva-800'}`}
              onMouseDown={(e) => { e.preventDefault(); elegir(String(c.id)) }}
            >
              <span className="font-medium">{c.nombre}</span>
              <span className="text-xs text-oliva-600 ml-2">({c.tipo})</span>
              {c.localidad && <span className="text-[11px] text-oliva-500 ml-2">· {c.localidad}</span>}
            </button>
          ))}
          {filtrados.length === 0 && (
            <div className="px-3 py-3 text-sm text-oliva-600 italic">Sin resultados</div>
          )}
        </div>
      )}
    </div>
  )
}
