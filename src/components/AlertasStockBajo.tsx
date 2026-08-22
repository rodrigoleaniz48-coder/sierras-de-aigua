import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { colorProducto } from '../lib/colores'

interface Presentacion { id: number; producto_id: number; nombre: string; activo: boolean; es_pack: boolean; stock_minimo: number }
interface Producto { id: number; nombre: string; categoria: string }
interface StockRow { presentacion_id: number; unidades: number; ubicacion_id: number }
interface Ubicacion { id: number; nombre: string }
interface MinimoUbic { presentacion_id: number; ubicacion_id: number; minimo: number }

/** Ubicaciones que le interesan al socio según su rol/lugar. Almazara siempre. */
function ubicacionesRelevantes(nombre: string | null | undefined): number[] {
  const n = (nombre ?? '').toLowerCase()
  const base = [1] // Almazara siempre
  if (n.includes('gonzalo')) return [...base, 2] // Maldonado
  if (n.includes('rodrigo') || n.includes('santi')) return [...base, 3] // Montevideo
  return base // Ayelén y demás: solo Almazara
}

export function AlertasStockBajo() {
  const { perfil } = useAuth()
  const [pres, setPres] = useState<Presentacion[]>([])
  const [prod, setProd] = useState<Producto[]>([])
  const [stock, setStock] = useState<StockRow[]>([])
  const [ubic, setUbic] = useState<Ubicacion[]>([])
  const [minimos, setMinimos] = useState<MinimoUbic[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('presentaciones').select('id,producto_id,nombre,activo,es_pack,stock_minimo').eq('activo', true),
      supabase.from('productos').select('id,nombre,categoria'),
      supabase.from('stock').select('presentacion_id,unidades,ubicacion_id'),
      supabase.from('ubicaciones').select('id,nombre').eq('activo', true),
      supabase.from('stock_minimos_ubicacion').select('*'),
    ]).then(([p, pr, s, u, m]) => {
      setPres((p.data as Presentacion[]) ?? [])
      setProd((pr.data as Producto[]) ?? [])
      setStock((s.data as StockRow[]) ?? [])
      setUbic((u.data as Ubicacion[]) ?? [])
      setMinimos((m.data as MinimoUbic[]) ?? [])
      setCargando(false)
    })
  }, [])

  const prodPorId = useMemo(() => new Map(prod.map((p) => [p.id, p])), [prod])
  const ubicPorId = useMemo(() => new Map(ubic.map((u) => [u.id, u])), [ubic])
  const minimoPorPresUbic = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of minimos) m.set(`${x.presentacion_id}:${x.ubicacion_id}`, x.minimo)
    return m
  }, [minimos])

  const ubicIds = useMemo(() => ubicacionesRelevantes(perfil?.nombre), [perfil])

  type Alerta = { pres: Presentacion; prod: Producto; ubicacionId: number; stock: number; minimo: number; nivel: 'rojo' | 'amarillo' }

  const alertas: Alerta[] = useMemo(() => {
    const arr: Alerta[] = []
    for (const p of pres) {
      if (p.es_pack) continue
      const pr = prodPorId.get(p.producto_id)
      if (!pr) continue
      for (const uid of ubicIds) {
        // Override por ubicacion; si no, cae al minimo global (presentaciones.stock_minimo)
        const min = minimoPorPresUbic.get(`${p.id}:${uid}`) ?? Number(p.stock_minimo) ?? 0
        if (min <= 0) continue
        const totalEnUbic = stock.filter((s) => s.presentacion_id === p.id && s.ubicacion_id === uid).reduce((a, b) => a + b.unidades, 0)
        if (totalEnUbic >= Math.ceil(min * 1.3)) continue // por encima del umbral amarillo → no alerta
        arr.push({
          pres: p, prod: pr, ubicacionId: uid,
          stock: totalEnUbic, minimo: min,
          nivel: totalEnUbic < min ? 'rojo' : 'amarillo',
        })
      }
    }
    // Ordenar por nivel (rojo primero) y producto
    return arr.sort((a, b) => {
      if (a.nivel !== b.nivel) return a.nivel === 'rojo' ? -1 : 1
      return (a.prod.nombre + a.pres.nombre).localeCompare(b.prod.nombre + b.pres.nombre)
    })
  }, [pres, prod, stock, ubicIds, prodPorId, minimoPorPresUbic])

  const [expandido, setExpandido] = useState(false)

  if (cargando) return null
  if (alertas.length === 0) return null

  const rojas = alertas.filter((a) => a.nivel === 'rojo').length
  const amar = alertas.filter((a) => a.nivel === 'amarillo').length

  return (
    <div className={`rounded-lg border ${rojas > 0 ? 'border-red-300 bg-red-50/50' : 'border-aceite-500/40 bg-aceite-500/5'}`}>
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        onClick={() => setExpandido((v) => !v)}
      >
        <span className="text-sm">⚠️</span>
        <span className="text-sm text-oliva-900 flex-1">
          <b>Stock bajo:</b>{' '}
          {rojas > 0 && <span className="text-red-700">{rojas} bajo mín.</span>}
          {rojas > 0 && amar > 0 && ' · '}
          {amar > 0 && <span className="text-aceite-600">{amar} cerca</span>}
        </span>
        <span className="text-xs text-oliva-600">{expandido ? '▲' : '▼'}</span>
      </button>
      {expandido && (
        <div className="space-y-1 px-3 pb-3 max-h-72 overflow-y-auto border-t border-oliva-100/70">
          {alertas.map((a, i) => {
            const color = colorProducto(a.prod.nombre)
            const bar = a.nivel === 'rojo' ? 'bg-red-600' : 'bg-aceite-500'
            const pct = a.minimo > 0 ? Math.min(100, (a.stock / a.minimo) * 100) : 0
            return (
              <div key={i} className="flex items-center gap-2 py-1 border-b border-oliva-100/60 last:border-0">
                <span className={`inline-block w-2 h-2 rounded-full ${color.dot}`}></span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-oliva-900 truncate">
                    <b>{a.prod.nombre}</b> · {a.pres.nombre}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 h-1 bg-oliva-100 rounded overflow-hidden">
                      <div className={`h-full ${bar}`} style={{ width: pct + '%' }} />
                    </div>
                    <span className="text-[10px] text-oliva-600 tabular-nums whitespace-nowrap">
                      {a.stock}/{a.minimo}
                    </span>
                  </div>
                </div>
                <span className="text-[9px] uppercase tracking-wide text-oliva-600 whitespace-nowrap">
                  {ubicPorId.get(a.ubicacionId)?.nombre}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
