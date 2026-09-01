import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Dialog } from './Dialog'

interface Categoria { id: number; slug: string; nombre: string; activo: boolean; orden: number }

function slugify(s: string): string {
  return s.trim().toLowerCase()
    .replace(/[áàäâ]/g, 'a').replace(/[éèëê]/g, 'e').replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o').replace(/[úùüû]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 40)
}

export function EditorCategoriasDialog({ abierto, tabla, titulo, onCerrar, onCambio }: {
  abierto: boolean
  tabla: 'categorias_gasto' | 'categorias_ingreso'
  titulo: string
  onCerrar: () => void
  onCambio: () => void
}) {
  const [items, setItems] = useState<Categoria[]>([])
  const [nuevo, setNuevo] = useState('')
  const [cargando, setCargando] = useState(false)

  async function cargar() {
    setCargando(true)
    const { data } = await supabase.from(tabla).select('*').order('orden').order('nombre')
    setItems((data as Categoria[]) ?? [])
    setCargando(false)
  }
  useEffect(() => { if (abierto) cargar() }, [abierto, tabla])

  async function agregar() {
    const nombre = nuevo.trim(); if (!nombre) return
    const slug = slugify(nombre) || `cat_${Date.now()}`
    const orden = (Math.max(0, ...items.map((c) => c.orden)) || 0) + 10
    const { error } = await supabase.from(tabla).insert({ slug, nombre, orden, activo: true })
    if (error) { alert('Error: ' + error.message); return }
    setNuevo(''); await cargar(); onCambio()
  }
  async function renombrar(c: Categoria, n: string) {
    if (!n.trim() || n === c.nombre) return
    const { error } = await supabase.from(tabla).update({ nombre: n.trim() }).eq('id', c.id)
    if (error) { alert('Error: ' + error.message); return }
    await cargar(); onCambio()
  }
  async function toggle(c: Categoria) {
    const { error } = await supabase.from(tabla).update({ activo: !c.activo }).eq('id', c.id)
    if (error) { alert('Error: ' + error.message); return }
    await cargar(); onCambio()
  }
  async function eliminar(c: Categoria) {
    if (!confirm(`¿Eliminar "${c.nombre}"? Si tiene movimientos ligados, mejor desactivala.`)) return
    const { error } = await supabase.from(tabla).delete().eq('id', c.id)
    if (error) { alert('No se puede borrar (tiene movimientos ligados). Desactivala en su lugar.'); return }
    await cargar(); onCambio()
  }

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo={titulo} ancho="md">
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Agregar nueva categoría…"
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }}
            autoFocus
          />
          <button type="button" className="btn-primary" onClick={agregar} disabled={!nuevo.trim()}>+ Agregar</button>
        </div>
        {cargando ? (
          <div className="text-sm text-oliva-600">Cargando…</div>
        ) : (
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {items.map((c) => (
              <Fila key={c.id} c={c} onRen={(n) => renombrar(c, n)} onTog={() => toggle(c)} onDel={() => eliminar(c)} />
            ))}
            {items.length === 0 && <div className="text-xs text-oliva-500 italic">Sin categorías.</div>}
          </div>
        )}
        <div className="flex justify-end pt-2 border-t border-oliva-100">
          <button type="button" className="btn-secondary" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </Dialog>
  )
}

function Fila({ c, onRen, onTog, onDel }: { c: Categoria; onRen: (n: string) => void; onTog: () => void; onDel: () => void }) {
  const [edit, setEdit] = useState(false)
  const [v, setV] = useState(c.nombre)
  useEffect(() => { setV(c.nombre) }, [c.nombre])
  return (
    <div className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${c.activo ? 'bg-white' : 'bg-oliva-50/60 opacity-60'}`}>
      {edit ? (
        <input
          className="input flex-1 py-1"
          value={v}
          autoFocus
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onRen(v); setEdit(false) } if (e.key === 'Escape') { setV(c.nombre); setEdit(false) } }}
          onBlur={() => { onRen(v); setEdit(false) }}
        />
      ) : (
        <button className="flex-1 text-left text-sm text-oliva-900 hover:text-oliva-700" onClick={() => setEdit(true)}>
          {c.nombre}
        </button>
      )}
      <button className="text-[10px] uppercase tracking-wide text-oliva-600 hover:text-oliva-900 underline" onClick={onTog}>
        {c.activo ? 'desactivar' : 'activar'}
      </button>
      <button className="text-[10px] uppercase tracking-wide text-red-700 hover:text-red-900 underline" onClick={onDel}>
        borrar
      </button>
    </div>
  )
}
