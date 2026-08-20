import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
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

// GitHub Pages sirve bajo /sierras-de-aigua/
const BASENAME = '/sierras-de-aigua'

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
            <Route
              index
              element={
                <ProtectedRoute roles={['admin', 'ventas']}>
                  <Ventas />
                </ProtectedRoute>
              }
            />
            <Route path="dashboard" element={<Dashboard />} />
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
