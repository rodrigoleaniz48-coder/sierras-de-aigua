export const money = (n: number | string | null | undefined, moneda: 'UYU' | 'USD' = 'UYU') => {
  const simbolo = moneda === 'USD' ? 'U$S ' : '$ '
  return simbolo + Number(n ?? 0).toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export const num = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString('es-UY', { maximumFractionDigits: 2 })

export function ordenarPresentaciones<T extends { producto_id: number; volumen_ml?: number | null; es_pack?: boolean }>(
  items: T[],
  prodPorId: Map<number, { nombre: string; categoria?: string }>,
): T[] {
  const catOrden: Record<string, number> = { aceite: 0, aceituna: 100, miel: 200, vinagre: 300, jabon: 400, servicio: 500 }
  return [...items].sort((a, b) => {
    const pa = prodPorId.get(a.producto_id), pb = prodPorId.get(b.producto_id)
    const ca = catOrden[pa?.categoria ?? ''] ?? 999, cb = catOrden[pb?.categoria ?? ''] ?? 999
    if (ca !== cb) return ca - cb
    if (a.es_pack && !b.es_pack) return 1
    if (!a.es_pack && b.es_pack) return -1
    const na = pa?.nombre ?? '', nb = pb?.nombre ?? ''
    if (na !== nb) return na.localeCompare(nb)
    return (b.volumen_ml ?? 0) - (a.volumen_ml ?? 0)
  })
}
