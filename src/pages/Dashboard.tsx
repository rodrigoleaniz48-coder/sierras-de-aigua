import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

interface Resumen {
  ventasMes: number
  ventasMesTotal: number
  clientes: number
  stockBajo: number
}

export function Dashboard() {
  const { perfil } = useAuth()
  const [r, setR] = useState<Resumen>({ ventasMes: 0, ventasMesTotal: 0, clientes: 0, stockBajo: 0 })
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const desde = new Date()
    desde.setDate(1)
    const desdeISO = desde.toISOString().slice(0, 10)

    Promise.all([
      supabase.from('ventas').select('id, total', { count: 'exact' }).gte('fecha', desdeISO),
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard titulo="Ventas del mes"       valor={cargando ? '…' : `$ ${r.ventasMesTotal.toLocaleString('es-UY')}`} sub={`${r.ventasMes} operaciones`} />
        <KpiCard titulo="Clientes registrados" valor={cargando ? '…' : String(r.clientes)} sub="en base de datos" />
        <KpiCard titulo="Stock bajo"           valor="—" sub="pendiente (fase Stock)" />
        <KpiCard titulo="Seguimientos hoy"     valor="—" sub="pendiente (fase CRM)" />
      </div>

      <div className="card p-5">
        <div className="text-sm text-oliva-700">
          Este es el esqueleto inicial. En las próximas fases sumamos:
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Módulo <b>Stock</b> con lotes, envasado y trazabilidad.</li>
            <li>Módulo <b>Ventas + CRM</b> con carga rápida desde celular.</li>
            <li>Módulo <b>Gastos</b> personales y contabilidad general (admins).</li>
            <li>Importación del histórico desde tus planillas.</li>
          </ul>
        </div>
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
