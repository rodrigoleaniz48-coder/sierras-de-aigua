/**
 * Reglas de stock mínimo por (categoría de producto, ubicación).
 *
 * Almazara (1): aceite 24 por presentación · no-aceite 24 por producto
 * Maldonado (2): 6 para todo
 * Montevideo (3): aceite 18 por presentación · no-aceite 12 por producto
 * Envases vacíos: sin alerta
 */
export interface ReglaMinimo {
  /** true → el mínimo se compara contra la suma de todas las presentaciones del producto en esa ubicación */
  porProducto: boolean
  /** cantidad mínima; 0 ⇒ sin alerta */
  min: number
}

export function reglaMinimo(categoria: string, ubicacionId: number): ReglaMinimo {
  if (categoria === 'envases_vacios') return { porProducto: false, min: 0 }
  const esAceite = categoria === 'aceite'

  // Maldonado: 6 para todo (por producto para no-aceite, por presentación para aceite)
  if (ubicacionId === 2) return { porProducto: !esAceite, min: 6 }

  // Almazara
  if (ubicacionId === 1) return { porProducto: !esAceite, min: 24 }

  // Montevideo
  if (ubicacionId === 3) return { porProducto: !esAceite, min: esAceite ? 18 : 12 }

  return { porProducto: !esAceite, min: 0 }
}
