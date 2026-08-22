import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
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
}

const CATEGORIAS = ['aceite', 'aceituna', 'miel', 'jabon'] as const
const UNIDADES = ['botella', 'bidon', 'frasco', 'unidad'] as const

export function Admin() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [presentaciones, setPresentaciones] = useState<Presentacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [expandido, setExpandido] = useState<number | null>(null)
  const [nuevoProd, setNuevoProd] = useState(false)
  const [nuevaPresProd, setNuevaPresProd] = useState<number | null>(null)
  const [editandoPres, setEditandoPres] = useState<Presentacion | null>(null)

  async function cargar() {
    setCargando(true)
    const [p, pr] = await Promise.all([
      supabase.from('productos').select('*').order('categoria').order('nombre'),
      supabase.from('presentaciones').select('*').order('volumen_ml', { ascending: true, nullsFirst: false }),
    ])
    setProductos((p.data as Producto[]) ?? [])
    setPresentaciones((pr.data as Presentacion[]) ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const presDe = (idProd: number) => presentaciones.filter((x) => x.producto_id === idProd)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-oliva-900">Administración</h1>
          <p className="text-sm text-oliva-700 mt-1">
            Catálogo de productos, presentaciones y precios. Los precios se aplican automáticamente
            al cargar una venta según el tipo de cliente (minorista / mayorista).
          </p>
        </div>
        <button className="btn-primary" onClick={() => setNuevoProd(true)}>+ Nuevo producto</button>
      </div>

      {cargando ? (
        <div className="card p-6 text-sm text-oliva-700">Cargando…</div>
      ) : productos.length === 0 ? (
        <div className="card p-6 text-sm text-oliva-700">
          Todavía no hay productos. Cargá el primero con el botón <b>+ Nuevo producto</b>.
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
                      <span className="text-[11px] uppercase tracking-wide rounded-full bg-oliva-100 text-oliva-700 px-2 py-[1px]">
                        {p.categoria}
                      </span>
                      {!p.activo && <span className="text-[11px] text-red-600">inactivo</span>}
                    </div>
                    {p.descripcion && (
                      <div className="text-xs text-oliva-600 mt-1 truncate">{p.descripcion}</div>
                    )}
                  </div>
                  <div className="text-xs text-oliva-500 shrink-0">
                    {ps.length} {ps.length === 1 ? 'presentación' : 'presentaciones'} {abierto ? '▲' : '▼'}
                  </div>
                </button>

                {abierto && (
                  <div className="border-t border-oliva-100 p-4 bg-oliva-50/50 space-y-3">
                    {ps.length === 0 && (
                      <div className="text-sm text-oliva-600">Sin presentaciones. Agregá una.</div>
                    )}
                    {ps.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[560px]">
                          <thead>
                            <tr className="text-left text-xs uppercase tracking-wide text-oliva-600 border-b border-oliva-100">
                              <th className="py-2 pr-3">Presentación</th>
                              <th className="py-2 pr-3 text-right">Minorista</th>
                              <th className="py-2 pr-3 text-right">Mayorista</th>
                              <th className="py-2 pr-3 text-right">IVA %</th>
                              <th className="py-2 pr-3 text-right">Stock mín.</th>
                              <th className="py-2 pr-1"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {ps.map((x) => (
                              <tr key={x.id} className={`border-b border-oliva-100/70 last:border-0 ${!x.activo ? 'text-oliva-400 line-through' : 'text-oliva-800'}`}>
                                <td className="py-2 pr-3">
                                  <div className="font-medium">{x.nombre}</div>
                                  <div className="text-[11px] text-oliva-500">{x.unidad}</div>
                                </td>
                                <td className="py-2 pr-3 text-right tabular-nums">{money(x.precio_minorista)}</td>
                                <td className="py-2 pr-3 text-right tabular-nums">{money(x.precio_mayorista)}</td>
                                <td className="py-2 pr-3 text-right tabular-nums">{Number(x.iva_pct)}%</td>
                                <td className="py-2 pr-3 text-right tabular-nums">{x.stock_minimo}</td>
                                <td className="py-2 pr-1 text-right">
                                  <button
                                    className="text-xs text-oliva-700 underline hover:text-oliva-900"
                                    onClick={() => setEditandoPres(x)}
                                  >
                                    Editar
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap items-center">
                      <button className="btn-secondary" onClick={() => setNuevaPresProd(p.id)}>+ Nueva presentación</button>
                      <button
                        className="btn-secondary"
                        onClick={async () => {
                          await supabase.from('productos').update({ activo: !p.activo }).eq('id', p.id)
                          cargar()
                        }}
                      >
                        {p.activo ? 'Desactivar producto' : 'Activar producto'}
                      </button>
                      <button
                        className="ml-auto text-xs text-red-700 hover:text-red-900 underline"
                        onClick={async () => {
                          const ok = confirm(`¿Eliminar definitivamente el producto "${p.nombre}"?\n\nSe borran también sus presentaciones. Si alguna venta ya lo usaba, el borrado se bloquea (usá "Desactivar producto" en ese caso).`)
                          if (!ok) return
                          const { error } = await supabase.from('productos').delete().eq('id', p.id)
                          if (error) alert('No se pudo eliminar: ' + error.message)
                          else cargar()
                        }}
                      >
                        Eliminar producto
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Nuevo producto */}
      <NuevoProductoDialog abierto={nuevoProd} onCerrar={() => setNuevoProd(false)} onOk={() => { setNuevoProd(false); cargar() }} />

      {/* Nueva presentación */}
      <PresentacionDialog
        abierto={nuevaPresProd !== null}
        productoId={nuevaPresProd}
        onCerrar={() => setNuevaPresProd(null)}
        onOk={() => { setNuevaPresProd(null); cargar() }}
      />

      {/* Editar presentación */}
      <PresentacionDialog
        abierto={editandoPres !== null}
        productoId={editandoPres?.producto_id ?? null}
        editar={editandoPres}
        onCerrar={() => setEditandoPres(null)}
        onOk={() => { setEditandoPres(null); cargar() }}
      />
    </div>
  )
}

// ---------- Dialogs ----------

function NuevoProductoDialog({ abierto, onCerrar, onOk }: { abierto: boolean; onCerrar: () => void; onOk: () => void }) {
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState<string>('aceite')
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (abierto) { setNombre(''); setCategoria('aceite'); setDescripcion(''); setError(null) }
  }, [abierto])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true); setError(null)
    const { error } = await supabase.from('productos').insert({
      nombre: nombre.trim(), categoria, descripcion: descripcion.trim() || null,
    })
    setGuardando(false)
    if (error) setError(error.message)
    else onOk()
  }

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo="Nuevo producto">
      <form onSubmit={guardar} className="space-y-4">
        <div>
          <label className="label">Nombre</label>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="label">Categoría</label>
          <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Descripción (opcional)</label>
          <textarea className="input min-h-[70px]" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
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

function PresentacionDialog({
  abierto, productoId, editar, onCerrar, onOk,
}: {
  abierto: boolean
  productoId: number | null
  editar?: Presentacion | null
  onCerrar: () => void
  onOk: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [volumenMl, setVolumenMl] = useState<string>('')
  const [unidad, setUnidad] = useState<string>('botella')
  const [precioMin, setPrecioMin] = useState<string>('0')
  const [precioMay, setPrecioMay] = useState<string>('0')
  const [ivaPct, setIvaPct] = useState<string>('22')
  const [stockMin, setStockMin] = useState<string>('0')
  const [activo, setActivo] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    if (editar) {
      setNombre(editar.nombre)
      setVolumenMl(editar.volumen_ml?.toString() ?? '')
      setUnidad(editar.unidad)
      setPrecioMin(String(editar.precio_minorista))
      setPrecioMay(String(editar.precio_mayorista))
      setIvaPct(String(editar.iva_pct))
      setStockMin(String(editar.stock_minimo))
      setActivo(editar.activo)
    } else {
      setNombre(''); setVolumenMl(''); setUnidad('botella')
      setPrecioMin('0'); setPrecioMay('0'); setIvaPct('22'); setStockMin('0'); setActivo(true)
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
      activo,
    }
    const q = editar
      ? supabase.from('presentaciones').update(payload).eq('id', editar.id)
      : supabase.from('presentaciones').insert(payload)
    const { error } = await q
    setGuardando(false)
    if (error) setError(error.message)
    else onOk()
  }

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo={editar ? 'Editar presentación' : 'Nueva presentación'} ancho="lg">
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Nombre (ej: “500 ml”, “3 L”, “unidad 250g”)</label>
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="label">Volumen (ml, opcional)</label>
            <input className="input" type="number" min="0" step="1" value={volumenMl} onChange={(e) => setVolumenMl(e.target.value)} placeholder="500" />
          </div>
          <div>
            <label className="label">Unidad</label>
            <select className="input" value={unidad} onChange={(e) => setUnidad(e.target.value)}>
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Precio minorista (UYU)</label>
            <input className="input" type="number" min="0" step="1" value={precioMin} onChange={(e) => setPrecioMin(e.target.value)} />
          </div>
          <div>
            <label className="label">Precio mayorista (UYU)</label>
            <input className="input" type="number" min="0" step="1" value={precioMay} onChange={(e) => setPrecioMay(e.target.value)} />
          </div>
          <div>
            <label className="label">IVA %</label>
            <select className="input" value={ivaPct} onChange={(e) => setIvaPct(e.target.value)}>
              <option value="22">22 % (básico)</option>
              <option value="10">10 % (mínimo)</option>
              <option value="0">0 % (exento)</option>
            </select>
          </div>
          <div>
            <label className="label">Stock mínimo (alerta)</label>
            <input className="input" type="number" min="0" step="1" value={stockMin} onChange={(e) => setStockMin(e.target.value)} />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2 pt-1">
            <input id="activo" type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="h-4 w-4 accent-oliva-700" />
            <label htmlFor="activo" className="text-sm text-oliva-800">Activa (visible al cargar ventas y stock)</label>
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
