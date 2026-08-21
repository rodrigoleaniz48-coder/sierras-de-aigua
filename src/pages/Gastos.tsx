import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Dialog } from '../components/Dialog'
import { money } from '../lib/format'

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
  comprobante_url: string | null
}

interface Socio { id: string; nombre: string }

const CATEGORIAS = [
  'combustible',
  'viaticos',
  'insumos_almazara',
  'insumos_campo',
  'sueldos',
  'jornales',
  'impuestos',
  'compras_generales',
  'otros',
] as const

const CAT_LABEL: Record<(typeof CATEGORIAS)[number], string> = {
  combustible: 'Combustible',
  viaticos: 'Viáticos',
  insumos_almazara: 'Insumos almazara',
  insumos_campo: 'Insumos campo',
  sueldos: 'Sueldos',
  jornales: 'Jornales',
  impuestos: 'Impuestos',
  compras_generales: 'Compras generales',
  otros: 'Otros',
}

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
  const [cargando, setCargando] = useState(true)
  const [nuevo, setNuevo] = useState(false)
  const [editando, setEditando] = useState<Gasto | null>(null)

  // Filtros
  const hoy = new Date()
  const [mes, setMes] = useState<string>(String(hoy.getMonth() + 1).padStart(2, '0'))
  const [anio, setAnio] = useState<string>(String(hoy.getFullYear()))
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas')
  const [filtroSocio, setFiltroSocio] = useState<string>('todos')

  async function cargar() {
    setCargando(true)
    const [g, s] = await Promise.all([
      supabase.from('gastos').select('*').order('fecha', { ascending: false }).order('id', { ascending: false }),
      supabase.from('perfiles').select('id,nombre').eq('activo', true).order('nombre'),
    ])
    setGastos((g.data as Gasto[]) ?? [])
    setSocios((s.data as Socio[]) ?? [])
    setCargando(false)
  }
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

  // KPIs
  const totalUYU = filtrados.filter((g) => g.moneda === 'UYU').reduce((s, g) => s + Number(g.monto), 0)
  const totalUSD = filtrados.filter((g) => g.moneda === 'USD').reduce((s, g) => s + Number(g.monto), 0)
  const reembPendUYU = filtrados.filter((g) => g.moneda === 'UYU' && g.reembolsable && !g.reembolsado).reduce((s, g) => s + Number(g.monto), 0)
  const reembPendUSD = filtrados.filter((g) => g.moneda === 'USD' && g.reembolsable && !g.reembolsado).reduce((s, g) => s + Number(g.monto), 0)

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
        <button className="btn-primary" onClick={() => setNuevo(true)}>+ Nuevo gasto</button>
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
            {CATEGORIAS.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
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
        <Kpi titulo="Total UYU" valor={money(totalUYU)} />
        <Kpi titulo="Total U$S" valor={'U$S ' + Number(totalUSD).toLocaleString('es-UY')} />
        <Kpi titulo="A reembolsar UYU" valor={money(reembPendUYU)} tono="aceite" />
        <Kpi titulo="A reembolsar U$S" valor={'U$S ' + Number(reembPendUSD).toLocaleString('es-UY')} tono="aceite" />
      </div>

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
                <th className="py-2 px-4">Reemb.</th>
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
                  <td className="py-2 px-4 text-oliva-800">{CAT_LABEL[g.categoria as keyof typeof CAT_LABEL] ?? g.categoria}</td>
                  {veTodos && <td className="py-2 px-4 text-oliva-700 text-xs">{socioPorId.get(g.socio_id)?.nombre ?? '—'}</td>}
                  <td className="py-2 px-4 text-oliva-700 text-xs truncate max-w-[280px]">{g.descripcion ?? '—'}</td>
                  <td className="py-2 px-4 text-oliva-700 text-xs">{g.metodo_pago?.replace('_', ' ') ?? '—'}</td>
                  <td className="py-2 px-4">
                    {g.reembolsable ? (
                      g.reembolsado
                        ? <span className="text-[11px] uppercase tracking-wide rounded-full bg-oliva-100 text-oliva-700 px-2 py-[1px]">reembolsado</span>
                        : <span className="text-[11px] uppercase tracking-wide rounded-full bg-aceite-500/20 text-aceite-600 ring-1 ring-aceite-500/30 px-2 py-[1px]">pendiente</span>
                    ) : '—'}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums font-medium text-oliva-900 whitespace-nowrap">
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
  const [categoria, setCategoria] = useState<string>('otros')
  const [monto, setMonto] = useState<string>('')
  const [moneda, setMoneda] = useState<'UYU' | 'USD'>('UYU')
  const [descripcion, setDescripcion] = useState('')
  const [metodoPago, setMetodoPago] = useState<string>('efectivo')
  const [reembolsable, setReembolsable] = useState(false)
  const [reembolsado, setReembolsado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState(false)

  useEffect(() => {
    if (!abierto) return
    if (editar) {
      setFecha(editar.fecha); setCategoria(editar.categoria)
      setMonto(String(editar.monto)); setMoneda(editar.moneda)
      setDescripcion(editar.descripcion ?? ''); setMetodoPago(editar.metodo_pago ?? 'efectivo')
      setReembolsable(editar.reembolsable); setReembolsado(editar.reembolsado)
    } else {
      setFecha(new Date().toISOString().slice(0, 10))
      setCategoria('otros'); setMonto(''); setMoneda('UYU')
      setDescripcion(''); setMetodoPago('efectivo')
      setReembolsable(false); setReembolsado(false)
    }
    setError(null); setConfirmEliminar(false)
  }, [abierto, editar])

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
      reembolsable,
      reembolsado: reembolsable ? reembolsado : false,
      actualizado_en: new Date().toISOString(),
    }
    const q = editar
      ? supabase.from('gastos').update(payload).eq('id', editar.id)
      : supabase.from('gastos').insert(payload)
    const { error } = await q
    setGuardando(false)
    if (error) setError(error.message); else onOk()
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
              {CATEGORIAS.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
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
        <div>
          <label className="label">Método de pago</label>
          <select className="input" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} disabled={soloLectura}>
            {METODOS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div className="rounded-xl border border-oliva-100 bg-oliva-50/60 p-3 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 accent-oliva-700" checked={reembolsable} onChange={(e) => setReembolsable(e.target.checked)} disabled={soloLectura} />
            <span className="text-sm text-oliva-800">Es reembolsable (lo puse de mi bolsillo y me lo tienen que devolver)</span>
          </label>
          {reembolsable && (
            <label className="flex items-center gap-2 cursor-pointer pl-6">
              <input type="checkbox" className="h-4 w-4 accent-oliva-700" checked={reembolsado} onChange={(e) => setReembolsado(e.target.checked)} disabled={soloLectura} />
              <span className="text-sm text-oliva-800">Ya me lo reembolsaron</span>
            </label>
          )}
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
