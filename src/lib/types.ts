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

// === Modulo Campo (cuaderno de campo) ===

export type EstadoEvento = 'realizada' | 'planificada'
export type AmbitoCategoria = 'aplicacion' | 'labor'

// Categorias editables (color + nombre). El slug es estable y es lo que se
// guarda en aplicacion_productos.categoria / labores_campo.tipo_labor.
export interface CategoriaCampo {
  id: number
  ambito: AmbitoCategoria
  slug: string
  nombre: string
  color: string
  orden: number
  activo: boolean
}

export interface Aplicacion {
  id: number
  fecha: string
  zafra: string
  sectores: string | null
  estado: EstadoEvento
  forma_aplicacion: string | null
  horas_tractor: number | null
  horas_hombre: number | null
  vol_total_l: number | null
  operario: string | null
  observaciones: string | null
  creado_por: string | null
  creado_en: string
}

export interface AplicacionProducto {
  id: number
  aplicacion_id: number
  categoria: string
  producto_comercial: string
  concentracion_100l: number | null
  dosis_ha: number | null
  dosis_total: number | null
  cantidad_planta: number | null
  vol_ha: number | null
  vol_total: number | null
  notas: string | null
}

export interface LaborCampo {
  id: number
  fecha: string
  zafra: string
  sectores: string | null
  tipo_labor: string
  descripcion: string | null
  horas_tractor: number | null
  horas_hombre: number | null
  jornales: number | null
  operarios: string | null
  estado: EstadoEvento
  observaciones: string | null
  creado_por: string | null
  creado_en: string
}

export interface ProductoFito {
  id: number
  nombre: string
  categoria: string
  activo: boolean
}

// === Cosecha (v1) ===
// Flujo: carga de cosecha (por operario) -> procesamiento en almazara.
// Pago a destajo con castigo por hojas sobre la tolerancia. Se agrupa por anio.

export interface CosechaOperario {
  id: number
  nombre: string
  activo: boolean
  orden: number
}

export interface CosechaTarifa {
  id: number
  anio: number
  precio_kg: number | null
  tolerancia_pct: number
}

export interface CosechaCarga {
  id: number
  fecha: string
  anio: number
  sector: string | null
  variedad: string
  kg_balanza: number
  kg_hojas: number | null
  notas: string | null
  creado_por: string | null
  creado_en: string
}

export interface CosechaCargaOperario {
  id: number
  carga_id: number
  operario_id: number | null
  kg: number
}

export interface CosechaProceso {
  id: number
  fecha: string
  anio: number
  variedad: string
  kg_balanza: number | null
  kg_procesado: number | null
  kg_aceite: number | null
  litros: number | null
  destino: string | null
  notas: string | null
  creado_por: string | null
  creado_en: string
}

export interface CosechaResumen {
  id: number
  anio: number
  variedad: string
  kg_cosecha: number | null
  litros: number | null
  rendimiento_pct: number | null
}

export interface CosechaSectorResumen {
  id: number
  anio: number
  sector: string
  kg_cosecha: number | null
}
