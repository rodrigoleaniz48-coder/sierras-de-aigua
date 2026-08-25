import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Dialog } from '../components/Dialog'
import { ClienteDialog, type Cliente, type Socio } from '../components/ClienteDialog'
import { ClienteCombo } from '../components/ClienteCombo'
import { money } from '../lib/format'
import { CADETE_MVD_WA, normalizarTelWA } from '../lib/config'
import { guardarFlag, leerFlag } from '../lib/persistencia'

// ---------- Tipos ----------
interface Producto { id: number; nombre: string; categoria?: string }
interface Presentacion {
  id: number; producto_id: number; nombre: string; volumen_ml: number | null
  precio_minorista: number; precio_mayorista: number; iva_pct: number; activo: boolean
  es_pack: boolean
  moneda_default?: 'UYU' | 'USD' | null
}
interface Componente { presentacion_pack_id: number; presentacion_componente_id: number; unidades: number }
interface StockRow { id: number; tanque_id: number | null; presentacion_id: number; unidades: number; ubicacion_id: number }
interface Ubicacion { id: number; nombre: string; activo: boolean }
interface Venta {
  id: number; fecha: string; cliente_id: number | null; socio_id: string
  canal: string | null; estado: string; forma_pago: string | null
  con_factura: boolean; subtotal: number; descuento: number; iva: number; total: number
  envio: boolean; costo_envio: number; horario_entrega: string | null
  ubicacion_id: number
  entregado: boolean; cobrado: boolean
  notas: string | null; creado_en: string
}

const CANALES = ['whatsapp', 'directa', 'feria'] as const
const FORMAS_PAGO = ['efectivo', 'transferencia'] as const

// ---------- Página ----------

export function Ventas() {
  const { session, puede } = useAuth()
  const puedeEscribir = puede(['admin', 'ventas'])
  const [ventas, setVentas] = useState<Venta[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [socios, setSocios] = useState<Socio[]>([])
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [cargando, setCargando] = useState(true)
  const location = useLocation()
  const navigate = useNavigate()
  const abrirNueva = (location.state as { abrirNueva?: boolean } | null)?.abrirNueva === true
  const [nueva, setNuevaRaw] = useState(abrirNueva || leerFlag('dialog:nueva-venta'))
  const setNueva = (v: boolean) => { setNuevaRaw(v); guardarFlag('dialog:nueva-venta', v) }
  useEffect(() => {
    if (abrirNueva) {
      // Limpiar el state para que un refresh no re-abra el diálogo
      navigate(location.pathname, { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [ventaDetalleId, setVentaDetalleId] = useState<number | null>(null)
  const [ventaEnEdicion, setVentaEnEdicion] = useState<Venta | null>(null)
  const [cadeteAbierto, setCadeteAbierto] = useState(false)

  const [filtroSocio, setFiltroSocio] = useState<string>('todos')
  const [soloEnvio, setSoloEnvio] = useState(false)
  const [filtroDesde, setFiltroDesde] = useState<string>(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10)
  })
  const [filtroHasta, setFiltroHasta] = useState<string>('')

  async function cargar() {
    setCargando(true)
    const [v, c, s, u] = await Promise.all([
      supabase.from('ventas').select('*').order('fecha', { ascending: false }).order('id', { ascending: false }),
      supabase.from('clientes').select('*').order('nombre'),
      supabase.from('perfiles').select('id,nombre').eq('activo', true).order('nombre'),
      supabase.from('ubicaciones').select('id,nombre,activo').eq('activo', true).order('id'),
    ])
    setVentas((v.data as Venta[]) ?? [])
    setClientes((c.data as Cliente[]) ?? [])
    setSocios((s.data as Socio[]) ?? [])
    setUbicaciones((u.data as Ubicacion[]) ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const clientePorId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes])
  const socioPorId = useMemo(() => new Map(socios.map((s) => [s.id, s])), [socios])

  const filtradas = useMemo(() => {
    return ventas.filter((v) => {
      if (filtroSocio !== 'todos' && v.socio_id !== filtroSocio) return false
      if (filtroDesde && v.fecha < filtroDesde) return false
      if (filtroHasta && v.fecha > filtroHasta) return false
      if (soloEnvio && !v.envio) return false
      return true
    })
  }, [ventas, filtroSocio, filtroDesde, filtroHasta, soloEnvio])

  const totalPeriodo = useMemo(
    () => filtradas.reduce((s, v) => (v.estado === 'cancelado' ? s : s + Number(v.total ?? 0)), 0),
    [filtradas],
  )

  // Ventas pendientes de entrega o cobro (siempre visibles arriba, sin filtros)
  const pendientes = useMemo(
    () => ventas.filter((v) => v.estado !== 'cancelado' && (!v.entregado || !v.cobrado)),
    [ventas],
  )

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-oliva-900">Ventas</h1>
          <p className="text-sm text-oliva-700 mt-1">
            Cada venta descuenta stock automáticamente. El IVA se calcula solo si marcás <b>Con factura</b>.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-secondary" onClick={() => setCadeteAbierto(true)}>🛵 Lista para cadete</button>
          {puedeEscribir && (
            <button className="btn-primary" onClick={() => setNueva(true)}>+ Nueva venta</button>
          )}
        </div>
      </div>

      {/* Sección 1: Pendientes de entrega o cobro (siempre visible arriba, sin filtros) */}
      {pendientes.length > 0 && (
        <div className="card p-0 overflow-x-auto border-2 border-amber-300 bg-amber-50/40">
          <div className="px-4 pt-3 pb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-amber-800 font-semibold">
            ⏳ Pendientes de entrega o cobro <span className="text-amber-600">({pendientes.length})</span>
          </div>
          <TablaVentas
            ventas={pendientes}
            clientePorId={clientePorId}
            socioPorId={socioPorId}
            ubicaciones={ubicaciones}
            onClic={(v) => setVentaDetalleId(v.id)}
          />
        </div>
      )}
      {pendientes.length === 0 && (
        <div className="card p-3 text-sm text-oliva-700 text-center bg-oliva-50">
          ✅ Sin ventas pendientes de entrega ni cobro
        </div>
      )}

      {/* Sección 2: Histórico con filtros */}
      <div className="card p-3 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <div>
          <label className="label">Desde</label>
          <input type="date" className="input" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input type="date" className="input" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} />
        </div>
        <div>
          <label className="label">Socio</label>
          <select className="input" value={filtroSocio} onChange={(e) => setFiltroSocio(e.target.value)}>
            <option value="todos">Todos</option>
            {socios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-oliva-700 mt-2">
            <input type="checkbox" className="h-3 w-3 accent-oliva-700" checked={soloEnvio} onChange={(e) => setSoloEnvio(e.target.checked)} />
            🛵 solo con envío
          </label>
        </div>
        <div className="rounded-lg bg-oliva-100 border border-oliva-200 p-3 text-right">
          <div className="text-[11px] uppercase tracking-wide text-oliva-700">Total del período</div>
          <div className="text-lg font-semibold text-oliva-900 tabular-nums">{money(totalPeriodo)}</div>
          <div className="text-[11px] text-oliva-600">{filtradas.length} venta(s)</div>
        </div>
      </div>

      {cargando ? (
        <div className="card p-6 text-sm text-oliva-700">Cargando…</div>
      ) : filtradas.length === 0 ? (
        <div className="card p-6 text-sm text-oliva-700">Sin ventas en el período.</div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <TablaVentas
            ventas={filtradas}
            clientePorId={clientePorId}
            socioPorId={socioPorId}
            ubicaciones={ubicaciones}
            onClic={(v) => setVentaDetalleId(v.id)}
          />
        </div>
      )}

      <NuevaVentaDialog
        abierto={nueva || ventaEnEdicion !== null}
        socioId={session?.user.id ?? ''}
        clientes={clientes}
        socios={socios}
        ubicaciones={ubicaciones}
        ventaAEditar={ventaEnEdicion}
        onClienteCreado={(c) => setClientes((prev) => [...prev, c].sort((a, b) => a.nombre.localeCompare(b.nombre)))}
        onCerrar={() => { setNueva(false); setVentaEnEdicion(null) }}
        onOk={() => { setNueva(false); setVentaEnEdicion(null); cargar() }}
      />

      <VentaDetalleDialog
        venta={ventaDetalleId ? ventas.find((v) => v.id === ventaDetalleId) ?? null : null}
        clientes={clientes}
        socios={socios}
        ubicaciones={ubicaciones}
        puedeEditar={puedeEscribir}
        onEditarItems={(v) => { setVentaDetalleId(null); setVentaEnEdicion(v) }}
        onCerrar={() => setVentaDetalleId(null)}
        onCambio={() => { cargar() /* NO cierra: el detalle sigue abierto y se actualiza con la nueva venta */ }}
        onAnulada={() => { setVentaDetalleId(null); cargar() /* Anular sí cierra */ }}
      />

      <ListaCadeteDialog
        abierto={cadeteAbierto}
        ventas={ventas}
        clientes={clientes}
        desde={filtroDesde}
        hasta={filtroHasta}
        onCerrar={() => setCadeteAbierto(false)}
      />
    </div>
  )
}

// ---------- Tabla de ventas (reutilizada en Pendientes y Histórico) ----------
function TablaVentas({
  ventas, clientePorId, socioPorId, ubicaciones, onClic,
}: {
  ventas: Venta[]
  clientePorId: Map<number, Cliente>
  socioPorId: Map<string, Socio>
  ubicaciones: Ubicacion[]
  onClic: (v: Venta) => void
}) {
  return (
    <table className="w-full text-sm min-w-[860px]">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-oliva-600 border-b border-oliva-100 bg-oliva-50">
          <th className="py-2 px-4">Fecha</th>
          <th className="py-2 px-4">Cliente</th>
          <th className="py-2 px-4">Socio</th>
          <th className="py-2 px-4">📍</th>
          <th className="py-2 px-4">Canal</th>
          <th className="py-2 px-4 text-center">Entrega</th>
          <th className="py-2 px-4 text-center">Cobro</th>
          <th className="py-2 px-4">Factura</th>
          <th className="py-2 px-4 text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        {ventas.map((v) => (
          <tr
            key={v.id}
            className="border-b border-oliva-100/70 last:border-0 hover:bg-oliva-50/60 cursor-pointer"
            onClick={() => onClic(v)}
          >
            <td className="py-2 px-4 tabular-nums text-oliva-700">{v.fecha}</td>
            <td className="py-2 px-4 text-oliva-900">{clientePorId.get(v.cliente_id ?? 0)?.nombre ?? <span className="italic text-oliva-500">sin cliente</span>}</td>
            <td className="py-2 px-4 text-oliva-700 text-xs">{socioPorId.get(v.socio_id)?.nombre ?? '—'}</td>
            <td className="py-2 px-4 text-oliva-700 text-xs">{ubicaciones.find((u) => u.id === v.ubicacion_id)?.nombre?.slice(0, 3) ?? '—'}</td>
            <td className="py-2 px-4 text-oliva-700 text-xs">
              {v.canal ?? '—'}
              {v.envio && <span title="Envío por cadete" className="ml-1">🛵</span>}
            </td>
            {v.estado === 'cancelado' ? (
              <td colSpan={2} className="py-2 px-4 text-center">
                <span className="text-[11px] uppercase tracking-wide rounded-full px-2 py-[1px] bg-red-100 text-red-800">Anulada</span>
              </td>
            ) : (
              <>
                <td className="py-2 px-4 text-center">
                  <span className={`text-[11px] uppercase tracking-wide rounded-full px-2 py-[1px] ${v.entregado ? 'bg-oliva-200 text-oliva-900' : 'bg-amber-100 text-amber-800'}`}>
                    {v.entregado ? '🚚 entregado' : '⏳ pendiente'}
                  </span>
                </td>
                <td className="py-2 px-4 text-center">
                  <span className={`text-[11px] uppercase tracking-wide rounded-full px-2 py-[1px] ${v.cobrado ? 'bg-aceite-500/20 text-aceite-600' : 'bg-red-100 text-red-800'}`}>
                    {v.cobrado ? '💰 cobrado' : '⚠ sin cobrar'}
                  </span>
                </td>
              </>
            )}
            <td className="py-2 px-4 text-xs">{v.con_factura ? 'Sí' : '—'}</td>
            <td className="py-2 px-4 text-right tabular-nums font-medium text-oliva-900">{money(v.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---------- Diálogo Nueva venta ----------

interface Item {
  key: string
  presentacion_id: number | null
  stock_id: number | null
  unidades: number
  precio_unitario: number // siempre en UYU (calculado si moneda=USD)
  descuento_unitario: number
  moneda: 'UYU' | 'USD'
  precio_usd: number // solo si moneda=USD (input del usuario)
}

function nuevoItem(): Item {
  return { key: crypto.randomUUID(), presentacion_id: null, stock_id: null, unidades: 1, precio_unitario: 0, descuento_unitario: 0, moneda: 'UYU', precio_usd: 0 }
}

function ubicacionDefaultPorSocio(nombre: string | null | undefined): number {
  const n = (nombre ?? '').toLowerCase()
  if (n.includes('gonzalo')) return 2 // Maldonado
  if (n.includes('rodrigo') || n.includes('santi')) return 3 // Montevideo
  return 1 // Almazara (fallback)
}

// ---------- Borrador de nueva venta (persiste ante cambios de ventana / app en mobile) ----------
const BORRADOR_KEY = 'nueva-venta-borrador-v1'
const BORRADOR_TTL_MS = 24 * 60 * 60 * 1000 // 24 h

interface Borrador {
  ts: number
  fecha: string; clienteId: string; canal: string; formaPago: string; conFactura: boolean
  envio: boolean; costoEnvio: string; horarioEntrega: string
  direccionEnvio: string; telefonoEnvio: string
  ubicacionId: string; entregado: boolean; cobrado: boolean; notas: string
  items: Item[]
  monedaVenta?: 'UYU' | 'USD'
  cotizacionUsd?: string
}

function leerBorrador(): Borrador | null {
  try {
    const raw = localStorage.getItem(BORRADOR_KEY)
    if (!raw) return null
    const b = JSON.parse(raw) as Borrador
    if (!b?.ts || Date.now() - b.ts > BORRADOR_TTL_MS) { localStorage.removeItem(BORRADOR_KEY); return null }
    return b
  } catch { return null }
}
function guardarBorrador(b: Omit<Borrador, 'ts'>) {
  try { localStorage.setItem(BORRADOR_KEY, JSON.stringify({ ...b, ts: Date.now() })) } catch { /* nada */ }
}
function limpiarBorrador() { try { localStorage.removeItem(BORRADOR_KEY) } catch { /* nada */ } }

function NuevaVentaDialog({
  abierto, socioId, clientes, socios, ubicaciones, ventaAEditar, onClienteCreado, onCerrar, onOk,
}: {
  abierto: boolean
  socioId: string
  clientes: Cliente[]
  socios: Socio[]
  ubicaciones: Ubicacion[]
  /** Si viene, el diálogo abre en modo edición: precarga la venta y hace revertir+reaplicar al guardar. */
  ventaAEditar?: Venta | null
  onClienteCreado: (cliente: Cliente) => void
  onCerrar: () => void
  onOk: () => void
}) {
  const { perfil } = useAuth()
  const [nuevoClienteAbierto, setNuevoClienteAbierto] = useState(false)
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [clienteId, setClienteId] = useState<string>('')
  const [canal, setCanal] = useState<string>('directa')
  const [formaPago, setFormaPago] = useState<string>('efectivo')
  const [conFactura, setConFactura] = useState(false)
  const [envio, setEnvio] = useState(false)
  const [costoEnvio, setCostoEnvio] = useState<string>('190')
  const [horarioEntrega, setHorarioEntrega] = useState('')
  const [direccionEnvio, setDireccionEnvio] = useState('')
  const [telefonoEnvio, setTelefonoEnvio] = useState('')
  const [ubicacionId, setUbicacionId] = useState<string>('1')
  const [entregado, setEntregado] = useState(true)
  const [cobrado, setCobrado] = useState(true)
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<Item[]>([nuevoItem()])
  const [monedaVenta, setMonedaVenta] = useState<'UYU' | 'USD'>('UYU')
  const [cotizacionUsd, setCotizacionUsd] = useState<string>('') // pesos por 1 USD; obligatoria si venta USD

  const [productos, setProductos] = useState<Producto[]>([])
  const [presentaciones, setPresentaciones] = useState<Presentacion[]>([])
  const [stock, setStock] = useState<StockRow[]>([])
  const [componentes, setComponentes] = useState<Componente[]>([])
  const [datosCargados, setDatosCargados] = useState(false)

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    if (ventaAEditar) {
      setFecha(ventaAEditar.fecha)
      setClienteId(ventaAEditar.cliente_id ? String(ventaAEditar.cliente_id) : '')
      setCanal(ventaAEditar.canal ?? 'directa')
      setFormaPago(ventaAEditar.forma_pago ?? 'efectivo')
      setConFactura(ventaAEditar.con_factura)
      setEnvio(ventaAEditar.envio)
      setCostoEnvio(String(ventaAEditar.costo_envio ?? '190'))
      setHorarioEntrega(ventaAEditar.horario_entrega ?? '')
      setDireccionEnvio(''); setTelefonoEnvio('') // se recargan del cliente al elegirlo
      setUbicacionId(String(ventaAEditar.ubicacion_id ?? 1))
      setEntregado(ventaAEditar.entregado)
      setCobrado(ventaAEditar.cobrado)
      setNotas(ventaAEditar.notas ?? '')
    } else {
      // Intentar cargar borrador de localStorage (últimas 24h)
      const b = leerBorrador()
      if (b) {
        setFecha(b.fecha); setClienteId(b.clienteId); setCanal(b.canal); setFormaPago(b.formaPago)
        setConFactura(b.conFactura); setEnvio(b.envio); setCostoEnvio(b.costoEnvio); setHorarioEntrega(b.horarioEntrega)
        setDireccionEnvio(b.direccionEnvio); setTelefonoEnvio(b.telefonoEnvio)
        setUbicacionId(b.ubicacionId); setEntregado(b.entregado); setCobrado(b.cobrado); setNotas(b.notas)
        setItems(b.items && b.items.length > 0 ? b.items : [nuevoItem()])
        setMonedaVenta(b.monedaVenta ?? 'UYU')
        setCotizacionUsd(b.cotizacionUsd ?? '')
      } else {
        setFecha(new Date().toISOString().slice(0, 10))
        setClienteId(''); setCanal('whatsapp'); setFormaPago('efectivo'); setConFactura(false)
        setEnvio(false); setCostoEnvio('190'); setHorarioEntrega('')
        setDireccionEnvio(''); setTelefonoEnvio('')
        setUbicacionId(String(ubicacionDefaultPorSocio(perfil?.nombre)))
        setEntregado(false); setCobrado(false); setNotas(''); setItems([nuevoItem()])
        setMonedaVenta('UYU'); setCotizacionUsd('')
      }
    }
    setError(null)

    setDatosCargados(false)
    Promise.all([
      supabase.from('productos').select('id,nombre,categoria'),
      supabase.from('presentaciones').select('id,producto_id,nombre,volumen_ml,precio_minorista,precio_mayorista,iva_pct,activo,es_pack,moneda_default').eq('activo', true),
      supabase.from('stock').select('id,tanque_id,presentacion_id,unidades,ubicacion_id').gt('unidades', 0),
      supabase.from('presentacion_componente').select('*'),
      ventaAEditar
        ? supabase.from('items_venta').select('*').eq('venta_id', ventaAEditar.id).order('id')
        : Promise.resolve({ data: [] as ItemVenta[] }),
    ]).then(([p, pr, s, c, iv]) => {
      setProductos((p.data as Producto[]) ?? [])
      setPresentaciones((pr.data as Presentacion[]) ?? [])
      setStock((s.data as StockRow[]) ?? [])
      setComponentes((c.data as Componente[]) ?? [])
      if (ventaAEditar) {
        const itemsExist = ((iv.data as ItemVenta[] | null) ?? []).map((it) => ({
          key: crypto.randomUUID(),
          presentacion_id: it.presentacion_id,
          stock_id: it.stock_id,
          unidades: Number(it.unidades),
          precio_unitario: Number(it.precio_unitario),
          descuento_unitario: Number(it.descuento_unitario),
        } as Item))
        setItems(itemsExist.length > 0 ? itemsExist : [nuevoItem()])
      }
      setDatosCargados(true)
    })
  }, [abierto])

  const cliente = clientes.find((c) => c.id === Number(clienteId))
  const esMayorista = cliente?.tipo === 'mayorista'

  // Al cambiar el cliente, precarga la dirección y teléfono en los campos de envío
  useEffect(() => {
    if (!cliente) { setDireccionEnvio(''); setTelefonoEnvio(''); return }
    setDireccionEnvio(cliente.direccion ?? '')
    setTelefonoEnvio(cliente.whatsapp ?? cliente.telefono ?? '')
  }, [clienteId])
  const presPorId = useMemo(() => new Map(presentaciones.map((p) => [p.id, p])), [presentaciones])
  const stockPorId = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock])
  const prodPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos])

  // Al cambiar tipo cliente, re-defaultea precios de items que están en su precio de lista
  useEffect(() => {
    setItems((prev) => prev.map((it) => {
      if (!it.presentacion_id) return it
      const p = presPorId.get(it.presentacion_id)
      if (!p) return it
      // Solo re-defaulta si el precio actual coincide con alguno de los precios de lista
      const min = Number(p.precio_minorista), may = Number(p.precio_mayorista)
      if (it.precio_unitario === min || it.precio_unitario === may) {
        return { ...it, precio_unitario: esMayorista && may ? may : min }
      }
      return it
    }))
  }, [esMayorista, presPorId])

  // Al cambiar de ubicación, resetear stock_id de todos los ítems (son de otra ubicación)
  useEffect(() => {
    setItems((prev) => prev.map((it) => ({ ...it, stock_id: null })))
  }, [ubicacionId])

  // Al marcar envío por cadete: por default queda como pendiente de entrega y de cobro
  // (típicamente se entrega y cobra al día siguiente). Se puede corregir a mano igual.
  useEffect(() => {
    if (envio) { setEntregado(false); setCobrado(false) }
  }, [envio])

  function actualizarItem(key: string, patch: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }
  function borrarItem(key: string) {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((it) => it.key !== key)))
  }
  function elegirPresentacion(key: string, presId: number | null) {
    if (!presId) return actualizarItem(key, { presentacion_id: null, stock_id: null, precio_unitario: 0, precio_usd: 0 })
    const p = presPorId.get(presId)
    const prod = p ? prodPorId.get(p.producto_id) : undefined
    const esServicio = prod?.categoria === 'servicio'
    const precioCatalogo = p ? (esMayorista && Number(p.precio_mayorista) ? Number(p.precio_mayorista) : Number(p.precio_minorista)) : 0
    const monedaDefaultProd: 'UYU' | 'USD' = p?.moneda_default === 'USD' ? 'USD' : 'UYU'
    const cot = Number(cotizacionUsd) || 0

    // Convertir precio del catálogo a la moneda de la VENTA
    let precioUyu = 0
    let precioUsdVal = 0
    if (monedaVenta === 'UYU') {
      // Precio final en pesos
      precioUyu = monedaDefaultProd === 'USD' ? precioCatalogo * cot : precioCatalogo
      precioUsdVal = 0
    } else {
      // Venta en USD: precio_usd es lo que ve el usuario; precio_unitario en pesos usando cot
      precioUsdVal = monedaDefaultProd === 'USD' ? precioCatalogo : (cot > 0 ? precioCatalogo / cot : 0)
      precioUyu = precioUsdVal * cot
    }

    const esUltimoItem = items.length > 0 && items[items.length - 1].key === key
    let stockElegidoId: number | null = null
    if (!p?.es_pack && !esServicio) {
      const stocksPres = stock
        .filter((s) => s.presentacion_id === presId && s.ubicacion_id === Number(ubicacionId))
        .sort((a, b) => a.id - b.id)
      stockElegidoId = stocksPres[0]?.id ?? null
    }
    actualizarItem(key, {
      presentacion_id: presId,
      stock_id: stockElegidoId,
      precio_unitario: precioUyu,
      precio_usd: precioUsdVal,
      moneda: monedaVenta,
    })
    if (esUltimoItem) setItems((prev) => [...prev, nuevoItem()])
  }

  // Cálculos (en la moneda de la venta para mostrar; en pesos para persistir)
  const cotVenta = Number(cotizacionUsd) || 0
  const filas = items.map((it) => {
    const p = it.presentacion_id ? presPorId.get(it.presentacion_id) : undefined
    const st = it.stock_id ? stockPorId.get(it.stock_id) : undefined
    const disponible = st?.unidades ?? 0
    const precioEnMonedaVenta = monedaVenta === 'USD' ? Number(it.precio_usd) : Number(it.precio_unitario)
    const subtotal = Math.max(0, (precioEnMonedaVenta - Number(it.descuento_unitario)) * Number(it.unidades))
    const ivaLinea = conFactura && p ? subtotal * (Number(p.iva_pct) / 100) : 0
    return { it, p, st, disponible, subtotal, ivaLinea }
  })
  const subtotal = filas.reduce((s, f) => s + (f.it.presentacion_id ? f.subtotal : 0), 0)
  const iva = filas.reduce((s, f) => s + (f.it.presentacion_id ? f.ivaLinea : 0), 0)
  // costoEnvio se ingresa en pesos siempre; si venta es USD, se muestra convertido
  const cEnvioUyu = envio ? (Number(costoEnvio) || 0) : 0
  const cEnvio = monedaVenta === 'USD' && cotVenta > 0 ? cEnvioUyu / cotVenta : cEnvioUyu
  const total = subtotal + iva + cEnvio

async function guardar(e: React.FormEvent) {
    e.preventDefault()

    // Ignoramos ítems vacíos (líneas sin presentación que quedan al final por auto-add)
    const filasValidas = filas.filter((f) => f.it.presentacion_id)
    if (filasValidas.length === 0) { setError('Agregá al menos un ítem.'); return }
    if (envio && !clienteId) {
      setError('Para envío por cadete es necesario seleccionar un cliente (o crearlo con "+ nuevo cliente"). Así queda registrada la dirección/teléfono para el cadete y para próximas ventas.')
      return
    }
    if (envio && !direccionEnvio.trim()) {
      setError('Ingresá una dirección de entrega para el envío.')
      return
    }
    // Validar cotización si la venta es en USD
    const cot = Number(cotizacionUsd) || 0
    if (monedaVenta === 'USD' && cot <= 0) { setError('Ingresá la cotización del USD (pesos por 1 USD) para registrar la venta en dólares.'); return }

    // Preacumular stock necesitado por presentación (para validar packs contra sus componentes)
    const necesidad = new Map<number, number>()
    for (const f of filasValidas) {
      if (!f.it.presentacion_id) { setError('Todos los ítems necesitan una presentación.'); return }
      if (f.it.unidades <= 0) { setError('Las unidades deben ser mayores a 0.'); return }
      const prodF = f.p ? prodPorId.get(f.p.producto_id) : undefined
      const esServicio = prodF?.categoria === 'servicio'
      if (esServicio) {
        // no descuenta stock
        continue
      }
      if (f.p?.es_pack) {
        const comps = componentes.filter((c) => c.presentacion_pack_id === f.it.presentacion_id)
        if (comps.length === 0) { setError(`El pack "${f.p?.nombre}" no tiene componentes definidos.`); return }
        for (const c of comps) {
          necesidad.set(c.presentacion_componente_id, (necesidad.get(c.presentacion_componente_id) ?? 0) + c.unidades * f.it.unidades)
        }
      } else {
        if (!f.it.stock_id) { setError('Todos los ítems necesitan un stock disponible.'); return }
        if (f.it.unidades > f.disponible) {
          setError(`No hay stock suficiente para "${f.p?.nombre ?? ''}": pedís ${f.it.unidades}, disponibles ${f.disponible}.`)
          return
        }
        necesidad.set(f.it.presentacion_id, (necesidad.get(f.it.presentacion_id) ?? 0) + f.it.unidades)
      }
    }
    // Chequear que la suma de necesidad por presentación no supere el stock de la ubicación
    for (const [presId, need] of necesidad) {
      const totalDisp = stock
        .filter((s) => s.presentacion_id === presId && s.ubicacion_id === Number(ubicacionId))
        .reduce((a, b) => a + b.unidades, 0)
      if (need > totalDisp) {
        const p = presPorId.get(presId)
        const prod = p ? prodPorId.get(p.producto_id) : null
        const ubicNombre = ubicaciones.find((u) => u.id === Number(ubicacionId))?.nombre ?? ''
        setError(`Stock insuficiente para ${prod?.nombre ?? ''} ${p?.nombre ?? ''} en ${ubicNombre}: se necesitan ${need} u pero hay ${totalDisp} u.`)
        return
      }
    }

    setGuardando(true); setError(null)

    // 0) Actualizar la ficha del cliente si corresponde:
    //    - auto-asignar socio (si el cliente no tenía socio, queda del vendedor que carga la venta)
    //    - si es envío, guardar direccion/telefono nuevos
    if (cliente) {
      const patch: Record<string, unknown> = {}
      if (!cliente.socio_asignado) patch.socio_asignado = socioId
      if (envio) {
        const dirNueva = direccionEnvio.trim()
        const telNuevo = telefonoEnvio.trim()
        if (dirNueva && dirNueva !== (cliente.direccion ?? '')) patch.direccion = dirNueva
        if (telNuevo && telNuevo !== (cliente.whatsapp ?? '') && telNuevo !== (cliente.telefono ?? '')) {
          if (!cliente.whatsapp) patch.whatsapp = telNuevo
          else if (!cliente.telefono) patch.telefono = telNuevo
          else patch.whatsapp = telNuevo
        }
      }
      if (Object.keys(patch).length > 0) {
        patch.actualizado_en = new Date().toISOString()
        const { error: eC, data: cActualizado } = await supabase.from('clientes')
          .update(patch).eq('id', cliente.id).select('*').single()
        if (eC) { setError('Error actualizando cliente: ' + eC.message); setGuardando(false); return }
        if (cActualizado) onClienteCreado(cActualizado as Cliente)
      }
    }

    // 1) Insert venta O update si es edición
    // estado se sincroniza con los booleans para mantener compat con datos viejos
    const estadoSync = cobrado ? 'cobrado' : (entregado ? 'entregado' : 'pendiente')
    // Totales SIEMPRE se persisten en pesos (para que Dashboard/Contabilidad no rompan).
    // Si la venta es USD, convertimos con la cotización.
    const factorAUyu = monedaVenta === 'USD' ? cotVenta : 1
    const subtotalUyu = subtotal * factorAUyu
    const ivaUyu = iva * factorAUyu
    const totalUyu = total * factorAUyu
    const cabecera = {
      fecha,
      cliente_id: clienteId ? Number(clienteId) : null,
      socio_id: socioId,
      canal, estado: estadoSync, forma_pago: formaPago,
      con_factura: conFactura,
      envio, costo_envio: cEnvioUyu, // envío siempre se ingresa en pesos
      horario_entrega: envio ? (horarioEntrega.trim() || null) : null,
      ubicacion_id: Number(ubicacionId),
      entregado, cobrado,
      subtotal: subtotalUyu, descuento: 0, iva: ivaUyu, total: totalUyu,
      notas: notas.trim() || null,
      moneda: monedaVenta,
      cotizacion: monedaVenta === 'USD' ? cotVenta : null,
    }

    let ventaId: number
    if (ventaAEditar) {
      // Edición: revertir movs_stock previos, borrar items viejos, actualizar cabecera
      const { data: { user } } = await supabase.auth.getUser()
      const { data: movsPrev } = await supabase.from('movimientos_stock').select('*').eq('venta_id', ventaAEditar.id)
      for (const m of (movsPrev ?? [])) {
        const { data: s } = await supabase.from('stock').select('unidades').eq('id', m.stock_id).maybeSingle()
        if (!s) continue
        await supabase.from('stock').update({ unidades: Number(s.unidades) - Number(m.unidades), actualizado_en: new Date().toISOString() }).eq('id', m.stock_id)
        await supabase.from('movimientos_stock').insert({
          stock_id: m.stock_id, tipo: 'devolucion', unidades: -Number(m.unidades),
          venta_id: ventaAEditar.id, usuario_id: user?.id ?? null,
          nota: `Reversion por edicion de venta #${ventaAEditar.id}`,
        })
      }
      await supabase.from('items_venta').delete().eq('venta_id', ventaAEditar.id)
      const { error: eU } = await supabase.from('ventas').update(cabecera).eq('id', ventaAEditar.id)
      if (eU) { setError('Error actualizando venta: ' + eU.message); setGuardando(false); return }
      ventaId = ventaAEditar.id
    } else {
      const { data: venta, error: eV } = await supabase.from('ventas').insert(cabecera).select('id').single()
      if (eV || !venta) { setError(eV?.message ?? 'Error creando venta'); setGuardando(false); return }
      ventaId = venta.id
    }

    // 2) Insert items (el trigger descuenta stock; para packs, componentes vía trigger)
    const payloadItems = filasValidas.map((f) => {
      const prodF = f.p ? prodPorId.get(f.p.producto_id) : undefined
      const esServicio = prodF?.categoria === 'servicio'
      const sinStock = f.p?.es_pack || esServicio
      // precio_unitario y subtotal SIEMPRE en pesos para BD
      const precioUyu = monedaVenta === 'USD' ? Number(f.it.precio_usd) * cot : Number(f.it.precio_unitario)
      const subtotalUyu = monedaVenta === 'USD' ? Number(f.subtotal) * cot : Number(f.subtotal)
      return {
        venta_id: ventaId,
        stock_id: sinStock ? null : f.it.stock_id,
        presentacion_id: f.it.presentacion_id!,
        unidades: Number(f.it.unidades),
        precio_unitario: precioUyu,
        descuento_unitario: Number(f.it.descuento_unitario),
        subtotal: subtotalUyu,
        moneda: monedaVenta,
        precio_usd: monedaVenta === 'USD' ? Number(f.it.precio_usd) : null,
        cotizacion: monedaVenta === 'USD' ? cot : null,
      }
    })
    const { error: eI } = await supabase.from('items_venta').insert(payloadItems)
    if (eI) {
      if (!ventaAEditar) {
        // Rollback manual: borrar la venta creada
        await supabase.from('ventas').delete().eq('id', ventaId)
      }
      setError('Error cargando ítems: ' + eI.message)
      setGuardando(false); return
    }

    setGuardando(false)
    if (!ventaAEditar) limpiarBorrador()
    onOk()
  }

  // Si el usuario cambia la ubicación a Maldonado, forzar envio=false (Maldonado no usa cadete)
  useEffect(() => {
    if (Number(ubicacionId) === 2 && envio) setEnvio(false)
  }, [ubicacionId, envio])

  // Guardar borrador con cada cambio (solo si es nueva venta, no edición)
  useEffect(() => {
    if (!abierto || ventaAEditar) return
    guardarBorrador({
      fecha, clienteId, canal, formaPago, conFactura,
      envio, costoEnvio, horarioEntrega, direccionEnvio, telefonoEnvio,
      ubicacionId, entregado, cobrado, notas, items,
      monedaVenta, cotizacionUsd,
    })
  }, [abierto, ventaAEditar, fecha, clienteId, canal, formaPago, conFactura, envio, costoEnvio, horarioEntrega, direccionEnvio, telefonoEnvio, ubicacionId, entregado, cobrado, notas, items, monedaVenta, cotizacionUsd])

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo={ventaAEditar ? `Editar venta #${ventaAEditar.id}` : 'Nueva venta'} ancho="lg">
      <form onSubmit={guardar} className="space-y-4">
        {/* Cabecera */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-3 rounded-lg bg-oliva-100/60 border border-oliva-200 p-3">
            <label className="label">📍 Ubicación desde donde se despacha</label>
            <select className="input" value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)}>
              {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
            <p className="text-[11px] text-oliva-700 mt-1">
              El stock se descuenta de esta ubicación. Se propone <b>{ubicaciones.find((u) => u.id === ubicacionDefaultPorSocio(perfil?.nombre))?.nombre}</b> según el socio logueado.
            </p>
          </div>
          <div>
            <label className="label">Fecha</label>
            <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </div>
          <div className="sm:col-span-2">
            <label className="label flex items-center justify-between">
              <span>Cliente {esMayorista && <span className="text-aceite-600">· mayorista</span>}</span>
            </label>
            <ClienteCombo
              clientes={clientes}
              clienteId={clienteId}
              onCambiar={setClienteId}
              onNuevo={() => setNuevoClienteAbierto(true)}
            />
          </div>
          <div>
            <label className="label">Canal</label>
            <select className="input" value={canal} onChange={(e) => setCanal(e.target.value)}>
              {!CANALES.includes(canal as typeof CANALES[number]) && canal && (
                <option value={canal}>{canal}</option>
              )}
              {CANALES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Forma de pago</label>
            <select className="input" value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
              {FORMAS_PAGO.map((f) => <option key={f} value={f}>{f.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Moneda</label>
            <div className="flex rounded-md border border-oliva-200 overflow-hidden text-sm font-semibold">
              <button
                type="button"
                className={`flex-1 py-2 ${monedaVenta === 'UYU' ? 'bg-oliva-800 text-oliva-50' : 'bg-white text-oliva-700 hover:bg-oliva-100'}`}
                onClick={() => {
                  if (monedaVenta === 'UYU') return
                  setMonedaVenta('UYU')
                  const cot = Number(cotizacionUsd) || 0
                  setItems((prev) => prev.map((it) => it.presentacion_id ? { ...it, moneda: 'UYU', precio_unitario: (Number(it.precio_usd) || 0) * cot || Number(it.precio_unitario) || 0, precio_usd: 0 } : it))
                }}
              >$ UYU</button>
              <button
                type="button"
                className={`flex-1 py-2 ${monedaVenta === 'USD' ? 'bg-oliva-800 text-oliva-50' : 'bg-white text-oliva-700 hover:bg-oliva-100'}`}
                onClick={() => {
                  if (monedaVenta === 'USD') return
                  setMonedaVenta('USD')
                  const cot = Number(cotizacionUsd) || 0
                  setItems((prev) => prev.map((it) => {
                    if (!it.presentacion_id) return { ...it, moneda: 'USD' }
                    const usd = cot > 0 ? Number(it.precio_unitario) / cot : Number(it.precio_usd) || 0
                    return { ...it, moneda: 'USD', precio_usd: Number(usd.toFixed(2)), precio_unitario: usd * cot }
                  }))
                }}
              >U$S</button>
            </div>
          </div>
          {monedaVenta === 'USD' && (
            <div>
              <label className="label">Cotización U$S ($/USD)</label>
              <input
                className="input tabular-nums"
                type="number" min="0" step="0.01"
                placeholder="ej: 40.5"
                value={cotizacionUsd}
                onChange={(e) => {
                  const val = e.target.value
                  setCotizacionUsd(val)
                  const cot = Number(val) || 0
                  setItems((prev) => prev.map((it) => it.moneda === 'USD' ? { ...it, precio_unitario: (Number(it.precio_usd) || 0) * cot } : it))
                }}
              />
            </div>
          )}
          <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-oliva-100 bg-oliva-50/60 p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={entregado} onChange={(e) => setEntregado(e.target.checked)} className="h-4 w-4 accent-oliva-700" />
              <span className="text-sm text-oliva-800">🚚 Ya entregado</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={cobrado} onChange={(e) => setCobrado(e.target.checked)} className="h-4 w-4 accent-oliva-700" />
              <span className="text-sm text-oliva-800">💰 Ya cobrado</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input id="cf" type="checkbox" checked={conFactura} onChange={(e) => setConFactura(e.target.checked)} className="h-4 w-4 accent-oliva-700" />
              <span className="text-sm text-oliva-800">🧾 Con factura <span className="text-xs text-oliva-600">(agrega 10% IVA)</span></span>
            </label>
          </div>

          {Number(ubicacionId) !== 2 && (
          <div className="sm:col-span-3 rounded-xl border border-oliva-100 bg-oliva-50/60 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input id="env" type="checkbox" checked={envio} onChange={(e) => setEnvio(e.target.checked)} className="h-4 w-4 accent-oliva-700" />
              <label htmlFor="env" className="text-sm text-oliva-800">🛵 Envío por cadete</label>
            </div>
            {envio && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Costo del envío</label>
                  <input className="input tabular-nums" type="number" min="0" step="1" value={costoEnvio} onChange={(e) => setCostoEnvio(e.target.value)} />
                  <p className="text-[11px] text-oliva-600 mt-1">Se le cobra al cliente. No entra en el IVA/factura.</p>
                </div>
                <div>
                  <label className="label">Se suma al total</label>
                  <div className="input tabular-nums">{money(Number(costoEnvio) || 0)}</div>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">📍 Dirección de entrega</label>
                  <input className="input" value={direccionEnvio} onChange={(e) => setDireccionEnvio(e.target.value)} placeholder="calle y número, apartamento, referencia…" />
                </div>
                <div>
                  <label className="label">📞 Teléfono / WhatsApp</label>
                  <input className="input" value={telefonoEnvio} onChange={(e) => setTelefonoEnvio(e.target.value)} placeholder="ej: 099 123 456" />
                </div>
                <div>
                  <label className="label">🕐 Horario de entrega (opcional)</label>
                  <input className="input" value={horarioEntrega} onChange={(e) => setHorarioEntrega(e.target.value)} placeholder="ej: después de las 18h" />
                </div>
                {cliente && (
                  <p className="sm:col-span-2 text-[11px] text-oliva-600">
                    Los datos de dirección y teléfono se guardan también en la ficha de <b>{cliente.nombre}</b> para las próximas ventas.
                  </p>
                )}
                {!cliente && (
                  <p className="sm:col-span-2 text-[11px] text-red-700">
                    ⚠ Sin cliente seleccionado, la dirección y teléfono solo quedan registrados en esta venta (para el mensaje al cadete). Recomendado: usar <b>+ nuevo cliente</b> arriba así queda registrado para futuras ventas.
                  </p>
                )}
              </div>
            )}
          </div>
          )}
        </div>

        {/* Ítems */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-oliva-800">Ítems</div>
            <button type="button" className="text-xs text-oliva-700 underline" onClick={() => setItems((p) => [...p, nuevoItem()])}>+ Agregar ítem</button>
          </div>

          {!datosCargados ? (
            <div className="card p-4 text-sm text-oliva-700">Cargando catálogo…</div>
          ) : (
            <div className="space-y-3">
              {filas.map((f) => {
                return (
                  <div key={f.it.key} className="rounded-xl border border-oliva-100 p-3 bg-oliva-50/60 space-y-3">
                    <div>
                      <label className="label">Presentación</label>
                      <select
                        className="input"
                        value={f.it.presentacion_id ?? ''}
                        onChange={(e) => elegirPresentacion(f.it.key, e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">— elegir —</option>
                        {presentaciones.map((p) => {
                          const prod = prodPorId.get(p.producto_id)
                          if (prod?.categoria === 'envases_vacios') return null
                          const esServicio = prod?.categoria === 'servicio'
                          const stockEnUbic = (p.es_pack || esServicio) ? 0 : stock
                            .filter((s) => s.presentacion_id === p.id && s.ubicacion_id === Number(ubicacionId))
                            .reduce((a, b) => a + b.unidades, 0)
                          const hayStock = p.es_pack || esServicio ? true : stockEnUbic > 0
                          const sufijo = p.es_pack
                            ? ' · pack'
                            : esServicio
                              ? ' · servicio'
                              : !hayStock ? ' · SIN STOCK AQUÍ' : ` · ${stockEnUbic} u`
                          return (
                            <option key={p.id} value={p.id} disabled={!hayStock}>
                              {prod?.nombre} · {p.nombre}{sufijo}
                            </option>
                          )
                        })}
                      </select>
                      {(() => {
                        const prodF = f.p ? prodPorId.get(f.p.producto_id) : undefined
                        const esServicio = prodF?.categoria === 'servicio'
                        if (!f.it.presentacion_id) return null
                        if (f.p?.es_pack || esServicio) return null
                        if (f.it.stock_id) return null
                        return <p className="text-xs text-red-700 mt-1">Sin stock envasado en esta ubicación. Ir a Stock → Envasar o Ajuste envasado.</p>
                      })()}
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="label">Unidades</label>
                        <input
                          className="input"
                          type="number" min="1" step="1"
                          value={f.it.unidades}
                          onChange={(e) => actualizarItem(f.it.key, { unidades: Number(e.target.value) || 0 })}
                        />
                        {f.it.stock_id && (
                          <p className={`text-[11px] mt-1 ${f.it.unidades > f.disponible ? 'text-red-700' : 'text-oliva-600'}`}>
                            disp: {f.disponible}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="label">Precio u. {monedaVenta === 'USD' ? '(U$S)' : ''}</label>
                        {monedaVenta === 'USD' ? (
                          <input
                            className="input tabular-nums"
                            type="number" min="0" step="0.01"
                            value={f.it.precio_usd}
                            onChange={(e) => {
                              const usd = Number(e.target.value) || 0
                              const cot = Number(cotizacionUsd) || 0
                              actualizarItem(f.it.key, { precio_usd: usd, precio_unitario: usd * cot })
                            }}
                          />
                        ) : (
                          <input
                            className="input tabular-nums"
                            type="number" min="0" step="1"
                            value={f.it.precio_unitario}
                            onChange={(e) => actualizarItem(f.it.key, { precio_unitario: Number(e.target.value) || 0 })}
                          />
                        )}
                      </div>
                      <div>
                        <label className="label">Desc. u.</label>
                        <input
                          className="input tabular-nums"
                          type="number" min="0" step="1"
                          value={f.it.descuento_unitario}
                          onChange={(e) => actualizarItem(f.it.key, { descuento_unitario: Number(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="hidden sm:block">
                        <label className="label">Subtotal</label>
                        <div className="input tabular-nums text-right">{money(f.subtotal, monedaVenta)}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:hidden">
                      <div className="text-sm">Subtotal: <b className="tabular-nums">{money(f.subtotal, monedaVenta)}</b></div>
                      <button type="button" className="text-xs text-red-700 underline" onClick={() => borrarItem(f.it.key)}>Quitar</button>
                    </div>
                    <div className="hidden sm:flex justify-end">
                      <button type="button" className="text-xs text-red-700 underline" onClick={() => borrarItem(f.it.key)}>Quitar ítem</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Totales */}
        <div className="card p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-oliva-600">Subtotal</div>
            <div className="tabular-nums font-medium text-oliva-900">{money(subtotal, monedaVenta)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-oliva-600">IVA</div>
            <div className="tabular-nums font-medium text-oliva-900">{conFactura ? money(iva, monedaVenta) : <span className="text-oliva-400">—</span>}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-oliva-600">Envío</div>
            <div className="tabular-nums font-medium text-oliva-900">{envio ? money(cEnvio, monedaVenta) : <span className="text-oliva-400">—</span>}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-oliva-600">Total</div>
            <div className="tabular-nums font-semibold text-oliva-900 text-lg">{money(total, monedaVenta)}</div>
            {monedaVenta === 'USD' && cotVenta > 0 && (
              <div className="text-[11px] text-oliva-500 mt-1">≈ {money(total * cotVenta)} · cot {cotVenta}</div>
            )}
          </div>
        </div>

        <div>
          <label className="label">Notas</label>
          <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>

        {error && <div className="text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={() => {
            const hayContenido = items.some((it) => it.presentacion_id) || !!clienteId || !!notas.trim()
            if (hayContenido && !confirm('¿Descartar esta venta? Se perderán los datos cargados.')) return
            limpiarBorrador()
            onCerrar()
          }}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={guardando || !datosCargados}>{guardando ? 'Guardando…' : 'Guardar venta'}</button>
        </div>
      </form>

      <ClienteDialog
        abierto={nuevoClienteAbierto}
        socios={socios}
        modo="rapido"
        defaultSocioAsignado={socioId}
        onCerrar={() => setNuevoClienteAbierto(false)}
        onOk={(c) => {
          onClienteCreado(c)
          setClienteId(String(c.id))
          setNuevoClienteAbierto(false)
        }}
      />
    </Dialog>
  )
}

// ---------- Diálogo Detalle / edición de venta existente ----------

interface ItemVenta {
  id: number
  venta_id: number
  stock_id: number | null
  presentacion_id: number
  unidades: number
  precio_unitario: number
  descuento_unitario: number
  subtotal: number
}

interface PresentacionInfo { id: number; nombre: string; producto_id: number; es_pack: boolean }
interface ProdInfo { id: number; nombre: string }

function VentaDetalleDialog({
  venta, clientes, socios, ubicaciones, puedeEditar, onEditarItems, onCerrar, onCambio, onAnulada,
}: {
  venta: Venta | null
  clientes: Cliente[]
  socios: Socio[]
  ubicaciones: Ubicacion[]
  puedeEditar: boolean
  onEditarItems: (v: Venta) => void
  onCerrar: () => void
  onCambio: () => void
  onAnulada: () => void
}) {
  const [items, setItems] = useState<ItemVenta[]>([])
  const [presMap, setPresMap] = useState<Map<number, PresentacionInfo>>(new Map())
  const [prodMap, setProdMap] = useState<Map<number, ProdInfo>>(new Map())
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmAnular, setConfirmAnular] = useState(false)

  // Campos editables (cabecera)
  const [clienteId, setClienteId] = useState<string>('')
  const [canal, setCanal] = useState('')
  const [formaPago, setFormaPago] = useState('')
  const [entregado, setEntregado] = useState(false)
  const [cobrado, setCobrado] = useState(false)
  const [notas, setNotas] = useState('')
  const [horarioEntrega, setHorarioEntrega] = useState('')

  useEffect(() => {
    if (!venta) return
    setClienteId(venta.cliente_id ? String(venta.cliente_id) : '')
    setCanal(venta.canal ?? 'directa')
    setFormaPago(venta.forma_pago ?? 'efectivo')
    setEntregado(venta.entregado)
    setCobrado(venta.cobrado)
    setNotas(venta.notas ?? '')
    setHorarioEntrega(venta.horario_entrega ?? '')
    setError(null); setConfirmAnular(false)

    setCargando(true)
    Promise.all([
      supabase.from('items_venta').select('*').eq('venta_id', venta.id).order('id'),
      supabase.from('presentaciones').select('id,nombre,producto_id,es_pack'),
      supabase.from('productos').select('id,nombre,categoria'),
    ]).then(([i, p, pr]) => {
      setItems((i.data as ItemVenta[]) ?? [])
      setPresMap(new Map(((p.data as PresentacionInfo[]) ?? []).map((x) => [x.id, x])))
      setProdMap(new Map(((pr.data as ProdInfo[]) ?? []).map((x) => [x.id, x])))
      setCargando(false)
    })
  }, [venta])

  if (!venta) return null

  const anulada = venta.estado === 'cancelado'
  const socio = socios.find((s) => s.id === venta.socio_id)
  const clienteActual = venta.cliente_id ? clientes.find((c) => c.id === venta.cliente_id) : null
  const clienteWA = normalizarTelWA(clienteActual?.whatsapp ?? clienteActual?.telefono ?? null)

  function armarMensajeCliente(): string {
    const items_str = items.map((it) => {
      const p = presMap.get(it.presentacion_id)
      const prod = p ? prodMap.get(p.producto_id) : null
      return `• ${it.unidades}× ${prod?.nombre ?? ''} ${p?.nombre ?? ''}`.trim()
    }).join('\n')
    const partes: string[] = []
    partes.push(`Hola ${clienteActual?.nombre?.split(' ')[0] ?? ''}!`)
    partes.push('Gracias por tu compra en Sierras de Aiguá 🫒')
    partes.push('')
    partes.push(`*Pedido #${venta!.id}* · ${venta!.fecha}`)
    partes.push(items_str)
    if (venta!.envio) partes.push(`🛵 Envío: ${money(venta!.costo_envio)}`)
    if (venta!.con_factura) partes.push(`IVA (10%): ${money(venta!.iva)}`)
    partes.push(`*Total: ${money(venta!.total)}*`)
    if (venta!.horario_entrega) partes.push(`🕐 ${venta!.horario_entrega}`)
    partes.push('')
    partes.push('Cualquier duda avisanos 🙌')
    partes.push('_Sierras de Aiguá · Producción familiar_')
    return partes.join('\n')
  }

  function enviarReciboWA() {
    const texto = encodeURIComponent(armarMensajeCliente())
    const url = clienteWA ? `https://wa.me/${clienteWA}?text=${texto}` : `https://wa.me/?text=${texto}`
    window.open(url, '_blank')
  }

  async function guardarCambios() {
    setGuardando(true); setError(null)
    const patch: Record<string, unknown> = {
      cliente_id: clienteId ? Number(clienteId) : null,
      canal, forma_pago: formaPago, notas: notas.trim() || null,
      horario_entrega: venta!.envio ? (horarioEntrega.trim() || null) : null,
    }
    const { error } = await supabase.from('ventas').update(patch).eq('id', venta!.id)
    setGuardando(false)
    if (error) { setError(error.message); return }
    onCambio()
  }

  async function toggleEntregado() {
    const nuevo = !entregado
    setGuardando(true); setError(null)
    // Mantener estado sincronizado por compat
    const estadoSync = cobrado ? 'cobrado' : (nuevo ? 'entregado' : 'pendiente')
    const { error } = await supabase.from('ventas').update({ entregado: nuevo, estado: estadoSync }).eq('id', venta!.id)
    setGuardando(false)
    if (error) { setError(error.message); return }
    setEntregado(nuevo)
    onCambio()
  }

  async function toggleCobrado() {
    const nuevo = !cobrado
    setGuardando(true); setError(null)
    const estadoSync = nuevo ? 'cobrado' : (entregado ? 'entregado' : 'pendiente')
    const { error } = await supabase.from('ventas').update({ cobrado: nuevo, estado: estadoSync }).eq('id', venta!.id)
    setGuardando(false)
    if (error) { setError(error.message); return }
    setCobrado(nuevo)
    onCambio()
  }

  async function anular() {
    setGuardando(true); setError(null)
    // 1) Obtener todos los movimientos_stock originados por esta venta
    const { data: movs, error: e1 } = await supabase
      .from('movimientos_stock').select('*').eq('venta_id', venta!.id)
    if (e1) { setError(e1.message); setGuardando(false); return }

    // 2) Reversar cada movimiento: sumar unidades al stock (mov.unidades es negativo → resta un negativo = suma)
    const { data: { user } } = await supabase.auth.getUser()
    for (const m of (movs ?? [])) {
      const { data: s } = await supabase.from('stock').select('unidades').eq('id', m.stock_id).maybeSingle()
      if (!s) continue
      const nuevas = Number(s.unidades) - Number(m.unidades)
      await supabase.from('stock').update({ unidades: nuevas, actualizado_en: new Date().toISOString() }).eq('id', m.stock_id)
      await supabase.from('movimientos_stock').insert({
        stock_id: m.stock_id, tipo: 'devolucion', unidades: -Number(m.unidades),
        venta_id: venta!.id, usuario_id: user?.id ?? null,
        nota: `Anulacion de venta #${venta!.id}`,
      })
    }
    // 3) Marcar venta cancelado
    const { error: e2 } = await supabase.from('ventas').update({ estado: 'cancelado' }).eq('id', venta!.id)
    setGuardando(false)
    if (e2) { setError(e2.message); return }
    onAnulada()
  }

  return (
    <Dialog abierto={venta !== null} onCerrar={onCerrar} titulo={`Venta #${venta.id} · ${venta.fecha}`} ancho="lg">
      <div className="space-y-4">
        {anulada && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            Esta venta está <b>anulada</b>. El stock ya fue devuelto.
          </div>
        )}

        {/* Entrega y cobro — toggles grandes clickeables */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            disabled={!puedeEditar || anulada || guardando}
            onClick={toggleEntregado}
            className={`rounded-xl border-2 p-4 text-left transition ${
              entregado
                ? 'bg-oliva-100 border-oliva-400 text-oliva-900'
                : 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
            } disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            <div className="text-lg font-semibold">{entregado ? '🚚 Entregado' : '⏳ Pendiente de entrega'}</div>
            <div className="text-xs mt-1 opacity-80">Clic para {entregado ? 'marcar como pendiente' : 'marcar como entregado'}</div>
          </button>
          <button
            type="button"
            disabled={!puedeEditar || anulada || guardando}
            onClick={toggleCobrado}
            className={`rounded-xl border-2 p-4 text-left transition ${
              cobrado
                ? 'bg-aceite-500/20 border-aceite-500 text-aceite-600'
                : 'bg-red-50 border-red-300 text-red-800 hover:bg-red-100'
            } disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            <div className="text-lg font-semibold">{cobrado ? '💰 Cobrado' : '⚠ Sin cobrar'}</div>
            <div className="text-xs mt-1 opacity-80">Clic para {cobrado ? 'marcar como sin cobrar' : 'marcar como cobrado'}</div>
          </button>
        </div>

        {/* Cabecera editable */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Cliente</label>
            <select className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)} disabled={!puedeEditar || anulada}>
              <option value="">— sin cliente —</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Canal</label>
            <select className="input" value={canal} onChange={(e) => setCanal(e.target.value)} disabled={!puedeEditar || anulada}>
              {!CANALES.includes(canal as typeof CANALES[number]) && canal && (
                <option value={canal}>{canal}</option>
              )}
              {CANALES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Forma de pago</label>
            <select className="input" value={formaPago} onChange={(e) => setFormaPago(e.target.value)} disabled={!puedeEditar || anulada}>
              {FORMAS_PAGO.map((f) => <option key={f} value={f}>{f.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Socio (vendedor)</label>
            <div className="input">{socio?.nombre ?? '—'}</div>
          </div>
          <div>
            <label className="label">📍 Ubicación</label>
            <div className="input">{ubicaciones.find((u) => u.id === venta.ubicacion_id)?.nombre ?? '—'}</div>
          </div>
        </div>

        {venta.envio && (
          <div>
            <label className="label">🕐 Horario de entrega</label>
            <input className="input" value={horarioEntrega} onChange={(e) => setHorarioEntrega(e.target.value)} disabled={!puedeEditar || anulada} placeholder="ej: después de las 18h" />
          </div>
        )}

        <div>
          <label className="label">Notas</label>
          <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} disabled={!puedeEditar || anulada} />
        </div>

        {puedeEditar && !anulada && (
          <div className="flex justify-end">
            <button
              className="btn-secondary text-xs"
              onClick={() => guardarCambios()}
              disabled={guardando}
            >
              Guardar cambios de cabecera
            </button>
          </div>
        )}

        {/* Ítems */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs uppercase tracking-wide text-oliva-600">Ítems</div>
            {puedeEditar && !anulada && (
              <button type="button" className="text-xs text-oliva-700 hover:text-oliva-900 underline" onClick={() => onEditarItems(venta)}>
                Editar ítems
              </button>
            )}
          </div>
          {cargando ? (
            <div className="text-sm text-oliva-600">Cargando…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-oliva-600">Sin ítems.</div>
          ) : (
            <div className="rounded-lg border border-oliva-100 overflow-x-auto">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-oliva-600 bg-oliva-50">
                    <th className="py-2 px-3">Producto · Presentación</th>
                    <th className="py-2 px-3 text-right">Cant.</th>
                    <th className="py-2 px-3 text-right">P. u.</th>
                    <th className="py-2 px-3 text-right">Desc.</th>
                    <th className="py-2 px-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const p = presMap.get(it.presentacion_id)
                    const prod = p ? prodMap.get(p.producto_id) : null
                    return (
                      <tr key={it.id} className="border-t border-oliva-100/70">
                        <td className="py-2 px-3 text-oliva-800">
                          {prod?.nombre ?? '—'} · {p?.nombre ?? '—'}
                          {p?.es_pack && <span className="text-[10px] ml-2 text-oliva-600">(pack)</span>}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">{it.unidades}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{money(it.precio_unitario)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{Number(it.descuento_unitario) > 0 ? money(it.descuento_unitario) : '—'}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-medium">{money(it.subtotal)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Totales */}
        <div className="card p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm bg-oliva-50/60">
          <div>
            <div className="text-xs uppercase tracking-wide text-oliva-600">Subtotal</div>
            <div className="tabular-nums font-medium">{money(venta.subtotal)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-oliva-600">IVA {venta.con_factura ? '' : '(sin factura)'}</div>
            <div className="tabular-nums font-medium">{venta.con_factura ? money(venta.iva) : <span className="text-oliva-400">—</span>}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-oliva-600">🛵 Envío</div>
            <div className="tabular-nums font-medium">{venta.envio ? money(venta.costo_envio) : <span className="text-oliva-400">—</span>}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-oliva-600">Total</div>
            <div className="tabular-nums font-semibold text-lg">{money(venta.total)}</div>
          </div>
        </div>

        {error && <div className="text-sm text-red-700">{error}</div>}

        {/* Acciones destructivas */}
        {puedeEditar && !anulada && (
          <div className="border-t border-oliva-100 pt-4">
            {confirmAnular ? (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-2">
                <div className="text-sm text-red-800">
                  ¿Anular la venta? El stock se devuelve automáticamente a los lotes de origen y la venta queda marcada como <b>cancelado</b>. Esta acción no se puede deshacer.
                </div>
                <div className="flex justify-end gap-2">
                  <button className="btn-secondary text-xs" onClick={() => setConfirmAnular(false)} disabled={guardando}>Cancelar</button>
                  <button className="text-xs px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50" onClick={anular} disabled={guardando}>
                    {guardando ? 'Anulando…' : 'Sí, anular y devolver stock'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center gap-2 flex-wrap">
                <button className="text-xs text-red-700 hover:text-red-900 underline" onClick={() => setConfirmAnular(true)}>Anular esta venta</button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary text-sm"
                    onClick={enviarReciboWA}
                    disabled={cargando}
                    title={clienteWA ? 'Abre WhatsApp con el mensaje ya escrito' : 'El cliente no tiene teléfono cargado — se abre WA sin destinatario'}
                  >
                    📱 Recibo por WhatsApp
                  </button>
                  <button className="btn-secondary" onClick={onCerrar}>Cerrar</button>
                </div>
              </div>
            )}
          </div>
        )}
        {(!puedeEditar || anulada) && (
          <div className="flex justify-end pt-2">
            <button className="btn-secondary" onClick={onCerrar}>Cerrar</button>
          </div>
        )}
      </div>
    </Dialog>
  )
}

// ---------- Diálogo Lista para cadete ----------

function ListaCadeteDialog({
  abierto, ventas, clientes, desde, hasta, onCerrar,
}: {
  abierto: boolean
  ventas: Venta[]
  clientes: Cliente[]
  desde: string
  hasta: string
  onCerrar: () => void
}) {
  const [items, setItems] = useState<ItemVenta[]>([])
  const [presMap, setPresMap] = useState<Map<number, PresentacionInfo>>(new Map())
  const [prodMap, setProdMap] = useState<Map<number, ProdInfo>>(new Map())
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  const [cargando, setCargando] = useState(false)
  const [copiado, setCopiado] = useState(false)

  // Filtro de las ventas: en el rango del listado, con envío, no canceladas y no entregadas
  // (Al marcar "🚚 Entregado" en el detalle, el pedido desaparece de la lista del cadete.)
  const enviosDelRango = useMemo(() => {
    return ventas
      .filter((v) => v.envio && v.estado !== 'cancelado' && !v.entregado)
      .filter((v) => !desde || v.fecha >= desde)
      .filter((v) => !hasta || v.fecha <= hasta)
      .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id - b.id))
  }, [ventas, desde, hasta])

  // Numeración estable por mes: cada envío tiene el índice + 1 dentro de las ventas con envío del mismo mes
  const numeroPedido = useMemo(() => {
    const porMes = new Map<string, Venta[]>()
    for (const v of ventas) {
      if (!v.envio) continue
      const mes = v.fecha.slice(0, 7) // yyyy-mm
      if (!porMes.has(mes)) porMes.set(mes, [])
      porMes.get(mes)!.push(v)
    }
    const map = new Map<number, number>()
    for (const [, arr] of porMes) {
      arr.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id - b.id))
      arr.forEach((v, idx) => map.set(v.id, idx + 1))
    }
    return map
  }, [ventas])

  useEffect(() => {
    if (!abierto) return
    setSeleccion(new Set(enviosDelRango.map((v) => v.id)))
    setCopiado(false)
    if (enviosDelRango.length === 0) { setItems([]); return }
    setCargando(true)
    const ids = enviosDelRango.map((v) => v.id)
    Promise.all([
      supabase.from('items_venta').select('*').in('venta_id', ids),
      supabase.from('presentaciones').select('id,nombre,producto_id,es_pack'),
      supabase.from('productos').select('id,nombre,categoria'),
    ]).then(([i, p, pr]) => {
      setItems((i.data as ItemVenta[]) ?? [])
      setPresMap(new Map(((p.data as PresentacionInfo[]) ?? []).map((x) => [x.id, x])))
      setProdMap(new Map(((pr.data as ProdInfo[]) ?? []).map((x) => [x.id, x])))
      setCargando(false)
    })
  }, [abierto, enviosDelRango])

  const clientePorId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes])
  const itemsPorVenta = useMemo(() => {
    const m = new Map<number, ItemVenta[]>()
    for (const it of items) {
      const arr = m.get(it.venta_id) ?? []
      arr.push(it)
      m.set(it.venta_id, arr)
    }
    return m
  }, [items])

  function resumenItems(ventaId: number): string {
    const arr = itemsPorVenta.get(ventaId) ?? []
    return arr.map((it) => {
      const p = presMap.get(it.presentacion_id)
      const prod = p ? prodMap.get(p.producto_id) : null
      return `${it.unidades}× ${prod?.nombre ?? ''} ${p?.nombre ?? ''}`.trim()
    }).join(', ')
  }

  function toggleUno(id: number) {
    setSeleccion((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }
  function toggleTodos() {
    if (seleccion.size === enviosDelRango.length) setSeleccion(new Set())
    else setSeleccion(new Set(enviosDelRango.map((v) => v.id)))
  }

  function armarTexto(): string {
    const fechaLabel = desde && hasta && desde === hasta
      ? desde
      : `${desde || '—'} → ${hasta || 'hoy'}`
    const bloques = enviosDelRango
      .filter((v) => seleccion.has(v.id))
      .map((v) => {
        const c = v.cliente_id ? clientePorId.get(v.cliente_id) : null
        const partes: string[] = []
        partes.push(`Pedido #${numeroPedido.get(v.id) ?? '?'}`)
        partes.push(c?.nombre ?? 'Sin cliente')
        partes.push(resumenItems(v.id) || '(sin ítems)')
        if (c?.telefono || c?.whatsapp) partes.push(`📞 ${c.whatsapp ?? c.telefono}`)
        if (c?.direccion) partes.push(`📍 ${c.direccion}${c.localidad ? ', ' + c.localidad : ''}`)
        if (v.horario_entrega) partes.push(`🕐 ${v.horario_entrega}`)
        return partes.join('\n')
      })
    const encabezado = `🛵 Pedidos Sierras de Aiguá — ${fechaLabel}`
    return [encabezado, ...bloques].join('\n\n')
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(armarTexto())
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setCopiado(false)
      alert('No se pudo copiar. Seleccioná el texto y copialo a mano.')
    }
  }

  function abrirWhatsapp() {
    const url = `https://wa.me/${CADETE_MVD_WA}?text=` + encodeURIComponent(armarTexto())
    window.open(url, '_blank')
  }

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo="🛵 Pedidos para el cadete" ancho="lg">
      <div className="space-y-4">
        <div className="text-xs text-oliva-600">
          Rango: <b>{desde || '—'}</b> a <b>{hasta || 'hoy'}</b>. Cambiá los filtros de fecha en el listado principal si necesitás otro período.
        </div>

        {cargando ? (
          <div className="text-sm text-oliva-700">Cargando pedidos…</div>
        ) : enviosDelRango.length === 0 ? (
          <div className="card p-4 text-sm text-oliva-700">
            No hay ventas con envío en este período. Cargá una nueva venta con el checkbox 🛵 Envío.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-oliva-700">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-oliva-700"
                  checked={seleccion.size === enviosDelRango.length}
                  onChange={toggleTodos}
                />
                Marcar/desmarcar todos ({seleccion.size}/{enviosDelRango.length})
              </label>
            </div>

            <div className="space-y-2 max-h-[45vh] overflow-y-auto">
              {enviosDelRango.map((v) => {
                const c = v.cliente_id ? clientePorId.get(v.cliente_id) : null
                const num = numeroPedido.get(v.id)
                const marcado = seleccion.has(v.id)
                return (
                  <label key={v.id} className={`flex gap-3 items-start p-3 rounded-lg border cursor-pointer ${marcado ? 'bg-oliva-50 border-oliva-200' : 'bg-white border-oliva-100'}`}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 mt-1 accent-oliva-700"
                      checked={marcado}
                      onChange={() => toggleUno(v.id)}
                    />
                    <div className="flex-1 text-sm">
                      <div className="font-medium text-oliva-900">
                        Pedido #{num} · {c?.nombre ?? <span className="italic text-oliva-500">sin cliente</span>}
                      </div>
                      <div className="text-oliva-700 text-xs mt-0.5">{resumenItems(v.id) || <em>sin ítems</em>}</div>
                      <div className="text-oliva-600 text-xs mt-1 space-y-0.5">
                        {(c?.whatsapp || c?.telefono) && <div>📞 {c?.whatsapp ?? c?.telefono}</div>}
                        {c?.direccion && <div>📍 {c.direccion}{c.localidad ? `, ${c.localidad}` : ''}</div>}
                        {v.horario_entrega && <div>🕐 {v.horario_entrega}</div>}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>

            <details className="rounded-lg border border-oliva-100 p-3 bg-oliva-50/50">
              <summary className="text-xs text-oliva-700 cursor-pointer">Ver texto que se va a enviar</summary>
              <pre className="text-xs text-oliva-800 whitespace-pre-wrap mt-2 font-mono">{armarTexto()}</pre>
            </details>

            <div className="flex flex-wrap gap-2 justify-end pt-2">
              <button className="btn-secondary" onClick={onCerrar}>Cerrar</button>
              <button className="btn-secondary" onClick={copiar} disabled={seleccion.size === 0}>
                {copiado ? '✓ Copiado' : 'Copiar al portapapeles'}
              </button>
              <button className="btn-primary" onClick={abrirWhatsapp} disabled={seleccion.size === 0}>
                Abrir WhatsApp
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}
