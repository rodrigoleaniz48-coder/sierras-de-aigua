import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { money, num } from '../lib/format'
import { ReporteSemanalCard } from '../components/ReporteSemanalCard'
import { AlertasStockBajo } from '../components/AlertasStockBajo'

interface Resumen {
  totalMes: number
  cantVentasMes: number
  totalMesAnterior: number
  litrosAceiteMes: number
  pendEntrega: number
  pendCobro: number
  pendCobroMonto: number
  enRiesgo: number
}

export function Dashboard() {
  const { perfil, puede } = useAuth()
  const nav = useNavigate()
  const puedeVender = puede(['admin', 'ventas'])
  const [r, setR] = useState<Resumen>({
    totalMes: 0, cantVentasMes: 0, totalMesAnterior: 0, litrosAceiteMes: 0,
    pendEntrega: 0, pendCobro: 0, pendCobroMonto: 0, enRiesgo: 0,
  })
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const hoy = new Date()
    const mesInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)
    const mesAntInicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).toISOString().slice(0, 10)
    const mesAntFin = new Date(hoy.getFullYear(), hoy.getMonth(), 0).toISOString().slice(0, 10)

    Promise.all([
      // Ventas del mes (con estado)
      supabase.from('ventas').select('id, total, entregado, cobrado').gte('fecha', mesInicio).neq('estado', 'cancelado'),
      // Total del mes anterior
      supabase.from('ventas').select('total').gte('fecha', mesAntInicio).lte('fecha', mesAntFin).neq('estado', 'cancelado'),
      // Items del mes con producto y presentación, para calcular litros de aceite
      supabase.from('items_venta').select('unidades, presentacion:presentaciones(volumen_ml, producto:productos(categoria)), venta:ventas!inner(fecha, estado)').gte('venta.fecha', mesInicio).neq('venta.estado', 'cancelado'),
      // Ventas con última compra vieja (para "en riesgo") — traemos fechas de última venta por cliente
      supabase.from('ventas').select('cliente_id, fecha').neq('estado', 'cancelado').order('fecha', { ascending: false }),
    ])
      .then(([vRes, vAntRes, iRes, ultVentasRes]) => {
        const ventasMes = vRes.data ?? []
        const totalMes = ventasMes.reduce((s, v) => s + Number(v.total ?? 0), 0)
        const pendEntrega = ventasMes.filter((v) => !v.entregado).length
        const pendCobroList = ventasMes.filter((v) => !v.cobrado)
        const pendCobro = pendCobroList.length
        const pendCobroMonto = pendCobroList.reduce((s, v) => s + Number(v.total ?? 0), 0)

        const totalMesAnterior = (vAntRes.data ?? []).reduce((s, v) => s + Number(v.total ?? 0), 0)

        let litros = 0
        for (const it of (iRes.data as any[]) ?? []) {
          const cat = it.presentacion?.producto?.categoria
          const vol = Number(it.presentacion?.volumen_ml ?? 0)
          if (cat === 'aceite' && vol > 0) litros += (Number(it.unidades) * vol) / 1000
        }

        // En riesgo: clientes cuya última compra fue hace entre 60 y 120 días
        const ultimaPorCli = new Map<number, string>()
        for (const v of (ultVentasRes.data as { cliente_id: number | null; fecha: string }[]) ?? []) {
          if (v.cliente_id == null) continue
          if (!ultimaPorCli.has(v.cliente_id)) ultimaPorCli.set(v.cliente_id, v.fecha)
        }
        let enRiesgo = 0
        for (const [, fecha] of ultimaPorCli) {
          const d = Math.floor((Date.now() - new Date(fecha + 'T00:00:00').getTime()) / 86400000)
          if (d >= 60 && d <= 120) enRiesgo++
        }

        setR({
          totalMes, cantVentasMes: ventasMes.length,
          totalMesAnterior, litrosAceiteMes: litros,
          pendEntrega, pendCobro, pendCobroMonto, enRiesgo,
        })
      })
      .finally(() => setCargando(false))
  }, [])

  const primerNombre = perfil?.nombre ? perfil.nombre.split(' ')[0] : ''
  const hoy = new Date().toLocaleDateString('es-UY', { day: 'numeric', month: 'long', year: 'numeric' })
  const ticketProm = r.cantVentasMes > 0 ? r.totalMes / r.cantVentasMes : 0
  const deltaMes = r.totalMesAnterior > 0 ? ((r.totalMes - r.totalMesAnterior) / r.totalMesAnterior) * 100 : null

  return (
    <div className="space-y-4 max-w-[1200px]">
      {/* Topbar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-oliva-500">Inicio</div>
          <h1 className="text-xl font-bold text-oliva-900 mt-1">
            Hola{primerNombre && `, ${primerNombre}`} <span className="text-oliva-400 font-normal">· {hoy}</span>
          </h1>
        </div>
        {puedeVender && (
          <button onClick={() => nav('/ventas', { state: { abrirNueva: true } })} className="btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nueva venta
          </button>
        )}
      </div>

      <AlertasStockBajo />

      {/* KPIs del mes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          titulo="Ventas del mes"
          valor={cargando ? '…' : money(r.totalMes)}
          sub={`${r.cantVentasMes} operaciones`}
          destacado
          delta={deltaMes}
        />
        <KpiCard titulo="Ticket promedio" valor={cargando ? '…' : money(ticketProm)} sub="por venta del mes" />
        <KpiCard titulo="Aceite vendido" valor={cargando ? '…' : `${num(r.litrosAceiteMes)} L`} sub="mes en curso" />
        <KpiCard titulo="Mes anterior" valor={cargando ? '…' : money(r.totalMesAnterior)} sub="para comparar" />
      </div>

      {/* Qué hacer ahora */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <AccionCard
          titulo="Pendientes de entrega"
          valor={cargando ? '…' : String(r.pendEntrega)}
          sub={r.pendEntrega > 0 ? 'clic para ver' : 'todo entregado ✓'}
          onClick={() => nav('/ventas')}
          tono={r.pendEntrega > 0 ? 'ambar' : 'ok'}
        />
        <AccionCard
          titulo="Pendientes de cobro"
          valor={cargando ? '…' : String(r.pendCobro)}
          sub={r.pendCobro > 0 ? money(r.pendCobroMonto) + ' pendiente' : 'todo cobrado ✓'}
          onClick={() => nav('/ventas')}
          tono={r.pendCobro > 0 ? 'rojo' : 'ok'}
        />
        <AccionCard
          titulo="Clientes en riesgo"
          valor={cargando ? '…' : String(r.enRiesgo)}
          sub={r.enRiesgo > 0 ? 'no compran hace 60–120 d' : 'sin alertas'}
          onClick={() => nav('/clientes')}
          tono={r.enRiesgo > 0 ? 'ambar' : 'ok'}
        />
      </div>

      <ReporteSemanalCard compact />
    </div>
  )
}

function KpiCard({ titulo, valor, sub, destacado, delta }: { titulo: string; valor: string; sub?: string; destacado?: boolean; delta?: number | null }) {
  return (
    <div className="panel">
      <div className="text-[10px] font-bold uppercase tracking-widest text-oliva-500">{titulo}</div>
      <div className={`text-2xl font-extrabold mt-1.5 tabular-nums tracking-tight ${destacado ? 'text-oliva-800' : 'text-oliva-900'}`}>
        {valor}
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        {sub && <div className="text-[11px] text-oliva-500">{sub}</div>}
        {delta !== null && delta !== undefined && !isNaN(delta) && (
          <div className={`text-[11px] font-semibold ${delta >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(0)}%
          </div>
        )}
      </div>
    </div>
  )
}

function AccionCard({ titulo, valor, sub, onClick, tono }: { titulo: string; valor: string; sub?: string; onClick: () => void; tono: 'ok' | 'ambar' | 'rojo' }) {
  const cls =
    tono === 'rojo' ? 'border-red-200 bg-red-50/60 hover:bg-red-50' :
    tono === 'ambar' ? 'border-amber-200 bg-amber-50/60 hover:bg-amber-50' :
    'border-oliva-100 bg-white hover:bg-oliva-50'
  const valCls =
    tono === 'rojo' ? 'text-red-800' :
    tono === 'ambar' ? 'text-amber-800' :
    'text-oliva-900'
  return (
    <button type="button" onClick={onClick} className={`rounded-lg border ${cls} p-3 text-left transition group`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-oliva-500">{titulo}</div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-oliva-400 group-hover:text-oliva-700"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
      </div>
      <div className={`text-2xl font-extrabold mt-1 tabular-nums ${valCls}`}>{valor}</div>
      {sub && <div className="text-[11px] text-oliva-600 mt-0.5">{sub}</div>}
    </button>
  )
}
