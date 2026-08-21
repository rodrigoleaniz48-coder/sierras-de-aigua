import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import type { Rol } from '../lib/types'
import { rangoSemanal, reporteVisto } from '../lib/reporte'

interface NavItem {
  to: string
  label: string
  roles: Rol[]
}

const NAV: NavItem[] = [
  { to: '/',            label: 'Inicio',       roles: ['admin', 'ventas', 'marketing'] },
  { to: '/ventas',      label: 'Ventas',       roles: ['admin', 'ventas'] },
  { to: '/clientes',    label: 'Clientes',     roles: ['admin', 'ventas', 'marketing'] },
  { to: '/stock',       label: 'Stock',        roles: ['admin', 'ventas', 'marketing'] },
  { to: '/gastos',      label: 'Mis gastos',   roles: ['admin', 'ventas', 'marketing'] },
  { to: '/contabilidad',label: 'Contabilidad', roles: ['admin'] },
  { to: '/admin',       label: 'Administración',roles: ['admin'] },
]

export function Layout() {
  const { perfil, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const items = NAV.filter((n) => !perfil || n.roles.includes(perfil.rol))

  // Badge de "reporte semanal nuevo" al lado del link Inicio
  const semanaISOPasada = useMemo(() => {
    const s = new Date(); s.setDate(s.getDate() - 7)
    return rangoSemanal(s).semanaISO
  }, [])
  const [reporteNuevo, setReporteNuevo] = useState(() => !reporteVisto(semanaISOPasada))
  useEffect(() => {
    // Recalcular al cambiar de ruta (por si el user marcó el reporte como visto)
    setReporteNuevo(!reporteVisto(semanaISOPasada))
  }, [loc.pathname, semanaISOPasada])

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Topbar mobile */}
      <header className="lg:hidden flex items-center justify-between border-b border-oliva-100 bg-white px-4 py-3">
        <button
          className="rounded-md p-2 text-oliva-800 hover:bg-oliva-100"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menú"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round"/>
          </svg>
        </button>
        <img src={import.meta.env.BASE_URL + 'logo.webp'} alt="Sierras de Aiguá" className="h-16 w-auto" />
        <button className="text-xs text-oliva-700 underline" onClick={signOut}>Salir</button>
      </header>

      {/* Sidebar */}
      <aside
        className={`${open ? 'block' : 'hidden'} lg:block w-full lg:w-64 shrink-0 border-r border-oliva-100 bg-white`}
      >
        <div className="hidden lg:flex items-center justify-center px-4 py-6 border-b border-oliva-100">
          <img src={import.meta.env.BASE_URL + 'logo.webp'} alt="Sierras de Aiguá" className="h-44 w-auto" />
        </div>
        <nav className="p-3 space-y-1">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                  isActive
                    ? 'bg-oliva-700 text-white'
                    : 'text-oliva-800 hover:bg-oliva-100'
                }`
              }
            >
              <span>{n.label}</span>
              {n.to === '/' && reporteNuevo && (
                <span className="text-[10px] uppercase tracking-wide rounded-full bg-aceite-500 text-white px-2 py-[1px] font-semibold">
                  📊 nuevo
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="hidden lg:block p-4 border-t border-oliva-100 mt-4">
          <div className="text-xs text-oliva-700">{perfil?.nombre}</div>
          <div className="text-[11px] text-oliva-500 uppercase tracking-wide">{perfil?.rol}</div>
          <button className="mt-2 text-xs text-oliva-800 underline" onClick={signOut}>Cerrar sesión</button>
        </div>
      </aside>

      {/* Contenido */}
      <main className="flex-1 p-4 lg:p-8 bg-oliva-50">
        <Outlet />
      </main>
    </div>
  )
}
