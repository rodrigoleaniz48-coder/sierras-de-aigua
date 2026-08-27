/**
 * Reglas de stock mínimo por (categoría de producto, ubicación).
 * Siempre por presentación.
 *
 * Almazara (1):   aceite 24 · no-aceite 24
 * Maldonado (2):  6 para todo
 * Montevideo (3): aceite 18 · no-aceite 12
 * Posada    (4):  6 para todo (default hasta ajustar)
 * Envases vacíos: sin alerta
 */
export interface ReglaMinimo {
  /** cantidad mínima; 0 ⇒ sin alerta */
  min: number
}

export function reglaMinimo(categoria: string, ubicacionId: number): ReglaMinimo {
  if (categoria === 'envases_vacios' || categoria === 'servicio') return { min: 0 }
  const esAceite = categoria === 'aceite'

  if (ubicacionId === 2) return { min: 6 } // Maldonado
  if (ubicacionId === 1) return { min: 24 } // Almazara
  if (ubicacionId === 3) return { min: esAceite ? 18 : 12 } // Montevideo
  if (ubicacionId === 4) return { min: 6 } // Posada

  return { min: 0 }
}
