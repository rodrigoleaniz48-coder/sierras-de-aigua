import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Dialog } from '../components/Dialog'
import { money } from '../lib/format'
import { parsearExtractoBROU } from '../lib/parserBROU'

type Tab = 'resultados' | 'conciliacion'

interface Cuenta {
  id: number
  nombre: string
  banco: string
  moneda: 'UYU' | 'USD'
  numero_cuenta: string | null
  activo: boolean
  tipo: 'cta_cte' | 'caja_ahorro' | null
}
interface MovBancario {
  id: number
  cuenta_id: number
  fecha: string
  descripcion: string | null
  numero_doc: string | null
  asunto: string | null
  dependencia: string | null
  debito: number
  credito: number
  monto: number
  saldo: number | null
  conciliado_gasto_id: number | null
  conciliado_venta_id: number | null
  categoria_manual: string | null
  es_transferencia_interna: boolean
  nota: string | null
  hash_unico: string
}
interface Venta { id: number; fecha: string; total: number; con_factura: boolean; ubicacion_id: number; cliente_id: number | null }
interface Gasto { id: number; fecha: string; monto: number; moneda: 'UYU' | 'USD'; descripcion: string | null; categoria: string; socio_id: string }
interface Cliente { id: number; nombre: string }

export function Contabilidad() {
  const { perfil } = useAuth()
  const veTodos = !!perfil?.ve_todos_gastos
  const [tab, setTab] = useState<Tab>('resultados')

  if (!veTodos) {
    return (
      <div className="card p-6 text-sm text-oliva-700">
        Esta sección es solo para administración. Si necesitás acceso, hablá con Rodrigo.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-oliva-900">Contabilidad</h1>
        <p className="text-sm text-oliva-700 mt-1">
          Estado de resultados de la empresa y conciliación de las cuentas bancarias.
        </p>
      </div>

      <div className="flex gap-1 border-b border-oliva-100 overflow-x-auto">
        {(['resultados', 'conciliacion'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition ${
              tab === t ? 'border-oliva-700 text-oliva-900' : 'border-transparent text-oliva-600 hover:text-oliva-900'
            }`}
            onClick={() => setTab(t)}
          >
            {t === 'resultados' ? 'Estado de resultados' : 'Conciliación bancaria'}
          </button>
        ))}
      </div>

      {tab === 'resultados' && <EstadoResultados />}
      {tab === 'conciliacion' && <Conciliacion />}
    </div>
  )
}

// ============================================================
// Estado de resultados
// ============================================================
function EstadoResultados() {
  const hoy = new Date()
  const [mes, setMes] = useState<string>(String(hoy.getMonth() + 1).padStart(2, '0'))
  const [anio, setAnio] = useState<string>(String(hoy.getFullYear()))
  const [ventas, setVentas] = useState<Venta[]>([])
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [cargando, setCargando] = useState(true)

  const desde = `${anio}-${mes}-01`
  const ult = new Date(Number(anio), Number(mes), 0).getDate()
  const hasta = `${anio}-${mes}-${String(ult).padStart(2, '0')}`

  useEffect(() => {
    setCargando(true)
    Promise.all([
      supabase.from('ventas').select('id,fecha,total,con_factura,ubicacion_id,cliente_id').gte('fecha', desde).lte('fecha', hasta).neq('estado', 'cancelado'),
      supabase.from('gastos').select('id,fecha,monto,moneda,descripcion,categoria,socio_id').gte('fecha', desde).lte('fecha', hasta),
    ]).then(([v, g]) => {
      setVentas((v.data as Venta[]) ?? [])
      setGastos((g.data as Gasto[]) ?? [])
      setCargando(false)
    })
  }, [desde, hasta])

  const totalVentas = ventas.reduce((s, v) => s + Number(v.total), 0)
  const ventasConFactura = ventas.filter((v) => v.con_factura).reduce((s, v) => s + Number(v.total), 0)
  const gastosUYU = gastos.filter((g) => g.moneda === 'UYU').reduce((s, g) => s + Number(g.monto), 0)
  const gastosUSD = gastos.filter((g) => g.moneda === 'USD').reduce((s, g) => s + Number(g.monto), 0)
  const margenUYU = totalVentas - gastosUYU

  // Egresos por categoría (UYU)
  const porCat = new Map<string, number>()
  for (const g of gastos.filter((x) => x.moneda === 'UYU')) {
    porCat.set(g.categoria, (porCat.get(g.categoria) ?? 0) + Number(g.monto))
  }
  const catArr = [...porCat.entries()].sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-4">
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
      </div>

      {cargando ? (
        <div className="card p-6 text-sm text-oliva-700">Cargando…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card p-5 space-y-3">
            <div className="text-xs uppercase tracking-wide text-oliva-600">Ingresos (ventas)</div>
            <div className="text-3xl font-semibold text-oliva-900 tabular-nums">{money(totalVentas)}</div>
            <div className="text-xs text-oliva-600">
              {ventas.length} ventas · {money(ventasConFactura)} con factura ({totalVentas > 0 ? Math.round(ventasConFactura / totalVentas * 100) : 0}%)
            </div>
          </div>
          <div className="card p-5 space-y-3">
            <div className="text-xs uppercase tracking-wide text-oliva-600">Egresos (gastos)</div>
            <div className="text-3xl font-semibold text-oliva-900 tabular-nums">{money(gastosUYU)}</div>
            <div className="text-xs text-oliva-600">
              {gastos.length} gastos · {gastosUSD > 0 ? `+ U$S ${gastosUSD.toFixed(2)}` : ''}
            </div>
          </div>
          <div className={`card p-5 space-y-3 ${margenUYU >= 0 ? 'bg-oliva-50/60' : 'bg-red-50 border-red-200'}`}>
            <div className="text-xs uppercase tracking-wide text-oliva-600">Margen UYU</div>
            <div className={`text-3xl font-semibold tabular-nums ${margenUYU >= 0 ? 'text-oliva-900' : 'text-red-700'}`}>{money(margenUYU)}</div>
            <div className="text-xs text-oliva-600">Ingresos − Egresos (solo UYU)</div>
          </div>
        </div>
      )}

      <div className="card p-4">
        <div className="text-xs uppercase tracking-wide text-oliva-600 mb-3">Gastos por categoría (UYU)</div>
        {catArr.length === 0 ? (
          <div className="text-sm text-oliva-600 italic">Sin gastos en el período.</div>
        ) : (
          <div className="space-y-1.5">
            {catArr.map(([cat, total]) => {
              const pct = gastosUYU > 0 ? (total / gastosUYU) * 100 : 0
              return (
                <div key={cat}>
                  <div className="flex justify-between text-sm">
                    <span className="text-oliva-800 capitalize">{cat.replace(/_/g, ' ')}</span>
                    <span className="tabular-nums text-oliva-700">{money(total)} <span className="text-xs text-oliva-500">({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div className="h-2 bg-oliva-100 rounded overflow-hidden">
                    <div className="h-full bg-oliva-500" style={{ width: pct + '%' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Conciliación bancaria
// ============================================================
function Conciliacion() {
  const hoy = new Date()
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [cuentaId, setCuentaId] = useState<string>('')
  const [mes, setMes] = useState<string>(String(hoy.getMonth() + 1).padStart(2, '0'))
  const [anio, setAnio] = useState<string>(String(hoy.getFullYear()))
  const [movs, setMovs] = useState<MovBancario[]>([])
  const [ventas, setVentas] = useState<Venta[]>([])
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(true)
  const [cargarAbierto, setCargarAbierto] = useState(false)

  const desde = `${anio}-${mes}-01`
  const ult = new Date(Number(anio), Number(mes), 0).getDate()
  const hasta = `${anio}-${mes}-${String(ult).padStart(2, '0')}`

  useEffect(() => {
    supabase.from('cuentas_bancarias').select('*').eq('activo', true).order('id').then(({ data }) => {
      const arr = (data as Cuenta[]) ?? []
      setCuentas(arr)
      if (arr.length > 0 && !cuentaId) setCuentaId(String(arr[0].id))
    })
  }, [])

  async function cargar() {
    if (!cuentaId) return
    setCargando(true)
    const [mb, v, g, cl] = await Promise.all([
      supabase.from('movimientos_bancarios').select('*').eq('cuenta_id', Number(cuentaId)).gte('fecha', desde).lte('fecha', hasta).order('fecha'),
      supabase.from('ventas').select('id,fecha,total,con_factura,ubicacion_id,cliente_id').gte('fecha', desde).lte('fecha', hasta).neq('estado', 'cancelado'),
      supabase.from('gastos').select('id,fecha,monto,moneda,descripcion,categoria,socio_id').gte('fecha', desde).lte('fecha', hasta),
      supabase.from('clientes').select('id,nombre'),
    ])
    setMovs((mb.data as MovBancario[]) ?? [])
    setVentas((v.data as Venta[]) ?? [])
    setGastos((g.data as Gasto[]) ?? [])
    setClientes((cl.data as Cliente[]) ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [cuentaId, desde, hasta])

  const cuenta = cuentas.find((c) => c.id === Number(cuentaId))
  const clientePorId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes])

  // Match automático: para cada movimiento no conciliado, buscar gasto o venta con monto y fecha cercana
  async function autoConciliar() {
    let matched = 0
    for (const m of movs) {
      if (m.conciliado_gasto_id || m.conciliado_venta_id || m.es_transferencia_interna) continue
      const monto = Math.abs(Number(m.monto))
      const fechaM = new Date(m.fecha).getTime()
      if (m.debito > 0) {
        // Egreso bancario → buscar gasto
        const cand = gastos.find((g) => {
          if (g.moneda !== cuenta?.moneda) return false
          if (Math.abs(Number(g.monto) - monto) > 0.01) return false
          const diff = Math.abs(new Date(g.fecha).getTime() - fechaM) / 86400000
          return diff <= 5
        })
        if (cand) {
          await supabase.from('movimientos_bancarios').update({ conciliado_gasto_id: cand.id }).eq('id', m.id)
          matched++
        }
      } else if (m.credito > 0) {
        const cand = ventas.find((v) => Math.abs(Number(v.total) - monto) < 0.01 && Math.abs(new Date(v.fecha).getTime() - fechaM) / 86400000 <= 5)
        if (cand) {
          await supabase.from('movimientos_bancarios').update({ conciliado_venta_id: cand.id }).eq('id', m.id)
          matched++
        }
      }
    }
    if (matched > 0) cargar()
    alert(`${matched} movimientos conciliados automáticamente.`)
  }

  // Estadísticas
  const totalDebitos = movs.reduce((s, m) => s + Number(m.debito), 0)
  const totalCreditos = movs.reduce((s, m) => s + Number(m.credito), 0)
  const conciliados = movs.filter((m) => m.conciliado_gasto_id || m.conciliado_venta_id || m.es_transferencia_interna)
  const pendientes = movs.filter((m) => !m.conciliado_gasto_id && !m.conciliado_venta_id && !m.es_transferencia_interna)

  async function toggleTransferencia(m: MovBancario) {
    await supabase.from('movimientos_bancarios').update({
      es_transferencia_interna: !m.es_transferencia_interna,
      conciliado_gasto_id: null, conciliado_venta_id: null,
    }).eq('id', m.id)
    cargar()
  }

  async function desconciliar(m: MovBancario) {
    await supabase.from('movimientos_bancarios').update({
      conciliado_gasto_id: null, conciliado_venta_id: null, es_transferencia_interna: false,
    }).eq('id', m.id)
    cargar()
  }

  return (
    <div className="space-y-4">
      <div className="card p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
        <div className="sm:col-span-2">
          <label className="label">Cuenta</label>
          <select className="input" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}{c.tipo ? ` · ${c.tipo === 'cta_cte' ? 'cta cte' : 'caja ahorro'}` : ''}
              </option>
            ))}
          </select>
        </div>
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
      </div>

      <div className="flex flex-wrap gap-2 justify-between items-center">
        <div className="text-sm text-oliva-700">
          {movs.length} movimientos · <b>{conciliados.length}</b> conciliados · <b className="text-red-700">{pendientes.length}</b> pendientes
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={autoConciliar} disabled={movs.length === 0}>Conciliar automático</button>
          <button className="btn-primary" onClick={() => setCargarAbierto(true)}>+ Cargar movimientos del banco</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi titulo="Débitos (banco)" valor={money(totalDebitos)} tono="rojo" />
        <Kpi titulo="Créditos (banco)" valor={money(totalCreditos)} tono="verde" />
        <Kpi titulo="Saldo mes (banco)" valor={money(totalCreditos - totalDebitos)} />
        <Kpi titulo="Pendientes" valor={String(pendientes.length)} tono={pendientes.length > 0 ? 'aceite' : undefined} />
      </div>

      {cargando ? (
        <div className="card p-6 text-sm text-oliva-700">Cargando…</div>
      ) : movs.length === 0 ? (
        <div className="card p-6 text-sm text-oliva-700">
          Sin movimientos cargados para este mes. Usá <b>+ Cargar movimientos del banco</b> para importar el extracto.
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[880px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-oliva-600 border-b border-oliva-100 bg-oliva-50">
                <th className="py-2 px-3">Fecha</th>
                <th className="py-2 px-3">Descripción</th>
                <th className="py-2 px-3">Asunto</th>
                <th className="py-2 px-3 text-right">Débito</th>
                <th className="py-2 px-3 text-right">Crédito</th>
                <th className="py-2 px-3">Estado</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {movs.map((m) => {
                const conciliado = m.conciliado_gasto_id || m.conciliado_venta_id
                const g = m.conciliado_gasto_id ? gastos.find((x) => x.id === m.conciliado_gasto_id) : null
                const v = m.conciliado_venta_id ? ventas.find((x) => x.id === m.conciliado_venta_id) : null
                return (
                  <tr key={m.id} className={`border-b border-oliva-100/70 last:border-0 ${m.es_transferencia_interna ? 'bg-blue-50/40' : conciliado ? 'bg-oliva-50/40' : ''}`}>
                    <td className="py-2 px-3 tabular-nums text-oliva-700 whitespace-nowrap">{m.fecha}</td>
                    <td className="py-2 px-3 text-oliva-800 text-xs">{m.descripcion}</td>
                    <td className="py-2 px-3 text-oliva-700 text-xs truncate max-w-[220px]">{m.asunto ?? ''}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-red-700">{Number(m.debito) > 0 ? money(m.debito) : ''}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-green-700">{Number(m.credito) > 0 ? money(m.credito) : ''}</td>
                    <td className="py-2 px-3 text-xs">
                      {m.es_transferencia_interna ? (
                        <span className="text-blue-800 bg-blue-100 rounded-full px-2 py-[1px]">🔄 interna</span>
                      ) : g ? (
                        <span className="text-oliva-800">✅ Gasto: {g.descripcion ?? g.categoria}</span>
                      ) : v ? (
                        <span className="text-oliva-800">✅ Venta #{v.id} {v.cliente_id ? `· ${clientePorId.get(v.cliente_id)?.nombre ?? ''}` : ''}</span>
                      ) : (
                        <span className="text-red-700">🔴 sin conciliar</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      {conciliado || m.es_transferencia_interna ? (
                        <button className="text-xs text-oliva-700 underline" onClick={() => desconciliar(m)}>Desconciliar</button>
                      ) : (
                        <button className="text-xs text-blue-700 underline" onClick={() => toggleTransferencia(m)}>Marcar interna</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <CargarMovimientosDialog
        abierto={cargarAbierto}
        cuenta={cuenta ?? null}
        onCerrar={() => setCargarAbierto(false)}
        onOk={() => { setCargarAbierto(false); cargar() }}
      />
    </div>
  )
}

function Kpi({ titulo, valor, tono }: { titulo: string; valor: string; tono?: 'aceite' | 'rojo' | 'verde' }) {
  const cls = tono === 'aceite' ? 'bg-aceite-500/5 border-aceite-500/30' :
              tono === 'rojo' ? 'text-red-700' :
              tono === 'verde' ? 'text-green-800' : ''
  return (
    <div className={`card p-3 ${tono === 'aceite' ? 'bg-aceite-500/5 border-aceite-500/30' : ''}`}>
      <div className="text-[11px] uppercase tracking-wide text-oliva-600">{titulo}</div>
      <div className={`text-lg font-semibold tabular-nums mt-1 ${cls}`}>{valor}</div>
    </div>
  )
}

// ============================================================
// Carga de movimientos (parseo BROU)
// ============================================================
function CargarMovimientosDialog({
  abierto, cuenta, onCerrar, onOk,
}: {
  abierto: boolean
  cuenta: Cuenta | null
  onCerrar: () => void
  onOk: () => void
}) {
  const [texto, setTexto] = useState('')
  const [preview, setPreview] = useState<ReturnType<typeof parsearExtractoBROU> | null>(null)
  const [importando, setImportando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) { setTexto(''); setPreview(null); setError(null) }
  }, [abierto])

  function analizar() {
    setPreview(parsearExtractoBROU(texto))
    setError(null)
  }

  async function importar() {
    if (!cuenta || !preview) return
    setImportando(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const rows = preview.movimientos.map((m) => ({
      cuenta_id: cuenta.id,
      fecha: m.fecha,
      descripcion: m.descripcion || null,
      numero_doc: m.numero_doc,
      asunto: m.asunto,
      dependencia: m.dependencia,
      debito: m.debito,
      credito: m.credito,
      hash_unico: m.hash_unico,
      importado_por: user?.id ?? null,
    }))
    // Upsert por unique(cuenta_id, hash_unico)
    const { error } = await supabase.from('movimientos_bancarios')
      .upsert(rows, { onConflict: 'cuenta_id,hash_unico', ignoreDuplicates: true })
    setImportando(false)
    if (error) { setError(error.message); return }
    onOk()
  }

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo={`Cargar movimientos · ${cuenta?.nombre ?? ''}`} ancho="lg">
      <div className="space-y-4">
        <p className="text-xs text-oliva-600">
          Pegá el texto del extracto BROU (podés copiar desde el PDF o desde el Excel exportado). El parser detecta las líneas por fecha DD/MM/YYYY y extrae los montos automáticamente. Al importar no se duplican los que ya estén cargados.
        </p>
        <div>
          <label className="label">Texto del extracto</label>
          <textarea
            className="input font-mono text-xs min-h-[220px]"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Copiá y pegá acá el detalle de movimientos del extracto BROU"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={analizar} disabled={!texto.trim()}>Analizar</button>
        </div>

        {preview && (
          <div className="rounded-xl border border-oliva-100 p-3 bg-oliva-50/60 space-y-2">
            <div className="text-sm text-oliva-800">
              <b>{preview.movimientos.length}</b> movimientos detectados
              {preview.errores.length > 0 && ` · ${preview.errores.length} líneas con problemas`}
            </div>
            {preview.movimientos.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded border border-oliva-100 bg-white">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-oliva-600 border-b border-oliva-100 bg-oliva-50">
                      <th className="py-1 px-2">Fecha</th>
                      <th className="py-1 px-2">Descripción</th>
                      <th className="py-1 px-2 text-right">Débito</th>
                      <th className="py-1 px-2 text-right">Crédito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.movimientos.slice(0, 60).map((m, i) => (
                      <tr key={i} className="border-b border-oliva-100/70 last:border-0">
                        <td className="py-1 px-2 tabular-nums">{m.fecha}</td>
                        <td className="py-1 px-2">{m.descripcion} {m.asunto ? `· ${m.asunto}` : ''}</td>
                        <td className="py-1 px-2 text-right tabular-nums text-red-700">{m.debito > 0 ? money(m.debito) : ''}</td>
                        <td className="py-1 px-2 text-right tabular-nums text-green-700">{m.credito > 0 ? money(m.credito) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {preview.errores.length > 0 && (
              <details className="text-xs text-oliva-700">
                <summary>Ver líneas con problemas ({preview.errores.length})</summary>
                <ul className="list-disc pl-5 mt-1">
                  {preview.errores.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        {error && <div className="text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onCerrar}>Cerrar</button>
          <button className="btn-primary" onClick={importar} disabled={!preview || preview.movimientos.length === 0 || importando}>
            {importando ? 'Importando…' : `Importar ${preview?.movimientos.length ?? 0} movimientos`}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
