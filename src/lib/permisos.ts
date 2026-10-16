/**
 * IDs de ubicaciones que el usuario puede ver en el módulo Stock (envasado + alertas).
 * Maldonado (id 2) queda EXCLUIDO: ese stock esta en poder de Gonzalo (distribuidor) y
 * ya esta contabilizado en su cuenta corriente, asi que no es stock de la empresa.
 */
export function ubicacionesVisiblesPorSocio(nombre: string | null | undefined): number[] {
  const n = (nombre ?? '').toLowerCase()
  if (n.includes('gonzalo')) return [1, 4] // Almazara + Posada
  return [1, 3, 4] // Rodrigo / Santi / Ayelén: Almazara + Montevideo + Posada
}
