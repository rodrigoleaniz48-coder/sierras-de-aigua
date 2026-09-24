import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Dialog } from '../components/Dialog'
import { money } from '../lib/format'
import { parsearExtractoBROU } from '../lib/parserBROU'
import { ConectarGmailCard } from '../components/ConectarGmailCard'
import {
  intercambiarCodigoGmail,
  sincronizarGmail,
  obtenerCorreosSincronizados,
  obtenerCuentaCorreo,
  type CuentaCorreo,
} from '../lib/gmail'
import {
  procesarCorreos,
  estadoDisplay,
  categoriaLabel,
  type Obligacion,
  type EstadoManual,
} from '../lib/obligaciones'

type Tab = 'resultados' | 'conciliacion' | 'obligaciones'

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
  const [tab, setTabState] = useState<Tab>(() => {
    try {
      const s = sessionStorage.getItem('contabilidad_tab')
      if (s === 'resultados' || s === 'conciliacion' || s === 'obligaciones') return s
    } catch { /* ignore */ }
    return 'resultados'
  })
  function setTab(t: Tab) {
    setTabState(t)
    try { sessionStorage.setItem('contabilidad_tab', t) } catch { /* ignore */ }
  }
  const [gmailMsg, setGmailMsg] = useState<{ ok?: boolean; error?: string } | null>(null)

  // Callback OAuth de Gmail: leer code/state de sessionStorage (guardados en main.tsx
  // antes de que Supabase o React Router pudieran limpiar la URL)
  useEffect(() => {
    const code = sessionStorage.getItem('gmail_oauth_code')
    const state = sessionStorage.getItem('gmail_oauth_state')
    if (!code || !state) return

    sessionStorage.removeItem('gmail_oauth_code')
    sessionStorage.removeItem('gmail_oauth_state')

    setTab('obligaciones')
    setGmailMsg({ ok: undefined })
    intercambiarCodigoGmail(code, state).then((res) => {
      if (res.error) {
        setGmailMsg({ error: res.error })
      } else {
        setGmailMsg({ ok: true })
      }
    })
  }, [])

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
          Estado de resultados, conciliación bancaria y obligaciones fiscales.
        </p>
      </div>

      <div className="flex gap-1 border-b border-oliva-100 overflow-x-auto">
        {(['resultados', 'conciliacion', 'obligaciones'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition ${
              tab === t ? 'border-oliva-700 text-oliva-900' : 'border-transparent text-oliva-600 hover:text-oliva-900'
            }`}
            onClick={() => setTab(t)}
          >
            {t === 'resultados' ? 'Estado de resultados' : t === 'conciliacion' ? 'Conciliación bancaria' : 'Obligaciones'}
          </button>
        ))}
      </div>

      {tab === 'resultados' && <EstadoResultados />}
      {tab === 'conciliacion' && <Conciliacion />}
      {tab === 'obligaciones' && <Obligaciones gmailMsg={gmailMsg} />}
    </div>
  )
}

// ============================================================
// Obligaciones (facturas, impuestos, proveedores — solo con monto)
// ============================================================
function Obligaciones({ gmailMsg }: { gmailMsg: { ok?: boolean; error?: string } | null }) {
  const [cuenta, setCuenta] = useState<CuentaCorreo | null>(null)
  const [obligaciones, setObligaciones] = useState<Obligacion[]>([])
  const [sincronizando, setSincronizando] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [detalle, setDetalle] = useState<Obligacion | null>(null)
  const [filtroOrg, setFiltroOrg] = useState<string>('todos')
  const [filtroEstado, setFiltroEstado] = useState<string>('activas')
  const [filtroMoneda, setFiltroMoneda] = useState<string>('todas')

  const hoy = new Date().toISOString().slice(0, 10)

  async function cargarDatos() {
    setCargando(true)
    const [c, emails] = await Promise.all([
      obtenerCuentaCorreo(),
      obtenerCorreosSincronizados(200),
    ])
    setCuenta(c)
    setObligaciones(procesarCorreos(emails, hoy))
    setCargando(false)
  }

  useEffect(() => { cargarDatos() }, [])
  useEffect(() => { if (gmailMsg?.ok) cargarDatos() }, [gmailMsg?.ok])

  async function handleSync() {
    setSincronizando(true)
    setSyncMsg(null)
    setSyncError(null)
    const res = await sincronizarGmail()
    setSincronizando(false)
    if (res.error) { setSyncError(res.error); return }
    setSyncMsg(
      res.primera_sync
        ? `Primera sincronizacion: ${res.correos_nuevos} correos fiscales importados.`
        : `${res.correos_nuevos} correos nuevos sincronizados.`,
    )
    cargarDatos()
  }

  async function cambiarEstadoManual(ob: Obligacion, nuevoEstado: EstadoManual) {
    const { error } = await supabase
      .from('correos_sincronizados')
      .update({ estado_manual: nuevoEstado })
      .eq('id', ob.id)
    if (error) return
    setObligaciones(prev => prev.map(o =>
      o.id === ob.id ? { ...o, estado_manual: nuevoEstado } : o,
    ))
    if (detalle?.id === ob.id) setDetalle({ ...detalle, estado_manual: nuevoEstado })
  }

  const organismos = useMemo(() => {
    const set = new Set(obligaciones.map(o => o.organismo))
    return [...set].sort()
  }, [obligaciones])

  const filtradas = useMemo(() => {
    return obligaciones.filter(ob => {
      if (filtroOrg !== 'todos' && ob.organismo !== filtroOrg) return false
      if (filtroMoneda !== 'todas' && ob.moneda !== filtroMoneda) return false
      const estadoEfectivo = ob.estado_manual ?? ob.estado
      if (filtroEstado === 'activas') return estadoEfectivo !== 'descartada' && estadoEfectivo !== 'pagada'
      if (filtroEstado === 'pendiente') return estadoEfectivo === 'pendiente'
      if (filtroEstado === 'vencido') return ob.estado === 'vencido' && !ob.estado_manual
      if (filtroEstado === 'posible_pago') return ob.estado === 'posible_pago' && !ob.estado_manual
      if (filtroEstado === 'revisar') return estadoEfectivo === 'revisar'
      if (filtroEstado === 'pagada') return ob.estado_manual === 'pagada'
      if (filtroEstado === 'descartada') return ob.estado_manual === 'descartada'
      return true
    })
  }, [obligaciones, filtroOrg, filtroEstado, filtroMoneda])

  const activas = obligaciones.filter(o => o.estado_manual !== 'descartada' && o.estado_manual !== 'pagada')
  const vencidas = activas.filter(o => o.estado === 'vencido' && !o.estado_manual)
  const porVencer = activas.filter(o => {
    if (!o.fecha_vencimiento || o.estado === 'vencido' || o.estado_manual) return false
    const diff = (new Date(o.fecha_vencimiento).getTime() - new Date(hoy).getTime()) / 86400000
    return diff >= 0 && diff <= 7
  })
  const pendientesRevision = activas.filter(o => (o.estado_manual === 'revisar' || o.estado === 'revisar'))
  const totalPendiente = activas
    .filter(o => o.estado !== 'posible_pago' && !o.estado_manual)
    .reduce((s, o) => s + (o.importe ?? 0), 0)

  function formatFecha(f: string) {
    return new Date(f + 'T12:00:00').toLocaleDateString('es-UY')
  }

  return (
    <div className="space-y-4">
      {gmailMsg && gmailMsg.ok === undefined && (
        <div className="card p-4 text-sm text-oliva-600">Conectando cuenta de Gmail…</div>
      )}
      {gmailMsg?.ok && (
        <div className="card p-3 text-sm text-green-700 bg-green-50 border-green-200">
          Cuenta de Gmail conectada correctamente.
        </div>
      )}
      {gmailMsg?.error && (
        <div className="card p-3 text-sm text-red-700 bg-red-50 border-red-200">
          Error al conectar Gmail: {gmailMsg.error}
        </div>
      )}

      <ConectarGmailCard recargar={gmailMsg?.ok === true} />

      {cuenta && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-oliva-700">
              {cuenta.ultima_sync
                ? `Ultima sync: ${new Date(cuenta.ultima_sync).toLocaleString('es-UY')}`
                : 'Sin sincronizar todavia'}
              {obligaciones.length > 0 && ` · ${obligaciones.length} obligacion${obligaciones.length === 1 ? '' : 'es'}`}
            </div>
            <button className="btn-primary" onClick={handleSync} disabled={sincronizando}>
              {sincronizando ? 'Sincronizando…' : cuenta.ultima_sync ? 'Sincronizar nuevas' : 'Primera sincronizacion'}
            </button>
          </div>

          {syncMsg && <div className="card p-3 text-sm text-green-700 bg-green-50 border-green-200">{syncMsg}</div>}
          {syncError && <div className="card p-3 text-sm text-red-700 bg-red-50 border-red-200">{syncError}</div>}

          {obligaciones.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="card p-3">
                <div className="text-[11px] uppercase tracking-wide text-oliva-600">Activas</div>
                <div className="text-lg font-semibold tabular-nums mt-1 text-oliva-900">{activas.length}</div>
              </div>
              {vencidas.length > 0 && (
                <button onClick={() => setFiltroEstado('vencido')} className="card p-3 bg-red-50 border-red-200 text-left hover:bg-red-100 transition">
                  <div className="text-[11px] uppercase tracking-wide text-red-600">Vencidas</div>
                  <div className="text-lg font-semibold tabular-nums mt-1 text-red-700">{vencidas.length}</div>
                </button>
              )}
              {porVencer.length > 0 && (
                <button onClick={() => setFiltroEstado('pendiente')} className="card p-3 bg-amber-50 border-amber-200 text-left hover:bg-amber-100 transition">
                  <div className="text-[11px] uppercase tracking-wide text-amber-700">Vencen en 7 dias</div>
                  <div className="text-lg font-semibold tabular-nums mt-1 text-amber-800">{porVencer.length}</div>
                </button>
              )}
              {pendientesRevision.length > 0 && (
                <button onClick={() => setFiltroEstado('revisar')} className="card p-3 bg-purple-50 border-purple-200 text-left hover:bg-purple-100 transition">
                  <div className="text-[11px] uppercase tracking-wide text-purple-700">Revisar</div>
                  <div className="text-lg font-semibold tabular-nums mt-1 text-purple-800">{pendientesRevision.length}</div>
                </button>
              )}
              {totalPendiente > 0 && (
                <div className="card p-3">
                  <div className="text-[11px] uppercase tracking-wide text-oliva-600">Total pendiente</div>
                  <div className="text-lg font-semibold tabular-nums mt-1 text-oliva-900">${totalPendiente.toLocaleString('es-UY')}</div>
                </div>
              )}
            </div>
          )}

          {obligaciones.length > 0 && (
            <div className="card p-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Organismo</label>
                <select className="input" value={filtroOrg} onChange={e => setFiltroOrg(e.target.value)}>
                  <option value="todos">Todos</option>
                  {organismos.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Estado</label>
                <select className="input" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
                  <option value="activas">Activas (sin pagadas/descartadas)</option>
                  <option value="todos">Todos</option>
                  <option value="pendiente">Pendientes</option>
                  <option value="vencido">Vencidas</option>
                  <option value="posible_pago">Posible pago</option>
                  <option value="revisar">Revisar</option>
                  <option value="pagada">Pagadas</option>
                  <option value="descartada">Descartadas</option>
                </select>
              </div>
              <div>
                <label className="label">Moneda</label>
                <select className="input" value={filtroMoneda} onChange={e => setFiltroMoneda(e.target.value)}>
                  <option value="todas">Todas</option>
                  <option value="UYU">UYU</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
          )}

          {cargando ? (
            <div className="card p-4 text-sm text-oliva-600">Cargando obligaciones…</div>
          ) : obligaciones.length === 0 ? (
            <div className="card p-5 text-sm text-oliva-600 text-center">
              {cuenta.ultima_sync
                ? 'No se encontraron correos fiscales.'
                : 'Hace click en "Primera sincronizacion" para importar correos de los ultimos 30 dias.'}
            </div>
          ) : filtradas.length === 0 ? (
            <div className="card p-5 text-sm text-oliva-600 text-center">
              No hay obligaciones con los filtros seleccionados.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-oliva-600">{filtradas.length} obligacion{filtradas.length === 1 ? '' : 'es'}</div>
              {filtradas.map(ob => {
                const est = estadoDisplay(ob)
                const vencido = ob.estado === 'vencido' && !ob.estado_manual
                const proxVenc = !vencido && ob.fecha_vencimiento && (() => {
                  const diff = (new Date(ob.fecha_vencimiento!).getTime() - new Date(hoy).getTime()) / 86400000
                  return diff >= 0 && diff <= 7
                })()
                return (
                  <button
                    key={ob.id}
                    className={`card p-0 overflow-hidden w-full text-left hover:bg-oliva-50/60 transition ${
                      vencido ? 'border-red-200' : proxVenc ? 'border-amber-200' : ''
                    }`}
                    onClick={() => setDetalle(ob)}
                  >
                    <div className="px-4 py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-medium rounded-full px-2 py-[1px] ${est.bg} ${est.color}`}>
                            {est.label}
                          </span>
                          {ob.categoria && (
                            <span className="text-[10px] font-medium rounded-full px-2 py-[1px] bg-oliva-100 text-oliva-700">
                              {categoriaLabel(ob.categoria)}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-oliva-900 font-medium truncate mt-1">{ob.concepto}</div>
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          <span className="text-xs text-oliva-700">{ob.organismo}</span>
                          {ob.periodo && (
                            <>
                              <span className="text-xs text-oliva-400">·</span>
                              <span className="text-xs text-oliva-600">Per. {ob.periodo}</span>
                            </>
                          )}
                          <span className="text-xs text-oliva-400">·</span>
                          <span className="text-xs tabular-nums text-oliva-600">
                            {new Date(ob.fecha_correo).toLocaleDateString('es-UY')}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        {ob.importe != null ? (
                          <div className="text-sm font-semibold tabular-nums text-oliva-900">
                            {ob.moneda === 'USD' ? 'US$ ' : '$ '}{ob.importe.toLocaleString('es-UY')}
                          </div>
                        ) : (
                          <div className="text-[11px] text-oliva-400">sin monto</div>
                        )}
                        {ob.fecha_vencimiento && (
                          <div className={`text-[11px] tabular-nums mt-0.5 ${
                            vencido ? 'text-red-700 font-medium' : proxVenc ? 'text-amber-700 font-medium' : 'text-oliva-600'
                          }`}>
                            {vencido ? 'Vencida' : proxVenc ? 'Vence' : 'Venc.'} {formatFecha(ob.fecha_vencimiento)}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {detalle && (
            <DetalleObligacion ob={detalle} onCerrar={() => setDetalle(null)} onCambiarEstado={cambiarEstadoManual} />
          )}
        </>
      )}
    </div>
  )
}

function DetalleObligacion({ ob, onCerrar, onCambiarEstado }: {
  ob: Obligacion; onCerrar: () => void; onCambiarEstado: (ob: Obligacion, estado: EstadoManual) => void
}) {
  const est = estadoDisplay(ob)
  function formatFecha(f: string) { return new Date(f + 'T12:00:00').toLocaleDateString('es-UY') }

  return (
    <Dialog abierto={true} onCerrar={onCerrar} titulo="Detalle de obligacion" ancho="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-medium rounded-full px-3 py-1 ${est.bg} ${est.color}`}>{est.label}</span>
          {ob.categoria && <span className="text-xs font-medium rounded-full px-3 py-1 bg-oliva-100 text-oliva-700">{categoriaLabel(ob.categoria)}</span>}
          {ob.tipo_obligacion && <span className="text-xs rounded-full px-2 py-[2px] bg-oliva-50 text-oliva-600">{ob.tipo_obligacion.replace(/_/g, ' ')}</span>}
          <span className="text-xs text-oliva-500 ml-auto">Confianza: {Math.round(ob.confianza * 100)}%</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <CampoDetalle label="Organismo" valor={ob.organismo} />
          <CampoDetalle label="Concepto" valor={ob.concepto} />
          <CampoDetalle label="Periodo" valor={ob.periodo ?? '—'} />
          <CampoDetalle label="Importe" valor={ob.importe != null ? `${ob.moneda === 'USD' ? 'US$ ' : '$ '}${ob.importe.toLocaleString('es-UY')}` : '—'} destaca />
          <CampoDetalle label="Moneda" valor={ob.moneda ?? '—'} />
          <CampoDetalle
            label="Vencimiento"
            valor={ob.fecha_vencimiento ? formatFecha(ob.fecha_vencimiento) : '—'}
            color={ob.estado === 'vencido' && !ob.estado_manual ? 'text-red-700' : ob.fecha_vencimiento ? 'text-amber-700' : undefined}
          />
          <CampoDetalle label="N° documento" valor={ob.numero_documento ?? '—'} />
          <CampoDetalle label="Fecha deteccion" valor={new Date(ob.fecha_correo).toLocaleDateString('es-UY')} />
          <CampoDetalle label="Remitente" valor={ob.remitente} small />
        </div>

        {ob.snippet && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-oliva-500 mb-1">Resumen del correo</div>
            <div className="text-xs text-oliva-700 leading-relaxed bg-oliva-50 rounded-lg p-3">{ob.snippet}</div>
          </div>
        )}

        <a href={ob.enlace_gmail} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-700 underline hover:text-blue-900 block">
          Ver correo original en Gmail
        </a>

        <div className="border-t border-oliva-100 pt-3">
          <div className="text-[10px] uppercase tracking-wide text-oliva-500 mb-2">Cambiar estado manualmente</div>
          <div className="flex flex-wrap gap-2">
            <button
              className={`text-xs px-3 py-1.5 rounded-lg border transition ${ob.estado_manual === 'pagada' ? 'bg-green-100 border-green-300 text-green-800' : 'border-oliva-200 text-oliva-700 hover:bg-green-50'}`}
              onClick={() => onCambiarEstado(ob, ob.estado_manual === 'pagada' ? null : 'pagada')}
            >{ob.estado_manual === 'pagada' ? 'Marcada como pagada' : 'Marcar pagada'}</button>
            <button
              className={`text-xs px-3 py-1.5 rounded-lg border transition ${ob.estado_manual === 'descartada' ? 'bg-gray-100 border-gray-300 text-gray-700' : 'border-oliva-200 text-oliva-700 hover:bg-gray-50'}`}
              onClick={() => onCambiarEstado(ob, ob.estado_manual === 'descartada' ? null : 'descartada')}
            >{ob.estado_manual === 'descartada' ? 'Marcada como descartada' : 'Descartar'}</button>
            <button
              className={`text-xs px-3 py-1.5 rounded-lg border transition ${ob.estado_manual === 'revisar' ? 'bg-purple-100 border-purple-300 text-purple-800' : 'border-oliva-200 text-oliva-700 hover:bg-purple-50'}`}
              onClick={() => onCambiarEstado(ob, ob.estado_manual === 'revisar' ? null : 'revisar')}
            >{ob.estado_manual === 'revisar' ? 'Marcada para revisar' : 'Marcar revisar'}</button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button className="btn-secondary" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </Dialog>
  )
}

function CampoDetalle({ label, valor, destaca, color, small }: {
  label: string; valor: string; destaca?: boolean; color?: string; small?: boolean
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-oliva-500">{label}</div>
      <div className={`mt-0.5 ${destaca ? 'text-sm font-semibold tabular-nums' : small ? 'text-[11px]' : 'text-xs'} ${color ?? 'text-oliva-800'}`}>{valor}</div>
    </div>
  )
}

// ============================================================
// Estado de resultados
// ============================================================
interface VentaMon { id: number; fecha: string; total: number; con_factura: boolean; ubicacion_id: number; cliente_id: number | null; moneda?: 'UYU' | 'USD' | null; cotizacion?: number | null }
interface IngresoMan { id: number; fecha: string; monto: number; moneda: 'UYU' | 'USD'; categoria_id: number | null; socio_id: string | null }

function EstadoResultados() {
  const hoy = new Date()
  const [mes, setMes] = useState<string>(String(hoy.getMonth() + 1).padStart(2, '0'))
  const [anio, setAnio] = useState<string>(String(hoy.getFullYear()))
  const [ventas, setVentas] = useState<VentaMon[]>([])
  const [ingresos, setIngresos] = useState<IngresoMan[]>([])
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [cargando, setCargando] = useState(true)

  const desde = `${anio}-${mes}-01`
  const ult = new Date(Number(anio), Number(mes), 0).getDate()
  const hasta = `${anio}-${mes}-${String(ult).padStart(2, '0')}`

  useEffect(() => {
    setCargando(true)
    Promise.all([
      // Reportes mensuales: las ventas cuentan en el mes de COBRO real (no de la fecha de venta).
      // Ventas "a confirmar" (potenciales) NO se incluyen.
      supabase.from('ventas').select('id,fecha,total,con_factura,ubicacion_id,cliente_id,moneda,cotizacion').gte('fecha_cobro', desde).lte('fecha_cobro', hasta).neq('estado', 'cancelado').eq('promocion_comercial', false).eq('a_confirmar', false),
      supabase.from('gastos').select('id,fecha,monto,moneda,descripcion,categoria,socio_id').gte('fecha', desde).lte('fecha', hasta).eq('es_adelanto', false),
      supabase.from('ingresos').select('id,fecha,monto,moneda,categoria_id,socio_id').gte('fecha', desde).lte('fecha', hasta),
    ]).then(([v, g, i]) => {
      setVentas((v.data as VentaMon[]) ?? [])
      setGastos((g.data as Gasto[]) ?? [])
      setIngresos((i.data as IngresoMan[]) ?? [])
      setCargando(false)
    })
  }, [desde, hasta])

  // Los totales en BD (ventas.total) están en UYU. Si moneda=USD, el USD original = total/cotizacion.
  const ventaEsUSD = (v: VentaMon) => (v.moneda ?? 'UYU') === 'USD' && !!v.cotizacion && Number(v.cotizacion) > 0
  const ventaUSD = (v: VentaMon) => Number(v.total) / Number(v.cotizacion)

  // Ingresos (ventas + ingresos manuales) por moneda
  const ventasUYU = ventas.filter((v) => !ventaEsUSD(v)).reduce((s, v) => s + Number(v.total), 0)
  const ventasUSD = ventas.filter((v) => ventaEsUSD(v)).reduce((s, v) => s + ventaUSD(v), 0)
  const ingresosManUYU = ingresos.filter((i) => i.moneda === 'UYU').reduce((s, i) => s + Number(i.monto), 0)
  const ingresosManUSD = ingresos.filter((i) => i.moneda === 'USD').reduce((s, i) => s + Number(i.monto), 0)
  const totalIngresosUYU = ventasUYU + ingresosManUYU
  const totalIngresosUSD = ventasUSD + ingresosManUSD

  const ventasConFactura = ventas.reduce((s, v) => s + (v.con_factura ? Number(v.total) : 0), 0)

  // Egresos por moneda
  const gastosUYU = gastos.filter((g) => g.moneda === 'UYU').reduce((s, g) => s + Number(g.monto), 0)
  const gastosUSD = gastos.filter((g) => g.moneda === 'USD').reduce((s, g) => s + Number(g.monto), 0)
  const margenUYU = totalIngresosUYU - gastosUYU
  const margenUSD = totalIngresosUSD - gastosUSD

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
        <>
          {/* Resumen total del mes en pesos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card p-5 space-y-2">
              <div className="text-xs uppercase tracking-wide text-oliva-600">Ingresos del mes (pesos)</div>
              <div className="text-3xl font-semibold text-oliva-900 tabular-nums">{money(totalIngresosUYU, 'UYU')}</div>
              <div className="text-xs text-oliva-600 space-y-0.5">
                <div>Ventas: <b className="tabular-nums">{money(ventasUYU, 'UYU')}</b> ({ventas.filter((v) => !ventaEsUSD(v)).length} vta.)</div>
                <div>Otros ingresos: <b className="tabular-nums">{money(ingresosManUYU, 'UYU')}</b></div>
                <div className="text-oliva-500">{money(ventasConFactura, 'UYU')} con factura</div>
              </div>
            </div>
            <div className="card p-5 space-y-2">
              <div className="text-xs uppercase tracking-wide text-oliva-600">Egresos del mes (pesos)</div>
              <div className="text-3xl font-semibold text-oliva-900 tabular-nums">{money(gastosUYU, 'UYU')}</div>
              <div className="text-xs text-oliva-600">
                {gastos.filter((g) => g.moneda === 'UYU').length} gasto{gastos.filter((g) => g.moneda === 'UYU').length === 1 ? '' : 's'} — todos los usuarios
              </div>
            </div>
            <div className={`card p-5 space-y-2 ${margenUYU >= 0 ? 'bg-oliva-50/60' : 'bg-red-50 border-red-200'}`}>
              <div className="text-xs uppercase tracking-wide text-oliva-600">Margen del mes (pesos)</div>
              <div className={`text-3xl font-semibold tabular-nums ${margenUYU >= 0 ? 'text-oliva-900' : 'text-red-700'}`}>{money(margenUYU, 'UYU')}</div>
              <div className="text-xs text-oliva-600">Ingresos − Egresos</div>
            </div>
          </div>

          {/* Resumen total del mes en dólares (solo si hay movimiento) */}
          {(totalIngresosUSD > 0 || gastosUSD > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="card p-5 space-y-2">
                <div className="text-xs uppercase tracking-wide text-oliva-600">Ingresos del mes (dólares)</div>
                <div className="text-3xl font-semibold text-oliva-900 tabular-nums">{money(totalIngresosUSD, 'USD')}</div>
                <div className="text-xs text-oliva-600 space-y-0.5">
                  <div>Ventas: <b className="tabular-nums">{money(ventasUSD, 'USD')}</b> ({ventas.filter((v) => ventaEsUSD(v)).length} vta.)</div>
                  <div>Otros ingresos: <b className="tabular-nums">{money(ingresosManUSD, 'USD')}</b></div>
                </div>
              </div>
              <div className="card p-5 space-y-2">
                <div className="text-xs uppercase tracking-wide text-oliva-600">Egresos del mes (dólares)</div>
                <div className="text-3xl font-semibold text-oliva-900 tabular-nums">{money(gastosUSD, 'USD')}</div>
                <div className="text-xs text-oliva-600">
                  {gastos.filter((g) => g.moneda === 'USD').length} gasto{gastos.filter((g) => g.moneda === 'USD').length === 1 ? '' : 's'}
                </div>
              </div>
              <div className={`card p-5 space-y-2 ${margenUSD >= 0 ? 'bg-oliva-50/60' : 'bg-red-50 border-red-200'}`}>
                <div className="text-xs uppercase tracking-wide text-oliva-600">Margen del mes (dólares)</div>
                <div className={`text-3xl font-semibold tabular-nums ${margenUSD >= 0 ? 'text-oliva-900' : 'text-red-700'}`}>{money(margenUSD, 'USD')}</div>
                <div className="text-xs text-oliva-600">Ingresos − Egresos</div>
              </div>
            </div>
          )}
        </>
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
      supabase.from('ventas').select('id,fecha,total,con_factura,ubicacion_id,cliente_id').gte('fecha', desde).lte('fecha', hasta).neq('estado', 'cancelado').eq('promocion_comercial', false).eq('a_confirmar', false),
      supabase.from('gastos').select('id,fecha,monto,moneda,descripcion,categoria,socio_id').gte('fecha', desde).lte('fecha', hasta).eq('es_adelanto', false),
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
