import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Dialog } from '../components/Dialog'
import { money } from '../lib/format'

// ---------- Tipos ----------
interface Producto { id: number; nombre: string }
interface Presentacion {
  id: number; producto_id: number; nombre: string; volumen_ml: number | null
  precio_minorista: number; precio_mayorista: number; iva_pct: number; activo: boolean
}
interface StockRow { id: number; lote_id: number; presentacion_id: number; unidades: number }
interface Lote { id: number; producto_id: number; campaña: number; edicion: string | null; variedad: string | null }
interface Cliente { id: number; nombre: string; tipo: 'minorista' | 'mayorista' | 'feria' | 'envio' | 'otro' }
interface Socio { id: string; nombre: string }
interface Venta {
  id: number; fecha: string; cliente_id: number | null; socio_id: string
  canal: string | null; estado: string; forma_pago: string | null
  con_factura: boolean; subtotal: number; descuento: number; iva: number; total: number
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

  const [filtroSocio, setFiltroSocio] = useState<string>('todos')
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
      return true
    })
  }, [ventas, filtroSocio, filtroDesde, filtroHasta])

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
        {puedeEscribir && (
          <button className="btn-primary" onClick={() => setNueva(true)}>+ Nueva venta</button>
        )}
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
                <tr key={v.id} className="border-b border-oliva-100/70 last:border-0 hover:bg-oliva-50/60">
                  <td className="py-2 px-4 tabular-nums text-oliva-700">{v.fecha}</td>
                  <td className="py-2 px-4 text-oliva-900">{clientePorId.get(v.cliente_id ?? 0)?.nombre ?? <span className="italic text-oliva-500">sin cliente</span>}</td>
                  <td className="py-2 px-4 text-oliva-700 text-xs">{socioPorId.get(v.socio_id)?.nombre ?? '—'}</td>
                  <td className="py-2 px-4 text-oliva-700 text-xs">{v.canal ?? '—'}</td>
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
        onCerrar={() => setNueva(false)}
        onOk={() => { setNueva(false); cargar() }}
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
  abierto, socioId, clientes, onCerrar, onOk,
}: {
  abierto: boolean
  socioId: string
  clientes: Cliente[]
  onCerrar: () => void
  onOk: () => void
}) {
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [clienteId, setClienteId] = useState<string>('')
  const [canal, setCanal] = useState<string>('directa')
  const [formaPago, setFormaPago] = useState<string>('efectivo')
  const [conFactura, setConFactura] = useState(false)
  const [estado, setEstado] = useState<string>('cobrado')
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<Item[]>([nuevoItem()])

  const [productos, setProductos] = useState<Producto[]>([])
  const [presentaciones, setPresentaciones] = useState<Presentacion[]>([])
  const [stock, setStock] = useState<StockRow[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [datosCargados, setDatosCargados] = useState(false)

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setFecha(new Date().toISOString().slice(0, 10))
    setClienteId(''); setCanal('directa'); setFormaPago('efectivo'); setConFactura(false)
    setEstado('cobrado'); setNotas(''); setItems([nuevoItem()]); setError(null)

    setDatosCargados(false)
    Promise.all([
      supabase.from('productos').select('id,nombre'),
      supabase.from('presentaciones').select('id,producto_id,nombre,volumen_ml,precio_minorista,precio_mayorista,iva_pct,activo').eq('activo', true),
      supabase.from('stock').select('id,lote_id,presentacion_id,unidades').gt('unidades', 0),
      supabase.from('lotes').select('id,producto_id,campaña,edicion,variedad'),
    ]).then(([p, pr, s, l]) => {
      setProductos((p.data as Producto[]) ?? [])
      setPresentaciones((pr.data as Presentacion[]) ?? [])
      setStock((s.data as StockRow[]) ?? [])
      setLotes((l.data as Lote[]) ?? [])
      setDatosCargados(true)
    })
  }, [abierto])

  const cliente = clientes.find((c) => c.id === Number(clienteId))
  const esMayorista = cliente?.tipo === 'mayorista'
  const presPorId = useMemo(() => new Map(presentaciones.map((p) => [p.id, p])), [presentaciones])
  const stockPorId = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock])
  const lotePorId = useMemo(() => new Map(lotes.map((l) => [l.id, l])), [lotes])
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
    // Auto-elegir el lote más viejo con stock (FIFO) para esta presentación
    const stocksPres = stock
      .filter((s) => s.presentacion_id === presId)
      .sort((a, b) => a.lote_id - b.lote_id)
    const stockElegido = stocksPres[0]
    const precio = p ? (esMayorista && Number(p.precio_mayorista) ? Number(p.precio_mayorista) : Number(p.precio_minorista)) : 0
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
  const total = subtotal + iva

  function stocksParaPresentacion(presId: number) {
    return stock
      .filter((s) => s.presentacion_id === presId)
      .sort((a, b) => a.lote_id - b.lote_id)
      .map((s) => ({ s, lote: lotePorId.get(s.lote_id), prod: prodPorId.get(lotePorId.get(s.lote_id)?.producto_id ?? 0) }))
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()

    // Validaciones
    if (items.length === 0) { setError('Agregá al menos un ítem.'); return }
    for (const f of filas) {
      if (!f.it.presentacion_id) { setError('Todos los ítems necesitan una presentación.'); return }
      if (!f.it.stock_id) { setError('Todos los ítems necesitan un lote con stock.'); return }
      if (f.it.unidades <= 0) { setError('Las unidades deben ser mayores a 0.'); return }
      if (f.it.unidades > f.disponible) {
        const prod = f.st ? prodPorId.get(lotePorId.get(f.st.lote_id)?.producto_id ?? 0) : null
        setError(`No hay stock suficiente para "${prod?.nombre ?? ''} ${f.p?.nombre ?? ''}": pedís ${f.it.unidades}, disponibles ${f.disponible}.`)
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
      subtotal, descuento: 0, iva, total,
      notas: notas.trim() || null,
    }).select('id').single()

    if (eV || !venta) { setError(eV?.message ?? 'Error creando venta'); setGuardando(false); return }

    // 2) Insert items (el trigger descuenta stock)
    const payloadItems = filas.map((f) => ({
      venta_id: venta.id,
      stock_id: f.it.stock_id!,
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
            <label className="label">Cliente {esMayorista && <span className="text-aceite-600">· mayorista</span>}</label>
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
                            const hayStock = stock.some((s) => s.presentacion_id === p.id)
                            return (
                              <option key={p.id} value={p.id} disabled={!hayStock}>
                                {prod?.nombre} · {p.nombre}{!hayStock ? ' · SIN STOCK' : ''}
                              </option>
                            )
                          })}
                        </select>
                      </div>
                      <div>
                        <label className="label">Lote</label>
                        <select
                          className="input"
                          value={f.it.stock_id ?? ''}
                          onChange={(e) => actualizarItem(f.it.key, { stock_id: e.target.value ? Number(e.target.value) : null })}
                          disabled={!f.it.presentacion_id}
                          required
                        >
                          <option value="">— elegir lote —</option>
                          {opcionesStock.map(({ s, lote }) => (
                            <option key={s.id} value={s.id}>
                              #{lote?.id} · {lote?.edicion ?? `campaña ${lote?.campaña}`} · {s.unidades} u
                            </option>
                          ))}
                        </select>
                        {f.it.presentacion_id && opcionesStock.length === 0 && (
                          <p className="text-xs text-red-700 mt-1">Sin stock envasado. Ir a Stock → Envasar.</p>
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
        <div className="card p-4 grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-oliva-600">Subtotal</div>
            <div className="tabular-nums font-medium text-oliva-900">{money(subtotal)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-oliva-600">IVA</div>
            <div className="tabular-nums font-medium text-oliva-900">{conFactura ? money(iva) : <span className="text-oliva-400">—</span>}</div>
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
    </Dialog>
  )
}
