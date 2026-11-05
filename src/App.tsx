import { lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'

// Paginas con carga diferida: cada una es su propio chunk y se descarga solo
// al entrar a la seccion (aligera la carga inicial de la app). El shell
// (Layout + sidebar) queda eager; el fallback de Suspense vive en Layout.
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const Stock = lazy(() => import('./pages/Stock').then((m) => ({ default: m.Stock })))
const Ventas = lazy(() => import('./pages/Ventas').then((m) => ({ default: m.Ventas })))
const Clientes = lazy(() => import('./pages/Clientes').then((m) => ({ default: m.Clientes })))
const Contabilidad = lazy(() => import('./pages/Contabilidad').then((m) => ({ default: m.Contabilidad })))
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })))
const Tareas = lazy(() => import('./pages/Tareas').then((m) => ({ default: m.Tareas })))
const Campo = lazy(() => import('./pages/Campo').then((m) => ({ default: m.Campo })))
const Finanzas = lazy(() => import('./pages/Finanzas').then((m) => ({ default: m.Finanzas })))
const Manual = lazy(() => import('./pages/Manual').then((m) => ({ default: m.Manual })))

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
            <Route path="tareas" element={<Tareas />} />
            <Route path="campo" element={<Campo />} />
            <Route path="manual" element={<Manual />} />
            <Route path="finanzas" element={<Finanzas />} />
            <Route path="gastos" element={<Navigate to="/finanzas" replace />} />
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
