import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Dialog } from '../components/Dialog'

interface Perfil { id: string; nombre: string; rol: string; activo: boolean }

interface Tarea {
  id: number
  titulo: string
  descripcion: string | null
  prioridad: 'baja' | 'media' | 'alta'
  estado: 'pendiente' | 'en_progreso' | 'hecha' | 'cancelada'
  asignado_a: string | null
  creado_por: string | null
  fecha_creada: string
  fecha_vence: string | null
  fecha_iniciada: string | null
  fecha_completada: string | null
  notas: string | null
}

function esCreador(nombre: string | null | undefined): boolean {
  const n = (nombre ?? '').toLowerCase()
  return n.includes('rodrigo') || n.includes('santi') || n.includes('ayelen') || n.includes('ayelén')
}

const LABEL_ESTADO: Record<Tarea['estado'], string> = {
  pendiente: '⏳ Pendiente',
  en_progreso: '🔧 En curso',
  hecha: '✅ Hecha',
  cancelada: '⊘ Cancelada',
}
const COLOR_ESTADO: Record<Tarea['estado'], string> = {
  pendiente: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  en_progreso: 'bg-blue-100 text-blue-800 ring-1 ring-blue-300',
  hecha: 'bg-green-100 text-green-800 ring-1 ring-green-300',
  cancelada: 'bg-oliva-100 text-oliva-500 line-through',
}
const COLOR_PRIORIDAD: Record<Tarea['prioridad'], string> = {
  baja: 'bg-oliva-100 text-oliva-700',
  media: 'bg-aceite-500/20 text-aceite-600',
  alta: 'bg-red-100 text-red-800',
}

export function Tareas() {
  const { perfil, session } = useAuth()
  const soyYo = session?.user.id ?? ''
  const puedeCrear = esCreador(perfil?.nombre)

  const [tareas, setTareas] = useState<Tarea[]>([])
  const [perfiles, setPerfiles] = useState<Perfil[]>([])
  const [cargando, setCargando] = useState(true)
  const [nueva, setNueva] = useState(false)
  const [editando, setEditando] = useState<Tarea | null>(null)
  const [filtroEstado, setFiltroEstado] = useState<'todas' | Tarea['estado']>('todas')
  const [filtroAsignado, setFiltroAsignado] = useState<string>('todos')

  async function cargar() {
    setCargando(true)
    const [t, p] = await Promise.all([
      supabase.from('tareas').select('*').order('fecha_creada', { ascending: false }),
      supabase.from('perfiles').select('id,nombre,rol,activo').eq('activo', true).order('nombre'),
    ])
    setTareas((t.data as Tarea[]) ?? [])
    setPerfiles((p.data as Perfil[]) ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const perfilPorId = useMemo(() => new Map(perfiles.map((p) => [p.id, p])), [perfiles])

  const filtradas = useMemo(() => {
    return tareas.filter((t) => {
      if (filtroEstado !== 'todas' && t.estado !== filtroEstado) return false
      if (filtroAsignado !== 'todos' && t.asignado_a !== filtroAsignado) return false
      return true
    })
  }, [tareas, filtroEstado, filtroAsignado])

  // KPIs
  const pend = tareas.filter((t) => t.estado === 'pendiente').length
  const curso = tareas.filter((t) => t.estado === 'en_progreso').length
  const misAsignadas = tareas.filter((t) => t.asignado_a === soyYo && t.estado !== 'hecha' && t.estado !== 'cancelada').length

  async function cambiarEstado(t: Tarea, nuevo: Tarea['estado']) {
    const patch: Partial<Tarea> = { estado: nuevo }
    if (nuevo === 'en_progreso' && !t.fecha_iniciada) patch.fecha_iniciada = new Date().toISOString()
    if (nuevo === 'hecha' && !t.fecha_completada) patch.fecha_completada = new Date().toISOString()
    const { error } = await supabase.from('tareas').update(patch).eq('id', t.id)
    if (error) { alert('Error: ' + error.message); return }
    cargar()
  }

  return (
    <div className="space-y-5 max-w-[1200px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-oliva-500">Gestión</div>
          <h1 className="text-xl font-bold text-oliva-900 mt-1">Tareas</h1>
          <p className="text-sm text-oliva-700">
            {puedeCrear ? 'Podés crear y asignar tareas al equipo.' : 'Ves las tareas que te asignaron. Cambiá el estado a medida que avancés.'}
          </p>
        </div>
        {puedeCrear && (
          <button className="btn-primary" onClick={() => setNueva(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
            Nueva tarea
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="panel">
          <div className="text-[10px] font-bold uppercase tracking-widest text-oliva-500">Pendientes</div>
          <div className="text-2xl font-extrabold text-amber-800 mt-1">{pend}</div>
        </div>
        <div className="panel">
          <div className="text-[10px] font-bold uppercase tracking-widest text-oliva-500">En curso</div>
          <div className="text-2xl font-extrabold text-blue-800 mt-1">{curso}</div>
        </div>
        <div className="panel">
          <div className="text-[10px] font-bold uppercase tracking-widest text-oliva-500">Tuyas activas</div>
          <div className="text-2xl font-extrabold text-oliva-900 mt-1">{misAsignadas}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-3 flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[140px]">
          <label className="label">Estado</label>
          <select className="input" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as 'todas' | Tarea['estado'])}>
            <option value="todas">Todas</option>
            <option value="pendiente">Pendiente</option>
            <option value="en_progreso">En curso</option>
            <option value="hecha">Hecha</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="label">Asignado a</label>
          <select className="input" value={filtroAsignado} onChange={(e) => setFiltroAsignado(e.target.value)}>
            <option value="todos">Todos</option>
            <option value={soyYo}>Yo</option>
            {perfiles.filter((p) => p.id !== soyYo).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div className="text-xs text-oliva-500 ml-auto">{filtradas.length} tarea(s)</div>
      </div>

      {/* Lista */}
      {cargando ? (
        <div className="card p-6 text-sm text-oliva-700">Cargando…</div>
      ) : filtradas.length === 0 ? (
        <div className="card p-6 text-sm text-oliva-700 text-center">
          {tareas.length === 0
            ? (puedeCrear ? 'Todavía no hay tareas. Creá la primera con "+ Nueva tarea".' : 'No tenés tareas asignadas.')
            : 'Sin resultados para el filtro.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtradas.map((t) => (
            <TareaCard
              key={t.id}
              tarea={t}
              asignado={t.asignado_a ? perfilPorId.get(t.asignado_a) : undefined}
              creador={t.creado_por ? perfilPorId.get(t.creado_por) : undefined}
              soyYo={soyYo}
              onCambiarEstado={cambiarEstado}
              onEditar={() => setEditando(t)}
            />
          ))}
        </div>
      )}

      <TareaDialog
        abierto={nueva || editando !== null}
        editar={editando}
        perfiles={perfiles}
        soyYo={soyYo}
        onCerrar={() => { setNueva(false); setEditando(null) }}
        onOk={() => { setNueva(false); setEditando(null); cargar() }}
      />
    </div>
  )
}

function TareaCard({ tarea, asignado, creador, soyYo, onCambiarEstado, onEditar }: {
  tarea: Tarea
  asignado?: Perfil
  creador?: Perfil
  soyYo: string
  onCambiarEstado: (t: Tarea, nuevo: Tarea['estado']) => void
  onEditar: () => void
}) {
  const esMia = tarea.asignado_a === soyYo
  const vencida = tarea.fecha_vence && tarea.fecha_vence < new Date().toISOString().slice(0, 10) && tarea.estado !== 'hecha' && tarea.estado !== 'cancelada'

  return (
    <div className={`panel ${vencida ? 'border-red-300' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <button className="text-left flex-1 min-w-0" onClick={onEditar}>
          <div className="font-semibold text-oliva-900 hover:text-oliva-700">{tarea.titulo}</div>
          {tarea.descripcion && <div className="text-xs text-oliva-600 mt-1 line-clamp-2">{tarea.descripcion}</div>}
        </button>
        <span className={`text-[10px] font-bold uppercase rounded-full px-2 py-[1px] ${COLOR_PRIORIDAD[tarea.prioridad]}`}>{tarea.prioridad}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[11px]">
        <span className={`rounded-full px-2 py-[1px] ${COLOR_ESTADO[tarea.estado]}`}>{LABEL_ESTADO[tarea.estado]}</span>
        {asignado && (
          <span className="text-oliva-600">👤 {esMia ? 'Yo' : asignado.nombre}</span>
        )}
        {creador && creador.id !== tarea.asignado_a && (
          <span className="text-oliva-500">· pidió {creador.nombre.split(' ')[0]}</span>
        )}
        {tarea.fecha_vence && (
          <span className={`ml-auto ${vencida ? 'text-red-700 font-semibold' : 'text-oliva-600'}`}>
            📅 {tarea.fecha_vence}
          </span>
        )}
      </div>

      {/* Botones de cambio de estado (para el asignado, si no está terminada) */}
      {esMia && tarea.estado !== 'hecha' && tarea.estado !== 'cancelada' && (
        <div className="flex gap-2 mt-3">
          {tarea.estado === 'pendiente' && (
            <button
              className="text-xs px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              onClick={() => onCambiarEstado(tarea, 'en_progreso')}
            >
              🔧 Empezar
            </button>
          )}
          <button
            className="text-xs px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white font-semibold"
            onClick={() => onCambiarEstado(tarea, 'hecha')}
          >
            ✅ Marcar hecha
          </button>
        </div>
      )}
    </div>
  )
}

function TareaDialog({ abierto, editar, perfiles, soyYo, onCerrar, onOk }: {
  abierto: boolean
  editar: Tarea | null
  perfiles: Perfil[]
  soyYo: string
  onCerrar: () => void
  onOk: () => void
}) {
  // Solo el creador de la tarea puede editar cabecera y eliminar
  const esMiCreacion = !!editar && editar.creado_por === soyYo
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [prioridad, setPrioridad] = useState<Tarea['prioridad']>('media')
  const [asignadoA, setAsignadoA] = useState<string>('')
  const [fechaVence, setFechaVence] = useState<string>('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)

  useEffect(() => {
    if (!abierto) return
    if (editar) {
      setTitulo(editar.titulo)
      setDescripcion(editar.descripcion ?? '')
      setPrioridad(editar.prioridad)
      setAsignadoA(editar.asignado_a ?? '')
      setFechaVence(editar.fecha_vence ?? '')
      setNotas(editar.notas ?? '')
    } else {
      setTitulo(''); setDescripcion(''); setPrioridad('media')
      setAsignadoA(''); setFechaVence(''); setNotas('')
    }
    setError(null); setConfirmDel(false)
  }, [abierto, editar])

  const soloLectura = !!editar && !esMiCreacion

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) { setError('Poné un título.'); return }
    setGuardando(true); setError(null)
    const payload = {
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      prioridad,
      asignado_a: asignadoA || null,
      fecha_vence: fechaVence || null,
      notas: notas.trim() || null,
      actualizado_en: new Date().toISOString(),
    }
    const q = editar
      ? supabase.from('tareas').update(payload).eq('id', editar.id)
      : supabase.from('tareas').insert({ ...payload, creado_por: soyYo, estado: 'pendiente' })
    const { error } = await q
    setGuardando(false)
    if (error) { setError(error.message); return }
    onOk()
  }

  async function eliminar() {
    if (!editar) return
    setGuardando(true)
    const { error } = await supabase.from('tareas').delete().eq('id', editar.id)
    setGuardando(false)
    if (error) { setError(error.message); return }
    onOk()
  }

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo={editar ? `Tarea #${editar.id}` : 'Nueva tarea'} ancho="md">
      <form onSubmit={guardar} className="space-y-4">
        <div>
          <label className="label">Título</label>
          <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={soloLectura} required autoFocus />
        </div>
        <div>
          <label className="label">Descripción (opcional)</label>
          <textarea className="input" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} disabled={soloLectura} placeholder="qué hay que hacer, contexto…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Asignada a</label>
            <select className="input" value={asignadoA} onChange={(e) => setAsignadoA(e.target.value)} disabled={soloLectura}>
              <option value="">— sin asignar —</option>
              {perfiles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Prioridad</label>
            <div className="flex gap-1.5">
              {(['baja', 'media', 'alta'] as const).map((p) => {
                const activo = prioridad === p
                const color = p === 'baja' ? 'bg-green-500' : p === 'media' ? 'bg-amber-400' : 'bg-red-500'
                const label = p === 'baja' ? 'Baja' : p === 'media' ? 'Media' : 'Alta'
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrioridad(p)}
                    disabled={soloLectura}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold transition
                      ${activo
                        ? 'bg-white ring-2 ring-oliva-800 text-oliva-900'
                        : 'bg-white ring-1 ring-oliva-200 text-oliva-600 hover:ring-oliva-400'}
                      ${soloLectura ? 'opacity-60 cursor-not-allowed' : ''}`}
                    title={label}
                  >
                    <span className={`h-3 w-3 rounded-full ${color} ${activo ? 'ring-2 ring-offset-1 ring-oliva-800/40' : ''}`}></span>
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div>
          <label className="label">Vence (opcional)</label>
          <input type="date" className="input" value={fechaVence} onChange={(e) => setFechaVence(e.target.value)} disabled={soloLectura} />
        </div>
        <div>
          <label className="label">Notas (opcional)</label>
          <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} disabled={soloLectura} />
        </div>

        {error && <div className="text-sm text-red-700">{error}</div>}

        <div className="flex justify-end gap-2 pt-2 border-t border-oliva-100">
          {editar && esMiCreacion && (
            <div className="mr-auto">
              {confirmDel ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-700">¿Eliminar?</span>
                  <button type="button" className="text-xs text-oliva-600 underline" onClick={() => setConfirmDel(false)}>No</button>
                  <button type="button" className="text-xs px-2 py-1 rounded bg-red-600 text-white" onClick={eliminar} disabled={guardando}>Sí, eliminar</button>
                </div>
              ) : (
                <button type="button" className="text-xs text-red-700 underline" onClick={() => setConfirmDel(true)}>Eliminar</button>
              )}
            </div>
          )}
          <button type="button" className="btn-secondary" onClick={onCerrar}>{soloLectura ? 'Cerrar' : 'Cancelar'}</button>
          {!soloLectura && (
            <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          )}
        </div>
      </form>
    </Dialog>
  )
}
