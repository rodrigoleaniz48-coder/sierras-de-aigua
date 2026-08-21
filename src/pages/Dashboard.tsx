import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { money } from '../lib/format'
import { ReporteSemanalCard } from '../components/ReporteSemanalCard'

interface Resumen {
  ventasMes: number
  ventasMesTotal: number
  clientes: number
  stockBajo: number
}

export function Dashboard() {
  const { perfil, puede } = useAuth()
  const nav = useNavigate()
  const puedeVender = puede(['admin', 'ventas'])
  const [r, setR] = useState<Resumen>({ ventasMes: 0, ventasMesTotal: 0, clientes: 0, stockBajo: 0 })
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
          stockBajo: 0,
        })
      })
      .finally(() => setCargando(false))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-oliva-900">
          Hola{perfil?.nombre ? `, ${perfil.nombre.split(' ')[0]}` : ''}
        </h1>
        <p className="text-sm text-oliva-700">Resumen del mes en curso.</p>
      </div>

      {/* Botón grande de acción principal */}
      {puedeVender && (
        <button
          onClick={() => nav('/ventas', { state: { abrirNueva: true } })}
          className="w-full rounded-2xl bg-oliva-600 hover:bg-oliva-700 active:bg-oliva-800 transition text-white shadow-lg shadow-oliva-600/20 p-6 flex items-center justify-between gap-4"
        >
          <div className="text-left">
            <div className="text-lg sm:text-xl font-semibold leading-tight">Cargar nueva venta</div>
            <div className="text-sm text-oliva-100/90 mt-1">Empezar el flujo de venta desde acá</div>
          </div>
          <div className="shrink-0 h-14 w-14 rounded-full bg-white/15 flex items-center justify-center text-3xl leading-none">+</div>
        </button>
      )}

      <ReporteSemanalCard />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard titulo="Ventas del mes"       valor={cargando ? '…' : money(r.ventasMesTotal)} sub={`${r.ventasMes} operaciones`} />
        <KpiCard titulo="Clientes registrados" valor={cargando ? '…' : String(r.clientes)} sub="en base de datos" />
        <KpiCard titulo="Stock bajo"           valor="—" sub="pendiente" />
        <KpiCard titulo="Seguimientos hoy"     valor="—" sub="pendiente" />
      </div>
    </div>
  )
}

function KpiCard({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-oliva-600">{titulo}</div>
      <div className="text-2xl font-semibold text-oliva-900 mt-2">{valor}</div>
      {sub && <div className="text-xs text-oliva-500 mt-1">{sub}</div>}
    </div>
  )
}
