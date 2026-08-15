export type Rol = 'admin' | 'ventas' | 'marketing'

export interface Perfil {
  id: string
  nombre: string
  rol: Rol
  activo: boolean
}

export interface Producto {
  id: number
  nombre: string
  categoria: 'aceite' | 'aceituna' | 'miel' | 'jabon'
  activo: boolean
}

export interface Presentacion {
  id: number
  producto_id: number
  nombre: string
  volumen_ml: number | null
  unidad: string
  precio_minorista: number
  precio_mayorista: number
  iva_pct: number
  stock_minimo: number
  activo: boolean
}
