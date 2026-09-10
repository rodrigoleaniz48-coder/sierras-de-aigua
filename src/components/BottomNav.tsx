import { NavLink } from 'react-router-dom'
import { type ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import type { Rol } from '../lib/types'
import { useOcultarAlBajar } from '../lib/useOcultarAlBajar'

interface Tab {
  to?: string
  label: string
  icon: ReactNode
  roles: Rol[]
  onClick?: () => void
}

const IconHome = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2z" /></svg>
const IconClientes = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-7 8-7s8 3 8 7" /></svg>
const IconVentasBig = <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h18M6 7v13h12V7M9 4h6v3H9z" /></svg>
const IconTareas = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
const IconStock = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
const IconMas = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></svg>

// Layout objetivo (6 columnas):
//   [Inicio] [Clientes] [ VENTAS - grande, elevada ] [Tareas] [Stock] [Más]
// Ventas es el CTA principal: circulo elevado sobre la barra, mas grande y coloreado.
export function BottomNav({ onAbrirMas }: { onAbrirMas: () => void }) {
  const { perfil } = useAuth()
  const oculta = useOcultarAlBajar()

  // Tab lateral "normal": icono + label pequenios
  const flatTab: Tab[] = [
    { to: '/',         label: 'Inicio',   icon: IconHome,     roles: ['admin', 'ventas', 'marketing'] },
    { to: '/clientes', label: 'Clientes', icon: IconClientes, roles: ['admin', 'ventas', 'marketing'] },
    // slot 3: Ventas elevada (se renderea aparte)
    { to: '/tareas',   label: 'Tareas',   icon: IconTareas,   roles: ['admin', 'ventas', 'marketing', 'campo'] },
    { to: '/stock',    label: 'Stock',    icon: IconStock,    roles: ['admin', 'ventas', 'marketing'] },
    { label: 'Más',    icon: IconMas,     roles: ['admin', 'ventas', 'marketing', 'campo'], onClick: onAbrirMas },
  ]
  const puedeVerVentas = !perfil || ['admin', 'ventas'].includes(perfil.rol)
  const visibles = flatTab.filter((t) => !perfil || t.roles.includes(perfil.rol))

  // Insertar un slot vacio (placeholder) en el indice 2 para dejarle lugar al boton elevado de Ventas.
  // Solo si el usuario puede ver Ventas y hay al menos 2 tabs a la izquierda para preservar el layout.
  const slots: (Tab | null)[] = [...visibles]
  if (puedeVerVentas) {
    // Insertar placeholder en la posicion 2 (despues de Inicio y Clientes) si existen esos primeros dos
    slots.splice(2, 0, null)
  }

  return (
    <nav
      className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-oliva-100 shadow-[0_-2px_10px_rgba(0,0,0,0.04)] transition-transform duration-200 ease-out ${
        oculta ? 'translate-y-full' : 'translate-y-0'
      }`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
    >
      <div className="relative">
        {/* Boton elevado "Ventas" (solo si el rol permite) */}
        {puedeVerVentas && (
          <NavLink
            to="/ventas"
            className="absolute left-1/2 -top-6 -translate-x-1/2 z-10 flex flex-col items-center"
          >
            {({ isActive }) => (
              <>
                <div
                  className={`h-14 w-14 rounded-full flex items-center justify-center shadow-lg border-4 border-white transition ${
                    isActive
                      ? 'bg-aceite-500 text-white ring-2 ring-aceite-500/40'
                      : 'bg-oliva-800 text-white hover:bg-oliva-900'
                  }`}
                >
                  {IconVentasBig}
                </div>
                <span className={`text-[10px] uppercase tracking-wide mt-1 leading-none ${
                  isActive ? 'text-oliva-900 font-bold' : 'text-oliva-700 font-semibold'
                }`}>
                  Ventas
                </span>
              </>
            )}
          </NavLink>
        )}

        {/* Grid con los tabs flat (con placeholder central para reservar el hueco de Ventas) */}
        <div className={`grid ${
          slots.length === 6 ? 'grid-cols-6'
          : slots.length === 5 ? 'grid-cols-5'
          : slots.length === 4 ? 'grid-cols-4'
          : slots.length === 3 ? 'grid-cols-3'
          : slots.length === 2 ? 'grid-cols-2'
          : 'grid-cols-1'
        }`}>
          {slots.map((t, i) => {
            if (!t) {
              // Placeholder para que el boton elevado tenga aire debajo
              return <div key={`slot-${i}`} className="min-h-[56px]" aria-hidden="true" />
            }
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
      </div>
    </nav>
  )
}
