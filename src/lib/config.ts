// Configuración fija de la app. Cambios acá se toman en el próximo deploy.

/** Número del cadete de Montevideo — formato E.164 sin '+' para wa.me */
export const CADETE_MVD_WA = '59898330140'

/** Formatea un teléfono uruguayo cualquiera al formato E.164 sin '+' para usar en wa.me */
export function normalizarTelWA(tel: string | null | undefined): string | null {
  if (!tel) return null
  const soloDigitos = tel.replace(/\D/g, '')
  if (!soloDigitos) return null
  if (soloDigitos.startsWith('598')) return soloDigitos
  if (soloDigitos.startsWith('0')) return '598' + soloDigitos.slice(1)
  return '598' + soloDigitos
}

// Datos bancarios para transferencia, según la cuenta de la venta o, en su defecto,
// por socio + factura + moneda. Devuelve las líneas del mensaje (o null).
export function usuarioDatosBancarios(
  nombre: string | null | undefined,
  conFactura: boolean,
  moneda: 'UYU' | 'USD' = 'UYU',
  cuentaIdVenta?: number | null,
): string[] | null {
  const n = (nombre ?? '').toLowerCase()
  const foot = ['', 'Te agradezco me envíes el comprobante de pago!']
  const bloque = (banco: string, tipo: string, numero: string, titular: string) =>
    ['*Datos para transferencia:*', `*${banco}*`, tipo, numero, titular, ...foot]

  // Prioridad 1: la cuenta que quedó asignada a la venta
  if (cuentaIdVenta) {
    switch (Number(cuentaIdVenta)) {
      case 1: return bloque('BROU', 'Cuenta corriente en pesos', '001529985-00002', 'HARRIA SRL')
      case 2: return bloque('BROU', 'Cuenta corriente en dólares', '001529985-00001', 'HARRIA SRL')
      case 3: return bloque('BROU', 'Caja de ahorro en pesos', '110854026-00001', 'RODRIGO LEANIZ')
      case 5: return bloque('BROU', 'Caja de ahorro en pesos', '001773207-00001', 'SANTIAGO LEÁNIZ')
      case 6: return bloque('BROU', 'Caja de ahorro en pesos', '000247689-00002', 'GONZALO LEÁNIZ')
    }
  }

  // Fallback: por socio logueado + factura + moneda
  const cuentaHarriaUYU = bloque('BROU', 'Cuenta corriente en pesos', '001529985-00002', 'HARRIA SRL')
  const cuentaHarriaUSD = bloque('BROU', 'Cuenta corriente en dólares', '001529985-00001', 'HARRIA SRL')
  const cuentaHarria = moneda === 'USD' ? cuentaHarriaUSD : cuentaHarriaUYU
  if (conFactura || moneda === 'USD') return cuentaHarria
  if (n.includes('rodrigo') || n.includes('ayelen') || n.includes('ayelén'))
    return bloque('BROU', 'Caja de ahorro en pesos', '110854026-00001', 'RODRIGO LEANIZ')
  if (n.includes('santi'))
    return bloque('BROU', 'Caja de ahorro en pesos', '001773207-00001', 'SANTIAGO LEÁNIZ')
  if (n.includes('gonzalo'))
    return bloque('BROU', 'Caja de ahorro en pesos', '000247689-00002', 'GONZALO LEÁNIZ')
  return null
}
