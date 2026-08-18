import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { ClienteDialog, type Cliente, type Socio, TIPOS_CLIENTE } from '../components/ClienteDialog'

export function Clientes() {
  const { puede } = useAuth()
  const puedeEscribir = puede(['admin', 'ventas'])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [socios, setSocios] = useState<Socio[]>([])
  const [cargando, setCargando] = useState(true)
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState<string>('todos')
  const [nuevo, setNuevo] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)

  async function cargar() {
    setCargando(true)
    const [c, s] = await Promise.all([
      supabase.from('clientes').select('*').order('nombre'),
      supabase.from('perfiles').select('id,nombre').eq('activo', true).order('nombre'),
    ])
    setClientes((c.data as Cliente[]) ?? [])
    setSocios((s.data as Socio[]) ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const socioPorId = useMemo(() => new Map(socios.map((s) => [s.id, s])), [socios])

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    return clientes.filter((c) => {
      if (tipo !== 'todos' && c.tipo !== tipo) return false
      if (!t) return true
      return (
        c.nombre.toLowerCase().includes(t) ||
        (c.email ?? '').toLowerCase().includes(t) ||
        (c.telefono ?? '').includes(t) ||
        (c.localidad ?? '').toLowerCase().includes(t)
      )
    })
  }, [clientes, q, tipo])

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-oliva-900">Clientes</h1>
          <p className="text-sm text-oliva-700 mt-1">
            Base compartida — todos los socios pueden verla. Marcá cada cliente como minorista o mayorista
            para que el precio se aplique automáticamente al cargar ventas.
          </p>
        </div>
        {puedeEscribir && (
          <button className="btn-primary" onClick={() => setNuevo(true)}>+ Nuevo cliente</button>
        )}
      </div>

      <div className="card p-3 flex flex-wrap gap-2 items-center">
        <input
          className="input flex-1 min-w-[220px]"
          placeholder="Buscar por nombre, email, teléfono, localidad…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="input w-40" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="todos">Todos los tipos</option>
          {TIPOS_CLIENTE.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="text-xs text-oliva-600 ml-auto">
          {filtrados.length} / {clientes.length}
        </div>
      </div>

      {cargando ? (
        <div className="card p-6 text-sm text-oliva-700">Cargando…</div>
      ) : clientes.length === 0 ? (
        <div className="card p-6 text-sm text-oliva-700">
          Todavía no hay clientes. Cargá el primero con <b>+ Nuevo cliente</b>.
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-oliva-600 border-b border-oliva-100 bg-oliva-50">
                <th className="py-2 px-4">Nombre</th>
                <th className="py-2 px-4">Tipo</th>
                <th className="py-2 px-4">Contacto</th>
                <th className="py-2 px-4">Localidad</th>
                <th className="py-2 px-4">Socio</th>
                <th className="py-2 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.id} className="border-b border-oliva-100/70 last:border-0 hover:bg-oliva-50/60">
                  <td className="py-2 px-4 font-medium text-oliva-900">{c.nombre}</td>
                  <td className="py-2 px-4">
                    <span className={`text-[11px] uppercase tracking-wide rounded-full px-2 py-[1px] ${badgeTipo(c.tipo)}`}>
                      {c.tipo}
                    </span>
                  </td>
                  <td className="py-2 px-4 text-oliva-700">
                    {c.telefono && <div>{c.telefono}</div>}
                    {c.email && <div className="text-xs text-oliva-500">{c.email}</div>}
                  </td>
                  <td className="py-2 px-4 text-oliva-700">{c.localidad ?? '—'}</td>
                  <td className="py-2 px-4 text-oliva-700 text-xs">{socioPorId.get(c.socio_asignado ?? '')?.nombre ?? '—'}</td>
                  <td className="py-2 px-4 text-right">
                    <button
                      className="text-xs text-oliva-700 underline hover:text-oliva-900"
                      onClick={() => setEditando(c)}
                    >
                      {puedeEscribir ? 'Editar' : 'Ver'}
                    </button>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-sm text-oliva-600">Sin resultados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ClienteDialog
        abierto={nuevo}
        socios={socios}
        onCerrar={() => setNuevo(false)}
        onOk={() => { setNuevo(false); cargar() }}
      />
      <ClienteDialog
        abierto={editando !== null}
        socios={socios}
        editar={editando}
        soloLectura={!puedeEscribir}
        onCerrar={() => setEditando(null)}
        onOk={() => { setEditando(null); cargar() }}
      />
    </div>
  )
}

function badgeTipo(t: Cliente['tipo']) {
  switch (t) {
    case 'mayorista': return 'bg-aceite-500/15 text-aceite-600'
    case 'feria':     return 'bg-tierra-100 text-tierra-800'
    case 'envio':     return 'bg-oliva-200 text-oliva-800'
    default:          return 'bg-oliva-100 text-oliva-700'
  }
}
