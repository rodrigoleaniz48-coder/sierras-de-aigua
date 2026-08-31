import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import type { Rol } from '../lib/types'
import { rangoSemanal, reporteVisto } from '../lib/reporte'
import { CambiarPasswordDialog } from './CambiarPasswordDialog'
import { Asistente } from './Asistente'

interface NavItem {
  to: string
  label: string
  roles: Rol[]
  icon: ReactNode
  group: 'op' | 'gestion'
}

const I = {
  home: <path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2z" />,
  ventas: <path d="M3 7h18M6 7v13h12V7M9 4h6v3H9z" />,
  clientes: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-7 8-7s8 3 8 7" /></>,
  stock: <path d="M4 7h16M4 12h16M4 17h16" />,
  gastos: <path d="M4 20V10M12 20V4M20 20v-6" />,
  contabilidad: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></>,
  admin: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" /></>,
  tareas: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
}

const NAV: NavItem[] = [
  { to: '/',            label: 'Inicio',        roles: ['admin', 'ventas', 'marketing'], icon: I.home,         group: 'op' },
  { to: '/ventas',      label: 'Ventas',        roles: ['admin', 'ventas'],              icon: I.ventas,       group: 'op' },
  { to: '/clientes',    label: 'Clientes',      roles: ['admin', 'ventas', 'marketing'], icon: I.clientes,     group: 'op' },
  { to: '/stock',       label: 'Stock',         roles: ['admin', 'ventas', 'marketing'], icon: I.stock,        group: 'op' },
  { to: '/gastos',      label: 'Mis gastos',    roles: ['admin', 'ventas', 'marketing'], icon: I.gastos,       group: 'op' },
  { to: '/tareas',      label: 'Tareas',        roles: ['admin', 'ventas', 'marketing', 'campo'], icon: I.tareas,  group: 'op' },
  { to: '/contabilidad',label: 'Contabilidad',  roles: ['admin'],                        icon: I.contabilidad, group: 'gestion' },
  { to: '/admin',       label: 'Administración',roles: ['admin'],                        icon: I.admin,        group: 'gestion' },
]

function Ico({ children }: { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {children}
    </svg>
  )
}

export function Layout() {
  const { perfil, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [cambiarPass, setCambiarPass] = useState(false)
  const [asistente, setAsistente] = useState(false)
  const loc = useLocation()

  const items = NAV.filter((n) => !perfil || n.roles.includes(perfil.rol))
  const itemsOp = items.filter((i) => i.group === 'op')
  const itemsGestion = items.filter((i) => i.group === 'gestion')

  const semanaISOPasada = useMemo(() => {
    const s = new Date(); s.setDate(s.getDate() - 7)
    return rangoSemanal(s).semanaISO
  }, [])
  const [reporteNuevo, setReporteNuevo] = useState(() => !reporteVisto(semanaISOPasada))
  useEffect(() => { setReporteNuevo(!reporteVisto(semanaISOPasada)) }, [loc.pathname, semanaISOPasada])

  const iniciales = (perfil?.nombre ?? '?').trim().charAt(0).toUpperCase()

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition ${
      isActive
        ? 'bg-oliva-100 text-oliva-900 font-semibold [&_svg]:text-oliva-800'
        : 'text-oliva-700 hover:bg-oliva-100/70 [&_svg]:text-oliva-500'
    }`

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
        <img src={import.meta.env.BASE_URL + 'logo.webp'} alt="Sierras de Aiguá" className="h-12 w-auto" />
        <div className="flex items-center gap-3">
          <button className="text-xs font-semibold text-oliva-700 underline" onClick={() => setCambiarPass(true)}>Clave</button>
          <button className="text-xs font-semibold text-oliva-700 underline" onClick={signOut}>Salir</button>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`${open ? 'block' : 'hidden'} lg:flex lg:flex-col w-full lg:w-[232px] shrink-0 border-r border-oliva-100 bg-white`}
      >
        <div className="hidden lg:flex items-center gap-2.5 px-4 py-4 border-b border-oliva-100">
          <div className="h-8 w-8 rounded-md bg-oliva-800 text-oliva-50 flex items-center justify-center font-extrabold text-[13px]">
            SA
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-bold text-oliva-900">Sierras de Aiguá</div>
            <div className="text-[10px] text-oliva-500 tracking-wide">Gestión interna</div>
          </div>
        </div>

        <nav className="p-3 space-y-4 flex-1">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-oliva-500 px-2.5 pb-1.5">Operación</div>
            <div className="space-y-0.5">
              {itemsOp.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => setOpen(false)} className={linkCls}>
                  <Ico>{n.icon}</Ico>
                  <span className="flex-1">{n.label}</span>
                  {n.to === '/' && reporteNuevo && (
                    <span className="text-[9px] font-bold uppercase tracking-wide rounded-full bg-aceite-500 text-white px-1.5 py-0.5">
                      nuevo
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
          {itemsGestion.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-oliva-500 px-2.5 pb-1.5">Gestión</div>
              <div className="space-y-0.5">
                {itemsGestion.map((n) => (
                  <NavLink key={n.to} to={n.to} onClick={() => setOpen(false)} className={linkCls}>
                    <Ico>{n.icon}</Ico>
                    <span>{n.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          )}
        </nav>

        <div className="hidden lg:flex items-center gap-2.5 p-3 border-t border-oliva-100">
          <div className="h-8 w-8 rounded-full bg-oliva-800 text-oliva-50 flex items-center justify-center font-bold text-xs shrink-0">
            {iniciales}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-oliva-900 truncate">{perfil?.nombre}</div>
            <div className="text-[10px] text-oliva-500 uppercase tracking-wide">{perfil?.rol}</div>
          </div>
          <button
            className="text-oliva-500 hover:text-oliva-800 p-1"
            title="Cambiar contraseña"
            onClick={() => setCambiarPass(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2l7 3v7c0 5-3.5 8-7 10-3.5-2-7-5-7-10V5l7-3z"/></svg>
          </button>
          <button
            className="text-oliva-500 hover:text-red-700 p-1"
            title="Cerrar sesión"
            onClick={signOut}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          </button>
        </div>
      </aside>

      <CambiarPasswordDialog abierto={cambiarPass} onClose={() => setCambiarPass(false)} />
      <Asistente abierto={asistente} onCerrar={() => setAsistente(false)} />

      {/* Botón flotante Analista — oculto para empleados de campo */}
      {perfil?.rol !== 'campo' && (
        <button
          onClick={() => setAsistente(true)}
          className="fixed bottom-4 right-4 z-40 h-14 w-14 rounded-full bg-oliva-800 hover:bg-oliva-900 text-oliva-50 shadow-lg shadow-oliva-800/30 flex items-center justify-center text-2xl transition"
          title="Analista de datos"
        >
          📊
        </button>
      )}

      {/* Contenido */}
      <main className="flex-1 p-4 lg:p-6 bg-oliva-50">
        <Outlet />
      </main>
    </div>
  )
}
