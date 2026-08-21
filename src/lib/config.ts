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
