import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Dialog } from '../components/Dialog'
import { fFecha } from '../lib/format'
import { guardarFlag, leerFlag, guardarObj, leerObj, borrarKey } from '../lib/persistencia'
import type {
  Aplicacion, AplicacionProducto, LaborCampo, CategoriaCampo, AmbitoCategoria, EstadoEvento,
} from '../lib/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hoyLocalStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Zafra agricola: arranca en julio.
function zafraDe(fecha: string): string {
  const [y, m] = fecha.slice(0, 10).split('-').map(Number)
  return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

function slugify(s: string): string {
  return s.trim().toLowerCase()
    .replace(/[áàäâ]/g, 'a').replace(/[éèëê]/g, 'e').replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o').replace(/[úùüû]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 40)
}

const COLOR_FALLBACK = '#5F5E5A'
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic']
const MESES_ZAFRA = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]

function nOrNull(s: string): number | null {
  const t = (s ?? '').trim().replace(',', '.')
  if (t === '') return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

// Borradores
const FLAG_APLIC = 'dialog:nueva-aplicacion'
const FLAG_LABOR = 'dialog:nueva-labor'
const BORRADOR_APLIC = 'borrador:nueva-aplicacion'
const BORRADOR_LABOR = 'borrador:nueva-labor'

// ---------------------------------------------------------------------------
// Formularios (campos numericos como string mientras se edita)
// ---------------------------------------------------------------------------

interface LineaForm {
  categoria: string
  producto_comercial: string
  dosis_ha: string
  cantidad_planta: string
  notas: string
}
interface AplicForm {
  fecha: string
  sectores: string
  estado: EstadoEvento
  forma_aplicacion: string
  operario: string
  horas_hombre: string
  observaciones: string
  lineas: LineaForm[]
}
interface LaborForm {
  fecha: string
  tipo_labor: string
  sectores: string
  descripcion: string
  jornales: string
  horas_hombre: string
  horas_tractor: string
  operarios: string
  estado: EstadoEvento
  observaciones: string
}

function aplicFormVacio(catDefault: string): AplicForm {
  return {
    fecha: hoyLocalStr(), sectores: '1 al 7', estado: 'realizada',
    forma_aplicacion: '', operario: '', horas_hombre: '', observaciones: '',
    lineas: [{ categoria: catDefault, producto_comercial: '', dosis_ha: '', cantidad_planta: '', notas: '' }],
  }
}
function laborFormVacio(catDefault: string): LaborForm {
  return {
    fecha: hoyLocalStr(), tipo_labor: catDefault, sectores: '1 al 7', descripcion: '',
    jornales: '', horas_hombre: '', horas_tractor: '', operarios: '', estado: 'realizada', observaciones: '',
  }
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

type Cronograma = 'aplicaciones' | 'manejo'
type Vista = 'lista' | 'grilla'

export function Campo() {
  const { puede } = useAuth()
  const puedeEscribir = puede(['admin', 'campo'])

  const location = useLocation()
  const navigate = useNavigate()
  const abrirNueva = (location.state as { abrirNueva?: boolean } | null)?.abrirNueva === true

  const [cronograma, setCronograma] = useState<Cronograma>('aplicaciones')
  const [vista, setVista] = useState<Vista>('lista')
  const [zafra, setZafra] = useState<string>('')
  const [cargando, setCargando] = useState(true)

  const [aplicaciones, setAplicaciones] = useState<Aplicacion[]>([])
  const [productos, setProductos] = useState<AplicacionProducto[]>([])
  const [labores, setLabores] = useState<LaborCampo[]>([])
  const [cats, setCats] = useState<CategoriaCampo[]>([])

  // Dialogs
  const [nuevaAplic, setNuevaAplicRaw] = useState(() => leerFlag(FLAG_APLIC))
  const setNuevaAplic = (v: boolean) => { setNuevaAplicRaw(v); guardarFlag(FLAG_APLIC, v) }
  const [nuevaLabor, setNuevaLaborRaw] = useState(() => leerFlag(FLAG_LABOR))
  const setNuevaLabor = (v: boolean) => { setNuevaLaborRaw(v); guardarFlag(FLAG_LABOR, v) }
  const [detAplic, setDetAplic] = useState<Aplicacion | null>(null)
  const [detLabor, setDetLabor] = useState<LaborCampo | null>(null)
  const [editAplic, setEditAplic] = useState<Aplicacion | null>(null)
  const [editLabor, setEditLabor] = useState<LaborCampo | null>(null)
  const [editorAmbito, setEditorAmbito] = useState<AmbitoCategoria | null>(null)

  const ambito: AmbitoCategoria = cronograma === 'aplicaciones' ? 'aplicacion' : 'labor'

  async function cargarCats() {
    const { data } = await supabase.from('categorias_campo').select('*').order('orden').order('nombre')
    setCats((data as CategoriaCampo[]) ?? [])
  }
  async function cargar() {
    setCargando(true)
    const [a, p, l, c] = await Promise.all([
      supabase.from('aplicaciones').select('*').order('fecha', { ascending: false }),
      supabase.from('aplicacion_productos').select('*'),
      supabase.from('labores_campo').select('*').order('fecha', { ascending: false }),
      supabase.from('categorias_campo').select('*').order('orden').order('nombre'),
    ])
    setAplicaciones((a.data as Aplicacion[]) ?? [])
    setProductos((p.data as AplicacionProducto[]) ?? [])
    setLabores((l.data as LaborCampo[]) ?? [])
    setCats((c.data as CategoriaCampo[]) ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  useEffect(() => {
    if (abrirNueva) {
      if (cronograma === 'aplicaciones') setNuevaAplic(true); else setNuevaLabor(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function h() {
      if (cronograma === 'aplicaciones') setNuevaAplic(true); else setNuevaLabor(true)
    }
    window.addEventListener('app:fab-nuevo', h)
    return () => window.removeEventListener('app:fab-nuevo', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cronograma])

  // Mapas de categoria por ambito (incluye inactivas, para que datos viejos sigan mostrando color/nombre)
  const infoApp = useMemo(() => new Map(cats.filter((c) => c.ambito === 'aplicacion').map((c) => [c.slug, c])), [cats])
  const infoLabor = useMemo(() => new Map(cats.filter((c) => c.ambito === 'labor').map((c) => [c.slug, c])), [cats])
  const activasApp = useMemo(() => cats.filter((c) => c.ambito === 'aplicacion' && c.activo), [cats])
  const activasLabor = useMemo(() => cats.filter((c) => c.ambito === 'labor' && c.activo), [cats])
  const activasActual = ambito === 'aplicacion' ? activasApp : activasLabor

  const colorDe = (map: Map<string, CategoriaCampo>, slug: string) => map.get(slug)?.color ?? COLOR_FALLBACK

  const prodPorAplic = useMemo(() => {
    const m = new Map<number, AplicacionProducto[]>()
    for (const p of productos) {
      const arr = m.get(p.aplicacion_id) ?? []
      arr.push(p); m.set(p.aplicacion_id, arr)
    }
    return m
  }, [productos])

  const zafras = useMemo(() => {
    const s = new Set<string>()
    for (const a of aplicaciones) s.add(a.zafra || zafraDe(a.fecha))
    for (const l of labores) s.add(l.zafra || zafraDe(l.fecha))
    return [...s].sort().reverse()
  }, [aplicaciones, labores])

  useEffect(() => {
    if (zafras.length && !zafras.includes(zafra)) setZafra(zafras[0])
  }, [zafras, zafra])

  const aplicZafra = useMemo(
    () => aplicaciones.filter((a) => (a.zafra || zafraDe(a.fecha)) === zafra)
      .sort((x, y) => x.fecha.localeCompare(y.fecha)),
    [aplicaciones, zafra],
  )
  const laboresZafra = useMemo(
    () => labores.filter((l) => (l.zafra || zafraDe(l.fecha)) === zafra)
      .sort((x, y) => x.fecha.localeCompare(y.fecha)),
    [labores, zafra],
  )

  // ------------------------------------------------------------------ guardar
  async function guardarAplicacion(form: AplicForm, id?: number) {
    const cab = {
      fecha: form.fecha,
      zafra: zafraDe(form.fecha),
      sectores: form.sectores.trim() || null,
      estado: form.estado,
      forma_aplicacion: form.forma_aplicacion.trim() || null,
      operario: form.operario.trim() || null,
      horas_hombre: nOrNull(form.horas_hombre),
      observaciones: form.observaciones.trim() || null,
    }
    let aplicId = id
    if (id) {
      await supabase.from('aplicaciones').update(cab).eq('id', id)
      await supabase.from('aplicacion_productos').delete().eq('aplicacion_id', id)
    } else {
      const { data } = await supabase.from('aplicaciones').insert(cab).select('id').single()
      aplicId = (data as { id: number } | null)?.id
    }
    if (aplicId) {
      const lineas = form.lineas
        .filter((ln) => ln.producto_comercial.trim() !== '')
        .map((ln) => ({
          aplicacion_id: aplicId!,
          categoria: ln.categoria,
          producto_comercial: ln.producto_comercial.trim(),
          dosis_ha: nOrNull(ln.dosis_ha),
          cantidad_planta: nOrNull(ln.cantidad_planta),
          notas: ln.notas.trim() || null,
        }))
      if (lineas.length) await supabase.from('aplicacion_productos').insert(lineas)
    }
    await cargar()
  }

  async function guardarLabor(form: LaborForm, id?: number) {
    const row = {
      fecha: form.fecha,
      zafra: zafraDe(form.fecha),
      sectores: form.sectores.trim() || null,
      tipo_labor: form.tipo_labor,
      descripcion: form.descripcion.trim() || null,
      jornales: nOrNull(form.jornales),
      horas_hombre: nOrNull(form.horas_hombre),
      horas_tractor: nOrNull(form.horas_tractor),
      operarios: form.operarios.trim() || null,
      estado: form.estado,
      observaciones: form.observaciones.trim() || null,
    }
    if (id) await supabase.from('labores_campo').update(row).eq('id', id)
    else await supabase.from('labores_campo').insert(row)
    await cargar()
  }

  async function borrarAplicacion(id: number) {
    if (!confirm('¿Borrar esta aplicación y sus productos?')) return
    await supabase.from('aplicaciones').delete().eq('id', id)
    setDetAplic(null)
    await cargar()
  }
  async function borrarLabor(id: number) {
    if (!confirm('¿Borrar esta labor?')) return
    await supabase.from('labores_campo').delete().eq('id', id)
    setDetLabor(null)
    await cargar()
  }

  const labelNuevo = cronograma === 'aplicaciones' ? 'Nueva aplicación' : 'Nueva labor'
  function abrirNuevo() { if (cronograma === 'aplicaciones') setNuevaAplic(true); else setNuevaLabor(true) }

  // ------------------------------------------------------------------ render
  return (
    <div className="pb-24 lg:pb-6">
      {/* Fila 1: cronograma + boton Nuevo (arriba, siempre visible) */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <Segmento
          valor={cronograma}
          onChange={(v) => setCronograma(v as Cronograma)}
          opciones={[['aplicaciones', 'Aplicaciones'], ['manejo', 'Manejo de cultivo']]}
        />
        {puedeEscribir && (
          <button
            onClick={abrirNuevo}
            className="inline-flex items-center gap-1.5 rounded-lg bg-oliva-800 text-oliva-50 px-3.5 py-2 text-sm font-medium hover:bg-oliva-900"
          >
            <span className="text-base leading-none">+</span> {labelNuevo}
          </button>
        )}
      </div>

      {/* Fila 2: zafra + vista */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-oliva-600">Zafra</span>
          <select
            value={zafra}
            onChange={(e) => setZafra(e.target.value)}
            className="rounded-lg border border-oliva-200 bg-white px-2 py-1.5 text-sm"
          >
            {zafras.length === 0 && <option value="">—</option>}
            {zafras.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>
        <Segmento
          valor={vista}
          onChange={(v) => setVista(v as Vista)}
          opciones={[['lista', 'Lista'], ['grilla', 'Grilla']]}
          pequeno
        />
      </div>

      {/* Leyenda + editar categorias */}
      <Leyenda
        cats={activasActual}
        onEditar={puedeEscribir ? () => setEditorAmbito(ambito) : undefined}
      />

      {cargando ? (
        <p className="text-oliva-500 text-sm py-8 text-center">Cargando…</p>
      ) : cronograma === 'aplicaciones' ? (
        vista === 'lista'
          ? <ListaAplicaciones items={aplicZafra} prodPorAplic={prodPorAplic} info={infoApp} onAbrir={setDetAplic} />
          : <GrillaEventos
              zafra={zafra}
              eventos={aplicZafra.map((a) => ({ id: a.id, fecha: a.fecha, color: colorDe(infoApp, prodPorAplic.get(a.id)?.[0]?.categoria ?? ''), planif: a.estado === 'planificada', onAbrir: () => setDetAplic(a) }))}
            />
      ) : (
        vista === 'lista'
          ? <ListaLabores items={laboresZafra} info={infoLabor} onAbrir={setDetLabor} />
          : <GrillaEventos
              zafra={zafra}
              eventos={laboresZafra.map((l) => ({ id: l.id, fecha: l.fecha, color: colorDe(infoLabor, l.tipo_labor), planif: l.estado === 'planificada', onAbrir: () => setDetLabor(l) }))}
            />
      )}

      {/* ---- Dialogs ---- */}
      {nuevaAplic && (
        <AplicacionDialog
          titulo="Nueva aplicación"
          cats={activasApp}
          borradorKey={BORRADOR_APLIC}
          onCerrar={() => { setNuevaAplic(false); borrarKey(BORRADOR_APLIC) }}
          onGuardar={async (f) => { await guardarAplicacion(f); setNuevaAplic(false); borrarKey(BORRADOR_APLIC) }}
        />
      )}
      {editAplic && (
        <AplicacionDialog
          titulo="Editar aplicación"
          cats={activasApp}
          inicial={aplicAForm(editAplic, prodPorAplic.get(editAplic.id) ?? [])}
          onCerrar={() => setEditAplic(null)}
          onGuardar={async (f) => { await guardarAplicacion(f, editAplic.id); setEditAplic(null) }}
        />
      )}
      {nuevaLabor && (
        <LaborDialog
          titulo="Nueva labor"
          cats={activasLabor}
          borradorKey={BORRADOR_LABOR}
          onCerrar={() => { setNuevaLabor(false); borrarKey(BORRADOR_LABOR) }}
          onGuardar={async (f) => { await guardarLabor(f); setNuevaLabor(false); borrarKey(BORRADOR_LABOR) }}
        />
      )}
      {editLabor && (
        <LaborDialog
          titulo="Editar labor"
          cats={activasLabor}
          inicial={laborAForm(editLabor)}
          onCerrar={() => setEditLabor(null)}
          onGuardar={async (f) => { await guardarLabor(f, editLabor.id); setEditLabor(null) }}
        />
      )}

      {detAplic && (
        <DetalleAplicacion
          aplic={detAplic}
          productos={prodPorAplic.get(detAplic.id) ?? []}
          info={infoApp}
          puedeEscribir={puedeEscribir}
          onCerrar={() => setDetAplic(null)}
          onEditar={() => { setEditAplic(detAplic); setDetAplic(null) }}
          onBorrar={() => borrarAplicacion(detAplic.id)}
        />
      )}
      {detLabor && (
        <DetalleLabor
          labor={detLabor}
          info={infoLabor}
          puedeEscribir={puedeEscribir}
          onCerrar={() => setDetLabor(null)}
          onEditar={() => { setEditLabor(detLabor); setDetLabor(null) }}
          onBorrar={() => borrarLabor(detLabor.id)}
        />
      )}

      {editorAmbito && (
        <CategoriasEditorDialog
          ambito={editorAmbito}
          onCerrar={() => setEditorAmbito(null)}
          onCambio={cargarCats}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subcomponentes de UI
// ---------------------------------------------------------------------------

function Segmento({ valor, onChange, opciones, pequeno }: {
  valor: string; onChange: (v: string) => void; opciones: [string, string][]; pequeno?: boolean
}) {
  return (
    <div className="inline-flex rounded-xl bg-oliva-100 p-0.5">
      {opciones.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-lg font-medium transition ${pequeno ? 'px-3 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'} ${
            valor === v ? 'bg-white text-oliva-900 shadow-sm' : 'text-oliva-600'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Leyenda({ cats, onEditar }: { cats: CategoriaCampo[]; onEditar?: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-oliva-50 border border-oliva-100 px-3 py-2 mb-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 flex-1">
        {cats.map((c) => (
          <span key={c.id} className="flex items-center gap-1.5 text-xs text-oliva-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />{c.nombre}
          </span>
        ))}
        {cats.length === 0 && <span className="text-xs text-oliva-400">Sin categorías.</span>}
      </div>
      {onEditar && (
        <button onClick={onEditar} className="shrink-0 text-xs font-medium text-oliva-600 hover:text-oliva-900 underline decoration-dotted">
          Editar
        </button>
      )}
    </div>
  )
}

function BadgeSectores({ sectores }: { sectores: string | null }) {
  if (!sectores) return null
  return (
    <span className="text-xs font-medium text-oliva-600 bg-white border border-oliva-200 rounded px-1.5 py-0.5">
      Sectores {sectores}
    </span>
  )
}
function BadgePlanif() {
  return <span className="text-[11px] text-blue-700 bg-blue-100 rounded-full px-2 py-0.5">planificada</span>
}

function agruparPorMes<T extends { fecha: string }>(items: T[]): [string, T[]][] {
  const grupos: [string, T[]][] = []
  for (const it of items) {
    const [y, m] = it.fecha.slice(0, 10).split('-').map(Number)
    const label = `${MESES[m - 1]} ${y}`
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo[0] === label) ultimo[1].push(it)
    else grupos.push([label, [it]])
  }
  return grupos
}

function ListaAplicaciones({ items, prodPorAplic, info, onAbrir }: {
  items: Aplicacion[]; prodPorAplic: Map<number, AplicacionProducto[]>; info: Map<string, CategoriaCampo>; onAbrir: (a: Aplicacion) => void
}) {
  if (items.length === 0) return <VacioMsg texto="No hay aplicaciones en esta zafra." />
  return (
    <div>
      {agruparPorMes(items).map(([mes, grupo]) => (
        <div key={mes}>
          <div className="text-xs font-medium uppercase tracking-wide text-oliva-400 mt-4 mb-2">{mes}</div>
          {grupo.map((a) => {
            const prods = prodPorAplic.get(a.id) ?? []
            const dia = a.fecha.slice(8, 10)
            return (
              <button
                key={a.id}
                onClick={() => onAbrir(a)}
                className="w-full text-left flex gap-3 items-start bg-white border border-oliva-100 rounded-xl px-3.5 py-3 mb-2 hover:border-oliva-300 transition"
              >
                <div className="w-8 text-center shrink-0">
                  <div className="text-xl font-semibold text-oliva-900 leading-none">{dia}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <BadgeSectores sectores={a.sectores} />
                    {a.estado === 'planificada' && <BadgePlanif />}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {prods.length === 0 && <span className="text-xs text-oliva-400">sin productos</span>}
                    {prods.map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-1.5 bg-oliva-50 border border-oliva-100 rounded-full px-2.5 py-1 text-xs text-oliva-800">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: info.get(p.categoria)?.color ?? COLOR_FALLBACK }} />
                        {p.producto_comercial}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="text-oliva-300 shrink-0">›</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function ListaLabores({ items, info, onAbrir }: { items: LaborCampo[]; info: Map<string, CategoriaCampo>; onAbrir: (l: LaborCampo) => void }) {
  if (items.length === 0) return <VacioMsg texto="No hay labores en esta zafra." />
  return (
    <div>
      {agruparPorMes(items).map(([mes, grupo]) => (
        <div key={mes}>
          <div className="text-xs font-medium uppercase tracking-wide text-oliva-400 mt-4 mb-2">{mes}</div>
          {grupo.map((l) => {
            const dia = l.fecha.slice(8, 10)
            const cat = info.get(l.tipo_labor)
            return (
              <button
                key={l.id}
                onClick={() => onAbrir(l)}
                className="w-full text-left flex gap-3 items-start bg-white border border-oliva-100 rounded-xl px-3.5 py-3 mb-2 hover:border-oliva-300 transition"
              >
                <div className="w-8 text-center shrink-0">
                  <div className="text-xl font-semibold text-oliva-900 leading-none">{dia}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="inline-flex items-center gap-1.5 bg-oliva-50 border border-oliva-100 rounded-full px-2.5 py-1 text-xs font-medium text-oliva-800">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: cat?.color ?? COLOR_FALLBACK }} />
                      {cat?.nombre ?? l.tipo_labor}
                    </span>
                    <BadgeSectores sectores={l.sectores} />
                    {l.estado === 'planificada' && <BadgePlanif />}
                  </div>
                  {l.descripcion && <p className="text-sm text-oliva-700 line-clamp-2">{l.descripcion}</p>}
                </div>
                <span className="text-oliva-300 shrink-0">›</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

interface EventoGrilla { id: number; fecha: string; color: string; planif: boolean; onAbrir: () => void }

function GrillaEventos({ zafra, eventos }: { zafra: string; eventos: EventoGrilla[] }) {
  const anioIni = Number((zafra || '0').split('-')[0]) || new Date().getFullYear()
  if (!zafra) return <VacioMsg texto="Sin datos." />
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {MESES_ZAFRA.map((m) => {
        const anio = m >= 7 ? anioIni : anioIni + 1
        const delMes = eventos.filter((e) => {
          const [y, mm] = e.fecha.slice(0, 10).split('-').map(Number)
          return y === anio && mm === m
        })
        return (
          <div key={m} className="rounded-xl border border-oliva-100 bg-white p-2.5 min-h-[76px]">
            <div className="text-xs font-medium text-oliva-500 mb-1.5">{MESES[m - 1]} {String(anio).slice(2)}</div>
            <div className="flex flex-wrap gap-1">
              {delMes.length === 0 && <span className="text-xs text-oliva-300">—</span>}
              {delMes.map((e) => (
                <button
                  key={e.id}
                  onClick={e.onAbrir}
                  title={fFecha(e.fecha)}
                  className={`inline-flex items-center justify-center h-6 min-w-[22px] px-1 rounded text-[11px] font-medium text-white ${e.planif ? 'opacity-60 ring-1 ring-blue-400' : ''}`}
                  style={{ background: e.color }}
                >
                  {e.fecha.slice(8, 10)}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function VacioMsg({ texto }: { texto: string }) {
  return <p className="text-oliva-400 text-sm py-10 text-center">{texto}</p>
}

// ---------------------------------------------------------------------------
// Dialogs de alta/edicion
// ---------------------------------------------------------------------------

function aplicAForm(a: Aplicacion, prods: AplicacionProducto[]): AplicForm {
  return {
    fecha: a.fecha.slice(0, 10),
    sectores: a.sectores ?? '',
    estado: a.estado,
    forma_aplicacion: a.forma_aplicacion ?? '',
    operario: a.operario ?? '',
    horas_hombre: a.horas_hombre != null ? String(a.horas_hombre) : '',
    observaciones: a.observaciones ?? '',
    lineas: prods.length
      ? prods.map((p) => ({
          categoria: p.categoria,
          producto_comercial: p.producto_comercial,
          dosis_ha: p.dosis_ha != null ? String(p.dosis_ha) : '',
          cantidad_planta: p.cantidad_planta != null ? String(p.cantidad_planta) : '',
          notas: p.notas ?? '',
        }))
      : [{ categoria: '', producto_comercial: '', dosis_ha: '', cantidad_planta: '', notas: '' }],
  }
}
function laborAForm(l: LaborCampo): LaborForm {
  return {
    fecha: l.fecha.slice(0, 10),
    tipo_labor: l.tipo_labor,
    sectores: l.sectores ?? '',
    descripcion: l.descripcion ?? '',
    jornales: l.jornales != null ? String(l.jornales) : '',
    horas_hombre: l.horas_hombre != null ? String(l.horas_hombre) : '',
    horas_tractor: l.horas_tractor != null ? String(l.horas_tractor) : '',
    operarios: l.operarios ?? '',
    estado: l.estado,
    observaciones: l.observaciones ?? '',
  }
}

const inputCls = 'w-full rounded-lg border border-oliva-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-oliva-300'
const labelCls = 'block text-xs font-medium text-oliva-600 mb-1'

function SelectCategoria({ cats, value, onChange }: { cats: CategoriaCampo[]; value: string; onChange: (v: string) => void }) {
  // value puede ser un slug inactivo (dato viejo): lo agregamos como opcion para no perderlo.
  const faltante = value && !cats.some((c) => c.slug === value)
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-oliva-200 px-2 py-1.5 text-sm">
      {cats.map((c) => <option key={c.slug} value={c.slug}>{c.nombre}</option>)}
      {faltante && <option value={value}>{value}</option>}
    </select>
  )
}

function AplicacionDialog({ titulo, inicial, cats, borradorKey, onCerrar, onGuardar }: {
  titulo: string
  inicial?: AplicForm
  cats: CategoriaCampo[]
  borradorKey?: string
  onCerrar: () => void
  onGuardar: (f: AplicForm) => Promise<void>
}) {
  const catDefault = cats[0]?.slug ?? ''
  const [form, setForm] = useState<AplicForm>(() => {
    const base = inicial ?? ((borradorKey && leerObj<AplicForm>(borradorKey)) || aplicFormVacio(catDefault))
    // asegurar que cada linea sin categoria tome el default
    return { ...base, lineas: base.lineas.map((ln) => ({ ...ln, categoria: ln.categoria || catDefault })) }
  })
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { if (borradorKey) guardarObj(borradorKey, form) }, [form, borradorKey])

  const set = <K extends keyof AplicForm>(k: K, v: AplicForm[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setLinea = (i: number, patch: Partial<LineaForm>) =>
    setForm((f) => ({ ...f, lineas: f.lineas.map((ln, j) => (j === i ? { ...ln, ...patch } : ln)) }))
  const addLinea = () => setForm((f) => ({ ...f, lineas: [...f.lineas, { categoria: catDefault, producto_comercial: '', dosis_ha: '', cantidad_planta: '', notas: '' }] }))
  const delLinea = (i: number) => setForm((f) => ({ ...f, lineas: f.lineas.filter((_, j) => j !== i) }))

  const colorDeSlug = (slug: string) => cats.find((c) => c.slug === slug)?.color ?? COLOR_FALLBACK

  async function submit() {
    if (!form.fecha) { alert('Falta la fecha.'); return }
    setGuardando(true)
    try { await onGuardar(form) } finally { setGuardando(false) }
  }

  return (
    <Dialog abierto onCerrar={onCerrar} titulo={titulo} ancho="lg" scrollKey={borradorKey}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Fecha</label>
            <input type="date" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Sectores</label>
            <input value={form.sectores} onChange={(e) => set('sectores', e.target.value)} placeholder="1 al 7" className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Estado</label>
            <select value={form.estado} onChange={(e) => set('estado', e.target.value as EstadoEvento)} className={inputCls}>
              <option value="realizada">Realizada</option>
              <option value="planificada">Planificada</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Forma de aplicación</label>
            <input value={form.forma_aplicacion} onChange={(e) => set('forma_aplicacion', e.target.value)} placeholder="Pulverizadora" className={inputCls} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className={labelCls + ' mb-0'}>Productos</span>
            <button onClick={addLinea} className="text-xs font-medium text-oliva-700 hover:text-oliva-900">+ Agregar producto</button>
          </div>
          <div className="space-y-2">
            {form.lineas.map((ln, i) => (
              <div key={i} className="rounded-lg border border-oliva-100 bg-oliva-50/50 p-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: colorDeSlug(ln.categoria) }} />
                  <SelectCategoria cats={cats} value={ln.categoria} onChange={(v) => setLinea(i, { categoria: v })} />
                  {form.lineas.length > 1 && (
                    <button onClick={() => delLinea(i)} className="ml-auto text-red-500 hover:text-red-700 text-sm" aria-label="Quitar producto">✕</button>
                  )}
                </div>
                <input value={ln.producto_comercial} onChange={(e) => setLinea(i, { producto_comercial: e.target.value })} placeholder="Nombre comercial del producto" className={inputCls} />
                <div className="grid grid-cols-2 gap-2">
                  <input value={ln.dosis_ha} onChange={(e) => setLinea(i, { dosis_ha: e.target.value })} placeholder="Dosis/ha" className={inputCls} />
                  <input value={ln.cantidad_planta} onChange={(e) => setLinea(i, { cantidad_planta: e.target.value })} placeholder="Cant./planta" className={inputCls} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Operario</label>
            <input value={form.operario} onChange={(e) => set('operario', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Horas (hombre)</label>
            <input value={form.horas_hombre} onChange={(e) => set('horas_hombre', e.target.value)} placeholder="0" className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Observaciones</label>
          <textarea value={form.observaciones} onChange={(e) => set('observaciones', e.target.value)} rows={2} className={inputCls} />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={submit} disabled={guardando} className="flex-1 rounded-lg bg-oliva-800 text-oliva-50 py-2.5 text-sm font-medium hover:bg-oliva-900 disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <button onClick={onCerrar} className="rounded-lg border border-oliva-200 px-4 py-2.5 text-sm text-oliva-700">Cancelar</button>
        </div>
      </div>
    </Dialog>
  )
}

function LaborDialog({ titulo, inicial, cats, borradorKey, onCerrar, onGuardar }: {
  titulo: string
  inicial?: LaborForm
  cats: CategoriaCampo[]
  borradorKey?: string
  onCerrar: () => void
  onGuardar: (f: LaborForm) => Promise<void>
}) {
  const catDefault = cats[0]?.slug ?? ''
  const [form, setForm] = useState<LaborForm>(() => {
    const base = inicial ?? ((borradorKey && leerObj<LaborForm>(borradorKey)) || laborFormVacio(catDefault))
    return { ...base, tipo_labor: base.tipo_labor || catDefault }
  })
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { if (borradorKey) guardarObj(borradorKey, form) }, [form, borradorKey])
  const set = <K extends keyof LaborForm>(k: K, v: LaborForm[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function submit() {
    if (!form.fecha) { alert('Falta la fecha.'); return }
    setGuardando(true)
    try { await onGuardar(form) } finally { setGuardando(false) }
  }

  return (
    <Dialog abierto onCerrar={onCerrar} titulo={titulo} ancho="md" scrollKey={borradorKey}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Fecha</label>
            <input type="date" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Tipo de labor</label>
            <select value={form.tipo_labor} onChange={(e) => set('tipo_labor', e.target.value)} className={inputCls}>
              {cats.map((c) => <option key={c.slug} value={c.slug}>{c.nombre}</option>)}
              {form.tipo_labor && !cats.some((c) => c.slug === form.tipo_labor) && <option value={form.tipo_labor}>{form.tipo_labor}</option>}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Sectores</label>
            <input value={form.sectores} onChange={(e) => set('sectores', e.target.value)} placeholder="1 al 7" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Estado</label>
            <select value={form.estado} onChange={(e) => set('estado', e.target.value as EstadoEvento)} className={inputCls}>
              <option value="realizada">Realizada</option>
              <option value="planificada">Planificada</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Descripción</label>
          <textarea value={form.descripcion} onChange={(e) => set('descripcion', e.target.value)} rows={2} className={inputCls} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls}>Jornales</label>
            <input value={form.jornales} onChange={(e) => set('jornales', e.target.value)} placeholder="0" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Hs hombre</label>
            <input value={form.horas_hombre} onChange={(e) => set('horas_hombre', e.target.value)} placeholder="0" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Hs tractor</label>
            <input value={form.horas_tractor} onChange={(e) => set('horas_tractor', e.target.value)} placeholder="0" className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Operarios</label>
          <input value={form.operarios} onChange={(e) => set('operarios', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Observaciones</label>
          <textarea value={form.observaciones} onChange={(e) => set('observaciones', e.target.value)} rows={2} className={inputCls} />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={submit} disabled={guardando} className="flex-1 rounded-lg bg-oliva-800 text-oliva-50 py-2.5 text-sm font-medium hover:bg-oliva-900 disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <button onClick={onCerrar} className="rounded-lg border border-oliva-200 px-4 py-2.5 text-sm text-oliva-700">Cancelar</button>
        </div>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Dialogs de detalle
// ---------------------------------------------------------------------------

function Fila({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  if (valor == null || valor === '') return null
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-oliva-50 last:border-0">
      <span className="text-oliva-500 text-sm">{etiqueta}</span>
      <span className="text-oliva-900 text-sm text-right">{valor}</span>
    </div>
  )
}

function DetalleAplicacion({ aplic, productos, info, puedeEscribir, onCerrar, onEditar, onBorrar }: {
  aplic: Aplicacion; productos: AplicacionProducto[]; info: Map<string, CategoriaCampo>; puedeEscribir: boolean
  onCerrar: () => void; onEditar: () => void; onBorrar: () => void
}) {
  return (
    <Dialog abierto onCerrar={onCerrar} titulo={`Aplicación ${fFecha(aplic.fecha)}`} ancho="md">
      <div>
        <Fila etiqueta="Fecha" valor={fFecha(aplic.fecha)} />
        <Fila etiqueta="Sectores" valor={aplic.sectores} />
        <Fila etiqueta="Estado" valor={aplic.estado === 'planificada' ? 'Planificada' : 'Realizada'} />
        <Fila etiqueta="Forma" valor={aplic.forma_aplicacion} />
        <Fila etiqueta="Operario" valor={aplic.operario} />
        <Fila etiqueta="Horas hombre" valor={aplic.horas_hombre} />

        <div className="mt-3 mb-1 text-xs font-medium uppercase tracking-wide text-oliva-400">Productos</div>
        <div className="space-y-1.5">
          {productos.length === 0 && <p className="text-sm text-oliva-400">Sin productos.</p>}
          {productos.map((p) => {
            const cat = info.get(p.categoria)
            return (
              <div key={p.id} className="rounded-lg border border-oliva-100 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: cat?.color ?? COLOR_FALLBACK }} />
                  <span className="text-sm font-medium text-oliva-900">{p.producto_comercial}</span>
                  <span className="ml-auto text-xs text-oliva-500">{cat?.nombre ?? p.categoria}</span>
                </div>
                {(p.dosis_ha != null || p.cantidad_planta != null || p.notas) && (
                  <div className="text-xs text-oliva-600 mt-1 flex flex-wrap gap-x-3">
                    {p.dosis_ha != null && <span>Dosis/ha: {p.dosis_ha}</span>}
                    {p.cantidad_planta != null && <span>Cant./planta: {p.cantidad_planta}</span>}
                    {p.notas && <span>{p.notas}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {aplic.observaciones && (
          <div className="mt-3">
            <div className="text-xs font-medium uppercase tracking-wide text-oliva-400 mb-1">Observaciones</div>
            <p className="text-sm text-oliva-700 whitespace-pre-wrap">{aplic.observaciones}</p>
          </div>
        )}

        {puedeEscribir && (
          <div className="flex gap-2 mt-4">
            <button onClick={onEditar} className="flex-1 rounded-lg bg-oliva-800 text-oliva-50 py-2 text-sm font-medium hover:bg-oliva-900">Editar</button>
            <button onClick={onBorrar} className="rounded-lg border border-red-200 text-red-600 px-4 py-2 text-sm hover:bg-red-50">Borrar</button>
          </div>
        )}
      </div>
    </Dialog>
  )
}

function DetalleLabor({ labor, info, puedeEscribir, onCerrar, onEditar, onBorrar }: {
  labor: LaborCampo; info: Map<string, CategoriaCampo>; puedeEscribir: boolean
  onCerrar: () => void; onEditar: () => void; onBorrar: () => void
}) {
  const cat = info.get(labor.tipo_labor)
  return (
    <Dialog abierto onCerrar={onCerrar} titulo={`${cat?.nombre ?? labor.tipo_labor} ${fFecha(labor.fecha)}`} ancho="md">
      <div>
        <Fila etiqueta="Fecha" valor={fFecha(labor.fecha)} />
        <Fila etiqueta="Tipo" valor={cat?.nombre ?? labor.tipo_labor} />
        <Fila etiqueta="Sectores" valor={labor.sectores} />
        <Fila etiqueta="Estado" valor={labor.estado === 'planificada' ? 'Planificada' : 'Realizada'} />
        <Fila etiqueta="Jornales" valor={labor.jornales} />
        <Fila etiqueta="Horas hombre" valor={labor.horas_hombre} />
        <Fila etiqueta="Horas tractor" valor={labor.horas_tractor} />
        <Fila etiqueta="Operarios" valor={labor.operarios} />
        {labor.descripcion && (
          <div className="mt-3">
            <div className="text-xs font-medium uppercase tracking-wide text-oliva-400 mb-1">Descripción</div>
            <p className="text-sm text-oliva-700 whitespace-pre-wrap">{labor.descripcion}</p>
          </div>
        )}
        {labor.observaciones && (
          <div className="mt-3">
            <div className="text-xs font-medium uppercase tracking-wide text-oliva-400 mb-1">Observaciones</div>
            <p className="text-sm text-oliva-700 whitespace-pre-wrap">{labor.observaciones}</p>
          </div>
        )}
        {puedeEscribir && (
          <div className="flex gap-2 mt-4">
            <button onClick={onEditar} className="flex-1 rounded-lg bg-oliva-800 text-oliva-50 py-2 text-sm font-medium hover:bg-oliva-900">Editar</button>
            <button onClick={onBorrar} className="rounded-lg border border-red-200 text-red-600 px-4 py-2 text-sm hover:bg-red-50">Borrar</button>
          </div>
        )}
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Editor de categorias (color + nombre)
// ---------------------------------------------------------------------------

function CategoriasEditorDialog({ ambito, onCerrar, onCambio }: {
  ambito: AmbitoCategoria
  onCerrar: () => void
  onCambio: () => void | Promise<void>
}) {
  const titulo = ambito === 'aplicacion' ? 'Categorías de aplicaciones' : 'Tipos de labor'
  const [items, setItems] = useState<CategoriaCampo[]>([])
  const [cargando, setCargando] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoColor, setNuevoColor] = useState('#639922')

  async function cargar() {
    setCargando(true)
    const { data } = await supabase.from('categorias_campo').select('*').eq('ambito', ambito).order('orden').order('nombre')
    setItems((data as CategoriaCampo[]) ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [ambito])

  async function agregar() {
    const nombre = nuevoNombre.trim(); if (!nombre) return
    const slug = slugify(nombre) || `cat_${Date.now()}`
    const orden = (Math.max(0, ...items.map((c) => c.orden)) || 0) + 10
    const { error } = await supabase.from('categorias_campo').insert({ ambito, slug, nombre, color: nuevoColor, orden, activo: true })
    if (error) { alert('Error: ' + error.message); return }
    setNuevoNombre(''); await cargar(); await onCambio()
  }
  async function patch(c: CategoriaCampo, campos: Partial<CategoriaCampo>) {
    const { error } = await supabase.from('categorias_campo').update(campos).eq('id', c.id)
    if (error) { alert('Error: ' + error.message); return }
    await cargar(); await onCambio()
  }
  async function eliminar(c: CategoriaCampo) {
    if (!confirm(`¿Eliminar "${c.nombre}"? Si ya se usó en registros, mejor desactivala.`)) return
    const { error } = await supabase.from('categorias_campo').delete().eq('id', c.id)
    if (error) { alert('No se puede borrar (ya tiene registros). Desactivala en su lugar.'); return }
    await cargar(); await onCambio()
  }

  return (
    <Dialog abierto onCerrar={onCerrar} titulo={titulo} ancho="md">
      <div className="space-y-3">
        {/* Agregar */}
        <div className="flex items-center gap-2 rounded-lg border border-oliva-100 bg-oliva-50/50 p-2">
          <input type="color" value={nuevoColor} onChange={(e) => setNuevoColor(e.target.value)} className="h-9 w-10 rounded border border-oliva-200 bg-white p-0.5 cursor-pointer" aria-label="Color" />
          <input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }}
            placeholder="Nueva categoría…"
            className="flex-1 rounded-lg border border-oliva-200 px-3 py-2 text-sm"
          />
          <button onClick={agregar} disabled={!nuevoNombre.trim()} className="rounded-lg bg-oliva-800 text-oliva-50 px-3 py-2 text-sm font-medium hover:bg-oliva-900 disabled:opacity-50">Agregar</button>
        </div>

        {cargando ? (
          <p className="text-sm text-oliva-500">Cargando…</p>
        ) : (
          <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
            {items.map((c) => (
              <FilaCategoria key={c.id} c={c} onColor={(color) => patch(c, { color })} onNombre={(nombre) => patch(c, { nombre })} onToggle={() => patch(c, { activo: !c.activo })} onDel={() => eliminar(c)} />
            ))}
            {items.length === 0 && <p className="text-xs text-oliva-400 italic">Sin categorías.</p>}
          </div>
        )}
        <p className="text-[11px] text-oliva-400">El nombre y el color se pueden cambiar sin perder los registros ya cargados. Desactivá una categoría para que deje de aparecer al cargar, sin borrarla.</p>
      </div>
    </Dialog>
  )
}

function FilaCategoria({ c, onColor, onNombre, onToggle, onDel }: {
  c: CategoriaCampo; onColor: (color: string) => void; onNombre: (nombre: string) => void; onToggle: () => void; onDel: () => void
}) {
  const [nombre, setNombre] = useState(c.nombre)
  useEffect(() => { setNombre(c.nombre) }, [c.nombre])
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${c.activo ? 'bg-white border-oliva-100' : 'bg-oliva-50/60 border-oliva-100 opacity-70'}`}>
      <input type="color" value={c.color} onChange={(e) => onColor(e.target.value)} className="h-8 w-9 rounded border border-oliva-200 bg-white p-0.5 cursor-pointer shrink-0" aria-label={`Color ${c.nombre}`} />
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onBlur={() => { if (nombre.trim() && nombre !== c.nombre) onNombre(nombre.trim()) }}
        onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() } }}
        className="flex-1 min-w-0 rounded-lg border border-transparent hover:border-oliva-200 focus:border-oliva-300 px-2 py-1 text-sm focus:outline-none"
      />
      <button onClick={onToggle} title={c.activo ? 'Desactivar' : 'Activar'} className="shrink-0 h-8 w-8 rounded-md bg-oliva-50 hover:bg-oliva-100 text-sm">{c.activo ? '👁' : '↻'}</button>
      <button onClick={onDel} title="Eliminar" className="shrink-0 h-8 w-8 rounded-md bg-red-50 hover:bg-red-100 text-red-700 text-sm">🗑</button>
    </div>
  )
}
