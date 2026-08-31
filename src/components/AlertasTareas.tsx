import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

interface Tarea {
  id: number
  titulo: string
  estado: 'pendiente' | 'en_progreso' | 'hecha' | 'cancelada'
  prioridad: 'baja' | 'media' | 'alta'
  fecha_vence: string | null
  asignado_a: string | null
  creado_por: string | null
}

const LABEL_ESTADO: Record<Tarea['estado'], string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En curso',
  hecha: 'Hecha',
  cancelada: 'Cancelada',
}

export function AlertasTareas() {
  const { session } = useAuth()
  const nav = useNavigate()
  const soyYo = session?.user.id ?? ''
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [cargando, setCargando] = useState(true)
  const [expandido, setExpandido] = useState(false)

  useEffect(() => {
    if (!soyYo) return
    let cancel = false
    ;(async () => {
      const { data } = await supabase
        .from('tareas')
        .select('id,titulo,estado,prioridad,fecha_vence,asignado_a,creado_por')
        .in('estado', ['pendiente', 'en_progreso'])
      if (cancel) return
      const mias = ((data as Tarea[]) ?? []).filter(
        (t) => t.asignado_a === soyYo || (t.asignado_a === null && t.creado_por === soyYo)
      )
      setTareas(mias)
      setCargando(false)
    })()
    return () => { cancel = true }
  }, [soyYo])

  const hoy = new Date().toISOString().slice(0, 10)

  const ordenadas = useMemo(() => {
    const prioNum = { alta: 0, media: 1, baja: 2 }
    return [...tareas].sort((a, b) => {
      const va = a.fecha_vence && a.fecha_vence < hoy ? 0 : 1
      const vb = b.fecha_vence && b.fecha_vence < hoy ? 0 : 1
      if (va !== vb) return va - vb
      if (prioNum[a.prioridad] !== prioNum[b.prioridad]) return prioNum[a.prioridad] - prioNum[b.prioridad]
      const fa = a.fecha_vence ?? '9999-12-31'
      const fb = b.fecha_vence ?? '9999-12-31'
      return fa.localeCompare(fb)
    })
  }, [tareas, hoy])

  const vencidas = tareas.filter((t) => t.fecha_vence && t.fecha_vence < hoy).length
  const enCurso = tareas.filter((t) => t.estado === 'en_progreso').length

  if (cargando) return null
  if (tareas.length === 0) return null

  const tono = vencidas > 0
    ? { borde: 'border-red-300', fondo: 'bg-red-50/50', titulo: 'text-red-800', barra: 'text-red-700' }
    : { borde: 'border-amber-300', fondo: 'bg-amber-50/50', titulo: 'text-amber-900', barra: 'text-amber-800' }

  const dotPrio: Record<Tarea['prioridad'], string> = {
    alta: 'bg-red-500',
    media: 'bg-amber-400',
    baja: 'bg-green-500',
  }
  const badgeEstado: Record<Tarea['estado'], string> = {
    pendiente: 'bg-amber-100 text-amber-800',
    en_progreso: 'bg-blue-100 text-blue-800',
    hecha: 'bg-green-100 text-green-800',
    cancelada: 'bg-oliva-100 text-oliva-600',
  }

  return (
    <div className={`rounded-lg border ${tono.borde} ${tono.fondo}`}>
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        onClick={() => setExpandido((v) => !v)}
      >
        <span className="text-sm">📋</span>
        <span className="text-sm text-oliva-900 flex-1">
          <b className={tono.titulo}>Tareas pendientes:</b>{' '}
          <span className={tono.barra}>{tareas.length}</span>
          {enCurso > 0 && <span className="text-oliva-600"> · {enCurso} en curso</span>}
          {vencidas > 0 && <span className="text-red-700"> · {vencidas} vencida{vencidas === 1 ? '' : 's'}</span>}
        </span>
        <span className="text-xs text-oliva-600">{expandido ? '▲' : '▼'}</span>
      </button>
      {expandido && (
        <div className="px-3 pb-3 border-t border-oliva-100/70">
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {ordenadas.map((t) => {
              const vencida = t.fecha_vence && t.fecha_vence < hoy
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => nav('/tareas')}
                  className="w-full flex items-center gap-2 py-1.5 border-b border-oliva-100/60 last:border-0 text-left hover:bg-white/50 rounded px-1"
                >
                  <span className={`inline-block w-2 h-2 rounded-full ${dotPrio[t.prioridad]}`} title={`prioridad ${t.prioridad}`}></span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-oliva-900 truncate">{t.titulo}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[9px] uppercase tracking-wide rounded px-1.5 py-[1px] ${badgeEstado[t.estado]}`}>
                        {LABEL_ESTADO[t.estado]}
                      </span>
                      {t.fecha_vence && (
                        <span className={`text-[10px] tabular-nums ${vencida ? 'text-red-700 font-semibold' : 'text-oliva-600'}`}>
                          📅 {t.fecha_vence}{vencida ? ' · vencida' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => nav('/tareas')}
            className="mt-2 text-[11px] text-oliva-700 hover:text-oliva-900 underline"
          >
            Ir a Tareas →
          </button>
        </div>
      )}
    </div>
  )
}
