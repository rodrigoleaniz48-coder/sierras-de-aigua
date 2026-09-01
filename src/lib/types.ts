export type Rol = 'admin' | 'ventas' | 'marketing' | 'campo'

export interface Perfil {
  id: string
  nombre: string
  rol: Rol
  activo: boolean
  puede_modificar_stock: boolean
  puede_trasladar_stock: boolean
  ve_todo_crm: boolean
  ve_todos_gastos: boolean
  cuenta_default_id?: number | null
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
