import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { money } from '../lib/format'
import { ReporteSemanalCard } from '../components/ReporteSemanalCard'
import { AlertasStockBajo } from '../components/AlertasStockBajo'

interface Resumen {
  ventasMes: number
  ventasMesTotal: number
  clientes: number
}

export function Dashboard() {
  const { perfil, puede } = useAuth()
  const nav = useNavigate()
  const puedeVender = puede(['admin', 'ventas'])
  const [r, setR] = useState<Resumen>({ ventasMes: 0, ventasMesTotal: 0, clientes: 0 })
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const desde = new Date()
    desde.setDate(1)
    const desdeISO = desde.toISOString().slice(0, 10)

    Promise.all([
      supabase.from('ventas').select('id, total', { count: 'exact' }).gte('fecha', desdeISO).neq('estado', 'cancelado'),
      supabase.from('clientes').select('id', { count: 'exact', head: true }),
    ])
      .then(([ventas, clientes]) => {
        const total = (ventas.data ?? []).reduce((s, v) => s + Number(v.total ?? 0), 0)
        setR({
          ventasMes: ventas.count ?? 0,
          ventasMesTotal: total,
          clientes: clientes.count ?? 0,
        })
      })
      .finally(() => setCargando(false))
  }, [])

  const primerNombre = perfil?.nombre ? perfil.nombre.split(' ')[0] : ''
  const hoy = new Date().toLocaleDateString('es-UY', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="space-y-5 max-w-[1200px]">
      {/* Topbar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-oliva-500">Inicio</div>
          <h1 className="text-xl font-bold text-oliva-900 mt-1">
            Hola{primerNombre && `, ${primerNombre}`} <span className="text-oliva-400 font-normal">· {hoy}</span>
          </h1>
        </div>
        {puedeVender && (
          <button
            onClick={() => nav('/ventas', { state: { abrirNueva: true } })}
            className="btn-primary"
          >
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
        <KpiCard titulo="Ventas del mes"   valor={cargando ? '…' : money(r.ventasMesTotal)} sub={`${r.ventasMes} operaciones`} destacado />
        <KpiCard titulo="Operaciones"      valor={cargando ? '…' : String(r.ventasMes)}     sub="mes en curso" />
        <KpiCard titulo="Clientes"         valor={cargando ? '…' : String(r.clientes)}       sub="en base de datos" />
        <KpiCard titulo="Seguimientos"     valor="—"                                          sub="pendiente" />
      </div>

      <ReporteSemanalCard />
    </div>
  )
}

function KpiCard({ titulo, valor, sub, destacado }: { titulo: string; valor: string; sub?: string; destacado?: boolean }) {
  return (
    <div className="panel">
      <div className="text-[10px] font-bold uppercase tracking-widest text-oliva-500">{titulo}</div>
      <div className={`text-2xl font-extrabold mt-1.5 tabular-nums tracking-tight ${destacado ? 'text-oliva-800' : 'text-oliva-900'}`}>
        {valor}
      </div>
      {sub && <div className="text-[11px] text-oliva-500 mt-1">{sub}</div>}
    </div>
  )
}
