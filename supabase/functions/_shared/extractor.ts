// Extractor de datos de obligaciones desde correos clasificados.
// Combina cuerpo + texto de adjuntos para extraer campos estructurados.

import type { Categoria } from './clasificador.ts'

// ---- Tipos ----

export interface AdjuntoTexto {
  nombre: string
  texto: string
}

export interface CorreoParaExtraccion {
  de: string
  asunto: string
  cuerpo: string
  fecha: string
  gmail_id: string
  thread_id: string
  categoria: Categoria
  confianza_clasificacion: number
  adjuntos_texto?: AdjuntoTexto[]
}

export type EstadoObligacion = 'pendiente' | 'posible_pago' | 'vencido' | 'revisar'

export interface ObligacionExtraida {
  organismo: string
  concepto: string
  tipo_obligacion: string | null
  periodo: string | null
  fecha_vencimiento: string | null
  importe: number | null
  moneda: 'UYU' | 'USD' | null
  numero_documento: string | null
  fecha_correo: string
  remitente: string
  asunto: string
  gmail_id: string
  thread_id: string
  adjunto_relevante: string | null
  estado: EstadoObligacion
  confianza: number
  categoria: Categoria
  enlace_gmail: string
}

// ---- Helpers ----

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function parseAmount(raw: string): number | null {
  let s = raw.trim()

  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes(',')) {
    const afterComma = s.split(',')[1]
    if (afterComma && afterComma.length <= 2) {
      s = s.replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (s.includes('.')) {
    const parts = s.split('.')
    if (parts.length > 2) {
      s = s.replace(/\./g, '')
    } else {
      const afterDot = parts[1]
      if (afterDot && afterDot.length === 3) {
        s = s.replace('.', '')
      }
    }
  }

  const val = parseFloat(s)
  return isNaN(val) ? null : val
}

// ---- Detección de importe y moneda ----

export function detectarImporte(texto: string): { importe: number | null; moneda: 'UYU' | 'USD' | null } {
  const norm = normalize(texto)

  // USD primero
  const usdRe = /(?:u\$s|usd|us\$|d[oó]lares?)\s*([\d.]+(?:,\d{1,2})?)/gi
  let match
  while ((match = usdRe.exec(norm)) !== null) {
    const val = parseAmount(match[1])
    if (val != null && val > 1) return { importe: val, moneda: 'USD' }
  }

  // UYU
  const uyuPatterns = [
    /(?:total|monto|importe|pagar|abonar|deuda|saldo|cobrar|cuota|prima|aporte)[\s:$u]*([\d][\d.,]*)/gi,
    /\$\s*([\d.]+(?:,\d{1,2})?)/g,
    /(?:uyu|pesos)\s*([\d.]+(?:,\d{1,2})?)/gi,
    /([\d][\d.,]*)\s*(?:pesos|uyu)/gi,
  ]

  let best: number | null = null
  for (const re of uyuPatterns) {
    re.lastIndex = 0
    while ((match = re.exec(norm)) !== null) {
      const val = parseAmount(match[1])
      if (val != null && val > 10 && val < 500_000) {
        if (best === null || val > best) best = val
      }
    }
  }

  if (best != null) return { importe: best, moneda: 'UYU' }
  return { importe: null, moneda: null }
}

// ---- Fecha de vencimiento ----

export function detectarFechaVencimiento(texto: string): string | null {
  const norm = normalize(texto)

  const meses: Record<string, string> = {
    enero: '01', febrero: '02', marzo: '03', abril: '04',
    mayo: '05', junio: '06', julio: '07', agosto: '08',
    septiembre: '09', setiembre: '09', octubre: '10',
    noviembre: '11', diciembre: '12',
  }

  const patternsNumerico = [
    /venc\w*\s+(?:(?:el|al|del|la)\s+)?(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/i,
    /venc\w*[\s.:]+(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/i,
    /fecha\s*limite[\s.:]*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/i,
    /plazo[\s.:]*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/i,
    /(?:pagar|abonar)\s+(?:antes|hasta)\s+(?:(?:de|el|del)\s+)?(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/i,
  ]

  for (const re of patternsNumerico) {
    const m = re.exec(norm)
    if (m) {
      const [, d, mRaw, yRaw] = m
      let y = yRaw
      if (y.length === 2) y = `20${y}`
      const mm = mRaw.padStart(2, '0')
      const dd = d.padStart(2, '0')
      const yNum = Number(y)
      if (Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31 && yNum >= 2020 && yNum <= 2035) {
        return `${y}-${mm}-${dd}`
      }
    }
  }

  // Con nombre de mes: "Vence el 5 de octubre de 2026"
  const mesRe = new RegExp(
    `venc\\w*\\s+(?:(?:el|al|del|la)\\s+)?(\\d{1,2})\\s+de\\s+(${Object.keys(meses).join('|')})\\s+(?:de\\s+)?(\\d{2,4})`,
    'i',
  )
  const mMes = mesRe.exec(norm)
  if (mMes) {
    const [, d, mesNombre, yRaw] = mMes
    const mm = meses[mesNombre.toLowerCase()]
    if (mm) {
      let y = yRaw
      if (y.length === 2) y = `20${y}`
      const yNum = Number(y)
      if (yNum >= 2020 && yNum <= 2035) return `${y}-${mm}-${d.padStart(2, '0')}`
    }
  }

  return null
}

// ---- Período ----

export function detectarPeriodo(texto: string): string | null {
  const norm = normalize(texto)

  const meses: Record<string, string> = {
    enero: '01', febrero: '02', marzo: '03', abril: '04',
    mayo: '05', junio: '06', julio: '07', agosto: '08',
    septiembre: '09', setiembre: '09', octubre: '10',
    noviembre: '11', diciembre: '12',
  }

  // "periodo 08/2026" o "período: 08-2026"
  const p1 = /periodo[\s:]*(\d{1,2})[/\-](\d{4})/i
  const m1 = p1.exec(norm)
  if (m1) return `${m1[1].padStart(2, '0')}/${m1[2]}`

  // "agosto 2026" o "agosto de 2026"
  const mesRe = new RegExp(
    `(${Object.keys(meses).join('|')})\\s+(?:de\\s+)?(\\d{4})`,
    'i',
  )
  const m2 = mesRe.exec(norm)
  if (m2) {
    const mm = meses[m2[1].toLowerCase()]
    if (mm) return `${mm}/${m2[2]}`
  }

  // "08/2026" standalone
  const p3 = /\b(\d{2})[/\-](\d{4})\b/
  const m3 = p3.exec(texto)
  if (m3 && Number(m3[1]) >= 1 && Number(m3[1]) <= 12) {
    return `${m3[1]}/${m3[2]}`
  }

  return null
}

// ---- Número de documento ----

export function detectarNumeroDocumento(texto: string): string | null {
  const norm = normalize(texto)

  const patterns = [
    /(?:factura|fact\.?|fc\.?)\s*(?:n[°o]?\.?\s*)?[#:]?\s*([a-z]?\d[\d\-/]{2,})/i,
    /(?:poliza)\s*(?:n[°o]?\.?\s*)?[#:]?\s*(\d[\d\-/]{2,})/i,
    /(?:recibo)\s*(?:n[°o]?\.?\s*)?[#:]?\s*(\d[\d\-/]{2,})/i,
    /(?:comprobante)\s*(?:n[°o]?\.?\s*)?[#:]?\s*(\d[\d\-/]{2,})/i,
    /\bn[°o]\.?\s*(\d[\d\-/]{3,})/i,
  ]

  for (const re of patterns) {
    const m = re.exec(norm)
    if (m) return m[1].toUpperCase()
  }
  return null
}

// ---- Organismo / proveedor ----

function detectarOrganismo(categoria: Categoria, de: string): string {
  const orgFijo: Partial<Record<Categoria, string>> = {
    bps: 'BPS',
    bse: 'BSE',
    dgi: 'DGI',
  }
  if (orgFijo[categoria]) return orgFijo[categoria]!

  const match = de.match(/^(.+?)\s*</)
  if (match) return match[1].replace(/"/g, '').trim()

  const atIdx = de.indexOf('@')
  return atIdx > 0 ? de.slice(0, atIdx) : de
}

// ---- Concepto ----

function detectarConcepto(asunto: string): string {
  return asunto.replace(/^(fwd?|rv|re)\s*:\s*/gi, '').trim() || 'Sin concepto'
}

// ---- Tipo de obligación ----

function detectarTipoObligacion(categoria: Categoria, texto: string): string {
  const norm = normalize(texto)

  switch (categoria) {
    case 'bps':
      if (norm.includes('aporte') || norm.includes('contribucion')) return 'aportes'
      if (norm.includes('historia laboral')) return 'tramite'
      return 'aportes'
    case 'bse':
      return 'seguro'
    case 'dgi':
      if (norm.includes('irpf')) return 'impuesto_irpf'
      if (norm.includes('iva')) return 'impuesto_iva'
      if (norm.includes('irae')) return 'impuesto_irae'
      if (norm.includes('tributo')) return 'tributo'
      return 'impuesto'
    case 'banco':
      return 'servicio_bancario'
    case 'estudio_contable':
      if (norm.includes('liquidacion') || norm.includes('sueldo')) return 'liquidacion_sueldos'
      if (norm.includes('honorario')) return 'honorarios'
      return 'servicio_contable'
    case 'organismo_publico':
      if (norm.includes('habilitacion')) return 'habilitacion'
      if (norm.includes('tasa') || norm.includes('patente')) return 'tasa'
      return 'tramite'
    case 'proveedor':
      if (norm.includes('factura')) return 'factura'
      if (norm.includes('presupuesto') || norm.includes('cotizacion')) return 'presupuesto'
      return 'factura'
  }
}

// ---- Adjunto relevante ----

function detectarAdjuntoRelevante(adjuntos?: AdjuntoTexto[]): string | null {
  if (!adjuntos || adjuntos.length === 0) return null
  const relevante = adjuntos.find((a) => {
    const n = a.nombre.toLowerCase()
    return n.endsWith('.pdf') || n.includes('factura') || n.includes('recibo') || n.includes('poliza')
  })
  return relevante?.nombre ?? adjuntos[0]?.nombre ?? null
}

// ---- Estado ----

export function calcularEstado(
  fechaVencimiento: string | null,
  texto: string,
  confianza: number,
  hoy?: string,
): EstadoObligacion {
  const norm = normalize(texto)

  const pagoPatrones = [
    /pagado/, /abonado/, /cancelado/,
    /pago\s+(?:fue\s+)?(?:realizado|recibido|confirmado|procesado)/,
    /confirmamos.*pago/, /recibimos.*pago/, /acreditado/,
  ]
  if (pagoPatrones.some((p) => p.test(norm))) return 'posible_pago'

  if (confianza < 0.2) return 'revisar'

  if (fechaVencimiento) {
    const hoyStr = hoy || new Date().toISOString().slice(0, 10)
    if (fechaVencimiento < hoyStr) return 'vencido'
  }

  return 'pendiente'
}

// ---- Confianza ----

function calcularConfianza(
  clasificacion: number,
  importe: number | null,
  fechaVenc: string | null,
  periodo: string | null,
  numDoc: string | null,
): number {
  let score = clasificacion * 0.4
  if (importe != null) score += 0.25
  if (fechaVenc) score += 0.15
  if (periodo) score += 0.1
  if (numDoc) score += 0.1
  return Math.min(1.0, Math.round(score * 100) / 100)
}

// ---- Deduplicación ----

export function generarClaveDedup(ob: ObligacionExtraida): string {
  const cat = ob.categoria

  if (ob.numero_documento) {
    return `doc::${cat}::${ob.numero_documento.toLowerCase()}`
  }

  if (ob.periodo && ob.tipo_obligacion) {
    return `per::${cat}::${ob.tipo_obligacion}::${ob.periodo}`
  }

  if (ob.importe != null && ob.fecha_vencimiento) {
    return `imp::${cat}::${ob.importe}::${ob.fecha_vencimiento}`
  }

  return `mail::${ob.gmail_id}`
}

export function deduplicar(obligaciones: ObligacionExtraida[]): ObligacionExtraida[] {
  const vistas = new Map<string, ObligacionExtraida>()
  const gmailVisto = new Set<string>()

  for (const ob of obligaciones) {
    if (gmailVisto.has(ob.gmail_id)) continue
    gmailVisto.add(ob.gmail_id)

    const clave = generarClaveDedup(ob)
    const existente = vistas.get(clave)

    if (!existente) {
      vistas.set(clave, ob)
    } else if (
      ob.confianza > existente.confianza ||
      (ob.confianza === existente.confianza && ob.fecha_correo > existente.fecha_correo)
    ) {
      vistas.set(clave, ob)
    }
  }

  return Array.from(vistas.values())
}

// ---- API pública ----

export function extraer(
  correo: CorreoParaExtraccion,
  hoy?: string,
): ObligacionExtraida {
  const textoAdjuntos = (correo.adjuntos_texto ?? []).map((a) => a.texto).join(' ')
  const textoCompleto = `${correo.asunto} ${correo.cuerpo} ${textoAdjuntos}`

  const { importe, moneda } = detectarImporte(textoCompleto)
  const fechaVencimiento = detectarFechaVencimiento(textoCompleto)
  const periodo = detectarPeriodo(textoCompleto)
  const numeroDocumento = detectarNumeroDocumento(textoCompleto)
  const organismo = detectarOrganismo(correo.categoria, correo.de)
  const concepto = detectarConcepto(correo.asunto)
  const tipoObligacion = detectarTipoObligacion(correo.categoria, textoCompleto)
  const adjuntoRelevante = detectarAdjuntoRelevante(correo.adjuntos_texto)

  const confianza = calcularConfianza(
    correo.confianza_clasificacion,
    importe, fechaVencimiento, periodo, numeroDocumento,
  )

  const estado = calcularEstado(fechaVencimiento, textoCompleto, confianza, hoy)

  return {
    organismo,
    concepto,
    tipo_obligacion: tipoObligacion,
    periodo,
    fecha_vencimiento: fechaVencimiento,
    importe,
    moneda,
    numero_documento: numeroDocumento,
    fecha_correo: correo.fecha,
    remitente: correo.de,
    asunto: correo.asunto,
    gmail_id: correo.gmail_id,
    thread_id: correo.thread_id,
    adjunto_relevante: adjuntoRelevante,
    estado,
    confianza,
    categoria: correo.categoria,
    enlace_gmail: `https://mail.google.com/mail/u/0/#inbox/${correo.gmail_id}`,
  }
}
