/**
 * Reglas de stock mínimo por (categoría de producto, ubicación).
 * Siempre por presentación.
 *
 * Almazara (1):   aceite 24 · no-aceite 24
 * Maldonado (2):  6 para todo
 * Montevideo (3): aceite 18 · no-aceite 12
 * Envases vacíos: sin alerta
 */
export interface ReglaMinimo {
  /** cantidad mínima; 0 ⇒ sin alerta */
  min: number
}

export function reglaMinimo(categoria: string, ubicacionId: number): ReglaMinimo {
  if (categoria === 'envases_vacios') return { min: 0 }
  const esAceite = categoria === 'aceite'

  if (ubicacionId === 2) return { min: 6 } // Maldonado
  if (ubicacionId === 1) return { min: 24 } // Almazara
  if (ubicacionId === 3) return { min: esAceite ? 18 : 12 } // Montevideo

  return { min: 0 }
}
