import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

// Bloque compacto de pendientes para el Inicio: ver los proximos, marcar hecho y
// agregar en una linea. El detalle completo vive en /pendientes.

interface Pendiente {
  id: number
  titulo: string
  estado: string
  fecha_vence: string | null
  asignado_a: string | null
  asignados_a: string[] | null
  creado_por: string | null
}

function hoyLocalStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtFecha(f: string): string {
  return new Date(f + 'T00:00:00').toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit' })
}

export function PendientesCard() {
  const { session } = useAuth()
  const soyYo = session?.user.id ?? ''
  const navigate = useNavigate()
  const [items, setItems] = useState<Pendiente[]>([])
  const [titulo, setTitulo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function cargar() {
    const { data } = await supabase
      .from('tareas')
      .select('id,titulo,estado,fecha_vence,asignado_a,asignados_a,creado_por')
      .in('estado', ['pendiente', 'en_progreso'])
    setItems((data as Pendiente[]) ?? [])
  }
  useEffect(() => { cargar() }, [])

  const hoy = hoyLocalStr()
  // En Inicio cada uno ve solo lo que le corresponde: asignado a el o creado por el.
  const mios = (p: Pendiente) =>
    (p.asignados_a?.includes(soyYo) ?? false) || p.asignado_a === soyYo || p.creado_por === soyYo
  const misItems = useMemo(() => items.filter(mios), [items, soyYo]) // eslint-disable-line react-hooks/exhaustive-deps
  const proximos = useMemo(() => {
    return [...misItems].sort((a, b) => {
      const fa = a.fecha_vence, fb = b.fecha_vence
      if (fa && fb) return fa.localeCompare(fb)
      if (fa && !fb) return -1
      if (!fa && fb) return 1
      return b.id - a.id
    }).slice(0, 5)
  }, [misItems])

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim() || guardando) return
    setGuardando(true)
    // Alta rapida: siempre asignado al usuario actual (se puede reasignar desde /pendientes).
    const { error } = await supabase.from('tareas').insert({
      titulo: titulo.trim(), descripcion: null, prioridad: 'media', tipo: 'agenda',
      jornales: 0, estado: 'pendiente', asignado_a: soyYo, asignados_a: [soyYo], fecha_vence: null,
      notas: null, creado_por: soyYo, actualizado_en: new Date().toISOString(),
    })
    setGuardando(false)
    if (error) { alert('No se pudo agregar: ' + error.message); return }
    setTitulo(''); inputRef.current?.focus(); cargar()
  }

  async function marcar(p: Pendiente) {
    setItems((prev) => prev.filter((x) => x.id !== p.id))
    const { error } = await supabase.from('tareas').update({
      estado: 'hecha', fecha_completada: new Date().toISOString(), actualizado_en: new Date().toISOString(),
    }).eq('id', p.id)
    if (error) { alert('No se pudo actualizar: ' + error.message); cargar() }
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-oliva-900">
          Pendientes {misItems.length > 0 && <span className="text-oliva-400 font-normal">· {misItems.length}</span>}
        </div>
        <button onClick={() => navigate('/pendientes')} className="text-xs text-oliva-600 hover:text-oliva-900">Ver todos →</button>
      </div>

      {proximos.length === 0 ? (
        <div className="text-sm text-oliva-500">Sin pendientes. 🎉</div>
      ) : (
        <ul className="space-y-1.5">
          {proximos.map((p) => {
            const atrasada = !!p.fecha_vence && p.fecha_vence < hoy
            const esHoy = p.fecha_vence === hoy
            return (
              <li key={p.id} className="flex items-start gap-2.5">
                <button
                  onClick={() => marcar(p)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-oliva-300 hover:border-oliva-600 hover:bg-oliva-50 transition"
                  aria-label="Marcar hecho"
                />
                <span className="min-w-0 flex-1 text-sm text-oliva-800 break-words">{p.titulo}</span>
                {p.fecha_vence && (
                  <span className={`shrink-0 text-[11px] ${atrasada ? 'text-red-700 font-semibold' : esHoy ? 'text-aceite-600 font-semibold' : 'text-oliva-400'}`}>
                    {atrasada ? '⚠ ' : ''}{fmtFecha(p.fecha_vence)}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={agregar} className="flex items-center gap-2 pt-1">
        <input
          ref={inputRef}
          className="input flex-1 text-sm"
          placeholder="Agregar un pendiente…"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
        />
        <button type="submit" className="btn-secondary text-sm" disabled={!titulo.trim() || guardando}>+</button>
      </form>
    </div>
  )
}
