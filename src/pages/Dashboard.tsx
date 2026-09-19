import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { money, num } from '../lib/format'
import { ReporteSemanalCard } from '../components/ReporteSemanalCard'
import { AlertasStockBajo } from '../components/AlertasStockBajo'
import { AlertasTareas } from '../components/AlertasTareas'

interface AvisoCadete { socio: string; cantidad: number; ubicacion: string }

interface Resumen {
  totalMes: number
  cantVentasMes: number
  totalMesAnterior: number
  litrosAceiteMes: number
  pendEntrega: number
  pendCobro: number
  pendCobroMonto: number
  pendTotal: number // union: ventas con algo pendiente (entrega u cobro)
}

export function Dashboard() {
  const { perfil, puede } = useAuth()
  const nav = useNavigate()
  const puedeVender = puede(['admin', 'ventas'])
  // Empleados de campo (Emiliano) no ven el Inicio: van directo a Tareas.
  if (perfil && perfil.rol === 'campo') return <Navigate to="/tareas" replace />

  const [r, setR] = useState<Resumen>({
    totalMes: 0, cantVentasMes: 0, totalMesAnterior: 0, litrosAceiteMes: 0,
    pendEntrega: 0, pendCobro: 0, pendCobroMonto: 0, pendTotal: 0,
  })
  const [cargando, setCargando] = useState(true)
  const [avisosCadete, setAvisosCadete] = useState<AvisoCadete[]>([])
  const soyYo = perfil?.id ?? ''
  const nombreLower0 = (perfil?.nombre ?? '').toLowerCase()
  const usaCadete = nombreLower0.includes('rodrigo') || nombreLower0.includes('santi')

  // Aviso: pedidos con cadete pendientes de OTROS socios (para unificar el envío)
  useEffect(() => {
    if (!usaCadete || !soyYo) { setAvisosCadete([]); return }
    let cancel = false
    ;(async () => {
      const [v, s, u] = await Promise.all([
        supabase.from('ventas').select('id,socio_id,ubicacion_id').eq('envio', true).eq('entregado', false).neq('estado', 'cancelado').eq('a_confirmar', false).neq('socio_id', soyYo),
        supabase.from('perfiles').select('id,nombre'),
        supabase.from('ubicaciones').select('id,nombre'),
      ])
      if (cancel) return
      const socios = new Map((s.data ?? []).map((x: { id: string; nombre: string }) => [x.id, x.nombre]))
      const ubics = new Map((u.data ?? []).map((x: { id: number; nombre: string }) => [x.id, x.nombre]))
      const map = new Map<string, AvisoCadete>()
      for (const vv of (v.data ?? []) as { socio_id: string; ubicacion_id: number }[]) {
        const key = `${vv.socio_id}:${vv.ubicacion_id}`
        const prev = map.get(key)
        if (prev) prev.cantidad++
        else map.set(key, { socio: socios.get(vv.socio_id) ?? '?', cantidad: 1, ubicacion: ubics.get(vv.ubicacion_id) ?? '?' })
      }
      setAvisosCadete([...map.values()].sort((a, b) => b.cantidad - a.cantidad))
    })()
    return () => { cancel = true }
  }, [soyYo, usaCadete])

  useEffect(() => {
    const hoy = new Date()
    const mesInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)
    const mesAntInicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).toISOString().slice(0, 10)
    const mesAntFin = new Date(hoy.getFullYear(), hoy.getMonth(), 0).toISOString().slice(0, 10)

    Promise.all([
      // Ventas del mes (para KPI de facturado) — excluye potenciales
      supabase.from('ventas').select('id, total, entregado, cobrado').gte('fecha', mesInicio).neq('estado', 'cancelado').eq('promocion_comercial', false).eq('a_confirmar', false),
      // Total del mes anterior
      supabase.from('ventas').select('total').gte('fecha', mesAntInicio).lte('fecha', mesAntFin).neq('estado', 'cancelado').eq('promocion_comercial', false).eq('a_confirmar', false),
      // Items del mes con producto y presentación, para calcular litros de aceite (envasado + granel)
      supabase.from('items_venta').select('unidades, presentacion:presentaciones(volumen_ml, producto:productos(nombre, categoria)), venta:ventas!inner(fecha, estado, a_confirmar)').gte('venta.fecha', mesInicio).neq('venta.estado', 'cancelado').eq('venta.a_confirmar', false),
      // Pendientes de entrega/cobro (todas las fechas, no filtrar por mes: siguen pendientes despues del cierre)
      supabase.from('ventas').select('id, total, entregado, cobrado, promocion_comercial').neq('estado', 'cancelado').eq('a_confirmar', false).or('entregado.eq.false,cobrado.eq.false'),
    ])
      .then(([vRes, vAntRes, iRes, pendRes]) => {
        const ventasMes = vRes.data ?? []
        const totalMes = ventasMes.reduce((s, v) => s + Number(v.total ?? 0), 0)
        // Pendientes: TODAS las ventas no-canceladas no-entregadas o no-cobradas (independiente del mes)
        // Las promos no tienen cobro; solo cuentan si falta entregar.
        const pendientes = pendRes.data ?? []
        const pendEntrega = pendientes.filter((v) => !v.entregado).length
        const pendCobroList = pendientes.filter((v) => !v.cobrado && !v.promocion_comercial)
        const pendCobro = pendCobroList.length
        const pendCobroMonto = pendCobroList.reduce((s, v) => s + Number(v.total ?? 0), 0)
        // Union: una venta puede estar pendiente por ambos motivos, pero se cuenta 1 sola vez
        const pendTotal = pendientes.length

        const totalMesAnterior = (vAntRes.data ?? []).reduce((s, v) => s + Number(v.total ?? 0), 0)

        let litros = 0
        for (const it of (iRes.data as any[]) ?? []) {
          const cat = it.presentacion?.producto?.categoria
          const nombreProd = String(it.presentacion?.producto?.nombre ?? '').toLowerCase()
          const vol = Number(it.presentacion?.volumen_ml ?? 0)
          // Envasado (categoría 'aceite') + granel (producto 'Aceite a granel' con volumen 1000)
          const esAceite = cat === 'aceite' || nombreProd.includes('aceite a granel')
          if (esAceite && vol > 0) litros += (Number(it.unidades) * vol) / 1000
        }

        setR({
          totalMes, cantVentasMes: ventasMes.length,
          totalMesAnterior, litrosAceiteMes: litros,
          pendEntrega, pendCobro, pendCobroMonto, pendTotal,
        })
      })
      .finally(() => setCargando(false))
  }, [])

  const primerNombre = perfil?.nombre ? perfil.nombre.split(' ')[0] : ''
  const hoy = new Date().toLocaleDateString('es-UY', { day: 'numeric', month: 'long', year: 'numeric' })
  const deltaMes = r.totalMesAnterior > 0 ? ((r.totalMes - r.totalMesAnterior) / r.totalMesAnterior) * 100 : null
  // Ayelén no ve la parte operativa (alertas de stock y pendientes) — solo reporte semanal + KPIs
  const nombreLower = (perfil?.nombre ?? '').toLowerCase()
  const soloReporte = nombreLower.includes('ayelen') || nombreLower.includes('ayelén')

  return (
    <div className="space-y-3 max-w-[1200px]">
      {/* Topbar compacto (una linea) */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-bold text-oliva-900 truncate">
          Hola{primerNombre && `, ${primerNombre}`} <span className="text-oliva-400 font-normal text-sm">· {hoy}</span>
        </h1>
        {puedeVender && (
          <button onClick={() => nav('/ventas', { state: { abrirNueva: true } })} className="btn-primary text-sm px-3 py-2 shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="inline-block mr-1">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nueva venta
          </button>
        )}
      </div>

      {/* Pendientes compacto (barra horizontal, no card) */}
      {!soloReporte && (
        <PendientesBar
          cargando={cargando}
          total={r.pendTotal}
          entrega={r.pendEntrega}
          cobro={r.pendCobro}
          cobroMonto={r.pendCobroMonto}
          onClick={() => nav('/ventas')}
        />
      )}

      {!soloReporte && <AlertasTareas />}

      {avisosCadete.length > 0 && (
        <div className="rounded-lg border-2 border-blue-300 bg-blue-50 p-3 flex items-start gap-3">
          <div className="text-xl">🛵</div>
          <div className="flex-1 text-sm text-blue-900">
            <div className="font-bold">Coordinar cadete con otro socio</div>
            <div className="mt-0.5 text-blue-800">
              {avisosCadete.map((a, i) => (
                <div key={i}>
                  <b>{a.socio}</b> tiene <b>{a.cantidad}</b> {a.cantidad === 1 ? 'pedido pendiente' : 'pedidos pendientes'} con envío en <b>{a.ubicacion}</b>.
                </div>
              ))}
              <div className="mt-1 text-[11px] text-blue-700">Considerá unificar el mensaje al cadete desde la lista.</div>
            </div>
          </div>
          <button className="btn-secondary text-xs shrink-0" onClick={() => nav('/ventas')}>
            Ir a Ventas →
          </button>
        </div>
      )}

      {/* Reporte semanal (sube desde el pie al lugar del ex-ticket promedio) */}
      <ReporteSemanalCard compact />

      {/* KPIs del mes — 3 columnas siempre (incluso en mobile) para que entren en una pantalla */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <KpiCard
          titulo="Ventas mes"
          valor={cargando ? '…' : money(r.totalMes)}
          sub={`${r.cantVentasMes} op.`}
          destacado
          delta={deltaMes}
        />
        <KpiCard titulo="Aceite" valor={cargando ? '…' : `${num(r.litrosAceiteMes)} L`} sub="mes" />
        <KpiCard titulo="Mes anterior" valor={cargando ? '…' : money(r.totalMesAnterior)} sub="para comparar" />
      </div>

      {/* Alertas de stock — al pie (no es lo mas urgente del dia a dia) */}
      {!soloReporte && <AlertasStockBajo />}

    </div>
  )
}

function PendientesBar({ cargando, total, entrega, cobro, cobroMonto, onClick }: {
  cargando: boolean; total: number; entrega: number; cobro: number; cobroMonto: number; onClick: () => void
}) {
  const tono = cobro > 0 ? 'rojo' : entrega > 0 ? 'ambar' : 'ok'
  const cls =
    tono === 'rojo'  ? 'border-red-200 bg-red-50/60 hover:bg-red-50 text-red-800' :
    tono === 'ambar' ? 'border-amber-200 bg-amber-50/60 hover:bg-amber-50 text-amber-900' :
                       'border-oliva-100 bg-white hover:bg-oliva-50 text-oliva-900'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-lg border px-3.5 py-3 transition text-left ${cls}`}
    >
      <span className="text-[11px] font-bold uppercase tracking-widest text-oliva-500 shrink-0">Pendientes</span>
      <span className="text-2xl font-extrabold tabular-nums leading-none">{cargando ? '…' : total}</span>
      <span className="text-xs text-oliva-700 truncate">
        {total === 0
          ? 'todo al día ✓'
          : <>{entrega} sin entregar · {cobro} sin cobrar{cobroMonto > 0 && ` (${money(cobroMonto)})`}</>
        }
      </span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-auto text-oliva-400 shrink-0"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
    </button>
  )
}

function KpiCard({ titulo, valor, sub, destacado, delta }: { titulo: string; valor: string; sub?: string; destacado?: boolean; delta?: number | null }) {
  return (
    <div className="rounded-lg border border-oliva-100 bg-white p-3 min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-widest text-oliva-500 truncate">{titulo}</div>
      <div className={`text-lg sm:text-xl font-extrabold mt-1 tabular-nums tracking-tight truncate ${destacado ? 'text-oliva-800' : 'text-oliva-900'}`}>
        {valor}
      </div>
      <div className="flex items-baseline gap-1 mt-0.5 min-w-0">
        {sub && <div className="text-[11px] text-oliva-500 truncate">{sub}</div>}
        {delta !== null && delta !== undefined && !isNaN(delta) && (
          <div className={`text-[11px] font-semibold ${delta >= 0 ? 'text-green-700' : 'text-red-700'} shrink-0`}>
            {delta >= 0 ? '↑' : '↓'}{Math.abs(delta).toFixed(0)}%
          </div>
        )}
      </div>
    </div>
  )
}

