export const money = (n: number | string | null | undefined, moneda: 'UYU' | 'USD' = 'UYU') => {
  const simbolo = moneda === 'USD' ? 'U$S ' : '$ '
  return simbolo + Number(n ?? 0).toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export const num = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString('es-UY', { maximumFractionDigits: 2 })
