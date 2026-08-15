import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Dialog } from '../components/Dialog'

interface Cliente {
  id: number
  nombre: string
  tipo: 'minorista' | 'mayorista' | 'feria' | 'envio' | 'otro'
  telefono: string | null
  email: string | null
  whatsapp: string | null
  direccion: string | null
  localidad: string | null
  rut: string | null
  condiciones_pago: string | null
  socio_asignado: string | null
  notas: string | null
  creado_en: string
}

interface Socio { id: string; nombre: string }

const TIPOS: Cliente['tipo'][] = ['minorista', 'mayorista', 'feria', 'envio', 'otro']

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
          {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
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

function ClienteDialog({
  abierto, socios, editar, soloLectura, onCerrar, onOk,
}: {
  abierto: boolean
  socios: Socio[]
  editar?: Cliente | null
  soloLectura?: boolean
  onCerrar: () => void
  onOk: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<Cliente['tipo']>('minorista')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [direccion, setDireccion] = useState('')
  const [localidad, setLocalidad] = useState('')
  const [rut, setRut] = useState('')
  const [pago, setPago] = useState('')
  const [socioAsig, setSocioAsig] = useState<string>('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    if (editar) {
      setNombre(editar.nombre); setTipo(editar.tipo); setTelefono(editar.telefono ?? '')
      setEmail(editar.email ?? ''); setWhatsapp(editar.whatsapp ?? '')
      setDireccion(editar.direccion ?? ''); setLocalidad(editar.localidad ?? '')
      setRut(editar.rut ?? ''); setPago(editar.condiciones_pago ?? '')
      setSocioAsig(editar.socio_asignado ?? ''); setNotas(editar.notas ?? '')
    } else {
      setNombre(''); setTipo('minorista'); setTelefono(''); setEmail(''); setWhatsapp('')
      setDireccion(''); setLocalidad(''); setRut(''); setPago(''); setSocioAsig(''); setNotas('')
    }
    setError(null)
  }, [abierto, editar])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true); setError(null)
    const payload = {
      nombre: nombre.trim(),
      tipo,
      telefono: telefono.trim() || null,
      email: email.trim() || null,
      whatsapp: whatsapp.trim() || null,
      direccion: direccion.trim() || null,
      localidad: localidad.trim() || null,
      rut: rut.trim() || null,
      condiciones_pago: pago.trim() || null,
      socio_asignado: socioAsig || null,
      notas: notas.trim() || null,
      origen: editar ? undefined : 'manual',
      actualizado_en: new Date().toISOString(),
    }
    const q = editar
      ? supabase.from('clientes').update(payload).eq('id', editar.id)
      : supabase.from('clientes').insert(payload)
    const { error } = await q
    setGuardando(false)
    if (error) setError(error.message)
    else onOk()
  }

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo={editar ? (soloLectura ? 'Cliente' : 'Editar cliente') : 'Nuevo cliente'} ancho="lg">
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Nombre / razón social</label>
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} required disabled={soloLectura} autoFocus />
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as Cliente['tipo'])} disabled={soloLectura}>
              {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Socio asignado</label>
            <select className="input" value={socioAsig} onChange={(e) => setSocioAsig(e.target.value)} disabled={soloLectura}>
              <option value="">— sin asignar —</option>
              {socios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input className="input" value={telefono} onChange={(e) => setTelefono(e.target.value)} disabled={soloLectura} />
          </div>
          <div>
            <label className="label">WhatsApp</label>
            <input className="input" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} disabled={soloLectura} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={soloLectura} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Dirección</label>
            <input className="input" value={direccion} onChange={(e) => setDireccion(e.target.value)} disabled={soloLectura} />
          </div>
          <div>
            <label className="label">Localidad</label>
            <input className="input" value={localidad} onChange={(e) => setLocalidad(e.target.value)} disabled={soloLectura} />
          </div>
          <div>
            <label className="label">RUT (opcional)</label>
            <input className="input" value={rut} onChange={(e) => setRut(e.target.value)} disabled={soloLectura} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Condiciones de pago</label>
            <input className="input" value={pago} onChange={(e) => setPago(e.target.value)} placeholder="ej: contado / 30 días" disabled={soloLectura} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notas</label>
            <textarea className="input min-h-[70px]" value={notas} onChange={(e) => setNotas(e.target.value)} disabled={soloLectura} />
          </div>
        </div>
        {error && <div className="text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onCerrar}>{soloLectura ? 'Cerrar' : 'Cancelar'}</button>
          {!soloLectura && (
            <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          )}
        </div>
      </form>
    </Dialog>
  )
}
