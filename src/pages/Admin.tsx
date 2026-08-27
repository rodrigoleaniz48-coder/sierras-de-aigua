import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Dialog } from '../components/Dialog'
import { money } from '../lib/format'

interface Producto {
  id: number
  nombre: string
  categoria: string
  descripcion: string | null
  activo: boolean
}

interface Presentacion {
  id: number
  producto_id: number
  nombre: string
  volumen_ml: number | null
  unidad: string
  precio_minorista: number
  precio_mayorista: number
  iva_pct: number
  stock_minimo: number
  activo: boolean
  costo_envasado: number
  es_pack: boolean
}

interface Lista { id: number; nombre: string; activo: boolean }
interface ListaItem { lista_id: number; presentacion_id: number; precio_uyu: number }
interface Componente { presentacion_pack_id: number; presentacion_componente_id: number; unidades: number }

const CATEGORIAS = ['aceite', 'aceituna', 'miel', 'jabon', 'envases_vacios', 'servicio'] as const
const UNIDADES = ['botella', 'bidon', 'frasco', 'unidad'] as const

export function Admin() {
  const { perfil } = useAuth()
  const nombreLower = (perfil?.nombre ?? '').toLowerCase()
  const puedeEditarMargenes = nombreLower.includes('rodrigo') || nombreLower.includes('santi')

  const [productos, setProductos] = useState<Producto[]>([])
  const [presentaciones, setPresentaciones] = useState<Presentacion[]>([])
  const [listas, setListas] = useState<Lista[]>([])
  const [listaItems, setListaItems] = useState<ListaItem[]>([])
  const [componentes, setComponentes] = useState<Componente[]>([])
  const [costoAceiteUsd, setCostoAceiteUsd] = useState<string>('9')
  const [cargando, setCargando] = useState(true)
  const [expandido, setExpandido] = useState<number | null>(null)
  const [nuevoProd, setNuevoProd] = useState(false)
  const [nuevaPresProd, setNuevaPresProd] = useState<number | null>(null)
  const [editandoPres, setEditandoPres] = useState<Presentacion | null>(null)
  const [editorListas, setEditorListas] = useState(false)

  async function cargar() {
    setCargando(true)
    const [p, pr, l, li, cfg, comp] = await Promise.all([
      supabase.from('productos').select('*').order('categoria').order('nombre'),
      supabase.from('presentaciones').select('*').order('volumen_ml', { ascending: true, nullsFirst: false }),
      supabase.from('listas_precios').select('*').order('id'),
      supabase.from('lista_precios_items').select('*'),
      supabase.from('config_global').select('value').eq('key', 'costo_aceite_por_litro_usd').maybeSingle(),
      supabase.from('presentacion_componente').select('*'),
    ])
    setProductos((p.data as Producto[]) ?? [])
    setPresentaciones((pr.data as Presentacion[]) ?? [])
    setListas((l.data as Lista[]) ?? [])
    setListaItems((li.data as ListaItem[]) ?? [])
    setComponentes((comp.data as Componente[]) ?? [])
    if (cfg.data?.value) setCostoAceiteUsd(cfg.data.value)
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const presDe = (idProd: number) => presentaciones.filter((x) => x.producto_id === idProd)

  const distId = useMemo(() => listas.find((l) => l.nombre === 'distribuidor')?.id ?? null, [listas])
  const precioDist = useMemo(() => {
    const m = new Map<number, number>()
    for (const it of listaItems) if (it.lista_id === distId) m.set(it.presentacion_id, Number(it.precio_uyu))
    return m
  }, [listaItems, distId])

  async function guardarConfigAceite() {
    const val = Number(costoAceiteUsd)
    if (!(val > 0)) return
    await supabase.from('config_global').upsert({ key: 'costo_aceite_por_litro_usd', value: String(val), actualizado_en: new Date().toISOString() })
  }

  // Costo envasado de packs = costo propio + suma costos de sus componentes (×unidades)
  function costoEnvasadoTotal(pr: Presentacion): number {
    let total = Number(pr.costo_envasado || 0)
    if (pr.es_pack) {
      const comps = componentes.filter((c) => c.presentacion_pack_id === pr.id)
      for (const c of comps) {
        const comp = presentaciones.find((x) => x.id === c.presentacion_componente_id)
        if (comp) total += Number(comp.costo_envasado || 0) * Number(c.unidades)
      }
    }
    return total
  }
  // Litros equivalentes del pack (para el margen aceite USD/L)
  function litrosPack(pr: Presentacion): number {
    if (!pr.es_pack) return Number(pr.volumen_ml ?? 0) / 1000
    const comps = componentes.filter((c) => c.presentacion_pack_id === pr.id)
    let l = 0
    for (const c of comps) {
      const comp = presentaciones.find((x) => x.id === c.presentacion_componente_id)
      if (comp) l += (Number(comp.volumen_ml ?? 0) / 1000) * Number(c.unidades)
    }
    return l
  }

  function calcMargenes(p: Producto, pr: Presentacion) {
    // Un pack de aceite se trata como aceite para USD/L
    const esAceite = p.categoria === 'aceite' || (pr.es_pack && componentes.some((c) => {
      if (c.presentacion_pack_id !== pr.id) return false
      const comp = presentaciones.find((x) => x.id === c.presentacion_componente_id)
      const prodComp = comp ? productos.find((pp) => pp.id === comp.producto_id) : undefined
      return prodComp?.categoria === 'aceite'
    }))
    const litros = pr.es_pack ? litrosPack(pr) : Number(pr.volumen_ml ?? 0) / 1000
    const costoEnv = costoEnvasadoTotal(pr)
    const costoAceite = esAceite && litros > 0 ? litros * Number(costoAceiteUsd) * 40 : 0
    const costoTotal = costoEnv + costoAceite
    const precioMin = Number(pr.precio_minorista || 0)
    const precioDistUyu = precioDist.get(pr.id) ?? 0
    const margenMinPct = precioMin > 0 ? ((precioMin - costoTotal) / precioMin) * 100 : 0
    const margenDistPct = precioDistUyu > 0 ? ((precioDistUyu - costoTotal) / precioDistUyu) * 100 : 0
    const cotEst = 40
    const margenAceiteMinUsdL = esAceite && litros > 0 ? (precioMin - costoEnv) / litros / cotEst : 0
    const margenAceiteDistUsdL = esAceite && litros > 0 && precioDistUyu > 0 ? (precioDistUyu - costoEnv) / litros / cotEst : 0
    return { costoEnvasado: costoEnv, precioMin, precioDistUyu, margenMinPct, margenDistPct, margenAceiteMinUsdL, margenAceiteDistUsdL, esAceite }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-oliva-900">Administración</h1>
          <p className="text-sm text-oliva-700 mt-1">
            Catálogo, costos, listas de precios y márgenes.
          </p>
        </div>
        <div className="flex gap-2">
          {puedeEditarMargenes && (
            <button className="btn-secondary" onClick={() => setEditorListas(true)}>💰 Listas de precios</button>
          )}
          <button className="btn-primary" onClick={() => setNuevoProd(true)}>+ Nuevo producto</button>
        </div>
      </div>

      {/* Config global (solo Rodrigo/Santi) */}
      {puedeEditarMargenes && (
        <div className="card p-4 flex items-center gap-4 flex-wrap">
          <div>
            <label className="label">Costo aceite USD/L</label>
            <div className="flex items-center gap-2">
              <input
                className="input tabular-nums w-28"
                type="number" min="0" step="0.1"
                value={costoAceiteUsd}
                onChange={(e) => setCostoAceiteUsd(e.target.value)}
              />
              <button className="btn-secondary text-xs" onClick={guardarConfigAceite}>Guardar</button>
            </div>
          </div>
          <div className="text-xs text-oliva-600 flex-1 min-w-[280px]">
            Se usa para estimar el <b>margen real</b> del aceite envasado (costo total = envasado + aceite proporcional al volumen).
            Actualizalo cuando cambie el costo de producción del año.
          </div>
        </div>
      )}

      {cargando ? (
        <div className="card p-6 text-sm text-oliva-700">Cargando…</div>
      ) : productos.length === 0 ? (
        <div className="card p-6 text-sm text-oliva-700">
          Todavía no hay productos. Cargá el primero con <b>+ Nuevo producto</b>.
        </div>
      ) : (
        <div className="space-y-3">
          {productos.map((p) => {
            const abierto = expandido === p.id
            const ps = presDe(p.id)
            return (
              <div key={p.id} className={`card overflow-hidden ${!p.activo ? 'opacity-60' : ''}`}>
                <button
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-oliva-50 text-left"
                  onClick={() => setExpandido(abierto ? null : p.id)}
                >
                  <div className="min-w-0">
                    <div className="font-medium text-oliva-900 flex items-center gap-2">
                      {p.nombre}
                      <span className="text-[11px] uppercase tracking-wide rounded-full bg-oliva-100 text-oliva-700 px-2 py-[1px]">{p.categoria}</span>
                      {!p.activo && <span className="text-[11px] text-red-600">inactivo</span>}
                    </div>
                    {p.descripcion && <div className="text-xs text-oliva-600 mt-1 truncate">{p.descripcion}</div>}
                  </div>
                  <div className="text-xs text-oliva-500 shrink-0">
                    {ps.length} {ps.length === 1 ? 'presentación' : 'presentaciones'} {abierto ? '▲' : '▼'}
                  </div>
                </button>

                {abierto && (
                  <div className="border-t border-oliva-100 p-4 bg-oliva-50/50 space-y-3">
                    {ps.length === 0 && <div className="text-sm text-oliva-600">Sin presentaciones. Agregá una.</div>}
                    {ps.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className={`w-full text-sm ${puedeEditarMargenes ? 'min-w-[900px]' : 'min-w-[560px]'}`}>
                          <thead>
                            <tr className="text-left text-[10px] uppercase tracking-wide text-oliva-600 border-b border-oliva-100">
                              <th className="py-2 pr-2">Presentación</th>
                              {puedeEditarMargenes && <th className="py-2 pr-2 text-right">Costo env.</th>}
                              <th className="py-2 pr-2 text-right">Consumidor</th>
                              {puedeEditarMargenes && <th className="py-2 pr-2 text-right">Distribuidor</th>}
                              {puedeEditarMargenes && <th className="py-2 pr-2 text-right">Marg. consum. %</th>}
                              {puedeEditarMargenes && <th className="py-2 pr-2 text-right">Marg. distr. %</th>}
                              {puedeEditarMargenes && <th className="py-2 pr-2 text-right">Marg. aceite USD/L (consum · distr)</th>}
                              <th className="py-2 pr-2 text-right">IVA %</th>
                              <th className="py-2 pr-2 text-right">Stock mín.</th>
                              <th className="py-2 pr-1"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {ps.map((x) => {
                              const m = calcMargenes(p, x)
                              return (
                                <tr key={x.id} className={`border-b border-oliva-100/70 last:border-0 ${!x.activo ? 'text-oliva-400 line-through' : 'text-oliva-800'}`}>
                                  <td className="py-2 pr-2">
                                    <div className="font-medium">{x.nombre}</div>
                                    <div className="text-[11px] text-oliva-500">{x.unidad}</div>
                                  </td>
                                  {puedeEditarMargenes && <td className="py-2 pr-2 text-right tabular-nums">{m.costoEnvasado > 0 ? money(m.costoEnvasado) : <span className="text-red-600">—</span>}</td>}
                                  <td className="py-2 pr-2 text-right tabular-nums">{money(m.precioMin)}</td>
                                  {puedeEditarMargenes && <td className="py-2 pr-2 text-right tabular-nums">{m.precioDistUyu > 0 ? money(m.precioDistUyu) : '—'}</td>}
                                  {puedeEditarMargenes && <td className={`py-2 pr-2 text-right tabular-nums ${m.margenMinPct < 20 ? 'text-red-700' : m.margenMinPct < 30 ? 'text-amber-700' : 'text-green-700'}`}>{m.margenMinPct.toFixed(0)}%</td>}
                                  {puedeEditarMargenes && <td className={`py-2 pr-2 text-right tabular-nums ${m.margenDistPct < 15 ? 'text-red-700' : m.margenDistPct < 25 ? 'text-amber-700' : 'text-green-700'}`}>{m.margenDistPct > 0 ? m.margenDistPct.toFixed(0) + '%' : '—'}</td>}
                                  {puedeEditarMargenes && (
                                    <td className="py-2 pr-2 text-right tabular-nums text-xs">
                                      {m.esAceite ? (
                                        <span>
                                          <b>{m.margenAceiteMinUsdL.toFixed(1)}</b>
                                          {m.margenAceiteDistUsdL > 0 && <> · {m.margenAceiteDistUsdL.toFixed(1)}</>}
                                        </span>
                                      ) : '—'}
                                    </td>
                                  )}
                                  <td className="py-2 pr-2 text-right tabular-nums">{Number(x.iva_pct)}%</td>
                                  <td className="py-2 pr-2 text-right tabular-nums">{x.stock_minimo}</td>
                                  <td className="py-2 pr-1 text-right">
                                    <button className="text-xs text-oliva-700 underline hover:text-oliva-900" onClick={() => setEditandoPres(x)}>Editar</button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                        {puedeEditarMargenes && (
                          <p className="text-[10px] text-oliva-500 mt-2">Márgenes calculados con costo aceite USD/L de arriba × cot. estimada $40. Los USD/L usan la fórmula: (precio − costo envasado) ÷ litros ÷ 40.</p>
                        )}
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap items-center">
                      <button className="btn-secondary" onClick={() => setNuevaPresProd(p.id)}>+ Nueva presentación</button>
                      <button className="btn-secondary" onClick={async () => { await supabase.from('productos').update({ activo: !p.activo }).eq('id', p.id); cargar() }}>
                        {p.activo ? 'Desactivar producto' : 'Activar producto'}
                      </button>
                      <button className="ml-auto text-xs text-red-700 hover:text-red-900 underline" onClick={async () => {
                        const ok = confirm(`¿Eliminar definitivamente "${p.nombre}"?\nSi alguna venta ya lo usa, el borrado se bloquea.`)
                        if (!ok) return
                        const { error } = await supabase.from('productos').delete().eq('id', p.id)
                        if (error) alert('No se pudo eliminar: ' + error.message); else cargar()
                      }}>Eliminar producto</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <NuevoProductoDialog abierto={nuevoProd} onCerrar={() => setNuevoProd(false)} onOk={() => { setNuevoProd(false); cargar() }} />
      <PresentacionDialog abierto={nuevaPresProd !== null} productoId={nuevaPresProd} onCerrar={() => setNuevaPresProd(null)} onOk={() => { setNuevaPresProd(null); cargar() }} />
      <PresentacionDialog abierto={editandoPres !== null} productoId={editandoPres?.producto_id ?? null} editar={editandoPres} onCerrar={() => setEditandoPres(null)} onOk={() => { setEditandoPres(null); cargar() }} />
      <EditorListasDialog abierto={editorListas} onCerrar={() => setEditorListas(false)} onOk={() => { setEditorListas(false); cargar() }} listas={listas} listaItems={listaItems} presentaciones={presentaciones} productos={productos} />
    </div>
  )
}

function NuevoProductoDialog({ abierto, onCerrar, onOk }: { abierto: boolean; onCerrar: () => void; onOk: () => void }) {
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState<string>('aceite')
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (abierto) { setNombre(''); setCategoria('aceite'); setDescripcion(''); setError(null) } }, [abierto])
  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true); setError(null)
    const { error } = await supabase.from('productos').insert({ nombre: nombre.trim(), categoria, descripcion: descripcion.trim() || null })
    setGuardando(false)
    if (error) setError(error.message); else onOk()
  }
  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo="Nuevo producto">
      <form onSubmit={guardar} className="space-y-4">
        <div><label className="label">Nombre</label><input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus /></div>
        <div><label className="label">Categoría</label>
          <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div><label className="label">Descripción (opcional)</label><textarea className="input min-h-[70px]" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></div>
        {error && <div className="text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Dialog>
  )
}

function PresentacionDialog({ abierto, productoId, editar, onCerrar, onOk }: {
  abierto: boolean; productoId: number | null; editar?: Presentacion | null; onCerrar: () => void; onOk: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [volumenMl, setVolumenMl] = useState<string>('')
  const [unidad, setUnidad] = useState<string>('botella')
  const [precioMin, setPrecioMin] = useState<string>('0')
  const [precioMay, setPrecioMay] = useState<string>('0')
  const [ivaPct, setIvaPct] = useState<string>('10')
  const [stockMin, setStockMin] = useState<string>('0')
  const [costoEnv, setCostoEnv] = useState<string>('0')
  const [activo, setActivo] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    if (editar) {
      setNombre(editar.nombre); setVolumenMl(editar.volumen_ml?.toString() ?? ''); setUnidad(editar.unidad)
      setPrecioMin(String(editar.precio_minorista)); setPrecioMay(String(editar.precio_mayorista))
      setIvaPct(String(editar.iva_pct)); setStockMin(String(editar.stock_minimo))
      setCostoEnv(String(editar.costo_envasado ?? 0)); setActivo(editar.activo)
    } else {
      setNombre(''); setVolumenMl(''); setUnidad('botella')
      setPrecioMin('0'); setPrecioMay('0'); setIvaPct('10'); setStockMin('0'); setCostoEnv('0'); setActivo(true)
    }
    setError(null)
  }, [abierto, editar])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!productoId) return
    setGuardando(true); setError(null)
    const payload = {
      producto_id: productoId,
      nombre: nombre.trim(),
      volumen_ml: volumenMl ? Number(volumenMl) : null,
      unidad,
      precio_minorista: Number(precioMin) || 0,
      precio_mayorista: Number(precioMay) || 0,
      iva_pct: Number(ivaPct) || 0,
      stock_minimo: Number(stockMin) || 0,
      costo_envasado: Number(costoEnv) || 0,
      activo,
    }
    const q = editar ? supabase.from('presentaciones').update(payload).eq('id', editar.id) : supabase.from('presentaciones').insert(payload)
    const { error } = await q
    setGuardando(false)
    if (error) setError(error.message); else onOk()
  }

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo={editar ? 'Editar presentación' : 'Nueva presentación'} ancho="lg">
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Nombre</label>
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
          </div>
          <div><label className="label">Volumen (ml, opcional)</label><input className="input" type="number" min="0" step="1" value={volumenMl} onChange={(e) => setVolumenMl(e.target.value)} placeholder="500" /></div>
          <div><label className="label">Unidad</label>
            <select className="input" value={unidad} onChange={(e) => setUnidad(e.target.value)}>
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div><label className="label">Precio consumidor (UYU)</label><input className="input" type="number" min="0" step="1" value={precioMin} onChange={(e) => setPrecioMin(e.target.value)} /></div>
          <div><label className="label">Precio mayorista (UYU)</label><input className="input" type="number" min="0" step="1" value={precioMay} onChange={(e) => setPrecioMay(e.target.value)} /></div>
          <div>
            <label className="label">Costo envasado (UYU)</label>
            <input className="input tabular-nums" type="number" min="0" step="0.1" value={costoEnv} onChange={(e) => setCostoEnv(e.target.value)} />
            <p className="text-[10px] text-oliva-500 mt-1">Envase + tapa + etiqueta + caja + servicio. Sin el costo del aceite (ese se toma de la config global).</p>
          </div>
          <div><label className="label">IVA %</label>
            <select className="input" value={ivaPct} onChange={(e) => setIvaPct(e.target.value)}>
              <option value="22">22 % (básico)</option>
              <option value="10">10 % (mínimo — aceite)</option>
              <option value="0">0 % (exento)</option>
            </select>
          </div>
          <div><label className="label">Stock mínimo (alerta)</label><input className="input" type="number" min="0" step="1" value={stockMin} onChange={(e) => setStockMin(e.target.value)} /></div>
          <div className="sm:col-span-2 flex items-center gap-2 pt-1">
            <input id="activo" type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="h-4 w-4 accent-oliva-700" />
            <label htmlFor="activo" className="text-sm text-oliva-800">Activa (visible en ventas y stock)</label>
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

// Orden de tamaños: primero volumen ascendente
function ordenTamano(nombre: string, volMl: number | null): number {
  if (volMl && volMl > 0) return volMl
  // Fallback por nombre (packs y sin volumen)
  const n = nombre.toLowerCase()
  if (n.includes('pack')) return 999999
  return 500000
}

interface FilaGrupo {
  label: string           // "Aceite · 1 L" ó "Miel · Chico 300 g"
  presIds: number[]       // presentaciones que abarca esta fila
  orden: number
  esAceiteMultiVariedad: boolean
}

function EditorListasDialog({ abierto, onCerrar, onOk, listas, listaItems, presentaciones, productos }: {
  abierto: boolean; onCerrar: () => void; onOk: () => void
  listas: Lista[]; listaItems: ListaItem[]; presentaciones: Presentacion[]; productos: Producto[]
}) {
  const [listaSel, setListaSel] = useState<number | null>(null)
  const [precios, setPrecios] = useState<Map<string, string>>(new Map()) // key = filaLabel
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    const id = listas[0]?.id ?? null
    setListaSel(id)
    setMensaje(null)
  }, [abierto, listas])

  const prodPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos])

  // Agrupar presentaciones: aceite por nombre de presentación (mismo precio para todas las variedades),
  // no-aceite individual. Excluir servicio y envases_vacios.
  const filas = useMemo<FilaGrupo[]>(() => {
    const grupos = new Map<string, FilaGrupo>()
    for (const p of presentaciones) {
      if (!p.activo) continue
      const prod = prodPorId.get(p.producto_id)
      if (!prod) continue
      if (prod.categoria === 'servicio' || prod.categoria === 'envases_vacios') continue

      let label: string, orden: number, multi = false
      if (prod.categoria === 'aceite' && !p.es_pack) {
        // Agrupar todos los aceites por nombre de presentación (250 ml, 500 ml, 1 L, etc.)
        label = `Aceite · ${p.nombre}`
        orden = ordenTamano(p.nombre, p.volumen_ml)
        multi = true
      } else if (p.es_pack) {
        label = `Pack · ${prod.nombre}`
        orden = 900000
      } else {
        // No-aceite: fila por presentación individual, agrupado por categoría/producto
        const catOrden: Record<string, number> = { miel: 1_000_000, aceituna: 1_100_000, jabon: 1_200_000 }
        const base = catOrden[prod.categoria] ?? 1_500_000
        label = `${prod.nombre} · ${p.nombre}`
        orden = base + (p.volumen_ml ?? 0)
      }
      const g = grupos.get(label) ?? { label, presIds: [], orden, esAceiteMultiVariedad: multi }
      g.presIds.push(p.id)
      grupos.set(label, g)
    }
    return [...grupos.values()].sort((a, b) => a.orden - b.orden)
  }, [presentaciones, prodPorId])

  // Al cambiar lista, poblar los precios (agrupados)
  useEffect(() => {
    if (listaSel == null) { setPrecios(new Map()); return }
    const itemsMap = new Map<number, number>()
    for (const it of listaItems) if (it.lista_id === listaSel) itemsMap.set(it.presentacion_id, Number(it.precio_uyu))
    const m = new Map<string, string>()
    for (const g of filas) {
      const precios = g.presIds.map((id) => itemsMap.get(id) ?? 0)
      const primerNo0 = precios.find((v) => v > 0) ?? 0
      m.set(g.label, primerNo0 > 0 ? String(primerNo0) : '')
    }
    setPrecios(m)
  }, [listaSel, listaItems, filas])

  async function guardar() {
    if (listaSel == null) return
    setGuardando(true); setMensaje(null)
    const upserts: Array<{ lista_id: number; presentacion_id: number; precio_uyu: number }> = []
    const borrarIds: number[] = []
    for (const g of filas) {
      const v = Number(precios.get(g.label) || 0)
      for (const presId of g.presIds) {
        if (v > 0) upserts.push({ lista_id: listaSel, presentacion_id: presId, precio_uyu: v })
        else borrarIds.push(presId)
      }
    }
    if (upserts.length > 0) {
      const { error } = await supabase.from('lista_precios_items').upsert(upserts, { onConflict: 'lista_id,presentacion_id' })
      if (error) { setMensaje('Error: ' + error.message); setGuardando(false); return }
    }
    if (borrarIds.length > 0) {
      await supabase.from('lista_precios_items').delete().eq('lista_id', listaSel).in('presentacion_id', borrarIds)
    }
    setGuardando(false)
    setMensaje('Guardado ✓')
    onOk()
  }

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo="💰 Listas de precios" ancho="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="label !mb-0">Lista</label>
          <select className="input w-56" value={listaSel ?? ''} onChange={(e) => setListaSel(Number(e.target.value))}>
            {listas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
          <div className="text-xs text-oliva-600 flex-1">
            Los aceites se agrupan por tamaño (mismo precio para todas las variedades). Vacío = cae al precio consumidor.
          </div>
        </div>
        <div className="overflow-x-auto border border-oliva-100 rounded-lg">
          <table className="w-full text-sm min-w-[420px]">
            <thead className="bg-oliva-50">
              <tr className="text-left text-[10px] uppercase tracking-wide text-oliva-600 border-b border-oliva-100">
                <th className="py-2 px-3">Presentación</th>
                <th className="py-2 px-3 text-right">Precio (UYU)</th>
                <th className="py-2 px-3 text-[10px] text-oliva-500 hidden sm:table-cell">Aplica a</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((g) => (
                <tr key={g.label} className="border-b border-oliva-100/70 last:border-0">
                  <td className="py-1.5 px-3 text-oliva-800 font-medium">{g.label}</td>
                  <td className="py-1.5 px-3 text-right">
                    <input
                      className="input tabular-nums text-right w-28"
                      type="number" min="0" step="1"
                      value={precios.get(g.label) ?? ''}
                      onChange={(e) => setPrecios(new Map(precios).set(g.label, e.target.value))}
                    />
                  </td>
                  <td className="py-1.5 px-3 text-[10px] text-oliva-500 hidden sm:table-cell">
                    {g.esAceiteMultiVariedad ? `${g.presIds.length} variedades` : '1 presentación'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {mensaje && <div className={`text-sm ${mensaje.startsWith('Error') ? 'text-red-700' : 'text-green-700'}`}>{mensaje}</div>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onCerrar}>Cerrar</button>
          <button className="btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>
      </div>
    </Dialog>
  )
}
