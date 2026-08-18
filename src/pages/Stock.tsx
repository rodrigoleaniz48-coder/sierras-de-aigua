import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Dialog } from '../components/Dialog'
import { num } from '../lib/format'
import { colorProducto } from '../lib/colores'

interface Producto { id: number; nombre: string; categoria: string; granel: boolean }
interface Presentacion {
  id: number; producto_id: number; nombre: string; volumen_ml: number | null
  stock_minimo: number; activo: boolean; es_pack: boolean
}
interface Tanque {
  id: number; nombre: string; capacidad_litros: number
  producto_id: number | null; variedad_libre: string | null
  campana: number | null; litros_actuales: number; notas: string | null; activo: boolean
  actualizado_en?: string
}
interface StockRow { id: number; tanque_id: number | null; presentacion_id: number; unidades: number }
interface MovStock { id: number; stock_id: number; tipo: string; unidades: number; venta_id: number | null; nota: string | null; fecha: string }
interface MovGranel {
  id: number; fecha: string; tipo: string
  tanque_origen_id: number | null; tanque_destino_id: number | null
  litros: number; nota: string | null; stock_id: number | null
}

type Tab = 'tanques' | 'envasado' | 'movimientos'

export function Stock() {
  const { puede } = useAuth()
  const puedeEscribir = puede(['admin', 'ventas'])

  const [tab, setTab] = useState<Tab>('tanques')
  const [productos, setProductos] = useState<Producto[]>([])
  const [presentaciones, setPresentaciones] = useState<Presentacion[]>([])
  const [tanques, setTanques] = useState<Tanque[]>([])
  const [stock, setStock] = useState<StockRow[]>([])
  const [movsStock, setMovsStock] = useState<MovStock[]>([])
  const [movsGranel, setMovsGranel] = useState<MovGranel[]>([])
  const [cargando, setCargando] = useState(true)

  const [envasar, setEnvasar] = useState(false)
  const [ajusteEnv, setAjusteEnv] = useState(false)
  const [trasegar, setTrasegar] = useState(false)
  const [cargarCosecha, setCargarCosecha] = useState(false)
  const [mermaMuestra, setMermaMuestra] = useState(false)
  const [tanqueEdit, setTanqueEdit] = useState<Tanque | null>(null)

  async function cargar() {
    setCargando(true)
    const [p, pr, t, s, mS, mG] = await Promise.all([
      supabase.from('productos').select('id,nombre,categoria,granel').order('nombre'),
      supabase.from('presentaciones').select('id,producto_id,nombre,volumen_ml,stock_minimo,activo,es_pack'),
      supabase.from('tanques').select('*').order('id'),
      supabase.from('stock').select('*'),
      supabase.from('movimientos_stock').select('*').order('fecha', { ascending: false }).limit(100),
      supabase.from('movimientos_granel').select('*').order('fecha', { ascending: false }).limit(100),
    ])
    setProductos((p.data as Producto[]) ?? [])
    setPresentaciones((pr.data as Presentacion[]) ?? [])
    setTanques((t.data as Tanque[]) ?? [])
    setStock((s.data as StockRow[]) ?? [])
    setMovsStock((mS.data as MovStock[]) ?? [])
    setMovsGranel((mG.data as MovGranel[]) ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const prodPorId = useMemo(() => new Map(productos.map((x) => [x.id, x])), [productos])
  const presPorId = useMemo(() => new Map(presentaciones.map((x) => [x.id, x])), [presentaciones])
  const tanquePorId = useMemo(() => new Map(tanques.map((x) => [x.id, x])), [tanques])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-oliva-900">Stock</h1>
          <p className="text-sm text-oliva-700 mt-1">
            Tanques de granel y stock envasado. Cada venta descuenta unidades automáticamente.
          </p>
        </div>
        {puedeEscribir && (
          <div className="flex gap-2 flex-wrap">
            <button className="btn-secondary" onClick={() => setCargarCosecha(true)}>+ Cargar cosecha</button>
            <button className="btn-secondary" onClick={() => setTrasegar(true)}>Trasegar / blend</button>
            <button className="btn-secondary" onClick={() => setMermaMuestra(true)}>Merma / muestra</button>
            <button className="btn-secondary" onClick={() => setAjusteEnv(true)}>Ajuste envasado</button>
            <button className="btn-primary" onClick={() => setEnvasar(true)}>Envasar</button>
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-oliva-100 overflow-x-auto">
        {(['tanques', 'envasado', 'movimientos'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition ${
              tab === t ? 'border-oliva-700 text-oliva-900' : 'border-transparent text-oliva-600 hover:text-oliva-900'
            }`}
            onClick={() => setTab(t)}
          >
            {t === 'tanques' ? 'Tanques (granel)' : t === 'envasado' ? 'Stock envasado' : 'Movimientos'}
          </button>
        ))}
      </div>

      {cargando && <div className="card p-6 text-sm text-oliva-700">Cargando…</div>}

      {!cargando && tab === 'tanques' && (
        <TanquesGrid tanques={tanques} prodPorId={prodPorId} onEditar={setTanqueEdit} puedeEditar={puedeEscribir} />
      )}

      {!cargando && tab === 'envasado' && (
        <EnvasadoView productos={productos} presentaciones={presentaciones.filter((p) => !p.es_pack)} stock={stock} tanquePorId={tanquePorId} prodPorId={prodPorId} />
      )}

      {!cargando && tab === 'movimientos' && (
        <MovimientosView
          movsStock={movsStock}
          movsGranel={movsGranel}
          stock={stock}
          presPorId={presPorId}
          prodPorId={prodPorId}
          tanquePorId={tanquePorId}
        />
      )}

      <EnvasarDialog
        abierto={envasar}
        tanques={tanques.filter((t) => t.activo && Number(t.litros_actuales) > 0)}
        presentaciones={presentaciones.filter((x) => x.activo && x.volumen_ml)}
        prodPorId={prodPorId}
        onCerrar={() => setEnvasar(false)}
        onOk={() => { setEnvasar(false); cargar() }}
      />

      <AjusteEnvasadoDialog
        abierto={ajusteEnv}
        presentaciones={presentaciones.filter((x) => x.activo && !x.es_pack)}
        prodPorId={prodPorId}
        stock={stock}
        tanques={tanques}
        onCerrar={() => setAjusteEnv(false)}
        onOk={() => { setAjusteEnv(false); cargar() }}
      />

      <TrasegarDialog
        abierto={trasegar}
        tanques={tanques.filter((t) => t.activo)}
        prodPorId={prodPorId}
        onCerrar={() => setTrasegar(false)}
        onOk={() => { setTrasegar(false); cargar() }}
      />

      <CargarCosechaDialog
        abierto={cargarCosecha}
        tanques={tanques.filter((t) => t.activo)}
        productos={productos.filter((p) => p.granel)}
        prodPorId={prodPorId}
        onCerrar={() => setCargarCosecha(false)}
        onOk={() => { setCargarCosecha(false); cargar() }}
      />

      <MermaMuestraDialog
        abierto={mermaMuestra}
        tanques={tanques.filter((t) => t.activo && Number(t.litros_actuales) > 0)}
        prodPorId={prodPorId}
        onCerrar={() => setMermaMuestra(false)}
        onOk={() => { setMermaMuestra(false); cargar() }}
      />

      <TanqueEditDialog
        abierto={tanqueEdit !== null}
        tanque={tanqueEdit}
        productos={productos.filter((p) => p.granel)}
        onCerrar={() => setTanqueEdit(null)}
        onOk={() => { setTanqueEdit(null); cargar() }}
      />
    </div>
  )
}

// ============================================================
// Vistas
// ============================================================

function contenidoDe(t: Tanque, prodPorId: Map<number, Producto>) {
  if (t.producto_id) return prodPorId.get(t.producto_id)?.nombre ?? '—'
  if (t.variedad_libre) return t.variedad_libre
  return 'Vacío'
}

function TanquesGrid({
  tanques, prodPorId, onEditar, puedeEditar,
}: {
  tanques: Tanque[]
  prodPorId: Map<number, Producto>
  onEditar: (t: Tanque) => void
  puedeEditar: boolean
}) {
  if (tanques.length === 0) {
    return <div className="card p-6 text-sm text-oliva-700">No hay tanques cargados.</div>
  }
  const totalCap = tanques.reduce((s, t) => s + Number(t.capacidad_litros), 0)
  const totalActual = tanques.reduce((s, t) => s + Number(t.litros_actuales), 0)

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap gap-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-oliva-600">Total granel</div>
          <div className="text-2xl font-semibold text-oliva-900 tabular-nums">{num(totalActual)} L</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-oliva-600">Capacidad</div>
          <div className="text-2xl font-semibold text-oliva-900 tabular-nums">{num(totalCap)} L</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-oliva-600">Ocupación</div>
          <div className="text-2xl font-semibold text-oliva-900 tabular-nums">
            {totalCap ? Math.round((totalActual / totalCap) * 100) : 0}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tanques.map((t) => (
          <TanqueCard key={t.id} tanque={t} prodPorId={prodPorId} onEditar={() => onEditar(t)} puedeEditar={puedeEditar} />
        ))}
      </div>
    </div>
  )
}

function TanqueCard({
  tanque, prodPorId, onEditar, puedeEditar,
}: {
  tanque: Tanque
  prodPorId: Map<number, Producto>
  onEditar: () => void
  puedeEditar: boolean
}) {
  const cap = Number(tanque.capacidad_litros) || 1
  const actual = Number(tanque.litros_actuales)
  const pct = Math.min(100, Math.round((actual / cap) * 100))
  const contenido = contenidoDe(tanque, prodPorId)
  const vacio = actual === 0
  const color = colorProducto(vacio ? null : contenido)

  return (
    <div className={`card p-4 flex flex-col gap-3 border-2 ${color.card} ${!tanque.activo ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-lg font-semibold text-oliva-900">{tanque.nombre}</div>
          <div className={`text-sm ${vacio ? 'italic text-oliva-500' : 'text-oliva-800'}`}>{contenido}</div>
          {tanque.campana && !vacio && (
            <div className="text-xs text-oliva-600 mt-0.5">Campaña {tanque.campana}</div>
          )}
        </div>
        {puedeEditar && (
          <button
            className="text-xs text-oliva-700 hover:text-oliva-900 underline"
            onClick={onEditar}
          >
            Editar
          </button>
        )}
      </div>

      {/* Barra visual tipo "tanque" */}
      <div className="relative h-24 rounded-lg border-2 border-oliva-200 overflow-hidden bg-white/70">
        <div
          className={`absolute bottom-0 left-0 right-0 transition-all ${vacio ? '' : color.fill}`}
          style={{ height: `${pct}%` }}
        />
        <div className="absolute inset-0 flex items-end justify-center pb-1">
          <div className="text-xs font-medium text-oliva-900 bg-white/80 rounded px-2 py-0.5 tabular-nums">
            {num(actual)} L
          </div>
        </div>
      </div>

      <div className="flex justify-between text-xs text-oliva-600 tabular-nums">
        <span>{pct}% ocupación</span>
        <span>Cap. {num(cap)} L</span>
      </div>

      {tanque.notas && (
        <div className="text-xs text-oliva-600 italic">{tanque.notas}</div>
      )}
    </div>
  )
}

function EnvasadoView({
  productos, presentaciones, stock, tanquePorId, prodPorId,
}: {
  productos: Producto[]
  presentaciones: Presentacion[]
  stock: StockRow[]
  tanquePorId: Map<number, Tanque>
  prodPorId: Map<number, Producto>
}) {
  const filas = useMemo(() => {
    const porPres = new Map<number, { unidades: number; detalle: { tanque_id: number | null; unidades: number }[] }>()
    for (const s of stock) {
      const g = porPres.get(s.presentacion_id) ?? { unidades: 0, detalle: [] }
      g.unidades += s.unidades
      g.detalle.push({ tanque_id: s.tanque_id, unidades: s.unidades })
      porPres.set(s.presentacion_id, g)
    }
    return presentaciones
      .map((p) => {
        const prod = productos.find((x) => x.id === p.producto_id)
        const g = porPres.get(p.id) ?? { unidades: 0, detalle: [] }
        return { pres: p, prod, unidades: g.unidades, detalle: g.detalle }
      })
      .filter((r) => r.prod)
      .sort((a, b) => (a.prod!.nombre + a.pres.nombre).localeCompare(b.prod!.nombre + b.pres.nombre))
  }, [productos, presentaciones, stock])

  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm min-w-[720px]">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-oliva-600 border-b border-oliva-100 bg-oliva-50">
            <th className="py-2 px-4">Producto</th>
            <th className="py-2 px-4">Presentación</th>
            <th className="py-2 px-4 text-right">Unidades</th>
            <th className="py-2 px-4 text-right">Mínimo</th>
            <th className="py-2 px-4">Proviene de</th>
            <th className="py-2 px-4"></th>
          </tr>
        </thead>
        <tbody>
          {filas.map((r) => {
            const bajo = r.unidades <= r.pres.stock_minimo && r.pres.stock_minimo > 0
            const origenes = r.detalle
              .filter((d) => d.unidades > 0)
              .map((d) => {
                if (!d.tanque_id) return 'directo (sin tanque)'
                const t = tanquePorId.get(d.tanque_id)
                if (!t) return `T${d.tanque_id}`
                const contenido = t.producto_id
                  ? prodPorId.get(t.producto_id)?.nombre
                  : t.variedad_libre
                const camp = t.campana ? ` ${t.campana}` : ''
                return contenido ? `${t.nombre} · ${contenido}${camp}` : t.nombre
              })
            const color = colorProducto(r.prod?.nombre)
            return (
              <tr key={r.pres.id} className="border-b border-oliva-100/70 last:border-0">
                <td className="py-2 px-4 text-oliva-800">
                  <span className={`inline-block w-2 h-2 rounded-full ${color.dot} mr-2 align-middle`}></span>
                  {r.prod?.nombre}
                </td>
                <td className="py-2 px-4 text-oliva-800">{r.pres.nombre}</td>
                <td className={`py-2 px-4 text-right tabular-nums font-medium ${r.unidades === 0 ? 'text-oliva-400' : 'text-oliva-900'}`}>{r.unidades}</td>
                <td className="py-2 px-4 text-right tabular-nums text-oliva-600">{r.pres.stock_minimo || '—'}</td>
                <td className="py-2 px-4 text-oliva-600 text-xs">{origenes.length ? Array.from(new Set(origenes)).join(', ') : '—'}</td>
                <td className="py-2 px-4 text-right">
                  {bajo && <span className="text-[11px] rounded-full bg-red-100 text-red-800 px-2 py-[1px] uppercase tracking-wide">Bajo</span>}
                </td>
              </tr>
            )
          })}
          {filas.length === 0 && (
            <tr><td colSpan={6} className="py-6 text-center text-sm text-oliva-600">Sin presentaciones cargadas.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function MovimientosView({
  movsStock, movsGranel, stock, presPorId, prodPorId, tanquePorId,
}: {
  movsStock: MovStock[]
  movsGranel: MovGranel[]
  stock: StockRow[]
  presPorId: Map<number, Presentacion>
  prodPorId: Map<number, Producto>
  tanquePorId: Map<number, Tanque>
}) {
  const stockPorId = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock])

  type Row = {
    key: string; fecha: string; tipo: string; que: string
    detalle: string; cantidad: string; nota: string | null; scope: 'granel' | 'envasado'
  }

  function tanqueLabel(id: number | null): string | null {
    if (!id) return null
    const t = tanquePorId.get(id)
    if (!t) return `T${id}`
    const contenido = t.producto_id
      ? prodPorId.get(t.producto_id)?.nombre
      : t.variedad_libre
    const camp = t.campana ? ` ${t.campana}` : ''
    return contenido ? `${t.nombre} · ${contenido}${camp}` : t.nombre
  }

  const filas: Row[] = useMemo(() => {
    const gr: Row[] = movsGranel.map((m) => {
      const org = tanqueLabel(m.tanque_origen_id)
      const dest = tanqueLabel(m.tanque_destino_id)
      const detalle = m.tipo === 'trasegar' ? `${org} → ${dest}`
        : m.tipo === 'cargar'   ? `→ ${dest}`
        : m.tipo === 'envasar'  ? `${org} → envasado`
        : `${org ?? dest ?? '—'}`
      return {
        key: `g${m.id}`, fecha: m.fecha, tipo: m.tipo, que: 'granel',
        detalle, cantidad: `${Number(m.litros).toString()} L`, nota: m.nota, scope: 'granel',
      }
    })
    const st: Row[] = movsStock.map((m) => {
      const s = stockPorId.get(m.stock_id)
      const pres = s ? presPorId.get(s.presentacion_id) : undefined
      const prod = pres ? prodPorId.get(pres.producto_id) : undefined
      return {
        key: `s${m.id}`, fecha: m.fecha, tipo: m.tipo, que: 'envasado',
        detalle: `${prod?.nombre ?? '—'} · ${pres?.nombre ?? '—'}`,
        cantidad: `${m.unidades > 0 ? '+' : ''}${m.unidades} u`,
        nota: m.nota, scope: 'envasado',
      }
    })
    return [...gr, ...st].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  }, [movsStock, movsGranel, stock, presPorId, prodPorId, tanquePorId, stockPorId])

  if (filas.length === 0) return <div className="card p-6 text-sm text-oliva-700">Sin movimientos todavía.</div>

  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm min-w-[720px]">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-oliva-600 border-b border-oliva-100 bg-oliva-50">
            <th className="py-2 px-4">Fecha</th>
            <th className="py-2 px-4">Capa</th>
            <th className="py-2 px-4">Tipo</th>
            <th className="py-2 px-4">Detalle</th>
            <th className="py-2 px-4 text-right">Cantidad</th>
            <th className="py-2 px-4">Nota</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((r) => (
            <tr key={r.key} className="border-b border-oliva-100/70 last:border-0">
              <td className="py-2 px-4 tabular-nums text-oliva-600 whitespace-nowrap">{new Date(r.fecha).toLocaleString('es-UY')}</td>
              <td className="py-2 px-4 text-xs text-oliva-600 uppercase">{r.scope}</td>
              <td className="py-2 px-4">
                <span className={`text-[11px] uppercase tracking-wide rounded-full px-2 py-[1px] ${badgeTipo(r.tipo)}`}>{r.tipo}</span>
              </td>
              <td className="py-2 px-4 text-oliva-800">{r.detalle}</td>
              <td className={`py-2 px-4 text-right tabular-nums font-medium ${r.cantidad.startsWith('-') ? 'text-red-700' : 'text-oliva-900'}`}>{r.cantidad}</td>
              <td className="py-2 px-4 text-oliva-600 truncate max-w-[240px]">{r.nota ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function badgeTipo(t: string) {
  switch (t) {
    case 'envasado':
    case 'envasar':   return 'bg-oliva-100 text-oliva-800'
    case 'cargar':    return 'bg-aceite-500/15 text-aceite-600'
    case 'trasegar':  return 'bg-tierra-100 text-tierra-800'
    case 'venta':     return 'bg-aceite-500/10 text-aceite-600'
    case 'merma':     return 'bg-red-100 text-red-800'
    case 'muestra':   return 'bg-oliva-200 text-oliva-800'
    case 'ajuste':    return 'bg-tierra-100 text-tierra-800'
    default:          return 'bg-oliva-100 text-oliva-700'
  }
}

// ============================================================
// Dialogs
// ============================================================

function EnvasarDialog({
  abierto, tanques, presentaciones, prodPorId, onCerrar, onOk,
}: {
  abierto: boolean
  tanques: Tanque[]
  presentaciones: Presentacion[]
  prodPorId: Map<number, Producto>
  onCerrar: () => void
  onOk: () => void
}) {
  const [tanqueId, setTanqueId] = useState<string>('')
  const [presentacionId, setPresentacionId] = useState<string>('')
  const [unidades, setUnidades] = useState<string>('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setTanqueId(''); setPresentacionId(''); setUnidades(''); setNota(''); setError(null)
  }, [abierto])

  const tanque = tanques.find((t) => t.id === Number(tanqueId))
  const presDelTanque = tanque?.producto_id
    ? presentaciones.filter((p) => p.producto_id === tanque.producto_id && p.volumen_ml)
    : []
  const pres = presDelTanque.find((p) => p.id === Number(presentacionId))
  const litrosNecesarios = pres && unidades ? (Number(unidades) * (pres.volumen_ml ?? 0)) / 1000 : 0
  const litrosOk = tanque ? litrosNecesarios <= Number(tanque.litros_actuales) + 0.0001 : false

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!tanque || !pres) return
    const n = Number(unidades)
    if (!n || n <= 0) { setError('Unidades > 0'); return }
    if (!litrosOk) { setError(`Faltan litros. Necesarios: ${litrosNecesarios} L; disponibles: ${tanque.litros_actuales} L.`); return }

    setGuardando(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()

    // 1) Descontar del tanque
    const { error: e1 } = await supabase.from('tanques')
      .update({ litros_actuales: Number(tanque.litros_actuales) - litrosNecesarios, actualizado_en: new Date().toISOString() })
      .eq('id', tanque.id)
    if (e1) { setError(e1.message); setGuardando(false); return }

    // 2) Upsert en stock
    const { data: existente } = await supabase.from('stock')
      .select('id,unidades').eq('tanque_id', tanque.id).eq('presentacion_id', pres.id).maybeSingle()
    let stockId: number
    if (existente) {
      const { error: e2 } = await supabase.from('stock')
        .update({ unidades: existente.unidades + n, actualizado_en: new Date().toISOString() })
        .eq('id', existente.id)
      if (e2) { setError(e2.message); setGuardando(false); return }
      stockId = existente.id
    } else {
      const { data: creado, error: e2 } = await supabase.from('stock')
        .insert({ tanque_id: tanque.id, presentacion_id: pres.id, unidades: n }).select('id').single()
      if (e2 || !creado) { setError(e2?.message ?? 'error'); setGuardando(false); return }
      stockId = creado.id
    }

    // 3) Movimiento de granel
    const { error: e3 } = await supabase.from('movimientos_granel').insert({
      tipo: 'envasar', tanque_origen_id: tanque.id, litros: litrosNecesarios,
      stock_id: stockId, usuario_id: user?.id ?? null, nota: nota.trim() || null,
    })
    if (e3) { setError(e3.message); setGuardando(false); return }

    // 4) Movimiento de stock (unidades +)
    await supabase.from('movimientos_stock').insert({
      stock_id: stockId, tipo: 'envasado', unidades: n,
      usuario_id: user?.id ?? null, nota: nota.trim() || `Envasado desde ${tanque.nombre}`,
    })

    setGuardando(false)
    onOk()
  }

  const tanquesConProd = tanques.filter((t) => t.producto_id)

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo="Envasar (granel → unidades)" ancho="lg">
      <form onSubmit={guardar} className="space-y-4">
        <div>
          <label className="label">Tanque</label>
          <select className="input" value={tanqueId} onChange={(e) => { setTanqueId(e.target.value); setPresentacionId('') }} required>
            <option value="">— Elegir tanque —</option>
            {tanquesConProd.map((t) => {
              const prod = t.producto_id ? prodPorId.get(t.producto_id) : null
              return (
                <option key={t.id} value={t.id}>
                  {t.nombre} · {prod?.nombre} {t.campana ? `· ${t.campana}` : ''} · {num(t.litros_actuales)} L
                </option>
              )
            })}
          </select>
          {tanquesConProd.length === 0 && (
            <p className="text-xs text-red-700 mt-1">Ningún tanque activo mapea a un producto vendible.</p>
          )}
        </div>

        {tanque && (
          <>
            <div>
              <label className="label">Presentación</label>
              <select className="input" value={presentacionId} onChange={(e) => setPresentacionId(e.target.value)} required>
                <option value="">— Elegir presentación —</option>
                {presDelTanque.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre} ({p.volumen_ml} ml)</option>
                ))}
              </select>
              {presDelTanque.length === 0 && (
                <p className="text-xs text-red-700 mt-1">Sin presentaciones con volumen para este producto.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Unidades a envasar</label>
                <input className="input" type="number" min="1" step="1" value={unidades} onChange={(e) => setUnidades(e.target.value)} required />
              </div>
              <div>
                <label className="label">Litros que se consumen</label>
                <div className={`input flex items-center tabular-nums ${!litrosOk && unidades ? 'text-red-700' : ''}`}>
                  {num(litrosNecesarios)} L
                  <span className="ml-auto text-xs text-oliva-600">disp: {num(tanque.litros_actuales)}</span>
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
          <button type="submit" className="btn-primary" disabled={guardando || !tanque || !pres}>{guardando ? 'Guardando…' : 'Envasar'}</button>
        </div>
      </form>
    </Dialog>
  )
}

function AjusteEnvasadoDialog({
  abierto, presentaciones, prodPorId, stock, tanques, onCerrar, onOk,
}: {
  abierto: boolean
  presentaciones: Presentacion[]
  prodPorId: Map<number, Producto>
  stock: StockRow[]
  tanques: Tanque[]
  onCerrar: () => void
  onOk: () => void
}) {
  const [presentacionId, setPresentacionId] = useState<string>('')
  const [tanqueId, setTanqueId] = useState<string>('')  // opcional
  const [delta, setDelta] = useState<string>('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setPresentacionId(''); setTanqueId(''); setDelta(''); setNota(''); setError(null)
  }, [abierto])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    const pres = presentaciones.find((p) => p.id === Number(presentacionId))
    if (!pres) return
    const d = Number(delta)
    if (!d) { setError('Ingresá una cantidad distinta de 0'); return }

    setGuardando(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()

    const tanqueNum = tanqueId ? Number(tanqueId) : null
    const existente = stock.find((s) => s.presentacion_id === pres.id && (s.tanque_id ?? null) === tanqueNum)
    let stockId: number
    if (existente) {
      const nueva = existente.unidades + d
      if (nueva < 0) { setError(`Quedaría stock negativo (${nueva}).`); setGuardando(false); return }
      const { error: e2 } = await supabase.from('stock')
        .update({ unidades: nueva, actualizado_en: new Date().toISOString() }).eq('id', existente.id)
      if (e2) { setError(e2.message); setGuardando(false); return }
      stockId = existente.id
    } else {
      if (d < 0) { setError('No hay stock previo para ajustar negativo.'); setGuardando(false); return }
      const { data: creado, error: e2 } = await supabase.from('stock')
        .insert({ tanque_id: tanqueNum, presentacion_id: pres.id, unidades: d }).select('id').single()
      if (e2 || !creado) { setError(e2?.message ?? 'error'); setGuardando(false); return }
      stockId = creado.id
    }

    await supabase.from('movimientos_stock').insert({
      stock_id: stockId, tipo: 'ajuste', unidades: d,
      usuario_id: user?.id ?? null, nota: nota.trim() || 'Ajuste manual',
    })

    setGuardando(false); onOk()
  }

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo="Ajuste manual de stock envasado" ancho="lg">
      <form onSubmit={guardar} className="space-y-4">
        <p className="text-xs text-oliva-600">
          Usalo para carga inicial (producto ya envasado antes de la app), correcciones de conteo, o mermas
          de envasado (rotura de botellas, etc.). Poné cantidades negativas para restar.
        </p>

        <div>
          <label className="label">Presentación</label>
          <select className="input" value={presentacionId} onChange={(e) => setPresentacionId(e.target.value)} required>
            <option value="">— Elegir —</option>
            {presentaciones.map((p) => {
              const prod = prodPorId.get(p.producto_id)
              return (
                <option key={p.id} value={p.id}>{prod?.nombre} · {p.nombre}</option>
              )
            })}
          </select>
        </div>

        <div>
          <label className="label">Tanque de origen (opcional)</label>
          <select className="input" value={tanqueId} onChange={(e) => setTanqueId(e.target.value)}>
            <option value="">— sin asociar (carga externa) —</option>
            {tanques.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre} · {contenidoDe(t, prodPorId)}{t.campana ? ` ${t.campana}` : ''}</option>
            ))}
          </select>
          <p className="text-xs text-oliva-600 mt-1">
            Solo si querés dejar registrado de qué tanque proviene ese stock ya envasado.
          </p>
        </div>

        <div>
          <label className="label">Cantidad (+ para sumar, − para restar)</label>
          <input className="input" type="number" step="1" value={delta} onChange={(e) => setDelta(e.target.value)} required />
        </div>

        <div>
          <label className="label">Motivo / nota</label>
          <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="ej: Carga inicial Picual" />
        </div>

        {error && <div className="text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Aplicar ajuste'}</button>
        </div>
      </form>
    </Dialog>
  )
}

function TrasegarDialog({
  abierto, tanques, prodPorId, onCerrar, onOk,
}: {
  abierto: boolean
  tanques: Tanque[]
  prodPorId: Map<number, Producto>
  onCerrar: () => void
  onOk: () => void
}) {
  const [origenId, setOrigenId] = useState<string>('')
  const [destinoId, setDestinoId] = useState<string>('')
  const [litros, setLitros] = useState<string>('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setOrigenId(''); setDestinoId(''); setLitros(''); setNota(''); setError(null)
  }, [abierto])

  const origen = tanques.find((t) => t.id === Number(origenId))
  const destino = tanques.find((t) => t.id === Number(destinoId))
  const L = Number(litros) || 0
  const espacioDest = destino ? Number(destino.capacidad_litros) - Number(destino.litros_actuales) : Infinity
  const okOrigen = origen ? L <= Number(origen.litros_actuales) : false
  const okDestino = destino ? L <= espacioDest : true

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!origen || !destino) return
    if (origen.id === destino.id) { setError('Origen y destino deben ser distintos.'); return }
    if (!L || L <= 0) { setError('Litros > 0'); return }
    if (!okOrigen) { setError(`El tanque origen solo tiene ${origen.litros_actuales} L.`); return }
    if (!okDestino) { setError(`En el destino solo entran ${espacioDest} L más.`); return }

    setGuardando(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()

    const { error: e1 } = await supabase.from('tanques')
      .update({ litros_actuales: Number(origen.litros_actuales) - L, actualizado_en: new Date().toISOString() })
      .eq('id', origen.id)
    if (e1) { setError(e1.message); setGuardando(false); return }

    // Si destino estaba vacío, hereda contenido/campana del origen
    const patch: Partial<Tanque> = { litros_actuales: Number(destino.litros_actuales) + L, actualizado_en: new Date().toISOString() }
    if (Number(destino.litros_actuales) === 0) {
      patch.producto_id = origen.producto_id
      patch.variedad_libre = origen.variedad_libre
      patch.campana = origen.campana
    }
    const { error: e2 } = await supabase.from('tanques').update(patch).eq('id', destino.id)
    if (e2) { setError(e2.message); setGuardando(false); return }

    const { error: e3 } = await supabase.from('movimientos_granel').insert({
      tipo: 'trasegar', tanque_origen_id: origen.id, tanque_destino_id: destino.id,
      litros: L, usuario_id: user?.id ?? null, nota: nota.trim() || null,
    })
    if (e3) { setError(e3.message); setGuardando(false); return }

    setGuardando(false); onOk()
  }

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo="Trasegar / armar blend" ancho="lg">
      <form onSubmit={guardar} className="space-y-4">
        <p className="text-xs text-oliva-600">
          Movés litros de un tanque a otro. Si el destino está vacío, hereda el contenido y campana
          del origen. Para armar un blend con varios orígenes, hacé un trasiego por cada tanque origen.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Origen</label>
            <select className="input" value={origenId} onChange={(e) => setOrigenId(e.target.value)} required>
              <option value="">— Elegir —</option>
              {tanques.filter((t) => Number(t.litros_actuales) > 0).map((t) => (
                <option key={t.id} value={t.id}>{t.nombre} · {contenidoDe(t, prodPorId)} · {num(t.litros_actuales)} L</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Destino</label>
            <select className="input" value={destinoId} onChange={(e) => setDestinoId(e.target.value)} required>
              <option value="">— Elegir —</option>
              {tanques.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre} · {contenidoDe(t, prodPorId)} · {num(t.litros_actuales)}/{num(t.capacidad_litros)} L</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Litros a mover</label>
            <input className="input" type="number" min="0.01" step="0.01" value={litros} onChange={(e) => setLitros(e.target.value)} required />
          </div>
          <div>
            <label className="label">Nota</label>
            <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="ej: Armado blend intenso" />
          </div>
        </div>

        {error && <div className="text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Trasegar'}</button>
        </div>
      </form>
    </Dialog>
  )
}

function CargarCosechaDialog({
  abierto, tanques, productos, prodPorId, onCerrar, onOk,
}: {
  abierto: boolean
  tanques: Tanque[]
  productos: Producto[]
  prodPorId: Map<number, Producto>
  onCerrar: () => void
  onOk: () => void
}) {
  const anio = new Date().getFullYear()
  const [tanqueId, setTanqueId] = useState<string>('')
  const [litros, setLitros] = useState<string>('')
  const [productoId, setProductoId] = useState<string>('')
  const [variedadLibre, setVariedadLibre] = useState<string>('')
  const [campana, setCampana] = useState<string>(String(anio))
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setTanqueId(''); setLitros(''); setProductoId(''); setVariedadLibre('')
    setCampana(String(anio)); setNota(''); setError(null)
  }, [abierto, anio])

  const tanque = tanques.find((t) => t.id === Number(tanqueId))
  const vacio = tanque && Number(tanque.litros_actuales) === 0
  const L = Number(litros) || 0
  const espacio = tanque ? Number(tanque.capacidad_litros) - Number(tanque.litros_actuales) : 0
  const okEspacio = tanque ? L <= espacio : true

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!tanque) return
    if (!L || L <= 0) { setError('Litros > 0'); return }
    if (!okEspacio) { setError(`No entra: capacidad libre ${espacio} L.`); return }

    setGuardando(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()

    const patch: Partial<Tanque> = {
      litros_actuales: Number(tanque.litros_actuales) + L,
      actualizado_en: new Date().toISOString(),
    }
    // Si el tanque estaba vacío, tomamos contenido nuevo del formulario
    if (vacio) {
      patch.producto_id = productoId ? Number(productoId) : null
      patch.variedad_libre = productoId ? null : (variedadLibre.trim() || null)
      patch.campana = Number(campana)
    }
    const { error: e1 } = await supabase.from('tanques').update(patch).eq('id', tanque.id)
    if (e1) { setError(e1.message); setGuardando(false); return }

    const { error: e2 } = await supabase.from('movimientos_granel').insert({
      tipo: 'cargar', tanque_destino_id: tanque.id, litros: L,
      usuario_id: user?.id ?? null, nota: nota.trim() || null,
    })
    if (e2) { setError(e2.message); setGuardando(false); return }

    setGuardando(false); onOk()
  }

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo="Cargar cosecha en tanque" ancho="lg">
      <form onSubmit={guardar} className="space-y-4">
        <div>
          <label className="label">Tanque destino</label>
          <select className="input" value={tanqueId} onChange={(e) => setTanqueId(e.target.value)} required>
            <option value="">— Elegir —</option>
            {tanques.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre} · {contenidoDe(t, prodPorId)} · {num(t.litros_actuales)}/{num(t.capacidad_litros)} L
              </option>
            ))}
          </select>
        </div>

        {tanque && (
          <>
            <div>
              <label className="label">Litros a cargar</label>
              <input className="input" type="number" min="0.01" step="0.01" value={litros} onChange={(e) => setLitros(e.target.value)} required />
              <p className={`text-xs mt-1 ${okEspacio ? 'text-oliva-600' : 'text-red-700'}`}>
                Espacio libre: {num(espacio)} L
              </p>
            </div>

            {vacio && (
              <div className="rounded-lg border border-oliva-100 p-3 bg-oliva-50/60 space-y-3">
                <div className="text-xs text-oliva-700 font-medium">Tanque vacío — definí el contenido nuevo:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Producto vendible</label>
                    <select className="input" value={productoId} onChange={(e) => setProductoId(e.target.value)}>
                      <option value="">— ninguno (materia prima) —</option>
                      {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Variedad libre (si no es vendible)</label>
                    <input className="input" value={variedadLibre} onChange={(e) => setVariedadLibre(e.target.value)} disabled={!!productoId} placeholder="ej: Coratina pura" />
                  </div>
                  <div>
                    <label className="label">Campaña</label>
                    <input className="input" type="number" min="2000" max="2100" value={campana} onChange={(e) => setCampana(e.target.value)} required />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="label">Nota</label>
              <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="ej: Cosecha 2026 primer día" />
            </div>
          </>
        )}

        {error && <div className="text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={guardando || !tanque}>{guardando ? 'Guardando…' : 'Cargar'}</button>
        </div>
      </form>
    </Dialog>
  )
}

function MermaMuestraDialog({
  abierto, tanques, prodPorId, onCerrar, onOk,
}: {
  abierto: boolean
  tanques: Tanque[]
  prodPorId: Map<number, Producto>
  onCerrar: () => void
  onOk: () => void
}) {
  const [tanqueId, setTanqueId] = useState<string>('')
  const [tipo, setTipo] = useState<'merma' | 'muestra'>('merma')
  const [litros, setLitros] = useState<string>('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setTanqueId(''); setTipo('merma'); setLitros(''); setNota(''); setError(null)
  }, [abierto])

  const tanque = tanques.find((t) => t.id === Number(tanqueId))
  const L = Number(litros) || 0
  const ok = tanque ? L <= Number(tanque.litros_actuales) : false

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!tanque) return
    if (!L || L <= 0) { setError('Litros > 0'); return }
    if (!ok) { setError(`Solo hay ${tanque.litros_actuales} L en el tanque.`); return }

    setGuardando(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()

    const { error: e1 } = await supabase.from('tanques')
      .update({ litros_actuales: Number(tanque.litros_actuales) - L, actualizado_en: new Date().toISOString() })
      .eq('id', tanque.id)
    if (e1) { setError(e1.message); setGuardando(false); return }

    const { error: e2 } = await supabase.from('movimientos_granel').insert({
      tipo, tanque_origen_id: tanque.id, litros: L,
      usuario_id: user?.id ?? null, nota: nota.trim() || null,
    })
    if (e2) { setError(e2.message); setGuardando(false); return }

    setGuardando(false); onOk()
  }

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo="Merma o muestra de granel">
      <form onSubmit={guardar} className="space-y-4">
        <div>
          <label className="label">Tipo</label>
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as 'merma' | 'muestra')}>
            <option value="merma">Merma (pérdida)</option>
            <option value="muestra">Muestra / análisis / degustación</option>
          </select>
        </div>
        <div>
          <label className="label">Tanque</label>
          <select className="input" value={tanqueId} onChange={(e) => setTanqueId(e.target.value)} required>
            <option value="">— Elegir —</option>
            {tanques.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre} · {contenidoDe(t, prodPorId)} · {num(t.litros_actuales)} L</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Litros</label>
          <input className="input" type="number" min="0.01" step="0.01" value={litros} onChange={(e) => setLitros(e.target.value)} required />
        </div>
        <div>
          <label className="label">Nota</label>
          <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>

        {error && <div className="text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Registrar'}</button>
        </div>
      </form>
    </Dialog>
  )
}

function TanqueEditDialog({
  abierto, tanque, productos, onCerrar, onOk,
}: {
  abierto: boolean
  tanque: Tanque | null
  productos: Producto[]
  onCerrar: () => void
  onOk: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [cap, setCap] = useState('')
  const [productoId, setProductoId] = useState<string>('')
  const [variedadLibre, setVariedadLibre] = useState('')
  const [campana, setCampana] = useState('')
  const [notas, setNotas] = useState('')
  const [activo, setActivo] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto || !tanque) return
    setNombre(tanque.nombre)
    setCap(String(tanque.capacidad_litros))
    setProductoId(tanque.producto_id ? String(tanque.producto_id) : '')
    setVariedadLibre(tanque.variedad_libre ?? '')
    setCampana(tanque.campana ? String(tanque.campana) : '')
    setNotas(tanque.notas ?? '')
    setActivo(tanque.activo)
    setError(null)
  }, [abierto, tanque])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!tanque) return
    setGuardando(true); setError(null)
    const { error } = await supabase.from('tanques').update({
      nombre: nombre.trim(),
      capacidad_litros: Number(cap) || tanque.capacidad_litros,
      producto_id: productoId ? Number(productoId) : null,
      variedad_libre: productoId ? null : (variedadLibre.trim() || null),
      campana: campana ? Number(campana) : null,
      notas: notas.trim() || null,
      activo,
      actualizado_en: new Date().toISOString(),
    }).eq('id', tanque.id)
    setGuardando(false)
    if (error) setError(error.message); else onOk()
  }

  if (!tanque) return null

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo={`Editar ${tanque.nombre}`} ancho="lg">
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Nombre</label>
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </div>
          <div>
            <label className="label">Capacidad (L)</label>
            <input className="input" type="number" min="1" step="1" value={cap} onChange={(e) => setCap(e.target.value)} required />
          </div>
          <div>
            <label className="label">Producto vendible</label>
            <select className="input" value={productoId} onChange={(e) => setProductoId(e.target.value)}>
              <option value="">— ninguno —</option>
              {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Variedad libre</label>
            <input className="input" value={variedadLibre} onChange={(e) => setVariedadLibre(e.target.value)} disabled={!!productoId} />
          </div>
          <div>
            <label className="label">Campaña</label>
            <input className="input" type="number" min="2000" max="2100" value={campana} onChange={(e) => setCampana(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <input id="tk-act" type="checkbox" className="h-4 w-4 accent-oliva-700" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            <label htmlFor="tk-act" className="text-sm text-oliva-800">Activo</label>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notas</label>
            <textarea className="input min-h-[60px]" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-oliva-600">
          Los litros actuales solo se cambian con acciones (cargar/envasar/trasegar/merma).
          Si necesitás corregirlos, usá "Merma / muestra" para bajar o "Cargar cosecha" para subir.
        </p>
        {error && <div className="text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Dialog>
  )
}
