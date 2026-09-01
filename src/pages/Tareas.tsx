import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Dialog } from '../components/Dialog'

interface Perfil { id: string; nombre: string; rol: string; activo: boolean }

interface Comentario {
  id: number
  tarea_id: number
  autor_id: string
  contenido: string
  creado_en: string
}

interface Tarea {
  id: number
  titulo: string
  descripcion: string | null
  prioridad: 'baja' | 'media' | 'alta'
  estado: 'pendiente' | 'en_progreso' | 'hecha' | 'cancelada'
  tipo: 'agenda' | 'campo'
  asignado_a: string | null
  creado_por: string | null
  fecha_creada: string
  fecha_vence: string | null
  fecha_iniciada: string | null
  fecha_completada: string | null
  notas: string | null
  jornales: number
}

function esCreador(nombre: string | null | undefined): boolean {
  const n = (nombre ?? '').toLowerCase()
  return n.includes('rodrigo') || n.includes('santi') || n.includes('ayelen') || n.includes('ayelén')
}
function esAdmin(nombre: string | null | undefined): boolean {
  return (nombre ?? '').toLowerCase().includes('rodrigo')
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
  const soyAdmin = esAdmin(perfil?.nombre)
  const soySocioEditor = puedeCrear // Rodrigo/Santi/Ayelen editan cabecera de cualquier tarea
  const soyCampo = perfil?.rol === 'campo' // Emiliano y futuros empleados

  const [tareas, setTareas] = useState<Tarea[]>([])
  const [perfiles, setPerfiles] = useState<Perfil[]>([])
  const [cargando, setCargando] = useState(true)
  const [nueva, setNueva] = useState(false)
  const [registrarHecha, setRegistrarHecha] = useState(false) // dialog para empleado
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
            {puedeCrear
              ? 'Podés crear y asignar tareas al equipo.'
              : soyCampo
                ? 'Ves las tareas que te asignaron. Registrá también las tareas que hiciste por tu cuenta con los jornales que te llevaron.'
                : 'Ves las tareas que te asignaron. Cambiá el estado a medida que avancés.'}
          </p>
        </div>
        <div className="flex gap-2">
          {soyCampo && (
            <button className="btn-primary" onClick={() => setRegistrarHecha(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
              Registrar tarea realizada
            </button>
          )}
          {puedeCrear && (
            <button className="btn-primary" onClick={() => setNueva(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
              Nueva tarea
            </button>
          )}
        </div>
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
        soyAdmin={soyAdmin}
        soySocioEditor={soySocioEditor}
        onCerrar={() => { setNueva(false); setEditando(null) }}
        onOk={() => { setNueva(false); setEditando(null); cargar() }}
      />
      <RegistrarHechaDialog
        abierto={registrarHecha}
        soyYo={soyYo}
        onCerrar={() => setRegistrarHecha(false)}
        onOk={() => { setRegistrarHecha(false); cargar() }}
      />
    </div>
  )
}

function RegistrarHechaDialog({ abierto, soyYo, onCerrar, onOk }: {
  abierto: boolean
  soyYo: string
  onCerrar: () => void
  onOk: () => void
}) {
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [jornales, setJornales] = useState<number>(1)
  const [fecha, setFecha] = useState<string>(new Date().toISOString().slice(0, 10))
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setTitulo(''); setDescripcion(''); setJornales(1)
    setFecha(new Date().toISOString().slice(0, 10)); setNotas(''); setError(null)
  }, [abierto])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) { setError('Poné qué hiciste.'); return }
    if (jornales <= 0) { setError('Indicá cuántos jornales te llevó.'); return }
    setGuardando(true); setError(null)
    const iso = new Date(fecha + 'T12:00:00').toISOString()
    const payload = {
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      prioridad: 'media' as const,
      tipo: 'campo' as const,
      estado: 'hecha' as const,
      asignado_a: soyYo,
      creado_por: soyYo,
      fecha_iniciada: iso,
      fecha_completada: iso,
      jornales,
      notas: notas.trim() || null,
    }
    const { error: err } = await supabase.from('tareas').insert(payload)
    setGuardando(false)
    if (err) { setError(err.message); return }
    onOk()
  }

  const opciones: { valor: number; label: string; hint: string }[] = [
    { valor: 0.5, label: 'Medio jornal', hint: '½ día' },
    { valor: 1, label: 'Jornal completo', hint: '1 día' },
    { valor: 2, label: '2 jornales', hint: '2 días' },
  ]

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo="Registrar tarea realizada" ancho="md">
      <form onSubmit={guardar} className="space-y-4">
        <div>
          <label className="label">¿Qué hiciste? <span className="text-red-600">*</span></label>
          <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} required autoFocus placeholder="ej. Poda de olivos cuadrante norte" />
        </div>
        <div>
          <label className="label">Detalles (opcional)</label>
          <textarea className="input" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="qué área, cuántas plantas, herramientas, etc." />
        </div>
        <div>
          <label className="label">Jornales <span className="text-red-600">*</span></label>
          <div className="grid grid-cols-3 gap-2">
            {opciones.map((o) => {
              const activo = jornales === o.valor
              return (
                <button
                  key={o.valor}
                  type="button"
                  onClick={() => setJornales(o.valor)}
                  className={`rounded-md px-2 py-3 text-sm font-semibold transition text-center
                    ${activo ? 'bg-oliva-800 text-white ring-2 ring-oliva-800' : 'bg-white ring-1 ring-oliva-200 text-oliva-700 hover:ring-oliva-400'}`}
                >
                  <div>{o.label}</div>
                  <div className={`text-[10px] font-normal mt-0.5 ${activo ? 'text-oliva-100' : 'text-oliva-500'}`}>{o.hint}</div>
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-oliva-600">
            <span>u otro:</span>
            <input type="number" step="0.5" min="0" max="30" className="input w-24 py-1" value={jornales} onChange={(e) => setJornales(Number(e.target.value) || 0)} />
            <span>jornales</span>
          </div>
        </div>
        <div>
          <label className="label">Fecha</label>
          <input type="date" className="input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div>
          <label className="label">Notas (opcional)</label>
          <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="observaciones, avances, problemas…" />
        </div>

        {error && <div className="text-sm text-red-700">{error}</div>}

        <div className="flex justify-end gap-2 pt-2 border-t border-oliva-100">
          <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Registrar'}</button>
        </div>
      </form>
    </Dialog>
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
        {tarea.tipo === 'campo' && (
          <span className="rounded-full px-2 py-[1px] bg-green-50 text-green-800 ring-1 ring-green-200">
            🌱 campo{tarea.jornales > 0 ? ` · ${tarea.jornales} jornal${tarea.jornales === 1 ? '' : 'es'}` : ''}
          </span>
        )}
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

function TareaDialog({ abierto, editar, perfiles, soyYo, soyAdmin, soySocioEditor, onCerrar, onOk }: {
  abierto: boolean
  editar: Tarea | null
  perfiles: Perfil[]
  soyYo: string
  soyAdmin: boolean
  soySocioEditor: boolean
  onCerrar: () => void
  onOk: () => void
}) {
  // Rodrigo/Santi/Ayelen editan la cabecera de cualquier tarea.
  // Rodrigo puede borrar cualquiera; los demas socios editores borran solo las suyas.
  // Gonzalo/Emiliano no editan cabecera: si son asignados cambian estado y comentan.
  const esMiCreacion = !!editar && editar.creado_por === soyYo
  const esMiAsignacion = !!editar && editar.asignado_a === soyYo
  const puedeEditar = !editar || soySocioEditor
  const puedeBorrar = !!editar && (esMiCreacion || soyAdmin)
  const puedeCambiarEstado = !!editar && (soySocioEditor || esMiAsignacion)
  const puedeComentar = !!editar && (soySocioEditor || esMiAsignacion)
  const perfilPorId = useMemo(() => new Map(perfiles.map((p) => [p.id, p])), [perfiles])
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [prioridad, setPrioridad] = useState<Tarea['prioridad']>('media')
  const [tipo, setTipo] = useState<Tarea['tipo']>('agenda')
  const [estado, setEstado] = useState<Tarea['estado']>('pendiente')
  const [jornales, setJornales] = useState<number>(0)
  const [asignadoA, setAsignadoA] = useState<string>('')
  const [fechaVence, setFechaVence] = useState<string>('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [nuevoComentario, setNuevoComentario] = useState('')
  const [enviandoComentario, setEnviandoComentario] = useState(false)

  useEffect(() => {
    if (!abierto) return
    if (editar) {
      setTitulo(editar.titulo)
      setDescripcion(editar.descripcion ?? '')
      setPrioridad(editar.prioridad)
      setTipo(editar.tipo ?? 'agenda')
      setEstado(editar.estado)
      setJornales(Number(editar.jornales ?? 0))
      setAsignadoA(editar.asignado_a ?? '')
      setFechaVence(editar.fecha_vence ?? '')
      setNotas(editar.notas ?? '')
    } else {
      setTitulo(''); setDescripcion(''); setPrioridad('media'); setTipo('agenda')
      setEstado('pendiente'); setJornales(0); setAsignadoA(''); setFechaVence(''); setNotas('')
    }
    setError(null); setConfirmDel(false); setNuevoComentario('')
  }, [abierto, editar])

  // Cargar comentarios de la tarea al abrir
  useEffect(() => {
    if (!abierto || !editar) { setComentarios([]); return }
    let cancel = false
    ;(async () => {
      const { data } = await supabase
        .from('tarea_comentarios')
        .select('*')
        .eq('tarea_id', editar.id)
        .order('creado_en', { ascending: true })
      if (!cancel) setComentarios((data as Comentario[]) ?? [])
    })()
    return () => { cancel = true }
  }, [abierto, editar])

  async function agregarComentario() {
    if (!editar || !nuevoComentario.trim()) return
    setError(null)
    setEnviandoComentario(true)
    const contenido = nuevoComentario.trim()
    const { error: errIns } = await supabase
      .from('tarea_comentarios')
      .insert({ tarea_id: editar.id, autor_id: soyYo, contenido })
    if (errIns) {
      setEnviandoComentario(false)
      setError('No se pudo guardar la anotación: ' + errIns.message)
      return
    }
    // Re-fetch para garantizar consistencia (el SELECT after-insert puede fallar por RLS)
    const { data } = await supabase
      .from('tarea_comentarios')
      .select('*')
      .eq('tarea_id', editar.id)
      .order('creado_en', { ascending: true })
    setEnviandoComentario(false)
    setComentarios((data as Comentario[]) ?? [])
    setNuevoComentario('')
  }

  // Días trabajados: desde fecha_iniciada hasta hoy (o fecha_completada si terminó)
  const diasTrabajados = (() => {
    if (!editar?.fecha_iniciada) return null
    const fin = editar.fecha_completada ? new Date(editar.fecha_completada) : new Date()
    const ini = new Date(editar.fecha_iniciada)
    const ms = fin.getTime() - ini.getTime()
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
  })()

  const soloLectura = !puedeEditar

  // Autoselección: si asignás a alguien con rol 'campo', proponer tipo=campo
  useEffect(() => {
    if (!abierto || editar) return
    const p = perfiles.find((x) => x.id === asignadoA)
    if (p && p.rol === 'campo') setTipo('campo')
  }, [asignadoA, abierto, editar, perfiles])

  function timestampsPorEstado(nuevo: Tarea['estado'], t: Tarea): Record<string, unknown> {
    const patch: Record<string, unknown> = {}
    if (nuevo === 'en_progreso' && !t.fecha_iniciada) patch.fecha_iniciada = new Date().toISOString()
    if (nuevo === 'hecha' && !t.fecha_completada) patch.fecha_completada = new Date().toISOString()
    if (nuevo === 'pendiente') { patch.fecha_iniciada = null; patch.fecha_completada = null }
    return patch
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Asignado (no creador ni admin): solo actualiza estado
    if (editar && !puedeEditar && puedeCambiarEstado) {
      if (estado === editar.estado) { onCerrar(); return }
      setGuardando(true)
      const patch = { estado, ...timestampsPorEstado(estado, editar), actualizado_en: new Date().toISOString() }
      const { error } = await supabase.from('tareas').update(patch).eq('id', editar.id)
      setGuardando(false)
      if (error) { setError(error.message); return }
      onOk()
      return
    }

    if (!titulo.trim()) { setError('Poné un título.'); return }
    if (!asignadoA) { setError('Asigná la tarea a alguien.'); return }
    setGuardando(true)
    const base = {
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      prioridad,
      tipo,
      jornales: tipo === 'campo' ? Number(jornales) || 0 : 0,
      asignado_a: asignadoA || null,
      fecha_vence: fechaVence || null,
      notas: notas.trim() || null,
      actualizado_en: new Date().toISOString(),
    }
    const payload: Record<string, unknown> = { ...base, estado }
    if (editar) Object.assign(payload, timestampsPorEstado(estado, editar))
    const q = editar
      ? supabase.from('tareas').update(payload).eq('id', editar.id)
      : supabase.from('tareas').insert({ ...base, creado_por: soyYo, estado: 'pendiente' })
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
          <label className="label">Título <span className="text-red-600">*</span></label>
          <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={soloLectura} required autoFocus />
        </div>
        <div>
          <label className="label">Descripción (opcional)</label>
          <textarea className="input" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} disabled={soloLectura} placeholder="qué hay que hacer, contexto…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Asignada a <span className="text-red-600">*</span></label>
            <select className="input" value={asignadoA} onChange={(e) => setAsignadoA(e.target.value)} disabled={soloLectura} required>
              <option value="">— elegí a alguien —</option>
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Tipo</label>
            <div className="flex gap-1.5">
              {(['agenda', 'campo'] as const).map((t) => {
                const activo = tipo === t
                const label = t === 'agenda' ? '📅 Agenda' : '🌱 Campo'
                const hint = t === 'agenda' ? 'itinerario / semana' : 'jornal / empleado'
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    disabled={soloLectura}
                    className={`flex-1 rounded-md px-2 py-2 text-xs font-semibold transition text-left
                      ${activo ? 'bg-white ring-2 ring-oliva-800 text-oliva-900' : 'bg-white ring-1 ring-oliva-200 text-oliva-600 hover:ring-oliva-400'}
                      ${soloLectura ? 'opacity-60 cursor-not-allowed' : ''}`}
                    title={hint}
                  >
                    <div>{label}</div>
                    <div className="text-[10px] font-normal text-oliva-500">{hint}</div>
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="label">Vence (opcional)</label>
            <input type="date" className="input" value={fechaVence} onChange={(e) => setFechaVence(e.target.value)} disabled={soloLectura} />
          </div>
        </div>
        {tipo === 'campo' && (
          <div>
            <label className="label">Jornales que llevó</label>
            <input type="number" step="0.5" min="0" max="30" className="input" value={jornales}
              onChange={(e) => setJornales(Number(e.target.value) || 0)} disabled={soloLectura}
              placeholder="0 · 0.5 · 1 · 2 …" />
            <div className="text-[10px] text-oliva-500 mt-1">Suma al reporte mensual de jornales del empleado.</div>
          </div>
        )}
        <div>
          <label className="label">Notas (opcional)</label>
          <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} disabled={soloLectura} />
        </div>

        {editar && puedeCambiarEstado && (
          <div>
            <label className="label">Estado</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['pendiente', 'en_progreso', 'hecha', 'cancelada'] as const).map((e) => {
                const activo = estado === e
                return (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEstado(e)}
                    className={`rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                      activo
                        ? `${COLOR_ESTADO[e]} ring-2 ring-oliva-800`
                        : `${COLOR_ESTADO[e]} opacity-60 hover:opacity-100`
                    }`}
                  >
                    {LABEL_ESTADO[e]}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Duración */}
        {editar && (editar.fecha_iniciada || editar.fecha_completada) && (
          <div className="text-[11px] text-oliva-600 bg-oliva-50 rounded-md px-3 py-2">
            {editar.fecha_iniciada && <>Iniciada <b>{new Date(editar.fecha_iniciada).toLocaleDateString('es-UY')}</b>. </>}
            {editar.fecha_completada && <>Terminada <b>{new Date(editar.fecha_completada).toLocaleDateString('es-UY')}</b>. </>}
            {diasTrabajados !== null && <>Duración: <b>{diasTrabajados}</b> día{diasTrabajados === 1 ? '' : 's'}.</>}
          </div>
        )}

        {/* Comentarios / anotaciones */}
        {editar && (
          <div className="pt-3 border-t border-oliva-100">
            <div className="text-[10px] font-bold uppercase tracking-widest text-oliva-500 mb-2">Anotaciones</div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {comentarios.length === 0 ? (
                <div className="text-[11px] text-oliva-500 italic">Sin anotaciones aún.</div>
              ) : (
                comentarios.map((c) => {
                  const autor = perfilPorId.get(c.autor_id)
                  const soyAutor = c.autor_id === soyYo
                  return (
                    <div key={c.id} className={`rounded-md px-3 py-2 text-xs ${soyAutor ? 'bg-oliva-100 text-oliva-900' : 'bg-oliva-50 text-oliva-800'}`}>
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="font-semibold text-[10px] uppercase tracking-wide">
                          {soyAutor ? 'Yo' : (autor?.nombre ?? 'alguien')}
                        </span>
                        <span className="text-[10px] text-oliva-500">{new Date(c.creado_en).toLocaleString('es-UY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="whitespace-pre-wrap">{c.contenido}</div>
                    </div>
                  )
                })
              )}
            </div>
            {puedeComentar && (
              <div className="mt-2 flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="Agregar anotación…"
                  value={nuevoComentario}
                  onChange={(e) => setNuevoComentario(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.stopPropagation()
                      if (nuevoComentario.trim() && !enviandoComentario) agregarComentario()
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={agregarComentario}
                  disabled={enviandoComentario || !nuevoComentario.trim()}
                >
                  Enviar
                </button>
              </div>
            )}
          </div>
        )}

        {error && <div className="text-sm text-red-700">{error}</div>}

        <div className="flex justify-end gap-2 pt-2 border-t border-oliva-100">
          {editar && puedeBorrar && (
            <div className="mr-auto">
              {confirmDel ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-700">¿Eliminar? Pierde el registro.</span>
                  <button type="button" className="text-xs text-oliva-600 underline" onClick={() => setConfirmDel(false)}>No</button>
                  <button type="button" className="text-xs px-2 py-1 rounded bg-red-600 text-white" onClick={eliminar} disabled={guardando}>Sí, eliminar</button>
                </div>
              ) : (
                <button type="button" className="text-xs text-red-700 underline" onClick={() => setConfirmDel(true)}>Eliminar</button>
              )}
            </div>
          )}
          <button type="button" className="btn-secondary" onClick={onCerrar}>{(!puedeEditar && !puedeCambiarEstado) ? 'Cerrar' : 'Cancelar'}</button>
          {(puedeEditar || puedeCambiarEstado) && (
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando…' : (puedeEditar ? 'Guardar' : 'Guardar estado')}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  )
}
