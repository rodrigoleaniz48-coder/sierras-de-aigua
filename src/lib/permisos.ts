/**
 * IDs de ubicaciones que el usuario puede ver en el módulo Stock (envasado + alertas).
 * Almazara siempre; Gonzalo además ve Maldonado; el resto además ve Montevideo.
 */
export function ubicacionesVisiblesPorSocio(nombre: string | null | undefined): number[] {
  const n = (nombre ?? '').toLowerCase()
  if (n.includes('gonzalo')) return [1, 2] // Almazara + Maldonado
  return [1, 2, 3] // Rodrigo / Santi / Ayelén ven todas
}
