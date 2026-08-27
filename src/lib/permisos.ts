/**
 * IDs de ubicaciones que el usuario puede ver en el módulo Stock (envasado + alertas).
 * Almazara siempre; Gonzalo además ve Maldonado; el resto además ve Montevideo + Posada.
 */
export function ubicacionesVisiblesPorSocio(nombre: string | null | undefined): number[] {
  const n = (nombre ?? '').toLowerCase()
  if (n.includes('gonzalo')) return [1, 2, 4] // Almazara + Maldonado + Posada
  return [1, 2, 3, 4] // Rodrigo / Santi / Ayelén ven todas (incluye Posada)
}
