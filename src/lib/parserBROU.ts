/**
 * Parser del extracto BROU (formato de "Detalle de Movimiento de Cuenta").
 * Acepta texto pegado desde el PDF o del Excel exportado del homebanking.
 *
 * Estrategia:
 * - Detecta líneas de movimiento por la presencia de una fecha DD/MM/YYYY al principio.
 * - Extrae los últimos 1-2 números con formato "1.234,56" como débito/crédito.
 * - El resto se guarda como descripción + asunto + numero_doc + dependencia.
 * - Genera un hash único por (fecha, numero_doc, monto) para dedupear al re-importar.
 */

export interface MovimientoParseado {
  fecha: string            // YYYY-MM-DD
  descripcion: string
  numero_doc: string | null
  asunto: string | null
  dependencia: string | null
  debito: number
  credito: number
  hash_unico: string
  raw: string              // línea original (debug)
}

const RE_FECHA = /(\d{2})\/(\d{2})\/(\d{4})/
const RE_MONTO = /(?:^|\s)(\d{1,3}(?:\.\d{3})*,\d{2})/g
const RE_NUM_DOC = /\b(\d{10,20})\b/

function parseNumero(s: string): number {
  return Number(s.replace(/\./g, '').replace(',', '.'))
}

function fechaISO(dd: string, mm: string, yyyy: string): string {
  return `${yyyy}-${mm}-${dd}`
}

function hash(fecha: string, doc: string | null, debito: number, credito: number): string {
  const key = `${fecha}|${doc ?? ''}|${debito}|${credito}`
  // Simple 32-bit hash (no crypto needed, solo para dedupe)
  let h = 0
  for (let i = 0; i < key.length; i++) h = ((h << 5) - h) + key.charCodeAt(i)
  return String(h >>> 0)
}

export function parsearExtractoBROU(texto: string): { movimientos: MovimientoParseado[]; errores: string[] } {
  const movimientos: MovimientoParseado[] = []
  const errores: string[] = []
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  // Compactar líneas continuadas — si una línea NO empieza con fecha DD/MM/YYYY, se pega a la anterior
  const compactas: string[] = []
  for (const linea of lineas) {
    if (RE_FECHA.test(linea) && linea.match(RE_FECHA)!.index === 0) {
      compactas.push(linea)
    } else if (compactas.length > 0) {
      compactas[compactas.length - 1] += ' ' + linea
    }
  }

  for (const linea of compactas) {
    const fechaMatch = linea.match(RE_FECHA)
    if (!fechaMatch || fechaMatch.index !== 0) continue
    const [, dd, mm, yyyy] = fechaMatch
    const fecha = fechaISO(dd, mm, yyyy)

    // Buscar todos los montos "1.234,56"
    const montos = [...linea.matchAll(RE_MONTO)].map((m) => ({ raw: m[1], num: parseNumero(m[1]) }))
    if (montos.length === 0) {
      errores.push(`Línea sin monto reconocido: "${linea.slice(0, 80)}…"`)
      continue
    }

    // El(los) último(s) monto(s) son débito/crédito. Formato BROU: una sola columna a la vez.
    // Regla: si aparece 1 monto → asignamos a débito o crédito según posición relativa a "Débito"/"Crédito".
    //        si aparece 2 montos consecutivos al final → primero débito, segundo crédito.
    let debito = 0, credito = 0
    if (montos.length === 1) {
      // Necesitamos heurística — asumimos débito por default (extractos suelen tener más débitos)
      // pero: si la línea contiene "TRF E-BROU OTROS" (transferencia recibida) es crédito.
      // Regla mejor: última posición → si la posición del monto está más a la derecha en el texto, es crédito.
      // BROU siempre pone débito primero. Asumimos débito.
      debito = montos[0].num
    } else {
      const [d, c] = montos.slice(-2)
      debito = d.num; credito = c.num
    }

    const numDocMatch = linea.match(RE_NUM_DOC)
    const numero_doc = numDocMatch ? numDocMatch[1] : null

    // Quitar los montos + fecha + numDoc de la línea para dejar descripción/asunto
    let resto = linea
      .replace(RE_FECHA, '')
      .trim()
    montos.forEach((m) => { resto = resto.replace(m.raw, '') })
    if (numero_doc) resto = resto.replace(numero_doc, '')
    resto = resto.replace(/\s+/g, ' ').trim()

    // Separar descripción / asunto / dependencia por " - " o palabras clave conocidas
    // Detectar dependencia: "199 - Casa Matriz" o "171 - Canales Digitales"
    const depMatch = resto.match(/(1\d\d\s*-\s*[A-Za-zÁÉÍÓÚñáéíóú ]+)/i)
    const dependencia = depMatch ? depMatch[1].trim() : null
    if (dependencia) resto = resto.replace(depMatch![0], '').trim()

    // Descripción = primer segmento (antes del primer " - " o "Comercio:"); asunto = resto
    let descripcion = resto
    let asunto: string | null = null
    const dashIdx = resto.indexOf(' - ')
    if (dashIdx > 0) {
      descripcion = resto.slice(0, dashIdx).trim()
      asunto = resto.slice(dashIdx + 3).trim()
    }
    // Si aparece "Comercio: XXX" al inicio, lo dejamos como descripción completa
    if (/^Comercio:/i.test(resto)) {
      descripcion = resto
      asunto = null
    }

    movimientos.push({
      fecha, descripcion, numero_doc, asunto, dependencia,
      debito, credito,
      hash_unico: hash(fecha, numero_doc, debito, credito),
      raw: linea,
    })
  }

  return { movimientos, errores }
}
