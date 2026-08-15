import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import type { Rol } from '../lib/types'

export function ProtectedRoute({
  children,
  roles,
}: {
  children: ReactNode
  roles?: Rol[]
}) {
  const { session, perfil, cargando } = useAuth()
  const loc = useLocation()

  if (cargando) {
    return (
      <div className="flex h-screen items-center justify-center text-oliva-700">
        Cargando…
      </div>
    )
  }
  if (!session) {
    return <Navigate to="/login" state={{ from: loc }} replace />
  }
  if (roles && perfil && !roles.includes(perfil.rol)) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">Sin acceso</h1>
        <p className="text-sm text-oliva-700 mt-2">
          Tu rol ({perfil.rol}) no puede ver esta sección.
        </p>
      </div>
    )
  }
  return <>{children}</>
}
