import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

interface Categoria { id: number; slug: string; nombre: string; activo: boolean; orden: number }

function esAdmin(nombre: string | null | undefined): boolean {
  const n = (nombre ?? '').toLowerCase()
  return n.includes('rodrigo') || n.includes('santi')
}

function slugify(s: string): string {
  return s.trim().toLowerCase()
    .replace(/[áàäâ]/g, 'a').replace(/[éèëê]/g, 'e').replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o').replace(/[úùüû]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 40)
}

export function CategoriasPanel() {
  const { perfil } = useAuth()
  const puedeEditar = esAdmin(perfil?.nombre)

  const [gasto, setGasto] = useState<Categoria[]>([])
  const [ingreso, setIngreso] = useState<Categoria[]>([])
  const [cargando, setCargando] = useState(true)

  async function cargar() {
    setCargando(true)
    const [cg, ci] = await Promise.all([
      supabase.from('categorias_gasto').select('*').order('orden').order('nombre'),
      supabase.from('categorias_ingreso').select('*').order('orden').order('nombre'),
    ])
    setGasto((cg.data as Categoria[]) ?? [])
    setIngreso((ci.data as Categoria[]) ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  if (!puedeEditar) {
    return <div className="card p-6 text-sm text-oliva-700">Solo Rodrigo o Santi pueden editar las categorías.</div>
  }
  if (cargando) return <div className="card p-6 text-sm text-oliva-700">Cargando…</div>

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ListaCategorias tabla="categorias_gasto" titulo="Categorías de egresos" items={gasto} onCambio={cargar} />
      <ListaCategorias tabla="categorias_ingreso" titulo="Categorías de ingresos" items={ingreso} onCambio={cargar} />
    </div>
  )
}

function ListaCategorias({ tabla, titulo, items, onCambio }: {
  tabla: 'categorias_gasto' | 'categorias_ingreso'
  titulo: string
  items: Categoria[]
  onCambio: () => void
}) {
  const [nuevoNombre, setNuevoNombre] = useState('')

  async function agregar() {
    const nombre = nuevoNombre.trim()
    if (!nombre) return
    const slug = slugify(nombre) || `cat_${Date.now()}`
    const orden = (Math.max(0, ...items.map((c) => c.orden)) || 0) + 10
    const { error } = await supabase.from(tabla).insert({ slug, nombre, orden, activo: true })
    if (error) { alert('Error: ' + error.message); return }
    setNuevoNombre('')
    onCambio()
  }
  async function renombrar(c: Categoria, nuevo: string) {
    if (!nuevo.trim() || nuevo === c.nombre) return
    const { error } = await supabase.from(tabla).update({ nombre: nuevo.trim() }).eq('id', c.id)
    if (error) { alert('Error: ' + error.message); return }
    onCambio()
  }
  async function toggleActivo(c: Categoria) {
    const { error } = await supabase.from(tabla).update({ activo: !c.activo }).eq('id', c.id)
    if (error) { alert('Error: ' + error.message); return }
    onCambio()
  }
  async function eliminar(c: Categoria) {
    if (!confirm(`¿Eliminar "${c.nombre}"? Si tiene movimientos ligados, mejor desactivala en vez de borrar.`)) return
    const { error } = await supabase.from(tabla).delete().eq('id', c.id)
    if (error) {
      alert('No se puede borrar (probablemente hay movimientos ligados). Desactivala en su lugar.')
      return
    }
    onCambio()
  }

  return (
    <div className="card p-4 space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-oliva-800">{titulo}</h2>
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Agregar nueva…"
          value={nuevoNombre}
          onChange={(e) => setNuevoNombre(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }}
        />
        <button type="button" className="btn-primary" onClick={agregar} disabled={!nuevoNombre.trim()}>+ Agregar</button>
      </div>
      <div className="space-y-1">
        {items.map((c) => (
          <FilaCategoria key={c.id} c={c} onRenombrar={(n) => renombrar(c, n)} onToggle={() => toggleActivo(c)} onEliminar={() => eliminar(c)} />
        ))}
        {items.length === 0 && <div className="text-xs text-oliva-500 italic">Sin categorías.</div>}
      </div>
    </div>
  )
}

function FilaCategoria({ c, onRenombrar, onToggle, onEliminar }: {
  c: Categoria
  onRenombrar: (nuevo: string) => void
  onToggle: () => void
  onEliminar: () => void
}) {
  const [edit, setEdit] = useState(false)
  const [valor, setValor] = useState(c.nombre)
  useEffect(() => { setValor(c.nombre) }, [c.nombre])

  return (
    <div className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${c.activo ? 'bg-white' : 'bg-oliva-50/60 opacity-60'}`}>
      {edit ? (
        <input
          className="input flex-1 py-1"
          value={valor}
          autoFocus
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onRenombrar(valor); setEdit(false) } if (e.key === 'Escape') { setValor(c.nombre); setEdit(false) } }}
          onBlur={() => { onRenombrar(valor); setEdit(false) }}
        />
      ) : (
        <button className="flex-1 text-left text-sm text-oliva-900 hover:text-oliva-700" onClick={() => setEdit(true)}>
          {c.nombre}
        </button>
      )}
      <button className="text-[10px] uppercase tracking-wide text-oliva-600 hover:text-oliva-900 underline" onClick={onToggle}>
        {c.activo ? 'desactivar' : 'activar'}
      </button>
      <button className="text-[10px] uppercase tracking-wide text-red-700 hover:text-red-900 underline" onClick={onEliminar}>
        borrar
      </button>
    </div>
  )
}
