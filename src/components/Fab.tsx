import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

/**
 * Floating Action Button (mobile only), esquina inferior derecha, sobre la BottomNav.
 * Muestra la accion principal segun la ruta actual. Al clickearlo:
 *   1. Si ya estamos en la pagina destino: dispara un evento global `app:fab-nuevo`
 *      que la pagina escucha para abrir su dialogo de "nuevo".
 *   2. Si no, navega a esa pagina con state `{abrirNueva:true}` — la pagina lo lee
 *      en el mount y abre el dialogo.
 */
export function Fab() {
  const loc = useLocation()
  const nav = useNavigate()
  const { perfil } = useAuth()
  const rol = perfil?.rol

  // Mapa ruta → (label, ruta destino, roles permitidos)
  const accion = (() => {
    const path = loc.pathname
    if (path.startsWith('/ventas')  && rol && ['admin','ventas'].includes(rol))              return { label: 'Nueva venta',   destino: '/ventas' }
    if (path.startsWith('/clientes')&& rol && ['admin','ventas','marketing'].includes(rol))  return { label: 'Nuevo cliente', destino: '/clientes' }
    if (path.startsWith('/tareas'))                                                            return { label: 'Nueva tarea',   destino: '/tareas' }
    if (path.startsWith('/finanzas')&& rol && ['admin','ventas','marketing'].includes(rol))  return { label: 'Nuevo',         destino: '/finanzas' }
    return null
  })()

  if (!accion) return null

  function click() {
    if (!accion) return
    if (loc.pathname.startsWith(accion.destino)) {
      window.dispatchEvent(new CustomEvent('app:fab-nuevo'))
    } else {
      nav(accion.destino, { state: { abrirNueva: true } })
    }
  }

  return (
    <button
      type="button"
      onClick={click}
      aria-label={accion.label}
      className="lg:hidden fixed right-4 z-40 h-14 w-14 rounded-full bg-oliva-800 text-white shadow-lg flex items-center justify-center hover:bg-oliva-900 active:scale-95 transition"
      style={{ bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
    </button>
  )
}
