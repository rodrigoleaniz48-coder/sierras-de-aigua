import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Dialog } from '../components/Dialog'
import { ClienteDialog, type Cliente, type Socio } from '../components/ClienteDialog'
import { money } from '../lib/format'

// ---------- Tipos ----------
interface Producto { id: number; nombre: string }
interface Presentacion {
  id: number; producto_id: number; nombre: string; volumen_ml: number | null
  precio_minorista: number; precio_mayorista: number; iva_pct: number; activo: boolean
  es_pack: boolean
}
interface Componente { presentacion_pack_id: number; presentacion_componente_id: number; unidades: number }
interface StockRow { id: number; tanque_id: number | null; presentacion_id: number; unidades: number }
interface Tanque { id: number; nombre: string; producto_id: number | null; variedad_libre: string | null; campana: number | null }
interface Venta {
  id: number; fecha: string; cliente_id: number | null; socio_id: string
  canal: string | null; estado: string; forma_pago: string | null
  con_factura: boolean; subtotal: number; descuento: number; iva: number; total: number
  envio: boolean; costo_envio: number; horario_entrega: string | null
  notas: string | null; creado_en: string
}

const CANALES = ['directa', 'feria', 'envio', 'whatsapp'] as const
const FORMAS_PAGO = ['efectivo', 'transferencia', 'tarjeta', 'mercado_pago', 'cheque', 'otro'] as const
const ESTADOS = ['pendiente', 'entregado', 'facturado', 'cobrado', 'cancelado'] as const

// ---------- Página ----------

export function Ventas() {
  const { session, puede } = useAuth()
  const puedeEscribir = puede(['admin', 'ventas'])
  const [ventas, setVentas] = useState<Venta[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [socios, setSocios] = useState<Socio[]>([])
  const [cargando, setCargando] = useState(true)
  const [nueva, setNueva] = useState(false)
  const [ventaDetalle, setVentaDetalle] = useState<Venta | null>(null)
  const [cadeteAbierto, setCadeteAbierto] = useState(false)

  const [filtroSocio, setFiltroSocio] = useState<string>('todos')
  const [soloEnvio, setSoloEnvio] = useState(false)
  const [filtroDesde, setFiltroDesde] = useState<string>(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10)
  })
  const [filtroHasta, setFiltroHasta] = useState<string>('')

  async function cargar() {
    setCargando(true)
    const [v, c, s] = await Promise.all([
      supabase.from('ventas').select('*').order('fecha', { ascending: false }).order('id', { ascending: false }),
      supabase.from('clientes').select('id,nombre,tipo').order('nombre'),
      supabase.from('perfiles').select('id,nombre').eq('activo', true).order('nombre'),
    ])
    setVentas((v.data as Venta[]) ?? [])
    setClientes((c.data as Cliente[]) ?? [])
    setSocios((s.data as Socio[]) ?? [])
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

  const totalPeriodo = useMemo(() => filtradas.reduce((s, v) => s + Number(v.total ?? 0), 0), [filtradas])

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
          <label className="flex items-center gap-1 mt-2 text-xs text-oliva-700">
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
        <div className="card p-6 text-sm text-oliva-700">
          Sin ventas en el período. {puedeEscribir && <>Cargá una con <b>+ Nueva venta</b>.</>}
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-oliva-600 border-b border-oliva-100 bg-oliva-50">
                <th className="py-2 px-4">Fecha</th>
                <th className="py-2 px-4">Cliente</th>
                <th className="py-2 px-4">Socio</th>
                <th className="py-2 px-4">Canal</th>
                <th className="py-2 px-4">Estado</th>
                <th className="py-2 px-4">Factura</th>
                <th className="py-2 px-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((v) => (
                <tr
                  key={v.id}
                  className="border-b border-oliva-100/70 last:border-0 hover:bg-oliva-50/60 cursor-pointer"
                  onClick={() => setVentaDetalle(v)}
                >
                  <td className="py-2 px-4 tabular-nums text-oliva-700">{v.fecha}</td>
                  <td className="py-2 px-4 text-oliva-900">{clientePorId.get(v.cliente_id ?? 0)?.nombre ?? <span className="italic text-oliva-500">sin cliente</span>}</td>
                  <td className="py-2 px-4 text-oliva-700 text-xs">{socioPorId.get(v.socio_id)?.nombre ?? '—'}</td>
                  <td className="py-2 px-4 text-oliva-700 text-xs">
                    {v.canal ?? '—'}
                    {v.envio && <span title="Envío por cadete" className="ml-1">🛵</span>}
                  </td>
                  <td className="py-2 px-4">
                    <span className={`text-[11px] uppercase tracking-wide rounded-full px-2 py-[1px] ${badgeEstado(v.estado)}`}>{v.estado}</span>
                  </td>
                  <td className="py-2 px-4 text-xs">{v.con_factura ? 'Sí' : '—'}</td>
                  <td className="py-2 px-4 text-right tabular-nums font-medium text-oliva-900">{money(v.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NuevaVentaDialog
        abierto={nueva}
        socioId={session?.user.id ?? ''}
        clientes={clientes}
        socios={socios}
        onClienteCreado={(c) => setClientes((prev) => [...prev, c].sort((a, b) => a.nombre.localeCompare(b.nombre)))}
        onCerrar={() => setNueva(false)}
        onOk={() => { setNueva(false); cargar() }}
      />

      <VentaDetalleDialog
        venta={ventaDetalle}
        clientes={clientes}
        socios={socios}
        puedeEditar={puedeEscribir}
        onCerrar={() => setVentaDetalle(null)}
        onCambio={() => { setVentaDetalle(null); cargar() }}
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

function badgeEstado(e: string) {
  switch (e) {
    case 'entregado':  return 'bg-oliva-100 text-oliva-800'
    case 'facturado':  return 'bg-tierra-100 text-tierra-800'
    case 'cobrado':    return 'bg-aceite-500/15 text-aceite-600'
    case 'cancelado':  return 'bg-red-100 text-red-800'
    default:           return 'bg-oliva-200 text-oliva-800'
  }
}

// ---------- Diálogo Nueva venta ----------

interface Item {
  key: string
  presentacion_id: number | null
  stock_id: number | null
  unidades: number
  precio_unitario: number
  descuento_unitario: number
}

function nuevoItem(): Item {
  return { key: crypto.randomUUID(), presentacion_id: null, stock_id: null, unidades: 1, precio_unitario: 0, descuento_unitario: 0 }
}

function NuevaVentaDialog({
  abierto, socioId, clientes, socios, onClienteCreado, onCerrar, onOk,
}: {
  abierto: boolean
  socioId: string
  clientes: Cliente[]
  socios: Socio[]
  onClienteCreado: (cliente: Cliente) => void
  onCerrar: () => void
  onOk: () => void
}) {
  const [nuevoClienteAbierto, setNuevoClienteAbierto] = useState(false)
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [clienteId, setClienteId] = useState<string>('')
  const [canal, setCanal] = useState<string>('directa')
  const [formaPago, setFormaPago] = useState<string>('efectivo')
  const [conFactura, setConFactura] = useState(false)
  const [envio, setEnvio] = useState(false)
  const [costoEnvio, setCostoEnvio] = useState<string>('190')
  const [horarioEntrega, setHorarioEntrega] = useState('')
  const [estado, setEstado] = useState<string>('cobrado')
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<Item[]>([nuevoItem()])

  const [productos, setProductos] = useState<Producto[]>([])
  const [presentaciones, setPresentaciones] = useState<Presentacion[]>([])
  const [stock, setStock] = useState<StockRow[]>([])
  const [tanques, setTanques] = useState<Tanque[]>([])
  const [componentes, setComponentes] = useState<Componente[]>([])
  const [datosCargados, setDatosCargados] = useState(false)

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setFecha(new Date().toISOString().slice(0, 10))
    setClienteId(''); setCanal('directa'); setFormaPago('efectivo'); setConFactura(false)
    setEnvio(false); setCostoEnvio('190'); setHorarioEntrega('')
    setEstado('cobrado'); setNotas(''); setItems([nuevoItem()]); setError(null)

    setDatosCargados(false)
    Promise.all([
      supabase.from('productos').select('id,nombre'),
      supabase.from('presentaciones').select('id,producto_id,nombre,volumen_ml,precio_minorista,precio_mayorista,iva_pct,activo,es_pack').eq('activo', true),
      supabase.from('stock').select('id,tanque_id,presentacion_id,unidades').gt('unidades', 0),
      supabase.from('tanques').select('*'),
      supabase.from('presentacion_componente').select('*'),
    ]).then(([p, pr, s, t, c]) => {
      setProductos((p.data as Producto[]) ?? [])
      setPresentaciones((pr.data as Presentacion[]) ?? [])
      setStock((s.data as StockRow[]) ?? [])
      setTanques((t.data as Tanque[]) ?? [])
      setComponentes((c.data as Componente[]) ?? [])
      setDatosCargados(true)
    })
  }, [abierto])

  const cliente = clientes.find((c) => c.id === Number(clienteId))
  const esMayorista = cliente?.tipo === 'mayorista'
  const presPorId = useMemo(() => new Map(presentaciones.map((p) => [p.id, p])), [presentaciones])
  const stockPorId = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock])
  const tanquePorId = useMemo(() => new Map(tanques.map((t) => [t.id, t])), [tanques])
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

  function actualizarItem(key: string, patch: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }
  function borrarItem(key: string) {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((it) => it.key !== key)))
  }
  function elegirPresentacion(key: string, presId: number | null) {
    if (!presId) return actualizarItem(key, { presentacion_id: null, stock_id: null, precio_unitario: 0 })
    const p = presPorId.get(presId)
    const precio = p ? (esMayorista && Number(p.precio_mayorista) ? Number(p.precio_mayorista) : Number(p.precio_minorista)) : 0
    if (p?.es_pack) {
      // Los packs no requieren stock_id: el trigger descuenta los componentes FIFO
      actualizarItem(key, { presentacion_id: presId, stock_id: null, precio_unitario: precio })
      return
    }
    const stocksPres = stock
      .filter((s) => s.presentacion_id === presId)
      .sort((a, b) => a.id - b.id)
    const stockElegido = stocksPres[0]
    actualizarItem(key, {
      presentacion_id: presId,
      stock_id: stockElegido?.id ?? null,
      precio_unitario: precio,
    })
  }

  // Cálculos
  const filas = items.map((it) => {
    const p = it.presentacion_id ? presPorId.get(it.presentacion_id) : undefined
    const st = it.stock_id ? stockPorId.get(it.stock_id) : undefined
    const disponible = st?.unidades ?? 0
    const subtotal = Math.max(0, (Number(it.precio_unitario) - Number(it.descuento_unitario)) * Number(it.unidades))
    const ivaLinea = conFactura && p ? subtotal * (Number(p.iva_pct) / 100) : 0
    return { it, p, st, disponible, subtotal, ivaLinea }
  })
  const subtotal = filas.reduce((s, f) => s + f.subtotal, 0)
  const iva = filas.reduce((s, f) => s + f.ivaLinea, 0)
  const cEnvio = envio ? (Number(costoEnvio) || 0) : 0
  const total = subtotal + iva + cEnvio

  function stocksParaPresentacion(presId: number) {
    return stock
      .filter((s) => s.presentacion_id === presId)
      .sort((a, b) => a.id - b.id)
      .map((s) => {
        const tanque = s.tanque_id ? tanquePorId.get(s.tanque_id) : null
        return { s, tanque, prod: tanque?.producto_id ? prodPorId.get(tanque.producto_id) : null }
      })
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()

    // Validaciones
    if (items.length === 0) { setError('Agregá al menos un ítem.'); return }
    // Preacumular stock necesitado por presentación (para validar packs contra sus componentes)
    const necesidad = new Map<number, number>()
    for (const f of filas) {
      if (!f.it.presentacion_id) { setError('Todos los ítems necesitan una presentación.'); return }
      if (f.it.unidades <= 0) { setError('Las unidades deben ser mayores a 0.'); return }
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
    // Chequear que la suma de necesidad por presentación no supere el stock total disponible
    for (const [presId, need] of necesidad) {
      const totalDisp = stock.filter((s) => s.presentacion_id === presId).reduce((a, b) => a + b.unidades, 0)
      if (need > totalDisp) {
        const p = presPorId.get(presId)
        const prod = p ? prodPorId.get(p.producto_id) : null
        setError(`Stock insuficiente para ${prod?.nombre ?? ''} ${p?.nombre ?? ''}: se necesitan ${need} u pero hay ${totalDisp} u.`)
        return
      }
    }

    setGuardando(true); setError(null)

    // 1) Insert venta
    const { data: venta, error: eV } = await supabase.from('ventas').insert({
      fecha,
      cliente_id: clienteId ? Number(clienteId) : null,
      socio_id: socioId,
      canal, estado, forma_pago: formaPago,
      con_factura: conFactura,
      envio, costo_envio: cEnvio,
      horario_entrega: envio ? (horarioEntrega.trim() || null) : null,
      subtotal, descuento: 0, iva, total,
      notas: notas.trim() || null,
    }).select('id').single()

    if (eV || !venta) { setError(eV?.message ?? 'Error creando venta'); setGuardando(false); return }

    // 2) Insert items (el trigger descuenta stock; para packs, componentes vía trigger)
    const payloadItems = filas.map((f) => ({
      venta_id: venta.id,
      stock_id: f.p?.es_pack ? null : f.it.stock_id,
      presentacion_id: f.it.presentacion_id!,
      unidades: Number(f.it.unidades),
      precio_unitario: Number(f.it.precio_unitario),
      descuento_unitario: Number(f.it.descuento_unitario),
      subtotal: f.subtotal,
    }))
    const { error: eI } = await supabase.from('items_venta').insert(payloadItems)
    if (eI) {
      // Rollback manual: borrar la venta creada
      await supabase.from('ventas').delete().eq('id', venta.id)
      setError('Error cargando ítems: ' + eI.message)
      setGuardando(false); return
    }

    setGuardando(false)
    onOk()
  }

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo="Nueva venta" ancho="lg">
      <form onSubmit={guardar} className="space-y-4">
        {/* Cabecera */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Fecha</label>
            <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </div>
          <div className="sm:col-span-2">
            <label className="label flex items-center justify-between">
              <span>Cliente {esMayorista && <span className="text-aceite-600">· mayorista</span>}</span>
              <button
                type="button"
                className="text-xs text-oliva-700 hover:text-oliva-900 underline font-normal normal-case tracking-normal"
                onClick={() => setNuevoClienteAbierto(true)}
              >
                + nuevo cliente
              </button>
            </label>
            <select className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">— sin cliente (venta de feria / mostrador) —</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Canal</label>
            <select className="input" value={canal} onChange={(e) => setCanal(e.target.value)}>
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
            <label className="label">Estado</label>
            <select className="input" value={estado} onChange={(e) => setEstado(e.target.value)}>
              {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="sm:col-span-3 flex items-center gap-2">
            <input id="cf" type="checkbox" checked={conFactura} onChange={(e) => setConFactura(e.target.checked)} className="h-4 w-4 accent-oliva-700" />
            <label htmlFor="cf" className="text-sm text-oliva-800">Con factura (agrega IVA)</label>
          </div>

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
                  <label className="label">🕐 Horario de entrega (opcional)</label>
                  <input className="input" value={horarioEntrega} onChange={(e) => setHorarioEntrega(e.target.value)} placeholder="ej: después de las 18h · solo mañana · sábados a la tarde" />
                </div>
              </div>
            )}
          </div>
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
                const opcionesStock = f.it.presentacion_id ? stocksParaPresentacion(f.it.presentacion_id) : []
                return (
                  <div key={f.it.key} className="rounded-xl border border-oliva-100 p-3 bg-oliva-50/60 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="label">Presentación</label>
                        <select
                          className="input"
                          value={f.it.presentacion_id ?? ''}
                          onChange={(e) => elegirPresentacion(f.it.key, e.target.value ? Number(e.target.value) : null)}
                          required
                        >
                          <option value="">— elegir —</option>
                          {presentaciones.map((p) => {
                            const prod = prodPorId.get(p.producto_id)
                            const hayStock = p.es_pack ? true : stock.some((s) => s.presentacion_id === p.id)
                            return (
                              <option key={p.id} value={p.id} disabled={!hayStock}>
                                {prod?.nombre} · {p.nombre}{p.es_pack ? ' · pack' : ''}{!hayStock ? ' · SIN STOCK' : ''}
                              </option>
                            )
                          })}
                        </select>
                      </div>
                      <div>
                        <label className="label">Origen del stock</label>
                        {f.p?.es_pack ? (
                          <div className="input text-xs text-oliva-600 italic">
                            pack — se descuenta 1 unidad de cada componente 250 ml (FIFO)
                          </div>
                        ) : (
                          <>
                            <select
                              className="input"
                              value={f.it.stock_id ?? ''}
                              onChange={(e) => actualizarItem(f.it.key, { stock_id: e.target.value ? Number(e.target.value) : null })}
                              disabled={!f.it.presentacion_id}
                              required
                            >
                              <option value="">— elegir origen —</option>
                              {opcionesStock.map(({ s, tanque }) => {
                                const origen = tanque
                                  ? `${tanque.nombre}${tanque.campana ? ` · ${tanque.campana}` : ''}`
                                  : 'directo (sin tanque)'
                                return (
                                  <option key={s.id} value={s.id}>
                                    {origen} · {s.unidades} u
                                  </option>
                                )
                              })}
                            </select>
                            {f.it.presentacion_id && opcionesStock.length === 0 && (
                              <p className="text-xs text-red-700 mt-1">Sin stock envasado. Ir a Stock → Envasar o Ajuste envasado.</p>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="label">Unidades</label>
                        <input
                          className="input"
                          type="number" min="1" step="1"
                          value={f.it.unidades}
                          onChange={(e) => actualizarItem(f.it.key, { unidades: Number(e.target.value) || 0 })}
                          required
                        />
                        {f.it.stock_id && (
                          <p className={`text-[11px] mt-1 ${f.it.unidades > f.disponible ? 'text-red-700' : 'text-oliva-600'}`}>
                            disp: {f.disponible}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="label">Precio u.</label>
                        <input
                          className="input tabular-nums"
                          type="number" min="0" step="1"
                          value={f.it.precio_unitario}
                          onChange={(e) => actualizarItem(f.it.key, { precio_unitario: Number(e.target.value) || 0 })}
                        />
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
                        <div className="input tabular-nums text-right">{money(f.subtotal)}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:hidden">
                      <div className="text-sm">Subtotal: <b className="tabular-nums">{money(f.subtotal)}</b></div>
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
            <div className="tabular-nums font-medium text-oliva-900">{money(subtotal)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-oliva-600">IVA</div>
            <div className="tabular-nums font-medium text-oliva-900">{conFactura ? money(iva) : <span className="text-oliva-400">—</span>}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-oliva-600">Envío</div>
            <div className="tabular-nums font-medium text-oliva-900">{envio ? money(cEnvio) : <span className="text-oliva-400">—</span>}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-oliva-600">Total</div>
            <div className="tabular-nums font-semibold text-oliva-900 text-lg">{money(total)}</div>
          </div>
        </div>

        <div>
          <label className="label">Notas</label>
          <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>

        {error && <div className="text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={guardando || !datosCargados}>{guardando ? 'Guardando…' : 'Guardar venta'}</button>
        </div>
      </form>

      <ClienteDialog
        abierto={nuevoClienteAbierto}
        socios={socios}
        modo="rapido"
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
  venta, clientes, socios, puedeEditar, onCerrar, onCambio,
}: {
  venta: Venta | null
  clientes: Cliente[]
  socios: Socio[]
  puedeEditar: boolean
  onCerrar: () => void
  onCambio: () => void
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
  const [estado, setEstado] = useState('')
  const [notas, setNotas] = useState('')
  const [horarioEntrega, setHorarioEntrega] = useState('')

  useEffect(() => {
    if (!venta) return
    setClienteId(venta.cliente_id ? String(venta.cliente_id) : '')
    setCanal(venta.canal ?? 'directa')
    setFormaPago(venta.forma_pago ?? 'efectivo')
    setEstado(venta.estado)
    setNotas(venta.notas ?? '')
    setHorarioEntrega(venta.horario_entrega ?? '')
    setError(null); setConfirmAnular(false)

    setCargando(true)
    Promise.all([
      supabase.from('items_venta').select('*').eq('venta_id', venta.id).order('id'),
      supabase.from('presentaciones').select('id,nombre,producto_id,es_pack'),
      supabase.from('productos').select('id,nombre'),
    ]).then(([i, p, pr]) => {
      setItems((i.data as ItemVenta[]) ?? [])
      setPresMap(new Map(((p.data as PresentacionInfo[]) ?? []).map((x) => [x.id, x])))
      setProdMap(new Map(((pr.data as ProdInfo[]) ?? []).map((x) => [x.id, x])))
      setCargando(false)
    })
  }, [venta])

  if (!venta) return null

  const anulada = estado === 'cancelado' || venta.estado === 'cancelado'
  const socio = socios.find((s) => s.id === venta.socio_id)

  async function guardarCambios(nuevoEstado?: string) {
    setGuardando(true); setError(null)
    const patch: Record<string, unknown> = {
      cliente_id: clienteId ? Number(clienteId) : null,
      canal, forma_pago: formaPago, notas: notas.trim() || null,
      horario_entrega: venta!.envio ? (horarioEntrega.trim() || null) : null,
    }
    if (nuevoEstado) patch.estado = nuevoEstado
    const { error } = await supabase.from('ventas').update(patch).eq('id', venta!.id)
    setGuardando(false)
    if (error) { setError(error.message); return }
    if (nuevoEstado) setEstado(nuevoEstado)
    onCambio()
  }

  async function cambiarEstado(nuevo: string) {
    if (nuevo === estado) return
    setGuardando(true); setError(null)
    const { error } = await supabase.from('ventas').update({ estado: nuevo }).eq('id', venta!.id)
    setGuardando(false)
    if (error) { setError(error.message); return }
    setEstado(nuevo)
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
    setEstado('cancelado')
    onCambio()
  }

  return (
    <Dialog abierto={venta !== null} onCerrar={onCerrar} titulo={`Venta #${venta.id} · ${venta.fecha}`} ancho="lg">
      <div className="space-y-4">
        {anulada && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            Esta venta está <b>anulada</b>. El stock ya fue devuelto.
          </div>
        )}

        {/* Estado — botones rápidos */}
        <div>
          <div className="text-xs uppercase tracking-wide text-oliva-600 mb-1">Estado</div>
          <div className="flex flex-wrap gap-1">
            {ESTADOS.map((s) => (
              <button
                key={s}
                disabled={!puedeEditar || anulada || guardando}
                onClick={() => cambiarEstado(s)}
                className={`text-xs px-3 py-1 rounded-full border transition ${
                  estado === s
                    ? 'bg-oliva-700 text-white border-oliva-700'
                    : 'bg-white text-oliva-700 border-oliva-200 hover:bg-oliva-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
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
          <div className="text-xs uppercase tracking-wide text-oliva-600 mb-1">Ítems</div>
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
              <div className="flex justify-between items-center">
                <button className="text-xs text-red-700 hover:text-red-900 underline" onClick={() => setConfirmAnular(true)}>Anular esta venta</button>
                <button className="btn-secondary" onClick={onCerrar}>Cerrar</button>
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

  // Filtro de las ventas: en el rango del listado, con envío, no canceladas
  const enviosDelRango = useMemo(() => {
    return ventas
      .filter((v) => v.envio && v.estado !== 'cancelado')
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
      supabase.from('productos').select('id,nombre'),
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
    const url = 'https://wa.me/?text=' + encodeURIComponent(armarTexto())
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
