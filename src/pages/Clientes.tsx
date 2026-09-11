import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { ClienteDialog, type Cliente, type Socio, type EstadisticasCliente, TIPOS_CLIENTE } from '../components/ClienteDialog'
import { EnviarWhatsAppDialog } from '../components/EnviarWhatsAppDialog'
import { money } from '../lib/format'
import { guardarFlag, leerFlag } from '../lib/persistencia'

interface VentaMin {
  id: number
  fecha: string
  cliente_id: number | null
  total: number
  estado: string
}

export function Clientes() {
  const { puede, perfil } = useAuth()
  const puedeEscribir = puede(['admin', 'ventas'])
  // Gonzalo ve solo sus contactos (los asignados a el).
  // Rodrigo, Santiago y Ayelen (y admin) ven todos.
  const esGonzalo = (perfil?.nombre ?? '').toLowerCase().includes('gonzalo')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [socios, setSocios] = useState<Socio[]>([])
  const [ventas, setVentas] = useState<VentaMin[]>([])
  const [cargando, setCargando] = useState(true)
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState<string>('todos')
  const [segmento, setSegmento] = useState<Segmento>('todos')
  const [orden, setOrden] = useState<OrdenClientes>('nombre')
  const location = useLocation()
  const navigate = useNavigate()
  const abrirNueva = (location.state as { abrirNueva?: boolean } | null)?.abrirNueva === true
  const [nuevo, setNuevoRaw] = useState(() => abrirNueva || leerFlag('dialog:nuevo-cliente'))
  const setNuevo = (v: boolean) => { setNuevoRaw(v); guardarFlag('dialog:nuevo-cliente', v) }
  const [editando, setEditando] = useState<Cliente | null>(null)
  // Selección múltiple para acciones masivas (WhatsApp reactivación, etc.)
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  const [enviarWAAbierto, setEnviarWAAbierto] = useState(false)

  useEffect(() => {
    if (abrirNueva) navigate(location.pathname, { replace: true, state: {} })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // FAB: escuchar el evento global para abrir el dialogo estando en /clientes
  useEffect(() => {
    function h() { setNuevo(true) }
    window.addEventListener('app:fab-nuevo', h)
    return () => window.removeEventListener('app:fab-nuevo', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cargar() {
    setCargando(true)
    const [c, s, v] = await Promise.all([
      supabase.from('clientes').select('*').order('nombre'),
      supabase.from('perfiles').select('id,nombre').eq('activo', true).order('nombre'),
      supabase.from('ventas').select('id,fecha,cliente_id,total,estado').neq('estado', 'cancelado').eq('a_confirmar', false),
    ])
    setClientes((c.data as Cliente[]) ?? [])
    setSocios((s.data as Socio[]) ?? [])
    setVentas((v.data as VentaMin[]) ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  // Estadísticas por cliente
  const statsPorCliente = useMemo(() => {
    const m = new Map<number, EstadisticasCliente>()
    const porCli = new Map<number, VentaMin[]>()
    for (const v of ventas) {
      if (v.cliente_id == null) continue
      const arr = porCli.get(v.cliente_id) ?? []
      arr.push(v)
      porCli.set(v.cliente_id, arr)
    }
    const hoy = new Date()
    for (const [cid, arr] of porCli) {
      arr.sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
      const compras = arr.length
      const total = arr.reduce((s, x) => s + Number(x.total || 0), 0)
      const primera = arr[0].fecha
      const ultima = arr[arr.length - 1].fecha
      const diasDesdeUltima = Math.floor((hoy.getTime() - new Date(ultima + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
      let frecuenciaDias: number | null = null
      if (compras >= 2) {
        const rangoDias = (new Date(ultima).getTime() - new Date(primera).getTime()) / (1000 * 60 * 60 * 24)
        frecuenciaDias = rangoDias / (compras - 1)
      }
      m.set(cid, {
        compras, total, ticketPromedio: total / compras,
        primeraCompra: primera, ultimaCompra: ultima, diasDesdeUltima, frecuenciaDias,
      })
    }
    return m
  }, [ventas])

  // Conteo por segmento (para mostrar cuántos hay en cada uno en el dropdown)
  const conteoPorSegmento = useMemo(() => {
    const m: Record<string, number> = { nuevos: 0, recientes: 0, frec_activos: 0, frec_inactivos: 0, en_riesgo: 0, perdidos: 0, nunca: 0 }
    for (const c of clientes) {
      if (esGonzalo && c.socio_asignado && c.socio_asignado !== perfil?.id) continue
      const s = segmentoDe(statsPorCliente.get(c.id))
      if (s in m) m[s] = (m[s] ?? 0) + 1
    }
    return m
  }, [clientes, statsPorCliente, esGonzalo, perfil?.id])

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    const arr = clientes.filter((c) => {
      // Gonzalo solo ve sus contactos (asignados a el)
      if (esGonzalo && c.socio_asignado !== perfil?.id) return false
      if (tipo !== 'todos' && c.tipo !== tipo) return false
      if (segmento !== 'todos') {
        const st = statsPorCliente.get(c.id)
        if (segmentoDe(st) !== segmento) return false
      }
      if (!t) return true
      return (
        c.nombre.toLowerCase().includes(t) ||
        (c.email ?? '').toLowerCase().includes(t) ||
        (c.telefono ?? '').includes(t) ||
        (c.localidad ?? '').toLowerCase().includes(t)
      )
    })
    // Orden
    const compareUltima = (a: Cliente, b: Cliente) => {
      const ua = statsPorCliente.get(a.id)?.ultimaCompra ?? ''
      const ub = statsPorCliente.get(b.id)?.ultimaCompra ?? ''
      return ub.localeCompare(ua) // desc (más reciente arriba)
    }
    if (orden === 'ultima') arr.sort(compareUltima)
    else if (orden === 'compras') arr.sort((a, b) => (statsPorCliente.get(b.id)?.compras ?? 0) - (statsPorCliente.get(a.id)?.compras ?? 0))
    else if (orden === 'total') arr.sort((a, b) => (statsPorCliente.get(b.id)?.total ?? 0) - (statsPorCliente.get(a.id)?.total ?? 0))
    else arr.sort((a, b) => a.nombre.localeCompare(b.nombre))
    return arr
  }, [clientes, q, tipo, segmento, statsPorCliente, orden, esGonzalo, perfil?.id])

  async function eliminarCliente(c: Cliente) {
    const { error } = await supabase.from('clientes').delete().eq('id', c.id)
    if (error) throw new Error(error.message)
    setEditando(null)
    cargar()
  }

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
        <select className="input w-56" value={segmento} onChange={(e) => setSegmento(e.target.value as Segmento)} title="Filtrar por comportamiento de compra">
          <option value="todos">Todos los segmentos</option>
          <option value="nuevos">Nuevos (1ª compra ≤ 30 días) · {conteoPorSegmento.nuevos ?? 0}</option>
          <option value="recientes">Compraron recién (≤ 30 días) · {conteoPorSegmento.recientes ?? 0}</option>
          <option value="frec_activos">Frecuentes activos (≥3, ≤ 60d) · {conteoPorSegmento.frec_activos ?? 0}</option>
          <option value="frec_inactivos">Frecuentes inactivos (≥3, &gt; 60d) · {conteoPorSegmento.frec_inactivos ?? 0}</option>
          <option value="en_riesgo">En riesgo (60–120 días) · {conteoPorSegmento.en_riesgo ?? 0}</option>
          <option value="perdidos">Perdidos (&gt; 180 días) · {conteoPorSegmento.perdidos ?? 0}</option>
          <option value="nunca">Nunca compró · {conteoPorSegmento.nunca ?? 0}</option>
        </select>
        <select className="input w-44" value={orden} onChange={(e) => setOrden(e.target.value as OrdenClientes)} title="Ordenar por">
          <option value="nombre">Orden: nombre</option>
          <option value="ultima">Orden: última compra</option>
          <option value="compras">Orden: # compras</option>
          <option value="total">Orden: total gastado</option>
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
          <table className="w-full text-sm min-w-[880px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-oliva-600 border-b border-oliva-100 bg-oliva-50">
                <th className="py-2 pl-3 pr-1 w-8">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-oliva-700 cursor-pointer"
                    title="Seleccionar todos los visibles"
                    checked={filtrados.length > 0 && filtrados.every((c) => seleccion.has(c.id))}
                    ref={(el) => { if (el) el.indeterminate = filtrados.some((c) => seleccion.has(c.id)) && !filtrados.every((c) => seleccion.has(c.id)) }}
                    onChange={(e) => {
                      const marcar = e.target.checked
                      setSeleccion((prev) => {
                        const s = new Set(prev)
                        for (const c of filtrados) { if (marcar) s.add(c.id); else s.delete(c.id) }
                        return s
                      })
                    }}
                  />
                </th>
                <th className="py-2 px-4">Nombre</th>
                <th className="py-2 px-4">Tipo</th>
                <th className="py-2 px-4">Contacto</th>
                <th className="py-2 px-4">Localidad</th>
                <th className="py-2 px-4 text-right"># compras</th>
                <th className="py-2 px-4 text-right">Última</th>
                <th className="py-2 px-4 text-right">Total</th>
                <th className="py-2 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => {
                const st = statsPorCliente.get(c.id)
                const seg = segmentoDe(st)
                const marcado = seleccion.has(c.id)
                return (
                  <tr key={c.id} className={`border-b border-oliva-100/70 last:border-0 hover:bg-oliva-50/60 cursor-pointer ${marcado ? 'bg-oliva-100/40' : ''}`} onClick={() => setEditando(c)}>
                    <td className="py-2 pl-3 pr-1 w-8" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-oliva-700 cursor-pointer"
                        checked={marcado}
                        onChange={(e) => {
                          const marcar = e.target.checked
                          setSeleccion((prev) => {
                            const s = new Set(prev)
                            if (marcar) s.add(c.id); else s.delete(c.id)
                            return s
                          })
                        }}
                      />
                    </td>
                    <td className="py-2 px-4 font-medium text-oliva-900">
                      <div>{c.nombre}</div>
                      {seg !== 'todos' && seg !== 'nunca' && (
                        <span className={`inline-block mt-0.5 text-[10px] uppercase tracking-wide rounded-full px-1.5 py-[1px] ${badgeSegmento(seg)}`}>
                          {etiquetaSegmento(seg)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-4">
                      <span className={`text-[11px] uppercase tracking-wide rounded-full px-2 py-[1px] ${badgeTipo(c.tipo)}`}>
                        {c.tipo}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-oliva-700">
                      {(c.whatsapp || c.telefono) && <div>{c.whatsapp ?? c.telefono}</div>}
                      {c.email && <div className="text-xs text-oliva-500">{c.email}</div>}
                    </td>
                    <td className="py-2 px-4 text-oliva-700">{c.localidad ?? '—'}</td>
                    <td className="py-2 px-4 text-right tabular-nums text-oliva-800">{st?.compras ?? 0}</td>
                    <td className="py-2 px-4 text-right tabular-nums text-oliva-600 text-xs whitespace-nowrap">{st?.ultimaCompra ?? '—'}</td>
                    <td className="py-2 px-4 text-right tabular-nums text-oliva-800">{st ? money(st.total) : '—'}</td>
                    <td className="py-2 px-4 text-right">
                      <button
                        className="text-xs text-oliva-700 underline hover:text-oliva-900"
                        onClick={(e) => { e.stopPropagation(); setEditando(c) }}
                      >
                        {puedeEscribir ? 'Editar' : 'Ver'}
                      </button>
                    </td>
                  </tr>
                )
              })}
              {filtrados.length === 0 && (
                <tr><td colSpan={9} className="py-6 text-center text-sm text-oliva-600">
                  {segmento !== 'todos' && conteoPorSegmento[segmento] === 0 ? (
                    <div className="space-y-1">
                      <div>Todavía no hay clientes en este segmento.</div>
                      <div className="text-[11px] text-oliva-500">
                        La app arrancó hace poco: <b>recientes</b>, <b>frecuentes</b>, <b>en riesgo</b> y <b>perdidos</b> se van poblando a medida que pasan las semanas y hay más historial de compras.
                      </div>
                    </div>
                  ) : 'Sin resultados.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Barra flotante de acciones masivas cuando hay clientes seleccionados */}
      {seleccion.size > 0 && (
        <div
          className="fixed left-0 right-0 z-30 pointer-events-none"
          style={{ bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="mx-auto max-w-2xl px-3">
            <div className="pointer-events-auto rounded-2xl bg-oliva-900 text-white shadow-2xl flex items-center gap-2 px-3 py-2">
              <span className="text-sm">
                <b>{seleccion.size}</b> seleccionado{seleccion.size === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                className="text-xs underline text-oliva-100 hover:text-white"
                onClick={() => setSeleccion(new Set())}
              >
                limpiar
              </button>
              <button
                type="button"
                onClick={() => setEnviarWAAbierto(true)}
                className="ml-auto text-sm font-semibold px-3 py-2 rounded-lg bg-[#25D366] text-white hover:brightness-95"
              >
                📱 Enviar WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      <EnviarWhatsAppDialog
        abierto={enviarWAAbierto}
        clientes={clientes.filter((c) => seleccion.has(c.id))}
        onCerrar={() => setEnviarWAAbierto(false)}
      />

      <ClienteDialog
        abierto={nuevo}
        socios={socios}
        defaultSocioAsignado={perfil?.id}
        onCerrar={() => setNuevo(false)}
        onOk={() => { setNuevo(false); cargar() }}
      />
      <ClienteDialog
        abierto={editando !== null}
        socios={socios}
        editar={editando}
        soloLectura={!puedeEscribir}
        stats={editando ? statsPorCliente.get(editando.id) ?? { compras: 0, total: 0, ticketPromedio: 0, primeraCompra: null, ultimaCompra: null, diasDesdeUltima: null, frecuenciaDias: null } : null}
        onEliminar={puedeEscribir ? eliminarCliente : undefined}
        onCerrar={() => setEditando(null)}
        onOk={() => { setEditando(null); cargar() }}
      />
    </div>
  )
}

type Segmento = 'todos' | 'nuevos' | 'recientes' | 'frec_activos' | 'frec_inactivos' | 'en_riesgo' | 'perdidos' | 'nunca'
type OrdenClientes = 'nombre' | 'ultima' | 'compras' | 'total'

function segmentoDe(st: EstadisticasCliente | undefined): Segmento {
  if (!st || st.compras === 0) return 'nunca'
  const d = st.diasDesdeUltima ?? Infinity
  const compras = st.compras
  // Nuevos: primera compra dentro de los últimos 30 días
  if (st.primeraCompra) {
    const dp = Math.floor((Date.now() - new Date(st.primeraCompra + 'T00:00:00').getTime()) / 86400000)
    if (dp <= 30) return 'nuevos'
  }
  if (d > 180) return 'perdidos'
  if (compras >= 3 && d > 60) return 'frec_inactivos'
  if (d >= 60 && d <= 120) return 'en_riesgo'
  if (compras >= 3 && d <= 60) return 'frec_activos'
  if (d <= 30) return 'recientes'
  return 'todos'
}

function etiquetaSegmento(s: Segmento): string {
  switch (s) {
    case 'nuevos': return 'nuevo'
    case 'recientes': return 'compró recién'
    case 'frec_activos': return 'frecuente activo'
    case 'frec_inactivos': return 'frecuente inactivo'
    case 'en_riesgo': return 'en riesgo'
    case 'perdidos': return 'perdido'
    case 'nunca': return 'sin compras'
    default: return ''
  }
}

function badgeSegmento(s: Segmento): string {
  switch (s) {
    case 'nuevos':          return 'bg-aceite-500/20 text-aceite-600'
    case 'recientes':       return 'bg-oliva-200 text-oliva-800'
    case 'frec_activos':    return 'bg-green-100 text-green-800'
    case 'frec_inactivos':  return 'bg-amber-100 text-amber-800'
    case 'en_riesgo':       return 'bg-orange-100 text-orange-800'
    case 'perdidos':        return 'bg-red-100 text-red-800'
    default:                return 'bg-oliva-100 text-oliva-700'
  }
}

function badgeTipo(t: Cliente['tipo']) {
  switch (t) {
    case 'mayorista':    return 'bg-aceite-500/20 text-aceite-600 ring-1 ring-aceite-500/30'
    case 'distribuidor': return 'bg-blue-100 text-blue-800 ring-1 ring-blue-300'
    case 'feria':        return 'bg-tierra-100 text-tierra-800'
    case 'envio':        return 'bg-oliva-200 text-oliva-800'
    default:             return 'bg-oliva-100 text-oliva-700'
  }
}
