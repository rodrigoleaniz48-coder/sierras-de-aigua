import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Dialog } from '../components/Dialog'
import { EditorCategoriasDialog } from '../components/EditorCategoriasDialog'
import { money } from '../lib/format'

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
      supabase.from('perfiles').select('id,nombre').eq('activo', true).order('nombre'),
      supabase.from('categorias_gasto').select('*').eq('activo', true).order('orden').order('nombre'),
    ])
    setGastos((g.data as Gasto[]) ?? [])
    setSocios((s.data as Socio[]) ?? [])
    setCategorias((c.data as Categoria[]) ?? [])
    setCargando(false)
  }
  // Lookup slug -> nombre para mostrar label lindo
  const catLabel = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of categorias) m.set(c.slug, c.nombre)
    return (slug: string) => m.get(slug) ?? slug
  }, [categorias])
  useEffect(() => { cargar() }, [])

  const socioPorId = useMemo(() => new Map(socios.map((s) => [s.id, s])), [socios])

  const desde = `${anio}-${mes}-01`
  const ultimoDia = new Date(Number(anio), Number(mes), 0).getDate()
  const hasta = `${anio}-${mes}-${String(ultimoDia).padStart(2, '0')}`

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

  // Cuenta socio (por socio filtrado, o solo el propio si no ve todos)
  const socioFocoId = veTodos ? (filtroSocio !== 'todos' ? filtroSocio : soyYo) : soyYo
  const socioFocoNombre = socioPorId.get(socioFocoId)?.nombre ?? 'vos'
  const misGastos = filtrados.filter((g) => g.socio_id === socioFocoId)
  const reembYoUYU = misGastos.filter((g) => g.moneda === 'UYU' && g.reembolsable && !g.reembolsado).reduce((s, g) => s + Number(g.monto), 0)
  const reembYoUSD = misGastos.filter((g) => g.moneda === 'USD' && g.reembolsable && !g.reembolsado).reduce((s, g) => s + Number(g.monto), 0)
  const adelYoUYU  = misGastos.filter((g) => g.moneda === 'UYU' && g.es_adelanto).reduce((s, g) => s + Number(g.monto), 0)
  const adelYoUSD  = misGastos.filter((g) => g.moneda === 'USD' && g.es_adelanto).reduce((s, g) => s + Number(g.monto), 0)
  const netoUYU = reembYoUYU - adelYoUYU
  const netoUSD = reembYoUSD - adelYoUSD
  const hayCtaSocio = reembYoUYU + reembYoUSD + adelYoUYU + adelYoUSD > 0

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
          <button className="btn-primary" onClick={() => setNuevo(true)}>+ Nuevo gasto</button>
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
          <select className="input" value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
            <option value="todas">Todas</option>
            {categorias.map((c) => <option key={c.slug} value={c.slug}>{c.nombre}</option>)}
          </select>
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

      {/* Cuenta socio (reembolsables vs adelantos) */}
      {hayCtaSocio && (
        <div className="card p-4 border-2 border-oliva-200 bg-oliva-50/40">
          <div className="text-xs uppercase tracking-widest text-oliva-700 font-bold mb-2">
            🧾 Cuenta con la empresa · {socioFocoNombre}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-oliva-600">A favor tuyo (reembolsables)</div>
              <div className="tabular-nums font-semibold text-green-700 mt-0.5">
                {reembYoUYU > 0 && <div>+ {money(reembYoUYU)}</div>}
                {reembYoUSD > 0 && <div>+ U$S {Number(reembYoUSD).toLocaleString('es-UY')}</div>}
                {reembYoUYU === 0 && reembYoUSD === 0 && <div className="text-oliva-400">—</div>}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-oliva-600">Adelantos que te llevaste</div>
              <div className="tabular-nums font-semibold text-red-700 mt-0.5">
                {adelYoUYU > 0 && <div>− {money(adelYoUYU)}</div>}
                {adelYoUSD > 0 && <div>− U$S {Number(adelYoUSD).toLocaleString('es-UY')}</div>}
                {adelYoUYU === 0 && adelYoUSD === 0 && <div className="text-oliva-400">—</div>}
              </div>
            </div>
            <div className="sm:border-l border-oliva-200 sm:pl-4">
              <div className="text-[11px] uppercase tracking-wide text-oliva-600 font-bold">Ajuste a cobrar del sueldo</div>
              <div className="tabular-nums font-bold text-oliva-900 text-lg mt-0.5">
                {netoUYU !== 0 && <div className={netoUYU >= 0 ? 'text-green-800' : 'text-red-800'}>{netoUYU >= 0 ? '+' : '−'} {money(Math.abs(netoUYU))}</div>}
                {netoUSD !== 0 && <div className={netoUSD >= 0 ? 'text-green-800' : 'text-red-800'}>{netoUSD >= 0 ? '+' : '−'} U$S {Number(Math.abs(netoUSD)).toLocaleString('es-UY')}</div>}
                {netoUYU === 0 && netoUSD === 0 && <div className="text-oliva-500 text-base">Cero (todo saldado)</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      {cargando ? (
        <div className="card p-6 text-sm text-oliva-700">Cargando…</div>
      ) : filtrados.length === 0 ? (
        <div className="card p-6 text-sm text-oliva-700">
          Sin gastos en este período. Cargá el primero con <b>+ Nuevo gasto</b>.
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
                  <td className="py-2 px-4 tabular-nums text-oliva-700 whitespace-nowrap">{g.fecha}</td>
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
        onCerrar={() => setNuevo(false)}
        onOk={() => { setNuevo(false); cargar() }}
      />
      <GastoDialog
        abierto={editando !== null}
        socioId={soyYo}
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
    </div>
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
  abierto, socioId, editar, veTodos, onCerrar, onOk, onEliminar,
}: {
  abierto: boolean
  socioId: string
  editar?: Gasto | null
  veTodos?: boolean
  onCerrar: () => void
  onOk: () => void
  onEliminar?: (g: Gasto) => Promise<void>
}) {
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [categoria, setCategoria] = useState<string>('varios')
  const [monto, setMonto] = useState<string>('')
  const [moneda, setMoneda] = useState<'UYU' | 'USD'>('UYU')
  const [descripcion, setDescripcion] = useState('')
  const [metodoPago, setMetodoPago] = useState<string>('efectivo')
  const [tipo, setTipo] = useState<TipoGasto>('normal')
  const [reembolsado, setReembolsado] = useState(false)
  const [cuentaId, setCuentaId] = useState<string>('')
  const [cuentas, setCuentas] = useState<CuentaBancariaBase[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState(false)
  const [catsDialog, setCatsDialog] = useState<Categoria[]>([])

  // Cargar categorias
  useEffect(() => {
    if (!abierto || catsDialog.length > 0) return
    supabase.from('categorias_gasto').select('*').eq('activo', true).order('orden').order('nombre').then(({ data }) => {
      setCatsDialog((data as Categoria[]) ?? [])
    })
  }, [abierto, catsDialog.length])

  // Cargar cuentas
  useEffect(() => {
    if (!abierto || cuentas.length > 0) return
    supabase.from('cuentas_bancarias').select('id,nombre,moneda').eq('activo', true).order('id').then(({ data }) => {
      setCuentas((data as CuentaBancariaBase[]) ?? [])
    })
  }, [abierto, cuentas.length])

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
    } else {
      const b = leerObj<{ fecha: string; categoria: string; monto: string; moneda: 'UYU' | 'USD'; descripcion: string; metodoPago: string; tipo?: TipoGasto; reembolsado: boolean }>('borrador:nuevo-gasto')
      if (b) {
        setFecha(b.fecha); setCategoria(b.categoria); setMonto(b.monto); setMoneda(b.moneda)
        setDescripcion(b.descripcion); setMetodoPago(b.metodoPago)
        setTipo(b.tipo ?? 'normal'); setReembolsado(b.reembolsado)
      } else {
        setFecha(new Date().toISOString().slice(0, 10))
        setCategoria('varios'); setMonto(''); setMoneda('UYU')
        setDescripcion(''); setMetodoPago('efectivo')
        setTipo('normal'); setReembolsado(false)
      }
    }
    setError(null); setConfirmEliminar(false)
  }, [abierto, editar])

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
    const payload = {
      fecha,
      socio_id: editar?.socio_id ?? socioId,
      categoria,
      monto: Number(monto) || 0,
      moneda,
      descripcion: descripcion.trim() || null,
      metodo_pago: metodoPago,
      reembolsable: tipo === 'reembolsable',
      reembolsado: tipo === 'reembolsable' ? reembolsado : false,
      es_adelanto: tipo === 'adelanto',
      cuenta_id: cuentaId ? Number(cuentaId) : null,
      actualizado_en: new Date().toISOString(),
    }
    const q = editar
      ? supabase.from('gastos').update(payload).eq('id', editar.id)
      : supabase.from('gastos').insert(payload)
    const { error } = await q
    setGuardando(false)
    if (error) { setError(error.message); return }
    if (!editar) borrarKey('borrador:nuevo-gasto')
    onOk()
  }

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo={editar ? `Gasto del ${editar.fecha}` : 'Nuevo gasto'} ancho="md">
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Fecha</label>
            <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required disabled={soloLectura} />
          </div>
          <div>
            <label className="label">Categoría</label>
            <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={soloLectura}>
              {catsDialog.length === 0 && <option value={categoria}>{categoria || '—'}</option>}
              {catsDialog.map((c) => <option key={c.slug} value={c.slug}>{c.nombre}</option>)}
            </select>
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
          <label className="label">Descripción (opcional)</label>
          <input className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="ej: gasoil Ancap Aiguá" disabled={soloLectura} />
        </div>
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
