import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Stock } from './pages/Stock'
import { Ventas } from './pages/Ventas'
import { Clientes } from './pages/Clientes'
import { Gastos } from './pages/Gastos'
import { Contabilidad } from './pages/Contabilidad'
import { Admin } from './pages/Admin'
import { Tareas } from './pages/Tareas'

// GitHub Pages sirve bajo /sierras-de-aigua/
const BASENAME = '/sierras-de-aigua'

// Beta: gate para módulos que solo Rodrigo puede ver mientras probamos
function SoloRodrigo({ children }: { children: ReactNode }) {
  const { perfil } = useAuth()
  const ok = (perfil?.nombre ?? '').toLowerCase().includes('rodrigo')
  if (!ok) return <Navigate to="/" replace />
  return <>{children}</>
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={BASENAME}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="stock" element={<Stock />} />
            <Route
              path="ventas"
              element={
                <ProtectedRoute roles={['admin', 'ventas']}>
                  <Ventas />
                </ProtectedRoute>
              }
            />
            <Route path="clientes" element={<Clientes />} />
            <Route path="tareas" element={<SoloRodrigo><Tareas /></SoloRodrigo>} />
            <Route path="gastos" element={<Gastos />} />
            <Route
              path="contabilidad"
              element={
                <ProtectedRoute roles={['admin']}>
                  <Contabilidad />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin"
              element={
                <ProtectedRoute roles={['admin']}>
                  <Admin />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
