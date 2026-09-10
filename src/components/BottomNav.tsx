import { NavLink } from 'react-router-dom'
import { type ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import type { Rol } from '../lib/types'

interface Tab {
  to?: string
  label: string
  icon: ReactNode
  roles: Rol[]
  onClick?: () => void
}

// Icons: simple stroke SVGs, matching the sidebar style
const IconHome = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2z" /></svg>
const IconVentas = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h18M6 7v13h12V7M9 4h6v3H9z" /></svg>
const IconTareas = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
const IconStock = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
const IconMas = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></svg>

export function BottomNav({ onAbrirMas }: { onAbrirMas: () => void }) {
  const { perfil } = useAuth()

  const tabs: Tab[] = [
    { to: '/',       label: 'Inicio', icon: IconHome,   roles: ['admin', 'ventas', 'marketing'] },
    { to: '/ventas', label: 'Ventas', icon: IconVentas, roles: ['admin', 'ventas'] },
    { to: '/tareas', label: 'Tareas', icon: IconTareas, roles: ['admin', 'ventas', 'marketing', 'campo'] },
    { to: '/stock',  label: 'Stock',  icon: IconStock,  roles: ['admin', 'ventas', 'marketing'] },
    { label: 'Más',  icon: IconMas,   roles: ['admin', 'ventas', 'marketing', 'campo'], onClick: onAbrirMas },
  ]

  const visibles = tabs.filter((t) => !perfil || t.roles.includes(perfil.rol))

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-oliva-100 shadow-[0_-2px_10px_rgba(0,0,0,0.04)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
    >
      <div className="grid grid-cols-5">
        {visibles.map((t) => {
          const inner = (isActive: boolean) => (
            <div className={`flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] ${
              isActive ? 'text-oliva-900' : 'text-oliva-500'
            }`}>
              <div className={isActive ? 'text-oliva-800' : ''}>{t.icon}</div>
              <span className={`text-[10px] leading-none uppercase tracking-wide ${isActive ? 'font-bold' : 'font-medium'}`}>{t.label}</span>
            </div>
          )
          if (t.onClick) {
            return (
              <button key={t.label} type="button" onClick={t.onClick} className="hover:bg-oliva-50/60 active:bg-oliva-100 transition">
                {inner(false)}
              </button>
            )
          }
          return (
            <NavLink key={t.to} to={t.to!} end={t.to === '/'} className="hover:bg-oliva-50/60 active:bg-oliva-100 transition">
              {({ isActive }) => inner(isActive)}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
