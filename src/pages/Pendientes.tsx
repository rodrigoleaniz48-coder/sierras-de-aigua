import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

// Lista de pendientes compartida: reemplazo simple del viejo modulo "Tareas".
// Reusa la misma tabla `tareas` (asi los pendientes ya cargados aparecen solos),
// pero con lo minimo: titulo, hecho/no, fecha opcional y "para quien" opcional.
// Se dejan de lado comentarios, prioridad, estados intermedios, jornales y vista equipo.

interface Perfil { id: string; nombre: string; rol: string }

interface Pendiente {
  id: number
  titulo: string
  estado: 'pendiente' | 'en_progreso' | 'hecha' | 'cancelada'
  asignado_a: string | null
  asignados_a: string[] | null
  creado_por: string | null
  fecha_creada: string
  fecha_vence: string | null
  fecha_completada: string | null
}

// Fecha de hoy en zona local (Uruguay UTC-3), no en UTC, para que "atrasada" no
// salte segun la hora en que cada uno abre la app.
function hoyLocalStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function asignadosDe(p: Pendiente): string[] {
  if (p.asignados_a && p.asignados_a.length > 0) return p.asignados_a
  return p.asignado_a ? [p.asignado_a] : []
}

function fmtFecha(f: string): string {
  return new Date(f + 'T00:00:00').toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit' })
}

export function Pendientes() {
  const { session } = useAuth()
  const soyYo = session?.user.id ?? ''

  const location = useLocation()
  const navigate = useNavigate()
  const abrirNueva = (location.state as { abrirNueva?: boolean } | null)?.abrirNueva === true

  const [items, setItems] = useState<Pendiente[]>([])
  const [perfiles, setPerfiles] = useState<Perfil[]>([])
  const [cargando, setCargando] = useState(true)

  const [titulo, setTitulo] = useState('')
  const [fecha, setFecha] = useState('')
  const [paraQuien, setParaQuien] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [filtro, setFiltro] = useState<'todos' | 'mios'>('todos')
  const [verHechas, setVerHechas] = useState(false)
  const tituloRef = useRef<HTMLInputElement>(null)

  async function cargar() {
    setCargando(true)
    const [t, p] = await Promise.all([
      supabase.from('tareas').select('id,titulo,estado,asignado_a,asignados_a,creado_por,fecha_creada,fecha_vence,fecha_completada').order('fecha_creada', { ascending: false }),
      supabase.from('perfiles').select('id,nombre,rol').eq('activo', true).order('nombre'),
    ])
    setItems((t.data as Pendiente[]) ?? [])
    setPerfiles((p.data as Perfil[]) ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  // Si llego con intencion de agregar (FAB o navegacion), enfocar el input.
  useEffect(() => {
    if (abrirNueva) {
      tituloRef.current?.focus()
      navigate(location.pathname, { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // FAB: estando en la pagina, enfocar el input de alta.
  useEffect(() => {
    function h() { tituloRef.current?.focus(); tituloRef.current?.scrollIntoView({ block: 'center' }) }
    window.addEventListener('app:fab-nuevo', h)
    return () => window.removeEventListener('app:fab-nuevo', h)
  }, [])

  const perfilPorId = useMemo(() => new Map(perfiles.map((p) => [p.id, p])), [perfiles])
  const hoy = hoyLocalStr()

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim() || guardando) return
    setGuardando(true)
    const quien = paraQuien || soyYo // siempre asignado; por defecto, el usuario actual
    const { error } = await supabase.from('tareas').insert({
      titulo: titulo.trim(),
      descripcion: null,
      prioridad: 'media',
      tipo: 'agenda',
      jornales: 0,
      estado: 'pendiente',
      asignado_a: quien,
      asignados_a: [quien],
      fecha_vence: fecha || null,
      notas: null,
      creado_por: soyYo,
      actualizado_en: new Date().toISOString(),
    })
    setGuardando(false)
    if (error) { alert('No se pudo agregar: ' + error.message); return }
    setTitulo(''); setFecha(''); setParaQuien('')
    tituloRef.current?.focus()
    cargar()
  }

  async function marcar(p: Pendiente, hecha: boolean) {
    // Optimista: actualizar en pantalla y persistir.
    const nuevoEstado = hecha ? 'hecha' : 'pendiente'
    setItems((prev) => prev.map((x) => x.id === p.id ? { ...x, estado: nuevoEstado, fecha_completada: hecha ? new Date().toISOString() : null } : x))
    const { error } = await supabase.from('tareas').update({
      estado: nuevoEstado,
      fecha_completada: hecha ? new Date().toISOString() : null,
      actualizado_en: new Date().toISOString(),
    }).eq('id', p.id)
    if (error) { alert('No se pudo actualizar: ' + error.message); cargar() }
  }

  async function archivar(p: Pendiente) {
    setItems((prev) => prev.filter((x) => x.id !== p.id))
    const { error } = await supabase.from('tareas').update({ estado: 'cancelada', actualizado_en: new Date().toISOString() }).eq('id', p.id)
    if (error) { alert('No se pudo quitar: ' + error.message); cargar() }
  }

  const mios = (p: Pendiente) => asignadosDe(p).includes(soyYo) || p.creado_por === soyYo

  const pendientes = useMemo(() => {
    return items
      .filter((p) => p.estado === 'pendiente' || p.estado === 'en_progreso')
      .filter((p) => filtro === 'todos' || mios(p))
      .sort((a, b) => {
        const fa = a.fecha_vence, fb = b.fecha_vence
        if (fa && fb) return fa.localeCompare(fb)
        if (fa && !fb) return -1
        if (!fa && fb) return 1
        return b.fecha_creada.localeCompare(a.fecha_creada)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, filtro, soyYo])

  const hechas = useMemo(() => {
    return items
      .filter((p) => p.estado === 'hecha')
      .filter((p) => filtro === 'todos' || mios(p))
      .sort((a, b) => (b.fecha_completada ?? b.fecha_creada).localeCompare(a.fecha_completada ?? a.fecha_creada))
      .slice(0, 30)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, filtro, soyYo])

  function etiquetaPersona(p: Pendiente): string | null {
    const ids = asignadosDe(p)
    if (ids.length === 0) return null
    const nombres = ids.map((id) => perfilPorId.get(id)?.nombre?.split(' ')[0] ?? '?')
    return nombres.join(', ')
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-oliva-900">Pendientes</h1>
        <span className="text-sm text-oliva-500">{pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'}</span>
      </div>

      {/* Alta rapida en una linea */}
      <form onSubmit={agregar} className="card p-3 space-y-2">
        <input
          ref={tituloRef}
          className="input"
          placeholder="Agregar un pendiente…"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-auto" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} title="Fecha (opcional)" />
          <select className="input w-auto" value={paraQuien || soyYo} onChange={(e) => setParaQuien(e.target.value)} title="Para quién">
            {perfiles.map((p) => <option key={p.id} value={p.id}>{p.nombre.split(' ')[0]}</option>)}
          </select>
          <button type="submit" className="btn-primary ml-auto" disabled={!titulo.trim() || guardando}>
            {guardando ? 'Agregando…' : 'Agregar'}
          </button>
        </div>
      </form>

      {/* Filtro */}
      <div className="flex items-center gap-2 text-sm">
        {([['todos', 'Todos'], ['mios', 'Míos']] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setFiltro(v)}
            className={`px-3 py-1 rounded-full ${filtro === v ? 'bg-oliva-800 text-oliva-50' : 'bg-oliva-100 text-oliva-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {cargando ? (
        <div className="card p-4 text-sm text-oliva-500 text-center">Cargando…</div>
      ) : pendientes.length === 0 ? (
        <div className="card p-6 text-sm text-oliva-500 text-center">No hay pendientes. 🎉</div>
      ) : (
        <ul className="card divide-y divide-oliva-100">
          {pendientes.map((p) => {
            const persona = etiquetaPersona(p)
            const atrasada = !!p.fecha_vence && p.fecha_vence < hoy
            const esHoy = p.fecha_vence === hoy
            return (
              <li key={p.id} className="flex items-start gap-3 p-3">
                <button
                  onClick={() => marcar(p, true)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-2 border-oliva-300 hover:border-oliva-600 hover:bg-oliva-50 transition"
                  aria-label="Marcar hecho"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-oliva-900 break-words">{p.titulo}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                    {p.fecha_vence && (
                      <span className={atrasada ? 'text-red-700 font-semibold' : esHoy ? 'text-aceite-600 font-semibold' : 'text-oliva-500'}>
                        {atrasada ? '⚠ ' : ''}{fmtFecha(p.fecha_vence)}
                      </span>
                    )}
                    {persona && <span className="text-oliva-500">· {persona}</span>}
                  </div>
                </div>
                <button
                  onClick={() => archivar(p)}
                  className="shrink-0 text-oliva-300 hover:text-red-600 transition text-lg leading-none"
                  aria-label="Quitar"
                  title="Quitar de la lista"
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Hechas */}
      {hechas.length > 0 && (
        <div>
          <button onClick={() => setVerHechas((v) => !v)} className="text-sm text-oliva-600 hover:text-oliva-900">
            {verHechas ? '▾' : '▸'} Hechas ({hechas.length})
          </button>
          {verHechas && (
            <ul className="card divide-y divide-oliva-100 mt-2">
              {hechas.map((p) => {
                const persona = etiquetaPersona(p)
                return (
                  <li key={p.id} className="flex items-start gap-3 p-3">
                    <button
                      onClick={() => marcar(p, false)}
                      className="mt-0.5 h-5 w-5 shrink-0 rounded-md bg-oliva-600 border-2 border-oliva-600 text-white flex items-center justify-center transition hover:bg-oliva-700"
                      aria-label="Desmarcar"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-oliva-500 line-through break-words">{p.titulo}</div>
                      {persona && <div className="text-[11px] text-oliva-400">· {persona}</div>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
