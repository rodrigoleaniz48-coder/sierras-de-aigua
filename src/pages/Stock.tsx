import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Dialog } from '../components/Dialog'
import { num } from '../lib/format'

interface Producto { id: number; nombre: string; categoria: string }
interface Presentacion { id: number; producto_id: number; nombre: string; volumen_ml: number | null; stock_minimo: number; activo: boolean }
interface Lote {
  id: number
  producto_id: number
  campaña: number
  edicion: string | null
  variedad: string | null
  fecha_elaboracion: string
  litros_producidos: number
  litros_disponibles: number
  acidez_pct: number | null
  notas: string | null
}
interface StockRow {
  id: number
  lote_id: number
  presentacion_id: number
  unidades: number
}
interface Movimiento {
  id: number
  stock_id: number
  tipo: string
  unidades: number
  venta_id: number | null
  nota: string | null
  fecha: string
}

type Tab = 'actual' | 'lotes' | 'movimientos'

export function Stock() {
  const { puede } = useAuth()
  const puedeEscribir = puede(['admin', 'ventas'])

  const [tab, setTab] = useState<Tab>('actual')
  const [productos, setProductos] = useState<Producto[]>([])
  const [presentaciones, setPresentaciones] = useState<Presentacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [stock, setStock] = useState<StockRow[]>([])
  const [movs, setMovs] = useState<Movimiento[]>([])
  const [cargando, setCargando] = useState(true)

  const [nuevoLote, setNuevoLote] = useState(false)
  const [envasar, setEnvasar] = useState(false)

  async function cargar() {
    setCargando(true)
    const [p, pr, l, s, m] = await Promise.all([
      supabase.from('productos').select('id,nombre,categoria').order('nombre'),
      supabase.from('presentaciones').select('id,producto_id,nombre,volumen_ml,stock_minimo,activo'),
      supabase.from('lotes').select('*').order('campaña', { ascending: false }).order('id', { ascending: false }),
      supabase.from('stock').select('*'),
      supabase.from('movimientos_stock').select('*').order('fecha', { ascending: false }).limit(200),
    ])
    setProductos((p.data as Producto[]) ?? [])
    setPresentaciones((pr.data as Presentacion[]) ?? [])
    setLotes((l.data as Lote[]) ?? [])
    setStock((s.data as StockRow[]) ?? [])
    setMovs((m.data as Movimiento[]) ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const prodPorId = useMemo(() => new Map(productos.map((x) => [x.id, x])), [productos])
  const presPorId = useMemo(() => new Map(presentaciones.map((x) => [x.id, x])), [presentaciones])
  const lotePorId = useMemo(() => new Map(lotes.map((x) => [x.id, x])), [lotes])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-oliva-900">Stock</h1>
          <p className="text-sm text-oliva-700 mt-1">
            Lotes, envasado y stock actual. Cada venta descuenta unidades automáticamente.
          </p>
        </div>
        {puedeEscribir && (
          <div className="flex gap-2 flex-wrap">
            <button className="btn-secondary" onClick={() => setNuevoLote(true)}>+ Nuevo lote</button>
            <button className="btn-primary" onClick={() => setEnvasar(true)}>Envasar</button>
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-oliva-100">
        {(['actual', 'lotes', 'movimientos'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t ? 'border-oliva-700 text-oliva-900' : 'border-transparent text-oliva-600 hover:text-oliva-900'
            }`}
            onClick={() => setTab(t)}
          >
            {t === 'actual' ? 'Stock actual' : t === 'lotes' ? 'Lotes' : 'Movimientos'}
          </button>
        ))}
      </div>

      {cargando && <div className="card p-6 text-sm text-oliva-700">Cargando…</div>}

      {!cargando && tab === 'actual' && (
        <StockActual productos={productos} presentaciones={presentaciones} lotes={lotes} stock={stock} />
      )}

      {!cargando && tab === 'lotes' && (
        <LotesTab lotes={lotes} prodPorId={prodPorId} />
      )}

      {!cargando && tab === 'movimientos' && (
        <MovimientosTab movs={movs} stock={stock} presPorId={presPorId} lotePorId={lotePorId} prodPorId={prodPorId} />
      )}

      <NuevoLoteDialog
        abierto={nuevoLote}
        productos={productos.filter((p) => p.categoria === 'aceite')}
        onCerrar={() => setNuevoLote(false)}
        onOk={() => { setNuevoLote(false); cargar() }}
      />

      <EnvasarDialog
        abierto={envasar}
        lotes={lotes}
        presentaciones={presentaciones.filter((x) => x.activo)}
        prodPorId={prodPorId}
        onCerrar={() => setEnvasar(false)}
        onOk={() => { setEnvasar(false); cargar() }}
      />
    </div>
  )
}

// ---------- Vistas ----------

function StockActual({ productos, presentaciones, lotes, stock }: {
  productos: Producto[]; presentaciones: Presentacion[]; lotes: Lote[]; stock: StockRow[]
}) {
  const filas = useMemo(() => {
    // Agrupar stock por presentación (sumando lotes) y anexar meta
    const porPres = new Map<number, { unidades: number; lotes: { lote_id: number; unidades: number }[] }>()
    for (const s of stock) {
      const g = porPres.get(s.presentacion_id) ?? { unidades: 0, lotes: [] }
      g.unidades += s.unidades
      g.lotes.push({ lote_id: s.lote_id, unidades: s.unidades })
      porPres.set(s.presentacion_id, g)
    }
    return presentaciones
      .map((p) => {
        const prod = productos.find((x) => x.id === p.producto_id)
        const g = porPres.get(p.id) ?? { unidades: 0, lotes: [] }
        return { pres: p, prod, unidades: g.unidades, lotes: g.lotes }
      })
      .filter((r) => r.prod)
      .sort((a, b) =>
        (a.prod!.nombre + a.pres.nombre).localeCompare(b.prod!.nombre + b.pres.nombre)
      )
  }, [productos, presentaciones, stock])

  const litrosGranel = useMemo(() => {
    const m = new Map<number, number>()
    for (const l of lotes) m.set(l.producto_id, (m.get(l.producto_id) ?? 0) + Number(l.litros_disponibles))
    return m
  }, [lotes])

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="text-xs uppercase tracking-wide text-oliva-600 mb-2">Granel disponible (litros sin envasar)</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {productos
            .filter((p) => (litrosGranel.get(p.id) ?? 0) > 0)
            .map((p) => (
              <div key={p.id} className="rounded-lg bg-oliva-50 border border-oliva-100 p-3">
                <div className="text-xs text-oliva-600">{p.nombre}</div>
                <div className="text-lg font-semibold text-oliva-900 tabular-nums">{num(litrosGranel.get(p.id) ?? 0)} L</div>
              </div>
            ))}
          {[...litrosGranel.values()].every((v) => v === 0) && (
            <div className="text-sm text-oliva-600">Sin granel disponible. Cargá un lote.</div>
          )}
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-oliva-600 border-b border-oliva-100 bg-oliva-50">
              <th className="py-2 px-4">Producto</th>
              <th className="py-2 px-4">Presentación</th>
              <th className="py-2 px-4 text-right">Unidades</th>
              <th className="py-2 px-4 text-right">Mínimo</th>
              <th className="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((r) => {
              const bajo = r.unidades <= r.pres.stock_minimo && r.pres.stock_minimo > 0
              return (
                <tr key={r.pres.id} className="border-b border-oliva-100/70 last:border-0">
                  <td className="py-2 px-4 text-oliva-800">{r.prod?.nombre}</td>
                  <td className="py-2 px-4 text-oliva-800">{r.pres.nombre}</td>
                  <td className={`py-2 px-4 text-right tabular-nums font-medium ${r.unidades === 0 ? 'text-oliva-400' : 'text-oliva-900'}`}>{r.unidades}</td>
                  <td className="py-2 px-4 text-right tabular-nums text-oliva-600">{r.pres.stock_minimo || '—'}</td>
                  <td className="py-2 px-4 text-right">
                    {bajo && <span className="text-[11px] rounded-full bg-red-100 text-red-800 px-2 py-[1px] uppercase tracking-wide">Bajo</span>}
                  </td>
                </tr>
              )
            })}
            {filas.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-sm text-oliva-600">Sin presentaciones cargadas.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LotesTab({ lotes, prodPorId }: { lotes: Lote[]; prodPorId: Map<number, Producto> }) {
  if (lotes.length === 0) {
    return <div className="card p-6 text-sm text-oliva-700">Todavía no hay lotes. Cargá el primero con <b>+ Nuevo lote</b>.</div>
  }
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm min-w-[780px]">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-oliva-600 border-b border-oliva-100 bg-oliva-50">
            <th className="py-2 px-4">Producto</th>
            <th className="py-2 px-4">Campaña</th>
            <th className="py-2 px-4">Edición</th>
            <th className="py-2 px-4">Variedad</th>
            <th className="py-2 px-4">Fecha</th>
            <th className="py-2 px-4 text-right">Producidos (L)</th>
            <th className="py-2 px-4 text-right">Granel (L)</th>
            <th className="py-2 px-4 text-right">Acidez %</th>
          </tr>
        </thead>
        <tbody>
          {lotes.map((l) => (
            <tr key={l.id} className="border-b border-oliva-100/70 last:border-0">
              <td className="py-2 px-4 text-oliva-800">{prodPorId.get(l.producto_id)?.nombre ?? '—'}</td>
              <td className="py-2 px-4 tabular-nums">{l.campaña}</td>
              <td className="py-2 px-4 text-oliva-700">{l.edicion ?? '—'}</td>
              <td className="py-2 px-4 text-oliva-700">{l.variedad ?? '—'}</td>
              <td className="py-2 px-4 tabular-nums text-oliva-600">{l.fecha_elaboracion}</td>
              <td className="py-2 px-4 text-right tabular-nums">{num(l.litros_producidos)}</td>
              <td className={`py-2 px-4 text-right tabular-nums font-medium ${Number(l.litros_disponibles) === 0 ? 'text-oliva-400' : 'text-oliva-900'}`}>{num(l.litros_disponibles)}</td>
              <td className="py-2 px-4 text-right tabular-nums text-oliva-600">{l.acidez_pct ? Number(l.acidez_pct) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MovimientosTab({
  movs, stock, presPorId, lotePorId, prodPorId,
}: {
  movs: Movimiento[]
  stock: StockRow[]
  presPorId: Map<number, Presentacion>
  lotePorId: Map<number, Lote>
  prodPorId: Map<number, Producto>
}) {
  const stockPorId = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock])

  if (movs.length === 0) return <div className="card p-6 text-sm text-oliva-700">Sin movimientos todavía.</div>

  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm min-w-[720px]">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-oliva-600 border-b border-oliva-100 bg-oliva-50">
            <th className="py-2 px-4">Fecha</th>
            <th className="py-2 px-4">Tipo</th>
            <th className="py-2 px-4">Producto</th>
            <th className="py-2 px-4">Presentación</th>
            <th className="py-2 px-4">Lote</th>
            <th className="py-2 px-4 text-right">Unidades</th>
            <th className="py-2 px-4">Nota</th>
          </tr>
        </thead>
        <tbody>
          {movs.map((m) => {
            const s = stockPorId.get(m.stock_id)
            const pres = s ? presPorId.get(s.presentacion_id) : undefined
            const lote = s ? lotePorId.get(s.lote_id) : undefined
            const prod = pres ? prodPorId.get(pres.producto_id) : undefined
            return (
              <tr key={m.id} className="border-b border-oliva-100/70 last:border-0">
                <td className="py-2 px-4 tabular-nums text-oliva-600">{new Date(m.fecha).toLocaleString('es-UY')}</td>
                <td className="py-2 px-4">
                  <span className={`text-[11px] uppercase tracking-wide rounded-full px-2 py-[1px] ${badgeTipo(m.tipo)}`}>{m.tipo}</span>
                </td>
                <td className="py-2 px-4 text-oliva-800">{prod?.nombre ?? '—'}</td>
                <td className="py-2 px-4 text-oliva-800">{pres?.nombre ?? '—'}</td>
                <td className="py-2 px-4 text-oliva-700">#{lote?.id ?? '—'}{lote?.edicion ? ` · ${lote.edicion}` : lote ? ` · ${lote.campaña}` : ''}</td>
                <td className={`py-2 px-4 text-right tabular-nums font-medium ${m.unidades < 0 ? 'text-red-700' : 'text-oliva-900'}`}>{m.unidades > 0 ? '+' : ''}{m.unidades}</td>
                <td className="py-2 px-4 text-oliva-600 truncate max-w-[240px]">{m.nota ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function badgeTipo(t: string) {
  switch (t) {
    case 'envasado': return 'bg-oliva-100 text-oliva-800'
    case 'venta': return 'bg-aceite-500/10 text-aceite-600'
    case 'merma': return 'bg-red-100 text-red-800'
    case 'ajuste': return 'bg-tierra-100 text-tierra-800'
    case 'devolucion': return 'bg-oliva-200 text-oliva-800'
    default: return 'bg-oliva-100 text-oliva-700'
  }
}

// ---------- Dialogs ----------

const VARIEDADES = ['arbequina', 'coratina', 'picual', 'frantoio', 'mezcla'] as const

function NuevoLoteDialog({
  abierto, productos, onCerrar, onOk,
}: { abierto: boolean; productos: Producto[]; onCerrar: () => void; onOk: () => void }) {
  const anio = new Date().getFullYear()
  const [productoId, setProductoId] = useState<string>('')
  const [campana, setCampana] = useState<string>(String(anio))
  const [edicion, setEdicion] = useState('')
  const [variedad, setVariedad] = useState<string>('mezcla')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [litros, setLitros] = useState<string>('')
  const [acidez, setAcidez] = useState<string>('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setProductoId(productos[0]?.id?.toString() ?? '')
    setCampana(String(anio)); setEdicion(''); setVariedad('mezcla')
    setFecha(new Date().toISOString().slice(0, 10)); setLitros('')
    setAcidez(''); setNotas(''); setError(null)
  }, [abierto, productos, anio])

  const productoSel = productos.find((p) => p.id === Number(productoId))
  const esPremiado = productoSel?.nombre.toLowerCase().includes('premiado')

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!productoId) return
    setGuardando(true); setError(null)
    const L = Number(litros) || 0
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('lotes').insert({
      producto_id: Number(productoId),
      campaña: Number(campana),
      edicion: esPremiado ? (edicion.trim() || `Premiado ${campana}`) : (edicion.trim() || null),
      variedad,
      fecha_elaboracion: fecha,
      litros_producidos: L,
      litros_disponibles: L,
      acidez_pct: acidez ? Number(acidez) : null,
      notas: notas.trim() || null,
      creado_por: user?.id ?? null,
    })
    setGuardando(false)
    if (error) setError(error.message)
    else onOk()
  }

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo="Nuevo lote / partida" ancho="lg">
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Producto</label>
            <select className="input" value={productoId} onChange={(e) => setProductoId(e.target.value)} required>
              <option value="">— Elegir —</option>
              {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Campaña (año)</label>
            <input className="input" type="number" min="2000" max="2100" value={campana} onChange={(e) => setCampana(e.target.value)} required />
          </div>
          <div>
            <label className="label">Variedad</label>
            <select className="input" value={variedad} onChange={(e) => setVariedad(e.target.value)}>
              {VARIEDADES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          {esPremiado && (
            <div className="sm:col-span-2">
              <label className="label">Edición (Premiado — receta del año)</label>
              <input className="input" placeholder={`Premiado ${campana}`} value={edicion} onChange={(e) => setEdicion(e.target.value)} />
              <p className="text-xs text-oliva-600 mt-1">Si lo dejás vacío usa “Premiado {campana}”.</p>
            </div>
          )}
          <div>
            <label className="label">Fecha de elaboración</label>
            <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </div>
          <div>
            <label className="label">Litros producidos</label>
            <input className="input" type="number" min="0" step="0.01" value={litros} onChange={(e) => setLitros(e.target.value)} required />
          </div>
          <div>
            <label className="label">Acidez % (opcional)</label>
            <input className="input" type="number" min="0" step="0.001" value={acidez} onChange={(e) => setAcidez(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notas</label>
            <textarea className="input min-h-[70px]" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>
        {error && <div className="text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Dialog>
  )
}

function EnvasarDialog({
  abierto, lotes, presentaciones, prodPorId, onCerrar, onOk,
}: {
  abierto: boolean
  lotes: Lote[]
  presentaciones: Presentacion[]
  prodPorId: Map<number, Producto>
  onCerrar: () => void
  onOk: () => void
}) {
  const [loteId, setLoteId] = useState<string>('')
  const [presentacionId, setPresentacionId] = useState<string>('')
  const [unidades, setUnidades] = useState<string>('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setLoteId(''); setPresentacionId(''); setUnidades(''); setNota(''); setError(null)
  }, [abierto])

  const lote = lotes.find((l) => l.id === Number(loteId))
  const presDelProducto = lote ? presentaciones.filter((p) => p.producto_id === lote.producto_id && p.volumen_ml) : []
  const pres = presDelProducto.find((p) => p.id === Number(presentacionId))

  const litrosNecesarios = pres && unidades ? (Number(unidades) * (pres.volumen_ml ?? 0)) / 1000 : 0
  const litrosOk = lote ? litrosNecesarios <= Number(lote.litros_disponibles) + 0.0001 : false

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!lote || !pres) return
    const n = Number(unidades)
    if (!n || n <= 0) { setError('Ingresá unidades > 0'); return }
    if (!litrosOk) { setError(`Faltan litros de granel. Necesarios: ${litrosNecesarios} L, disponibles: ${lote.litros_disponibles} L.`); return }

    setGuardando(true); setError(null)

    // 1) Descontar litros del lote
    const nuevosLitros = Number(lote.litros_disponibles) - litrosNecesarios
    const { error: e1 } = await supabase.from('lotes').update({ litros_disponibles: nuevosLitros }).eq('id', lote.id)
    if (e1) { setError(e1.message); setGuardando(false); return }

    // 2) Upsert en stock (buscar existente o insertar)
    const { data: existente } = await supabase
      .from('stock').select('id,unidades')
      .eq('lote_id', lote.id).eq('presentacion_id', pres.id).maybeSingle()

    let stockId: number
    if (existente) {
      const { error: e2 } = await supabase.from('stock')
        .update({ unidades: existente.unidades + n, actualizado_en: new Date().toISOString() })
        .eq('id', existente.id)
      if (e2) { setError(e2.message); setGuardando(false); return }
      stockId = existente.id
    } else {
      const { data: creado, error: e2 } = await supabase.from('stock')
        .insert({ lote_id: lote.id, presentacion_id: pres.id, unidades: n }).select('id').single()
      if (e2 || !creado) { setError(e2?.message ?? 'error'); setGuardando(false); return }
      stockId = creado.id
    }

    // 3) Registrar movimiento
    const { data: { user } } = await supabase.auth.getUser()
    const { error: e3 } = await supabase.from('movimientos_stock').insert({
      stock_id: stockId,
      tipo: 'envasado',
      unidades: n,
      usuario_id: user?.id ?? null,
      nota: nota.trim() || `Envasado desde lote #${lote.id}`,
    })
    if (e3) { setError(e3.message); setGuardando(false); return }

    setGuardando(false)
    onOk()
  }

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo="Envasar (granel → unidades)" ancho="lg">
      <form onSubmit={guardar} className="space-y-4">
        <div>
          <label className="label">Lote de granel</label>
          <select className="input" value={loteId} onChange={(e) => { setLoteId(e.target.value); setPresentacionId('') }} required>
            <option value="">— Elegir lote —</option>
            {lotes.filter((l) => Number(l.litros_disponibles) > 0).map((l) => {
              const prod = prodPorId.get(l.producto_id)
              return (
                <option key={l.id} value={l.id}>
                  #{l.id} · {prod?.nombre} · {l.edicion ?? `campaña ${l.campaña}`} · {num(l.litros_disponibles)} L disponibles
                </option>
              )
            })}
          </select>
        </div>

        {lote && (
          <>
            <div>
              <label className="label">Presentación</label>
              <select className="input" value={presentacionId} onChange={(e) => setPresentacionId(e.target.value)} required>
                <option value="">— Elegir presentación —</option>
                {presDelProducto.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre} ({p.volumen_ml} ml)</option>
                ))}
              </select>
              {presDelProducto.length === 0 && (
                <p className="text-xs text-red-700 mt-1">Este producto no tiene presentaciones con volumen definido. Cargalas desde Administración.</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Unidades a envasar</label>
                <input className="input" type="number" min="1" step="1" value={unidades} onChange={(e) => setUnidades(e.target.value)} required />
              </div>
              <div>
                <label className="label">Litros que se consumen</label>
                <div className={`input flex items-center tabular-nums ${!litrosOk && unidades ? 'text-red-700' : ''}`}>
                  {num(litrosNecesarios)} L
                  <span className="ml-auto text-xs text-oliva-600">disp: {num(lote.litros_disponibles)} L</span>
                </div>
              </div>
            </div>

            <div>
              <label className="label">Nota (opcional)</label>
              <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} />
            </div>
          </>
        )}

        {error && <div className="text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={guardando || !lote || !pres}>{guardando ? 'Guardando…' : 'Envasar'}</button>
        </div>
      </form>
    </Dialog>
  )
}
