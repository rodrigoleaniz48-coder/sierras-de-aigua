// Clasificador de correos fiscales — módulo extensible por reglas.
// Para agregar una categoría nueva: añadir un ReglaConfig a REGLAS.

export interface CorreoInput {
  de: string
  asunto: string
  cuerpo: string
}

export type Categoria =
  | 'bps'
  | 'bse'
  | 'dgi'
  | 'banco'
  | 'estudio_contable'
  | 'organismo_publico'
  | 'proveedor'

export interface ResultadoClasificacion {
  categoria: Categoria | null
  confianza: number
  regla: string
}

export interface ReglaConfig {
  nombre: string
  categoria: Categoria
  dominios: string[]
  remitentePatrones: RegExp[]
  asuntoKeywords: string[]
  cuerpoKeywords: string[]
}

// ---- Helpers ----

export function extraerDominio(de: string): string {
  const match = de.match(/@([\w.-]+)/)
  return match ? match[1].toLowerCase() : ''
}

function limpiarAsunto(asunto: string): string {
  return asunto.replace(/^(fwd?|rv|re)\s*:\s*/gi, '').trim()
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function contarCoincidencias(texto: string, keywords: string[]): number {
  const norm = normalize(texto)
  return keywords.filter((kw) => norm.includes(normalize(kw))).length
}

// ---- Evaluación ----

export function evaluarRegla(correo: CorreoInput, config: ReglaConfig): number {
  let score = 0

  const dominio = extraerDominio(correo.de)
  const dominioDirecto = config.dominios.some(
    (d) => dominio === d || dominio.endsWith('.' + d),
  )

  if (dominioDirecto) {
    score += 0.5
  } else if (config.dominios.length > 0) {
    // Buscar dominio del remitente original en cuerpo (correos reenviados)
    const bodyDomains = [...correo.cuerpo.matchAll(/@([\w.-]+)/g)].map((m) =>
      m[1].toLowerCase(),
    )
    if (
      config.dominios.some((d) =>
        bodyDomains.some((bd) => bd === d || bd.endsWith('.' + d)),
      )
    ) {
      score += 0.3
    }
  }

  // Nombre del remitente
  const nombreRemitente = normalize(correo.de)
  if (config.remitentePatrones.some((p) => p.test(nombreRemitente))) {
    score += 0.2
  }

  // Keywords en asunto (limpio de Fwd/Re)
  const asuntoLimpio = limpiarAsunto(correo.asunto)
  const asuntoHits = contarCoincidencias(asuntoLimpio, config.asuntoKeywords)
  if (asuntoHits > 0) {
    score += Math.min(0.3, asuntoHits * 0.15)
  }

  // Keywords en cuerpo
  const cuerpoHits = contarCoincidencias(correo.cuerpo, config.cuerpoKeywords)
  if (cuerpoHits > 0) {
    score += Math.min(0.3, cuerpoHits * 0.1)
  }

  return Math.min(1.0, score)
}

// ---- Reglas ----

export const REGLAS: ReglaConfig[] = [
  {
    nombre: 'BPS',
    categoria: 'bps',
    dominios: ['bps.gub.uy'],
    remitentePatrones: [/bps/i, /banco\s*de\s*previsi[oó]n/i],
    asuntoKeywords: [
      'bps', 'aportes', 'contribucion', 'historia laboral',
      'certificado comun', 'patronal',
    ],
    cuerpoKeywords: [
      'bps', 'aportes', 'prevision social', 'contribucion',
      'historia laboral', 'certificado comun', 'patronal',
      'banco de prevision',
    ],
  },
  {
    nombre: 'BSE',
    categoria: 'bse',
    dominios: ['bse.com.uy'],
    remitentePatrones: [/bse/i, /banco\s*de\s*seguros/i],
    asuntoKeywords: [
      'bse', 'seguro', 'poliza', 'prima', 'siniestro',
      'accidente de trabajo',
    ],
    cuerpoKeywords: [
      'bse', 'banco de seguros', 'poliza', 'prima', 'seguro',
      'cobertura', 'siniestro', 'accidente de trabajo',
    ],
  },
  {
    nombre: 'DGI',
    categoria: 'dgi',
    dominios: ['dgi.gub.uy'],
    remitentePatrones: [/dgi/i, /direcci[oó]n\s*general\s*impositiva/i],
    asuntoKeywords: [
      'dgi', 'impuesto', 'irpf', 'iva', 'irae', 'tributo',
      'declaracion jurada',
    ],
    cuerpoKeywords: [
      'dgi', 'impositiva', 'impuesto', 'irpf', 'iva', 'irae',
      'tributo', 'declaracion jurada', 'rut',
      'obligacion tributaria',
    ],
  },
  {
    nombre: 'Banco',
    categoria: 'banco',
    dominios: [
      'brou.com.uy', 'itau.com.uy', 'santander.com.uy',
      'scotiabank.com.uy', 'bbva.com.uy', 'hsbc.com.uy',
      'heritage.com.uy', 'citi.com',
    ],
    remitentePatrones: [
      /banco/i, /brou/i, /ita[uú]/i, /santander/i,
      /scotiabank/i, /bbva/i, /hsbc/i,
    ],
    asuntoKeywords: [
      'extracto', 'estado de cuenta', 'transferencia',
      'debito automatico', 'vencimiento tarjeta',
    ],
    cuerpoKeywords: [
      'extracto bancario', 'estado de cuenta', 'saldo',
      'deposito', 'transferencia', 'cuenta corriente',
      'caja de ahorro',
    ],
  },
  {
    nombre: 'Estudio contable',
    categoria: 'estudio_contable',
    dominios: [],
    remitentePatrones: [
      /estudio/i, /contable/i, /contador[a]?\b/i,
      /\bcr[a]?\.?\s/i, /contadur[ií]a/i,
    ],
    asuntoKeywords: [
      'liquidacion de sueldos', 'balance', 'estados financieros',
      'declaracion jurada', 'cierre mensual', 'contabilidad',
      'aguinaldo', 'licencia',
    ],
    cuerpoKeywords: [
      'estudio contable', 'contador', 'contadora', 'liquidacion',
      'balance', 'estados financieros', 'declaracion', 'cierre',
      'contabilidad', 'nomina', 'recibo de sueldo',
    ],
  },
  {
    nombre: 'Organismo publico',
    categoria: 'organismo_publico',
    dominios: ['gub.uy'],
    remitentePatrones: [
      /ministerio/i, /intendencia/i, /municipio/i, /gobierno/i,
    ],
    asuntoKeywords: [
      'ministerio', 'intendencia', 'municipio', 'resolucion',
      'expediente', 'habilitacion',
    ],
    cuerpoKeywords: [
      'ministerio', 'intendencia', 'gobierno', 'resolucion',
      'expediente', 'habilitacion', 'permiso', 'tramite',
    ],
  },
  {
    nombre: 'Proveedor',
    categoria: 'proveedor',
    dominios: [],
    remitentePatrones: [],
    asuntoKeywords: [
      'factura', 'presupuesto', 'cotizacion', 'orden de compra',
      'remito', 'nota de credito', 'cuenta corriente',
    ],
    cuerpoKeywords: [
      'factura', 'presupuesto', 'cotizacion', 'orden de compra',
      'remito', 'nota de credito', 'pago', 'vencimiento',
      'proveedor', 'deuda',
    ],
  },
]

// ---- API pública ----

const UMBRAL = 0.3

export function clasificarConReglas(
  correo: CorreoInput,
  reglas: ReglaConfig[],
): ResultadoClasificacion {
  let mejorScore = 0
  let mejorRegla = ''
  let mejorCategoria: Categoria | null = null

  for (const regla of reglas) {
    const score = evaluarRegla(correo, regla)
    if (score > mejorScore) {
      mejorScore = score
      mejorRegla = regla.nombre
      mejorCategoria = regla.categoria
    }
  }

  if (mejorScore < UMBRAL) {
    return { categoria: null, confianza: 0, regla: '' }
  }

  return {
    categoria: mejorCategoria,
    confianza: Math.round(mejorScore * 100) / 100,
    regla: mejorRegla,
  }
}

export function clasificar(correo: CorreoInput): ResultadoClasificacion {
  return clasificarConReglas(correo, REGLAS)
}
