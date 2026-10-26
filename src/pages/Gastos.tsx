import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Dialog } from '../components/Dialog'
import { EditorCategoriasDialog } from '../components/EditorCategoriasDialog'
import { money, fFecha } from '../lib/format'
import { fetchCotizacionBilleteMes } from '../lib/bcu'

function esAdminGastos(nombre: string | null | undefined): boolean {
  const n = (nombre ?? '').toLowerCase()
  return n.includes('rodrigo') || n.includes('santi')
}
import { guardarFlag, leerFlag, guardarObj, leerObj, borrarKey } from '../lib/persistencia'

interface Gasto {
  id: number
  fecha: string
  socio_id: string
  categoria: string
  monto: number
  moneda: 'UYU' | 'USD'
  descripcion: string | null
  metodo_pago: string | null
  reembolsable: boolean
  reembolsado: boolean
  es_adelanto: boolean
  comprobante_url: string | null
}

type TipoGasto = 'normal' | 'reembolsable' | 'adelanto'

interface Socio { id: string; nombre: string }

interface Categoria { id: number; slug: string; nombre: string; activo: boolean; orden: number }

const METODOS = ['efectivo', 'transferencia', 'tarjeta', 'debito_automatico'] as const

// Agrupación de categorías de gasto para los selectores (optgroups).
const GRUPOS_GASTO: [string, string[]][] = [
  ['Olivos', ['olivos_poda', 'olivos_cultivos']],
  ['Almazara', ['olivos_procesamiento', 'almazara_-_productos_jabon_miel_etc', 'almazara_-_gastos_y_mo_habilitacion_arre']],
  ['Ovinos', ['ovinos', 'ovinos_-_general_mo_sanidad_etc', 'ovinos_-_compra_animales']],
  ['Campo', ['forestacion']],
  ['Inversiones', ['olivos_inversion', 'inversion_-_almazara', 'inersion_-_casas', 'inversion_-_mejoras_fijas_alambrados_etc', 'inversion_-_maquinaria']],
  ['Operativo', ['vehiculos', 'maquinaria', 'herramientas_menores', 'administracion', 'impuestos_aportes', 'reformas_obra', 'capacitaciones']],
  ['Comercial', ['promociones_comerciales']],
  ['Otros', ['varios']],
]
const SLUGS_AGRUPADOS = new Set(GRUPOS_GASTO.flatMap(([, slugs]) => slugs))

// Etiqueta corta para el <option>: quita el prefijo redundante del grupo
// (Olivos/Almazara/Ovinos) y abrevia "Inversión" a "Inv.", para que en el
// select nativo de mobile las opciones sean cortas y no se mezclen con el
// subtítulo del grupo.
function labelCortoCategoria(nombre: string): string {
  const i = nombre.indexOf(' - ')
  if (i === -1) return nombre
  const prefijo = nombre.slice(0, i)
  const resto = nombre.slice(i + 3)
  if (prefijo === 'Inversión') return 'Inv. ' + resto
  if (prefijo === 'Olivos' || prefijo === 'Almazara' || prefijo === 'Ovinos') {
    return resto.charAt(0).toUpperCase() + resto.slice(1)
  }
  return nombre
}

// Desplegable propio de categorías: reemplaza al <select> nativo (que en mobile
// mezcla optgroups y opciones de forma incontrolable). Grupos como subtítulos
// claros y opciones con buen área de toque.
function CategoriaSelect({ value, onChange, categorias, incluirTodas, disabled }: {
  value: string
  onChange: (slug: string) => void
  categorias: Categoria[]
  incluirTodas?: boolean
  disabled?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (!ref.current?.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const catMap = useMemo(() => new Map(categorias.map(c => [c.slug, c])), [categorias])
  const sinGrupo = categorias.filter(c => !SLUGS_AGRUPADOS.has(c.slug))
  const etiquetaSel = value === 'todas' ? 'Todas' : (catMap.get(value)?.nombre ?? value ?? '— elegir —')

  function elegir(slug: string) { onChange(slug); setAbierto(false) }

  const opCls = (activo: boolean) =>
    `block w-full text-left px-3 py-2.5 text-sm hover:bg-oliva-50 ${activo ? 'bg-oliva-100 text-oliva-900 font-medium' : 'text-oliva-800'}`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAbierto(v => !v)}
        className="input w-full flex items-center justify-between gap-2 text-left disabled:opacity-60"
      >
        <span className="truncate">{etiquetaSel}</span>
        <span className={`text-oliva-400 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {abierto && !disabled && (
        <div className="absolute z-30 mt-1 left-0 right-0 max-h-[55vh] overflow-y-auto rounded-lg border border-oliva-200 bg-white shadow-lg">
          {incluirTodas && (
            <button type="button" className={opCls(value === 'todas') + ' border-b border-oliva-100'} onMouseDown={(e) => { e.preventDefault(); elegir('todas') }}>
              Todas
            </button>
          )}
          {GRUPOS_GASTO.map(([label, slugs]) => {
            const items = slugs.map(s => catMap.get(s)).filter(Boolean) as Categoria[]
            if (items.length === 0) return null
            return (
              <div key={label}>
                <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-oliva-500 bg-oliva-50 border-y border-oliva-100">{label}</div>
                {items.map(c => (
                  <button key={c.slug} type="button" className={opCls(value === c.slug)} onMouseDown={(e) => { e.preventDefault(); elegir(c.slug) }}>
                    {labelCortoCategoria(c.nombre)}
                  </button>
                ))}
              </div>
            )
          })}
          {sinGrupo.length > 0 && sinGrupo.map(c => (
            <button key={c.slug} type="button" className={opCls(value === c.slug)} onMouseDown={(e) => { e.preventDefault(); elegir(c.slug) }}>
              {c.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function formatMonto(monto: number, moneda: 'UYU' | 'USD'): string {
  if (moneda === 'USD') return 'U$S ' + Number(monto).toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  return money(monto)
}

export function Gastos() {
  const { session, perfil } = useAuth()
  const veTodos = !!perfil?.ve_todos_gastos
  const soyYo = session?.user.id ?? ''

  const [gastos, setGastos] = useState<Gasto[]>([])
  const [socios, setSocios] = useState<Socio[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [cargando, setCargando] = useState(true)
  const [nuevo, setNuevoRaw] = useState(() => leerFlag('dialog:nuevo-gasto'))
  const setNuevo = (v: boolean) => { setNuevoRaw(v); guardarFlag('dialog:nuevo-gasto', v) }
  const [editando, setEditando] = useState<Gasto | null>(null)
  const [editorCat, setEditorCat] = useState(false)
  // Socios con sueldo configurado (para mostrar "Liquidar sueldo") + socio a liquidar.
  const [sueldoSocioIds, setSueldoSocioIds] = useState<Set<string>>(new Set())
  const [liquidar, setLiquidar] = useState<{ id: string; nombre: string } | null>(null)

  // Filtros
  const hoy = new Date()
  const [mes, setMes] = useState<string>(String(hoy.getMonth() + 1).padStart(2, '0'))
  const [anio, setAnio] = useState<string>(String(hoy.getFullYear()))
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas')
  const [filtroSocio, setFiltroSocio] = useState<string>('todos')

  async function cargar() {
    setCargando(true)
    const [g, s, c] = await Promise.all([
      supabase.from('gastos').select('*').order('fecha', { ascending: false }).order('id', { ascending: false }),
      supabase.from('perfiles').select('id,nombre').eq('activo', true).neq('rol', 'campo').order('nombre'),
      supabase.from('categorias_gasto').select('*').eq('activo', true).order('orden').order('nombre'),
    ])
    setGastos((g.data as Gasto[]) ?? [])
    setSocios((s.data as Socio[]) ?? [])
    setCategorias((c.data as Categoria[]) ?? [])
    setCargando(false)
    supabase.from('sueldos_socio').select('socio_id').then(({ data }) => {
      setSueldoSocioIds(new Set(((data as { socio_id: string }[]) ?? []).map((x) => x.socio_id)))
    })
  }
  // Lookup slug -> nombre para mostrar label lindo
  const catLabel = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of categorias) m.set(c.slug, c.nombre)
    return (slug: string) => m.get(slug) ?? slug
  }, [categorias])
  useEffect(() => { cargar() }, [])
  // FAB: abrir "Nuevo gasto" al recibir el evento global (solo si esta montado, o sea si tab=egresos)
  useEffect(() => {
    function h() { setNuevo(true) }
    window.addEventListener('app:fab-nuevo', h)
    return () => window.removeEventListener('app:fab-nuevo', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const socioPorId = useMemo(() => new Map(socios.map((s) => [s.id, s])), [socios])

  const desde = `${anio}-${mes}-01`
  const ultimoDia = new Date(Number(anio), Number(mes), 0).getDate()
  const hasta = `${anio}-${mes}-${String(ultimoDia).padStart(2, '0')}`

  // Cotización del "Total en pesos": promedio del dólar billete del BCU para el mes seleccionado.
  // Automática y fija (no editable). Se cachea por mes en el dispositivo.
  const [cotMes, setCotMes] = useState<number | null>(null)
  const [cotMesDias, setCotMesDias] = useState<number>(0)
  useEffect(() => {
    const clave = `${anio}-${mes}`
    try {
      const c = localStorage.getItem('bcu:billete-mes:' + clave)
      if (c) { const o = JSON.parse(c); setCotMes(Number(o.cotizacion) || null); setCotMesDias(Number(o.dias) || 0) }
      else { setCotMes(null); setCotMesDias(0) }
    } catch { setCotMes(null); setCotMesDias(0) }
    fetchCotizacionBilleteMes(clave).then((r) => {
      if (r && r.cotizacion > 0) {
        setCotMes(r.cotizacion); setCotMesDias(r.dias)
        try { localStorage.setItem('bcu:billete-mes:' + clave, JSON.stringify({ cotizacion: r.cotizacion, dias: r.dias })) } catch { /* nada */ }
      }
    })
  }, [anio, mes])
  const cotUsada = cotMes

  const filtrados = useMemo(() => {
    return gastos.filter((g) => {
      if (g.fecha < desde || g.fecha > hasta) return false
      if (filtroCategoria !== 'todas' && g.categoria !== filtroCategoria) return false
      if (veTodos && filtroSocio !== 'todos' && g.socio_id !== filtroSocio) return false
      return true
    })
  }, [gastos, desde, hasta, filtroCategoria, veTodos, filtroSocio])

  // KPIs (excluyendo adelantos del total operativo)
  const operativos = filtrados.filter((g) => !g.es_adelanto)
  const totalUYU = operativos.filter((g) => g.moneda === 'UYU').reduce((s, g) => s + Number(g.monto), 0)
  const totalUSD = operativos.filter((g) => g.moneda === 'USD').reduce((s, g) => s + Number(g.monto), 0)
  const reembPendUYU = filtrados.filter((g) => g.moneda === 'UYU' && g.reembolsable && !g.reembolsado).reduce((s, g) => s + Number(g.monto), 0)
  const reembPendUSD = filtrados.filter((g) => g.moneda === 'USD' && g.reembolsable && !g.reembolsado).reduce((s, g) => s + Number(g.monto), 0)

  // Cuentas por socio: si admin con filtroSocio='todos' ve una card por socio (para liquidar sueldos de todos).
  // Si filtroSocio esta puesto en uno o no ve todos, muestra solo esa card.
  const sociosCuenta: string[] = (() => {
    if (!veTodos) return [soyYo]
    if (filtroSocio !== 'todos') return [filtroSocio]
    // Todos los socios que tienen movimientos en cuenta este periodo
    const set = new Set<string>()
    for (const g of filtrados) {
      if (g.reembolsable || g.es_adelanto) set.add(g.socio_id)
    }
    return [...set]
  })()

  function cuentaDe(sid: string) {
    const gs = filtrados.filter((g) => g.socio_id === sid)
    const reembUYU = gs.filter((g) => g.moneda === 'UYU' && g.reembolsable && !g.reembolsado).reduce((s, g) => s + Number(g.monto), 0)
    const reembUSD = gs.filter((g) => g.moneda === 'USD' && g.reembolsable && !g.reembolsado).reduce((s, g) => s + Number(g.monto), 0)
    const adelUYU  = gs.filter((g) => g.moneda === 'UYU' && g.es_adelanto).reduce((s, g) => s + Number(g.monto), 0)
    const adelUSD  = gs.filter((g) => g.moneda === 'USD' && g.es_adelanto).reduce((s, g) => s + Number(g.monto), 0)
    // Ya reembolsado este mes (reembolsables marcados como pagados)
    const pagUYU = gs.filter((g) => g.moneda === 'UYU' && g.reembolsable && g.reembolsado).reduce((s, g) => s + Number(g.monto), 0)
    const pagUSD = gs.filter((g) => g.moneda === 'USD' && g.reembolsable && g.reembolsado).reduce((s, g) => s + Number(g.monto), 0)
    const pendIds = gs.filter((g) => g.reembolsable && !g.reembolsado).map((g) => g.id)
    return {
      sid,
      nombre: socioPorId.get(sid)?.nombre ?? 'vos',
      reembUYU, reembUSD, adelUYU, adelUSD, pagUYU, pagUSD,
      netoUYU: reembUYU - adelUYU,
      netoUSD: reembUSD - adelUSD,
      pendIds,
      tieneAlgo: reembUYU + reembUSD + adelUYU + adelUSD + pagUYU + pagUSD > 0,
    }
  }
  const cuentasSocio = sociosCuenta.map(cuentaDe).filter((c) => c.tieneAlgo)

  // Estado local del "confirmar" por socio (Map: socio_id → booleano)
  const [confirmMarcarSocio, setConfirmMarcarSocio] = useState<string | null>(null)
  const [marcandoReembSocio, setMarcandoReembSocio] = useState<string | null>(null)

  async function marcarReembolsadosDe(sid: string, ids: number[]) {
    if (ids.length === 0) return
    setMarcandoReembSocio(sid)
    const { error } = await supabase.from('gastos').update({ reembolsado: true }).in('id', ids)
    setMarcandoReembSocio(null)
    setConfirmMarcarSocio(null)
    if (error) { alert('Error: ' + error.message); return }
    cargar()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-oliva-900">
            {veTodos ? 'Gastos (todos los socios)' : 'Mis gastos'}
          </h1>
          <p className="text-sm text-oliva-700 mt-1">
            Registro personal de gastos por período. {veTodos ? 'Ves los tuyos y los del resto.' : 'Solo vos ves tus gastos.'}
          </p>
        </div>
        <div className="flex gap-2">
          {esAdminGastos(perfil?.nombre) && (
            <button type="button" className="btn-secondary" onClick={() => setEditorCat(true)}>
              🏷️ Categorías
            </button>
          )}
          <button className="btn-primary" onClick={() => setNuevo(true)}>+ Nuevo gasto / adelanto</button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
        <div>
          <label className="label">Mes</label>
          <select className="input" value={mes} onChange={(e) => setMes(e.target.value)}>
            {['01','02','03','04','05','06','07','08','09','10','11','12'].map((m) => (
              <option key={m} value={m}>{new Date(2000, Number(m) - 1, 1).toLocaleString('es-UY', { month: 'long' })}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Año</label>
          <select className="input" value={anio} onChange={(e) => setAnio(e.target.value)}>
            {[hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Categoría</label>
          <CategoriaSelect value={filtroCategoria} onChange={setFiltroCategoria} categorias={categorias} incluirTodas />
        </div>
        {veTodos && (
          <div>
            <label className="label">Socio</label>
            <select className="input" value={filtroSocio} onChange={(e) => setFiltroSocio(e.target.value)}>
              <option value="todos">Todos</option>
              {socios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi titulo="Total UYU (operativo)" valor={money(totalUYU)} />
        <Kpi titulo="Total U$S (operativo)" valor={'U$S ' + Number(totalUSD).toLocaleString('es-UY')} />
        <Kpi titulo="A reembolsar UYU" valor={money(reembPendUYU)} tono="aceite" />
        <Kpi titulo="A reembolsar U$S" valor={'U$S ' + Number(reembPendUSD).toLocaleString('es-UY')} tono="aceite" />
      </div>

      {/* Cotización USD del "Total en pesos": promedio del dólar billete del mes (BCU), fija */}
      {cuentasSocio.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="text-[11px] uppercase tracking-wide text-oliva-600 font-semibold">Cotización USD · billete promedio del mes (BCU)</span>
          {cotMes ? (
            <>
              <span className="tabular-nums font-semibold text-oliva-900">$ {cotMes}</span>
              {cotMesDias > 0 && <span className="text-[11px] text-oliva-500">({cotMesDias} días promediados)</span>}
            </>
          ) : (
            <span className="text-[11px] text-amber-700">esperando cotización del BCU…</span>
          )}
        </div>
      )}

      {/* Sueldos del mes: liquidar el sueldo nominal (exacto) de cada socio configurado */}
      {socios.filter((s) => sueldoSocioIds.has(s.id) && (veTodos || s.id === soyYo)).length > 0 && (
        <div className="card p-4">
          <div className="text-xs uppercase tracking-widest text-oliva-700 font-bold mb-2">💵 Sueldos del mes</div>
          <div className="space-y-1.5">
            {socios.filter((s) => sueldoSocioIds.has(s.id) && (veTodos || s.id === soyYo)).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-1 border-b border-oliva-100/70 last:border-0">
                <span className="text-sm text-oliva-800">{s.nombre}</span>
                <button type="button" className="btn-secondary text-xs" onClick={() => setLiquidar({ id: s.id, nombre: s.nombre })}>
                  Liquidar sueldo
                </button>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-oliva-500 mt-2">Registra el sueldo nominal exacto (según el reparto por área de Admin) y te dice el neto a transferir (sueldo − adelantos + reembolsos). No modifica el sueldo con esos ajustes.</div>
        </div>
      )}

      {/* Cuenta por socio (reembolsables vs adelantos) — una card por socio con movimientos */}
      {cuentasSocio.map((c) => {
        const esYo = c.sid === soyYo
        const yoOSocio = esYo ? 'tuyo' : 'suyo'
        const yoOSocioPos = esYo ? 'tuyos' : 'suyos'
        const pendCant = c.pendIds.length
        const esConfirm = confirmMarcarSocio === c.sid
        const marcando = marcandoReembSocio === c.sid
        return (
        <div key={c.sid} className="card p-4 border-2 border-oliva-200 bg-oliva-50/40">
          <div className="text-xs uppercase tracking-widest text-oliva-700 font-bold mb-2">
            🧾 Cuenta con la empresa · {c.nombre}{esYo && ' (vos)'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-oliva-600">A favor {yoOSocio} (reembolsables)</div>
              <div className="tabular-nums font-semibold text-green-700 mt-0.5">
                {c.reembUYU > 0 && <div>+ {money(c.reembUYU)}</div>}
                {c.reembUSD > 0 && <div>+ U$S {Number(c.reembUSD).toLocaleString('es-UY')}</div>}
                {c.reembUYU === 0 && c.reembUSD === 0 && <div className="text-oliva-400">—</div>}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-oliva-600">Adelantos {yoOSocioPos}</div>
              <div className="tabular-nums font-semibold text-red-700 mt-0.5">
                {c.adelUYU > 0 && <div>− {money(c.adelUYU)}</div>}
                {c.adelUSD > 0 && <div>− U$S {Number(c.adelUSD).toLocaleString('es-UY')}</div>}
                {c.adelUYU === 0 && c.adelUSD === 0 && <div className="text-oliva-400">—</div>}
              </div>
            </div>
            <div className="sm:border-l border-oliva-200 sm:pl-4">
              <div className="text-[11px] uppercase tracking-wide text-oliva-600 font-bold">Ajuste a {esYo ? 'cobrar del' : 'sumar al'} sueldo</div>
              {(c.reembUYU > 0 || c.reembUSD > 0) ? (
                <div className="text-[10px] text-amber-700">incluye reembolsos pendientes</div>
              ) : (c.pagUYU > 0 || c.pagUSD > 0) ? (
                <div className="text-[10px] text-oliva-500">reembolsos ya pagados · solo adelantos</div>
              ) : null}
              <div className="tabular-nums font-bold text-oliva-900 text-lg mt-0.5">
                {c.netoUYU !== 0 && <div className={c.netoUYU >= 0 ? 'text-green-800' : 'text-red-800'}>{c.netoUYU >= 0 ? '+' : '−'} {money(Math.abs(c.netoUYU))}</div>}
                {c.netoUSD !== 0 && <div className={c.netoUSD >= 0 ? 'text-green-800' : 'text-red-800'}>{c.netoUSD >= 0 ? '+' : '−'} U$S {Number(Math.abs(c.netoUSD)).toLocaleString('es-UY')}</div>}
                {c.netoUYU === 0 && c.netoUSD === 0 && <div className="text-oliva-500 text-base">Cero (todo saldado)</div>}
              </div>
            </div>
            <div className="sm:border-l border-oliva-200 sm:pl-4">
              <div className="text-[11px] uppercase tracking-wide text-oliva-600 font-bold">Total en pesos (BCU)</div>
              <div className="tabular-nums font-bold text-lg mt-0.5">
                {(c.netoUSD === 0 || cotUsada) ? (() => {
                  const totalFinal = Math.round(c.netoUYU + (cotUsada ? c.netoUSD * cotUsada : 0))
                  if (totalFinal === 0) return <div className="text-oliva-500 text-base">Cero (todo saldado)</div>
                  return <div className={totalFinal >= 0 ? 'text-green-800' : 'text-red-800'}>{totalFinal >= 0 ? '+' : '−'} {money(Math.abs(totalFinal))}</div>
                })() : (
                  <div className="text-oliva-400 text-base">esperando cotización…</div>
                )}
              </div>
              {c.netoUSD !== 0 && cotUsada && (
                <div className="text-[10px] text-oliva-500 mt-0.5">
                  incluye U$S {Number(Math.abs(c.netoUSD)).toLocaleString('es-UY')} × {cotUsada}
                </div>
              )}
            </div>
          </div>

          {(c.pagUYU > 0 || c.pagUSD > 0) && (
            <div className="mt-3 pt-3 border-t border-oliva-200 flex items-baseline justify-between gap-2 flex-wrap">
              <span className="text-[11px] uppercase tracking-wide text-oliva-600 font-semibold">✓ Reembolsado este mes</span>
              <span className="tabular-nums font-semibold text-oliva-900">
                {(() => {
                  const totalPag = Math.round(c.pagUYU + (cotUsada ? c.pagUSD * cotUsada : 0))
                  const txt = money(totalPag)
                  const detalle = c.pagUSD > 0
                    ? ` (${money(c.pagUYU)}${c.pagUYU > 0 ? ' + ' : ''}U$S ${Number(c.pagUSD).toLocaleString('es-UY')}${cotUsada ? ` × ${cotUsada}` : ''})`
                    : ''
                  return <>{txt}<span className="text-[11px] font-normal text-oliva-500">{detalle}</span></>
                })()}
              </span>
            </div>
          )}

          {pendCant > 0 && (
            <div className="mt-3 pt-3 border-t border-oliva-200">
              {!esConfirm ? (
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => setConfirmMarcarSocio(c.sid)}
                >
                  ✅ Marcar todos los reembolsables{!esYo ? ` de ${c.nombre}` : ''} como pagados ({pendCant})
                </button>
              ) : (
                <div className="rounded-lg bg-aceite-500/10 border border-aceite-500/40 p-3 space-y-2">
                  <div className="text-sm text-oliva-900">
                    Se marcarán como <b>reembolsado</b> los <b>{pendCant}</b> gasto{pendCant === 1 ? '' : 's'} reembolsable{pendCant === 1 ? '' : 's'} pendiente{pendCant === 1 ? '' : 's'} de <b>{c.nombre}</b> en este período
                    {c.reembUYU > 0 && <> · <b>{money(c.reembUYU)}</b></>}
                    {c.reembUSD > 0 && <> · <b>U$S {Number(c.reembUSD).toLocaleString('es-UY')}</b></>}
                    . Se usa al liquidar el sueldo (sueldo + reembolsos - adelantos).
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" className="btn-secondary text-xs" onClick={() => setConfirmMarcarSocio(null)} disabled={marcando}>Cancelar</button>
                    <button type="button" className="text-xs px-3 py-2 rounded-lg bg-oliva-800 text-oliva-50 hover:bg-oliva-900 disabled:opacity-50" onClick={() => marcarReembolsadosDe(c.sid, c.pendIds)} disabled={marcando}>
                      {marcando ? 'Marcando…' : 'Sí, marcar todos'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        )
      })}

      {/* Lista */}
      {cargando ? (
        <div className="card p-6 text-sm text-oliva-700">Cargando…</div>
      ) : filtrados.length === 0 ? (
        <div className="card p-6 text-sm text-oliva-700">
          Sin gastos en este período. Cargá el primero con <b>+ Nuevo gasto / adelanto</b>.
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-oliva-600 border-b border-oliva-100 bg-oliva-50">
                <th className="py-2 px-4">Fecha</th>
                <th className="py-2 px-4">Categoría</th>
                {veTodos && <th className="py-2 px-4">Socio</th>}
                <th className="py-2 px-4">Descripción</th>
                <th className="py-2 px-4">Método</th>
                <th className="py-2 px-4">Tipo</th>
                <th className="py-2 px-4 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((g) => (
                <tr
                  key={g.id}
                  className={`border-b border-oliva-100/70 last:border-0 hover:bg-oliva-50/60 cursor-pointer ${g.socio_id !== soyYo ? 'bg-oliva-50/30' : ''}`}
                  onClick={() => setEditando(g)}
                >
                  <td className="py-2 px-4 tabular-nums text-oliva-700 whitespace-nowrap">{fFecha(g.fecha)}</td>
                  <td className="py-2 px-4 text-oliva-800">{catLabel(g.categoria)}</td>
                  {veTodos && <td className="py-2 px-4 text-oliva-700 text-xs">{socioPorId.get(g.socio_id)?.nombre ?? '—'}</td>}
                  <td className="py-2 px-4 text-oliva-700 text-xs truncate max-w-[280px]">{g.descripcion ?? '—'}</td>
                  <td className="py-2 px-4 text-oliva-700 text-xs">{g.metodo_pago?.replace('_', ' ') ?? '—'}</td>
                  <td className="py-2 px-4">
                    {g.es_adelanto ? (
                      <span className="text-[11px] uppercase tracking-wide rounded-full bg-red-100 text-red-800 px-2 py-[1px]">adelanto</span>
                    ) : g.reembolsable ? (
                      g.reembolsado
                        ? <span className="text-[11px] uppercase tracking-wide rounded-full bg-oliva-100 text-oliva-700 px-2 py-[1px]">reembolsado</span>
                        : <span className="text-[11px] uppercase tracking-wide rounded-full bg-aceite-500/20 text-aceite-600 ring-1 ring-aceite-500/30 px-2 py-[1px]">reembolsable</span>
                    ) : '—'}
                  </td>
                  <td className={`py-2 px-4 text-right tabular-nums font-medium whitespace-nowrap ${g.es_adelanto ? 'text-red-800' : 'text-oliva-900'}`}>
                    {formatMonto(g.monto, g.moneda)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <GastoDialog
        abierto={nuevo}
        socioId={soyYo}
        socios={socios}
        veTodos={veTodos}
        onCerrar={() => setNuevo(false)}
        onOk={() => { setNuevo(false); cargar() }}
      />
      <GastoDialog
        abierto={editando !== null}
        socioId={soyYo}
        socios={socios}
        editar={editando}
        veTodos={veTodos}
        onCerrar={() => setEditando(null)}
        onOk={() => { setEditando(null); cargar() }}
        onEliminar={async (g) => {
          const { error } = await supabase.from('gastos').delete().eq('id', g.id)
          if (error) throw new Error(error.message)
          setEditando(null); cargar()
        }}
      />
      <EditorCategoriasDialog
        abierto={editorCat}
        tabla="categorias_gasto"
        titulo="Categorías de egresos"
        onCerrar={() => setEditorCat(false)}
        onCambio={cargar}
      />
      <LiquidarSueldoDialog socio={liquidar} onCerrar={() => setLiquidar(null)} onOk={() => { setLiquidar(null); cargar() }} />
    </div>
  )
}

// Liquidar sueldo del mes: registra el sueldo NOMINAL exacto (repartido por area segun
// sueldos_socio) sin netear adelantos/reembolsos, marca los reembolsables como pagados,
// y muestra el neto a transferir (sueldo - adelantos + reembolsos), que es solo caja.
function LiquidarSueldoDialog({ socio, onCerrar, onOk }: {
  socio: { id: string; nombre: string } | null
  onCerrar: () => void
  onOk: () => void
}) {
  const { perfil } = useAuth()
  const hoy = new Date()
  const [mes, setMes] = useState(String(hoy.getMonth() + 1).padStart(2, '0'))
  const [anio, setAnio] = useState(String(hoy.getFullYear()))
  const [fecha, setFecha] = useState(hoy.toISOString().slice(0, 10))
  const [lineas, setLineas] = useState<{ categoria: string; monto: number }[]>([])
  const [catNombres, setCatNombres] = useState<Map<string, string>>(new Map())
  const [adel, setAdel] = useState(0)
  const [reembPend, setReembPend] = useState<{ ids: number[]; total: number }>({ ids: [], total: 0 })
  const [yaLiquidado, setYaLiquidado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const desde = `${anio}-${mes}-01`
  const ult = new Date(Number(anio), Number(mes), 0).getDate()
  const hasta = `${anio}-${mes}-${String(ult).padStart(2, '0')}`
  const mesNombre = new Date(Number(anio), Number(mes) - 1, 1).toLocaleString('es-UY', { month: 'long' })
  const marca = `[sueldo ${anio}-${mes}]`

  useEffect(() => {
    if (!socio) return
    setError(null)
    let cancel = false
    ;(async () => {
      const [cfg, gs, cats] = await Promise.all([
        supabase.from('sueldos_socio').select('categoria,monto').eq('socio_id', socio.id),
        supabase.from('gastos').select('id,monto,moneda,reembolsable,reembolsado,es_adelanto,descripcion').eq('socio_id', socio.id).gte('fecha', desde).lte('fecha', hasta),
        supabase.from('categorias_gasto').select('slug,nombre'),
      ])
      if (cancel) return
      setLineas(((cfg.data as { categoria: string; monto: number }[]) ?? []).map((x) => ({ categoria: x.categoria, monto: Number(x.monto) })))
      setCatNombres(new Map(((cats.data as { slug: string; nombre: string }[]) ?? []).map((c) => [c.slug, c.nombre])))
      const g = (gs.data as { id: number; monto: number; moneda: string; reembolsable: boolean; reembolsado: boolean; es_adelanto: boolean; descripcion: string | null }[]) ?? []
      setAdel(g.filter((x) => x.es_adelanto && x.moneda !== 'USD').reduce((s, x) => s + Number(x.monto), 0))
      const pend = g.filter((x) => x.reembolsable && !x.reembolsado && x.moneda !== 'USD')
      setReembPend({ ids: pend.map((x) => x.id), total: pend.reduce((s, x) => s + Number(x.monto), 0) })
      setYaLiquidado(g.some((x) => (x.descripcion ?? '').includes(marca)))
    })()
    return () => { cancel = true }
  }, [socio, desde, hasta, marca])

  const nominal = lineas.reduce((s, l) => s + l.monto, 0)
  const neto = nominal - adel + reembPend.total

  async function liquidar() {
    if (!socio || !perfil) return
    if (lineas.length === 0) { setError('Este socio no tiene sueldo configurado (Admin → Sueldos).'); return }
    setGuardando(true); setError(null)
    const rows = lineas.map((l) => ({
      fecha, socio_id: socio.id, categoria: l.categoria, monto: l.monto, moneda: 'UYU',
      descripcion: `Sueldo ${socio.nombre} ${mesNombre} ${anio} ${marca}`,
      metodo_pago: 'transferencia', reembolsable: false, reembolsado: false, es_adelanto: false,
      actualizado_en: new Date().toISOString(),
    }))
    const { error: e1 } = await supabase.from('gastos').insert(rows)
    if (e1) { setGuardando(false); setError(e1.message); return }
    if (reembPend.ids.length > 0) {
      const { error: e2 } = await supabase.from('gastos').update({ reembolsado: true }).in('id', reembPend.ids)
      if (e2) { setGuardando(false); setError('Sueldo registrado, pero fallo marcar reembolsos: ' + e2.message); return }
    }
    setGuardando(false)
    onOk()
  }

  if (!socio) return null
  return (
    <Dialog abierto={socio !== null} onCerrar={onCerrar} titulo={`Liquidar sueldo · ${socio.nombre}`} ancho="sm">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Mes</label>
            <select className="input" value={mes} onChange={(e) => setMes(e.target.value)}>
              {['01','02','03','04','05','06','07','08','09','10','11','12'].map((m) => (
                <option key={m} value={m}>{new Date(2000, Number(m) - 1, 1).toLocaleString('es-UY', { month: 'long' })}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Año</label>
            <select className="input" value={anio} onChange={(e) => setAnio(e.target.value)}>
              {[hoy.getFullYear() - 1, hoy.getFullYear()].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Fecha pago</label>
            <input type="date" className="input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>

        <div className="rounded-lg border border-oliva-100 bg-oliva-50/60 p-3">
          <div className="text-[11px] uppercase tracking-wide text-oliva-600 mb-1">Sueldo (reparto por área)</div>
          {lineas.length === 0 ? (
            <div className="text-sm text-red-700">Sin sueldo configurado. Cargalo en Admin → Sueldos.</div>
          ) : (
            <div className="space-y-0.5 text-sm">
              {lineas.map((l) => (
                <div key={l.categoria} className="flex justify-between gap-3">
                  <span className="text-oliva-700">{catNombres.get(l.categoria) ?? l.categoria}</span>
                  <span className="tabular-nums">{money(l.monto)}</span>
                </div>
              ))}
              <div className="flex justify-between gap-3 pt-1 border-t border-oliva-200 font-semibold">
                <span>Sueldo nominal</span><span className="tabular-nums">{money(nominal)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-oliva-100 p-3 text-sm space-y-0.5">
          <div className="text-[11px] uppercase tracking-wide text-oliva-500 mb-1">Neto a transferir (solo caja)</div>
          <div className="flex justify-between gap-3"><span>Sueldo</span><span className="tabular-nums">{money(nominal)}</span></div>
          {adel > 0 && <div className="flex justify-between gap-3 text-red-700"><span>− Adelantos del mes</span><span className="tabular-nums">− {money(adel)}</span></div>}
          {reembPend.total > 0 && <div className="flex justify-between gap-3 text-green-700"><span>+ Reembolsos pendientes</span><span className="tabular-nums">+ {money(reembPend.total)}</span></div>}
          <div className="flex justify-between gap-3 pt-1 border-t border-oliva-100 font-bold text-oliva-900"><span>A transferir</span><span className="tabular-nums">{money(neto)}</span></div>
        </div>

        <p className="text-[11px] text-oliva-500">Se registra el sueldo <b>exacto</b> ({money(nominal)}) en sus categorías; los adelantos y reembolsos quedan como están (no modifican el sueldo). El neto es solo lo que transferís.</p>

        {yaLiquidado && <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">⚠ Ya hay un sueldo liquidado para {mesNombre} {anio}. Si confirmás, se registra de nuevo (duplicado).</div>}
        {error && <div className="text-sm text-red-700">{error}</div>}

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button className="btn-primary" onClick={liquidar} disabled={guardando || lineas.length === 0}>
            {guardando ? 'Registrando…' : `Registrar sueldo ${money(nominal)}`}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function Kpi({ titulo, valor, tono }: { titulo: string; valor: string; tono?: 'aceite' }) {
  return (
    <div className={`card p-4 ${tono === 'aceite' ? 'bg-aceite-500/5 border-aceite-500/30' : ''}`}>
      <div className="text-xs uppercase tracking-wide text-oliva-600">{titulo}</div>
      <div className="text-xl font-semibold text-oliva-900 tabular-nums mt-1">{valor}</div>
    </div>
  )
}

interface CuentaBancariaBase { id: number; nombre: string; moneda: 'UYU' | 'USD' }

function GastoDialog({
  abierto, socioId, socios, editar, veTodos, onCerrar, onOk, onEliminar,
}: {
  abierto: boolean
  socioId: string
  socios: Socio[]
  editar?: Gasto | null
  veTodos?: boolean
  onCerrar: () => void
  onOk: () => void
  onEliminar?: (g: Gasto) => Promise<void>
}) {
  // Admin (veTodos) puede cargar/editar gastos de otros socios. Default = uno mismo.
  const [socioSel, setSocioSel] = useState<string>(socioId)
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [categoria, setCategoria] = useState<string>('varios')
  const [monto, setMonto] = useState<string>('')
  const [moneda, setMoneda] = useState<'UYU' | 'USD'>('UYU')
  const [descripcion, setDescripcion] = useState('')
  const [metodoPago, setMetodoPago] = useState<string>('efectivo')
  const [tipo, setTipo] = useState<TipoGasto>('normal')
  const [reembolsado, setReembolsado] = useState(false)
  const [cuentaId, setCuentaId] = useState<string>('')
  const [correoId, setCorreoId] = useState<number | null>(null)
  const [cuentas, setCuentas] = useState<CuentaBancariaBase[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState(false)
  const [catsDialog, setCatsDialog] = useState<Categoria[]>([])
  const { perfil } = useAuth()
  // Cuenta corriente: si el socio del gasto tambien es un cliente distribuidor/mayorista
  // (hoy solo Gonzalo, socio + distribuidor), se puede descontar el gasto de su deuda.
  const [ccClientes, setCcClientes] = useState<{ id: number; nombre: string }[]>([])
  const [yaDescontado, setYaDescontado] = useState(false)
  const [descontando, setDescontando] = useState(false)
  const [confirmDesc, setConfirmDesc] = useState(false)

  // Cargar categorias
  useEffect(() => {
    if (!abierto || catsDialog.length > 0) return
    supabase.from('categorias_gasto').select('*').eq('activo', true).order('orden').order('nombre').then(({ data }) => {
      setCatsDialog((data as Categoria[]) ?? [])
    })
  }, [abierto, catsDialog.length])

  // Al cambiar tipo, ajustar categoría a la lista correspondiente
  // y limpiar campos que no aplican para adelanto
  useEffect(() => {
    const adelantoSlugs = ['aceite_efectivo', 'otras_ventas_efectivo', 'otros']
    if (tipo === 'adelanto') {
      if (!adelantoSlugs.includes(categoria)) setCategoria('aceite_efectivo')
      setMetodoPago('efectivo')
      setCuentaId('')
    } else {
      if (adelantoSlugs.slice(0, 2).includes(categoria)) setCategoria('varios')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo])

  // Cargar cuentas
  useEffect(() => {
    if (!abierto || cuentas.length > 0) return
    supabase.from('cuentas_bancarias').select('id,nombre,moneda').eq('activo', true).order('id').then(({ data }) => {
      setCuentas((data as CuentaBancariaBase[]) ?? [])
    })
  }, [abierto, cuentas.length])

  // Clientes de cuenta corriente (distribuidor/mayorista) para cruzar con el socio del gasto.
  useEffect(() => {
    setConfirmDesc(false)
    if (!abierto || !veTodos) return
    supabase.from('clientes').select('id,nombre').in('tipo', ['distribuidor', 'mayorista']).then(({ data }) => {
      setCcClientes((data as { id: number; nombre: string }[]) ?? [])
    })
  }, [abierto, veTodos])

  // Cliente de cuenta corriente que coincide con el socio del gasto (el que paga).
  const socioGastoId = editar ? editar.socio_id : socioSel
  const ctacteCliente = useMemo(() => {
    const n = (socios.find((s) => s.id === socioGastoId)?.nombre ?? '').trim().toLowerCase()
    if (!n) return null
    return ccClientes.find((c) => c.nombre.toLowerCase().includes(n)) ?? null
  }, [ccClientes, socios, socioGastoId])

  // Para un socio-distribuidor (Gonzalo) no aplica reembolsable/adelanto: el gasto es siempre
  // costo de la empresa que el cubrio. Forzamos tipo normal al crear.
  useEffect(() => {
    if (ctacteCliente && !editar) setTipo('normal')
  }, [ctacteCliente, editar])

  // Al editar: ver si este gasto ya fue descontado de su cuenta (para no duplicar).
  useEffect(() => {
    setYaDescontado(false)
    if (!abierto || !editar || !ctacteCliente) return
    let cancel = false
    supabase.from('pagos').select('id').eq('cliente_id', ctacteCliente.id).ilike('nota', `%[gasto #${editar.id}]%`).limit(1)
      .then(({ data }) => { if (!cancel) setYaDescontado(((data as { id: number }[]) ?? []).length > 0) })
    return () => { cancel = true }
  }, [abierto, editar, ctacteCliente])

  async function descontarEnCtaCte() {
    if (!editar || !ctacteCliente || !perfil) return
    setDescontando(true); setError(null)
    // 1) El gasto deja de ser reembolsable (no se le devuelve la plata: salda su deuda).
    const { error: e1 } = await supabase.from('gastos').update({
      reembolsable: false, reembolsado: false, actualizado_en: new Date().toISOString(),
    }).eq('id', editar.id)
    if (e1) { setDescontando(false); setError('No se pudo actualizar el gasto: ' + e1.message); return }
    // 2) Pago en especie a su cuenta corriente (baja el saldo, no mueve dinero).
    const { error: e2 } = await supabase.from('pagos').insert({
      cliente_id: ctacteCliente.id, fecha: editar.fecha, monto: Number(editar.monto), moneda: editar.moneda,
      medio_pago: 'especie', cuenta_id: null, socio_id: perfil.id,
      nota: `Gasto cubierto por el distribuidor · ${editar.descripcion ?? 'gasto'} [gasto #${editar.id}]`,
      actualizado_en: new Date().toISOString(),
    })
    if (e2) { setDescontando(false); setError('El gasto se actualizo, pero fallo el pago: ' + e2.message); return }
    setDescontando(false)
    onOk()
  }

  // Cuenta por default: vacía (efectivo / no aplica).
  // El usuario elige cuenta manualmente cuando corresponde.
  // (Al editar, se respeta el valor que tenía guardado — cargado en el useEffect de arriba.)

  useEffect(() => {
    if (!abierto) return
    if (editar) {
      setFecha(editar.fecha); setCategoria(editar.categoria)
      setMonto(String(editar.monto)); setMoneda(editar.moneda)
      setDescripcion(editar.descripcion ?? ''); setMetodoPago(editar.metodo_pago ?? 'efectivo')
      setTipo(editar.es_adelanto ? 'adelanto' : editar.reembolsable ? 'reembolsable' : 'normal')
      setReembolsado(editar.reembolsado)
      setCuentaId((editar as Gasto & { cuenta_id?: number | null }).cuenta_id ? String((editar as Gasto & { cuenta_id?: number | null }).cuenta_id) : '')
      setSocioSel(editar.socio_id)
    } else {
      const b = leerObj<{ fecha: string; categoria: string; monto: string; moneda: 'UYU' | 'USD'; descripcion: string; metodoPago: string; tipo?: TipoGasto; reembolsado: boolean; cuentaId?: string; correoId?: number }>('borrador:nuevo-gasto')
      if (b) {
        setFecha(b.fecha); setCategoria(b.categoria); setMonto(b.monto); setMoneda(b.moneda)
        setDescripcion(b.descripcion); setMetodoPago(b.metodoPago)
        setTipo(b.tipo ?? 'normal'); setReembolsado(b.reembolsado)
        if (b.cuentaId) setCuentaId(b.cuentaId)
        setCorreoId(b.correoId ?? null)
      } else {
        setFecha(new Date().toISOString().slice(0, 10))
        setCategoria('varios'); setMonto(''); setMoneda('UYU')
        setDescripcion(''); setMetodoPago('efectivo')
        setTipo('normal'); setReembolsado(false)
        setCorreoId(null)
      }
      setSocioSel(socioId)
    }
    setError(null); setConfirmEliminar(false)
  }, [abierto, editar, socioId])

  // Guardar borrador al escribir (solo en modo nuevo)
  useEffect(() => {
    if (!abierto || editar) return
    guardarObj('borrador:nuevo-gasto', { fecha, categoria, monto, moneda, descripcion, metodoPago, tipo, reembolsado })
  }, [abierto, editar, fecha, categoria, monto, moneda, descripcion, metodoPago, tipo, reembolsado])

  const propio = !editar || editar.socio_id === socioId
  const soloLectura = editar !== null && editar !== undefined && !propio && !veTodos

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true); setError(null)
    // Gasto de un socio-distribuidor (Gonzalo): siempre es costo de la empresa que el cubrio
    // y se descuenta de su cuenta corriente. NO es reembolsable ni adelanto.
    const descCC = !editar && ctacteCliente != null
    const payload = {
      fecha,
      // Admin puede cargar/reasignar a otro socio via el selector; si no, cae a soyYo (o al que ya tenia el gasto editado).
      socio_id: veTodos ? socioSel : (editar?.socio_id ?? socioId),
      categoria,
      monto: Number(monto) || 0,
      moneda,
      descripcion: descripcion.trim() || null,
      metodo_pago: metodoPago,
      reembolsable: descCC ? false : tipo === 'reembolsable',
      reembolsado: descCC ? false : (tipo === 'reembolsable' ? reembolsado : false),
      es_adelanto: tipo === 'adelanto',
      cuenta_id: cuentaId ? Number(cuentaId) : null,
      actualizado_en: new Date().toISOString(),
    }
    if (editar) {
      const { error } = await supabase.from('gastos').update(payload).eq('id', editar.id)
      setGuardando(false)
      if (error) { setError(error.message); return }
      onOk()
      return
    }
    // Nuevo gasto: insertar y, si corresponde, descontarlo de la cuenta corriente del distribuidor.
    const { data: nuevoG, error } = await supabase.from('gastos').insert(payload).select('id').single()
    if (error || !nuevoG) { setGuardando(false); setError(error?.message ?? 'No se pudo crear el gasto'); return }
    if (descCC && ctacteCliente && perfil) {
      const { error: ePago } = await supabase.from('pagos').insert({
        cliente_id: ctacteCliente.id, fecha, monto: Number(monto) || 0, moneda,
        medio_pago: 'especie', cuenta_id: null, socio_id: perfil.id,
        nota: `Gasto cubierto por el distribuidor · ${descripcion.trim() || 'gasto'} [gasto #${nuevoG.id}]`,
        actualizado_en: new Date().toISOString(),
      })
      if (ePago) { setGuardando(false); setError('El gasto se creo, pero fallo el descuento en cuenta corriente: ' + ePago.message); return }
    }
    setGuardando(false)
    borrarKey('borrador:nuevo-gasto')
    if (correoId) {
      await supabase.from('correos_sincronizados').update({ estado_manual: 'pagada' }).eq('id', correoId)
    }
    onOk()
  }

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo={editar ? `${tipo === 'adelanto' ? 'Adelanto' : 'Gasto'} del ${fFecha(editar.fecha)}` : (tipo === 'adelanto' ? 'Nuevo adelanto' : 'Nuevo gasto')} ancho="md">
      <form onSubmit={guardar} className="space-y-4">
        {/* Selector de socio — solo admins (veTodos) pueden cargar/editar en nombre de otro */}
        {veTodos && (
          <div className="rounded-xl border border-aceite-500/30 bg-aceite-500/5 p-3">
            <label className="label mb-1">Socio (a quien se le carga el gasto)</label>
            <select
              className="input"
              value={socioSel}
              onChange={(e) => setSocioSel(e.target.value)}
              disabled={soloLectura}
            >
              {socios.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}{s.id === socioId ? ' (vos)' : ''}</option>
              ))}
            </select>
            {socioSel !== socioId && (
              <p className="text-[11px] text-aceite-600 mt-1">⚠ Este gasto se carga a nombre de <b>{socios.find((s) => s.id === socioSel)?.nombre}</b>.</p>
            )}
          </div>
        )}

        {/* TIPO — primero. Oculto para socio-distribuidor (Gonzalo): su gasto siempre se descuenta de su cuenta corriente. */}
        {!ctacteCliente && (
        <div className="rounded-xl border border-oliva-100 bg-oliva-50/60 p-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-oliva-600 font-semibold mb-1">Tipo</div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name="tipoGasto" className="h-4 w-4 mt-0.5 accent-oliva-700" checked={tipo === 'normal'} onChange={() => setTipo('normal')} disabled={soloLectura} />
            <div>
              <div className="text-sm text-oliva-800 font-medium">Gasto normal</div>
              <div className="text-[11px] text-oliva-600">Gasto operativo pagado por la empresa.</div>
            </div>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name="tipoGasto" className="h-4 w-4 mt-0.5 accent-oliva-700" checked={tipo === 'reembolsable'} onChange={() => setTipo('reembolsable')} disabled={soloLectura} />
            <div>
              <div className="text-sm text-oliva-800 font-medium">Reembolsable</div>
              <div className="text-[11px] text-oliva-600">Lo puse de mi bolsillo, la empresa me lo tiene que devolver.</div>
            </div>
          </label>
          {tipo === 'reembolsable' && (
            <label className="flex items-center gap-2 cursor-pointer pl-6">
              <input type="checkbox" className="h-4 w-4 accent-oliva-700" checked={reembolsado} onChange={(e) => setReembolsado(e.target.checked)} disabled={soloLectura} />
              <span className="text-sm text-oliva-800">Ya me lo reembolsaron</span>
            </label>
          )}
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name="tipoGasto" className="h-4 w-4 mt-0.5 accent-oliva-700" checked={tipo === 'adelanto'} onChange={() => setTipo('adelanto')} disabled={soloLectura} />
            <div>
              <div className="text-sm text-oliva-800 font-medium">Adelanto a cuenta de sueldo</div>
              <div className="text-[11px] text-oliva-600">Me llevé plata de la caja/cobros. Se descuenta de mi sueldo, no cuenta como gasto operativo.</div>
            </div>
          </label>
        </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Fecha</label>
            <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required disabled={soloLectura} />
          </div>
          <div>
            <label className="label">{tipo === 'adelanto' ? 'Origen del efectivo' : 'Categoría'}</label>
            {tipo === 'adelanto' ? (
              <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={soloLectura}>
                <option value="aceite_efectivo">Aceite efectivo</option>
                <option value="otras_ventas_efectivo">Otras ventas en efectivo</option>
                <option value="otros">Otros</option>
              </select>
            ) : (
              <CategoriaSelect value={categoria} onChange={setCategoria} categorias={catsDialog} disabled={soloLectura} />
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="label">Monto</label>
            <input className="input tabular-nums" type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} required disabled={soloLectura} />
          </div>
          <div>
            <label className="label">Moneda</label>
            <select className="input" value={moneda} onChange={(e) => setMoneda(e.target.value as 'UYU' | 'USD')} disabled={soloLectura}>
              <option value="UYU">UYU</option>
              <option value="USD">U$S</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">{tipo === 'adelanto' ? 'Notas (opcional)' : 'Descripción (opcional)'}</label>
          <input className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder={tipo === 'adelanto' ? 'ej: para comprar comida familia' : 'ej: gasoil Ancap Aiguá'} disabled={soloLectura} />
        </div>
        {/* Método y cuenta: solo cuando NO es adelanto (adelanto es siempre efectivo caja) */}
        {tipo !== 'adelanto' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Método de pago</label>
              <select className="input" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} disabled={soloLectura}>
                {METODOS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Cuenta origen</label>
              <select className="input" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} disabled={soloLectura}>
                <option value="">— efectivo / no aplica —</option>
                {cuentas.filter((c) => c.moneda === moneda).map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.nombre}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Descontar de cuenta corriente al crear: el socio es tambien cliente distribuidor (Gonzalo) */}
        {!editar && ctacteCliente && !soloLectura && (
          <div className="rounded-xl border border-oliva-200 bg-oliva-50 p-3">
            <div className="text-sm text-oliva-800 font-medium">📂 Gasto cubierto por {ctacteCliente.nombre}</div>
            <div className="text-[11px] text-oliva-600">Al guardar se le descuenta de su cuenta corriente (pago en especie). Cuenta como costo de la empresa; no es reembolsable ni adelanto.</div>
          </div>
        )}

        {/* Descontar de cuenta corriente al editar: boton directo */}
        {editar && ctacteCliente && !editar.es_adelanto && !soloLectura && (
          <div className="rounded-xl border border-oliva-200 bg-oliva-50 p-3 space-y-2">
            {yaDescontado ? (
              <p className="text-xs text-oliva-700">
                ✓ Este gasto ya fue descontado de la cuenta corriente de <b>{ctacteCliente.nombre}</b>.
              </p>
            ) : confirmDesc ? (
              <div className="space-y-2">
                <p className="text-xs text-oliva-700">
                  Lo cubrió <b>{ctacteCliente.nombre}</b> como forma de pago: el gasto deja de ser reembolsable y se le descuentan <b>{formatMonto(editar.monto, editar.moneda)}</b> de su cuenta corriente (pago en especie). El gasto se mantiene como costo de la empresa.
                </p>
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-secondary text-xs" onClick={() => setConfirmDesc(false)} disabled={descontando}>Cancelar</button>
                  <button type="button" className="text-xs px-3 py-2 rounded-lg bg-oliva-800 text-oliva-50 hover:bg-oliva-900 disabled:opacity-50" onClick={descontarEnCtaCte} disabled={descontando}>
                    {descontando ? 'Descontando…' : 'Sí, descontar'}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="text-xs text-oliva-800 underline hover:text-oliva-900" onClick={() => setConfirmDesc(true)}>
                📂 Lo cubrió {ctacteCliente.nombre} → descontar de su cuenta corriente
              </button>
            )}
          </div>
        )}

        {error && <div className="text-sm text-red-700">{error}</div>}

        {editar && onEliminar && !soloLectura && (
          <div className="border-t border-oliva-100 pt-3">
            {confirmEliminar ? (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-2">
                <div className="text-sm text-red-800">¿Eliminar este gasto? No se puede deshacer.</div>
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-secondary text-xs" onClick={() => setConfirmEliminar(false)} disabled={guardando}>Cancelar</button>
                  <button type="button" className="text-xs px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700" onClick={async () => { setGuardando(true); try { await onEliminar(editar) } catch (e) { setError(e instanceof Error ? e.message : 'Error'); setGuardando(false) } }} disabled={guardando}>
                    {guardando ? 'Eliminando…' : 'Sí, eliminar'}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="text-xs text-red-700 hover:text-red-900 underline" onClick={() => setConfirmEliminar(true)}>Eliminar gasto</button>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onCerrar}>{soloLectura ? 'Cerrar' : 'Cancelar'}</button>
          {!soloLectura && (
            <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          )}
        </div>
      </form>
    </Dialog>
  )
}
