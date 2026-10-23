// Clasificación y extracción client-side de obligaciones fiscales.
// Versión ligera del clasificador/extractor de Edge Functions,
// opera sobre los datos ya almacenados en correos_sincronizados.

export type Categoria = 'bps' | 'bse' | 'dgi' | 'banco' | 'estudio_contable' | 'organismo_publico' | 'proveedor'
export type EstadoObligacion = 'pendiente' | 'posible_pago' | 'vencido' | 'revisar'
export type EstadoManual = 'pagada' | 'descartada' | 'revisar' | 'pendiente' | null

export interface Obligacion {
  id: number
  gmail_id: string
  categoria: Categoria | null
  organismo: string
  concepto: string
  tipo_obligacion: string | null
  periodo: string | null
  fecha_vencimiento: string | null
  importe: number | null
  moneda: 'UYU' | 'USD' | null
  numero_documento: string | null
  estado: EstadoObligacion
  estado_manual: EstadoManual
  confianza: number
  fecha_correo: string
  remitente: string
  asunto: string
  snippet: string
  cuerpo_texto: string | null
  enlace_gmail: string
}

interface CorreoRaw {
  id: number
  gmail_id: string
  de: string
  asunto: string
  fecha: string
  snippet: string
  monto_detectado: number | null
  moneda_detectada: string | null
  fecha_vencimiento: string | null
  cuerpo_texto: string | null
  estado_manual: EstadoManual
}

// ---- Helpers ----

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function extraerDominio(de: string): string {
  const m = de.match(/@([\w.-]+)/)
  return m ? m[1].toLowerCase() : ''
}

function extraerNombreRemitente(de: string): string {
  const m = de.match(/^(.+?)\s*</)
  if (m) return m[1].replace(/"/g, '').trim()
  const at = de.indexOf('@')
  return at > 0 ? de.slice(0, at) : de
}

// ---- Clasificación ----

interface ReglaSimple {
  categoria: Categoria
  nombre: string
  dominios: string[]
  remitenteRe: RegExp[]
  keywords: string[]
}

const REGLAS: ReglaSimple[] = [
  { categoria: 'bps', nombre: 'BPS', dominios: ['bps.gub.uy'], remitenteRe: [/bps/i], keywords: ['bps', 'aportes', 'contribucion', 'prevision social', 'patronal'] },
  { categoria: 'bse', nombre: 'BSE', dominios: ['bse.com.uy'], remitenteRe: [/bse/i, /banco\s*de\s*seguros/i], keywords: ['bse', 'seguro', 'poliza', 'prima', 'siniestro'] },
  { categoria: 'dgi', nombre: 'DGI', dominios: ['dgi.gub.uy'], remitenteRe: [/dgi/i], keywords: ['dgi', 'impuesto', 'irpf', 'iva', 'irae', 'tributo'] },
  { categoria: 'banco', nombre: 'Banco', dominios: ['brou.com.uy', 'itau.com.uy', 'santander.com.uy', 'scotiabank.com.uy'], remitenteRe: [/banco/i, /brou/i], keywords: ['extracto', 'estado de cuenta', 'transferencia'] },
  { categoria: 'estudio_contable', nombre: 'Estudio contable', dominios: [], remitenteRe: [/estudio/i, /contable/i, /\bcr[a]?\.?\s/i], keywords: ['liquidacion', 'balance', 'contabilidad', 'honorarios'] },
  { categoria: 'organismo_publico', nombre: 'Organismo publico', dominios: ['gub.uy'], remitenteRe: [/ministerio/i, /intendencia/i], keywords: ['ministerio', 'intendencia', 'habilitacion', 'resolucion'] },
  { categoria: 'proveedor', nombre: 'Proveedor', dominios: [], remitenteRe: [], keywords: ['factura', 'presupuesto', 'cotizacion', 'remito', 'nota de credito'] },
]

function clasificar(de: string, asunto: string, cuerpo: string): { categoria: Categoria | null; confianza: number } {
  const dominio = extraerDominio(de)
  const nombre = norm(de)
  const texto = norm(`${asunto} ${cuerpo}`)
  let mejor: { cat: Categoria; score: number } | null = null

  for (const r of REGLAS) {
    let score = 0
    if (r.dominios.some(d => dominio === d || dominio.endsWith('.' + d))) score += 0.5
    else {
      const bodyDomains = [...cuerpo.matchAll(/@([\w.-]+)/g)].map(m => m[1].toLowerCase())
      if (r.dominios.some(d => bodyDomains.some(bd => bd === d || bd.endsWith('.' + d)))) score += 0.3
    }
    if (r.remitenteRe.some(p => p.test(nombre))) score += 0.2
    const hits = r.keywords.filter(kw => texto.includes(norm(kw))).length
    if (hits > 0) score += Math.min(0.3, hits * 0.1)
    if (score > (mejor?.score ?? 0)) mejor = { cat: r.categoria, score }
  }

  if (!mejor || mejor.score < 0.3) return { categoria: null, confianza: 0 }
  return { categoria: mejor.cat, confianza: Math.round(mejor.score * 100) / 100 }
}

// ---- Extracción ----

function detectarPeriodo(texto: string): string | null {
  const n = norm(texto)
  const meses: Record<string, string> = {
    enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
    julio: '07', agosto: '08', septiembre: '09', setiembre: '09', octubre: '10',
    noviembre: '11', diciembre: '12',
  }
  const p1 = /periodo[\s:]*(\d{1,2})[/\-](\d{4})/i.exec(n)
  if (p1) return `${p1[1].padStart(2, '0')}/${p1[2]}`
  const mesRe = new RegExp(`(${Object.keys(meses).join('|')})\\s+(?:de\\s+)?(\\d{4})`, 'i')
  const p2 = mesRe.exec(n)
  if (p2 && meses[p2[1]]) return `${meses[p2[1]]}/${p2[2]}`
  const p3 = /\b(\d{2})[/\-](\d{4})\b/.exec(texto)
  if (p3 && +p3[1] >= 1 && +p3[1] <= 12) return `${p3[1]}/${p3[2]}`
  return null
}

// Normaliza un numero de documento para comparar entre correos de distinto
// remitente: mayusculas, sin espacios ("A 2325" -> "A2325") y sin el sufijo de
// serie que agrega la e-factura ("A2325-EF" -> "A2325").
function normalizarNumDoc(raw: string): string {
  let s = raw.toUpperCase().replace(/\s+/g, '')
  s = s.replace(/[-/][A-Z]{1,4}$/, '') // sufijo tipo -EF
  s = s.replace(/[-/]+$/, '')          // guiones/barras colgantes
  return s
}

function detectarNumDoc(texto: string): string | null {
  const n = norm(texto)
  const pats = [
    // "Factura A2325", "Factura A 2325", "Ref A2325-EF", "Fc N° 0001-0001234"
    /(?:factura|fact\.?|fc\.?|comprobante|ref\.?)\s*(?:n[°o]?\.?\s*)?[#:]?\s*([a-z]{0,3}\s?\d[\d\s\-/]{1,}\d)/i,
    /(?:poliza)\s*(?:n[°o]?\.?\s*)?[#:]?\s*(\d[\d\-/]{2,})/i,
    /(?:recibo|comprobante)\s*(?:n[°o]?\.?\s*)?[#:]?\s*(\d[\d\-/]{2,})/i,
    /\bn[°o]\.?\s*(\d[\d\-/]{3,})/i,
  ]
  for (const re of pats) {
    const m = re.exec(n)
    if (m) return normalizarNumDoc(m[1])
  }
  return null
}

function detectarMoneda(texto: string): 'UYU' | 'USD' | null {
  const n = norm(texto)
  if (/u\$s|usd|us\$|dolares?/.test(n)) return 'USD'
  if (/\$|uyu|pesos/.test(n)) return 'UYU'
  return null
}

function detectarTipo(cat: Categoria | null, texto: string): string | null {
  if (!cat) return null
  const n = norm(texto)
  const map: Record<string, string> = {
    bps: n.includes('aporte') ? 'aportes' : 'aportes',
    bse: 'seguro',
    dgi: n.includes('irpf') ? 'impuesto_irpf' : n.includes('iva') ? 'impuesto_iva' : 'impuesto',
    banco: 'servicio_bancario',
    estudio_contable: n.includes('liquidacion') ? 'liquidacion_sueldos' : n.includes('honorario') ? 'honorarios' : 'servicio_contable',
    organismo_publico: 'tramite',
    proveedor: n.includes('factura') ? 'factura' : n.includes('presupuesto') ? 'presupuesto' : 'factura',
  }
  return map[cat] ?? null
}

function detectarEstado(fechaVenc: string | null, texto: string, confianza: number, hoy: string): EstadoObligacion {
  const n = norm(texto)
  const pagoPat = [/pagado/, /abonado/, /cancelado/, /acreditado/, /pago\s+(?:fue\s+)?(?:realizado|recibido|confirmado)/, /confirmamos.*pago/]
  if (pagoPat.some(p => p.test(n))) return 'posible_pago'
  if (confianza < 0.2) return 'revisar'
  if (fechaVenc && fechaVenc < hoy) return 'vencido'
  return 'pendiente'
}

function orgFijo(cat: Categoria | null): string | null {
  if (cat === 'bps') return 'BPS'
  if (cat === 'bse') return 'BSE'
  if (cat === 'dgi') return 'DGI'
  return null
}

// ---- API pública ----

export function procesarCorreos(correos: CorreoRaw[], hoy: string): Obligacion[] {
  const todas = correos.map(c => {
    const texto = `${c.asunto} ${c.cuerpo_texto ?? ''}`
    const { categoria, confianza: confClasif } = clasificar(c.de, c.asunto, c.cuerpo_texto ?? '')
    const periodo = detectarPeriodo(texto)
    const numDoc = detectarNumDoc(texto)
    const moneda = c.monto_detectado != null
      ? ((c.moneda_detectada as 'UYU' | 'USD') ?? detectarMoneda(texto) ?? 'UYU')
      : null
    const tipo = detectarTipo(categoria, texto)
    const organismo = orgFijo(categoria) ?? extraerNombreRemitente(c.de)
    const concepto = c.asunto.replace(/^(fwd?|rv|re)\s*:\s*/gi, '').trim() || 'Sin concepto'

    let conf = confClasif * 0.4
    if (c.monto_detectado != null) conf += 0.25
    if (c.fecha_vencimiento) conf += 0.15
    if (periodo) conf += 0.1
    if (numDoc) conf += 0.1
    conf = Math.min(1, Math.round(conf * 100) / 100)

    const estado = detectarEstado(c.fecha_vencimiento, texto, conf, hoy)

    return {
      id: c.id,
      gmail_id: c.gmail_id,
      categoria,
      organismo,
      concepto,
      tipo_obligacion: tipo,
      periodo,
      fecha_vencimiento: c.fecha_vencimiento,
      importe: c.monto_detectado,
      moneda,
      numero_documento: numDoc,
      estado,
      estado_manual: c.estado_manual,
      confianza: conf,
      fecha_correo: c.fecha,
      remitente: c.de,
      asunto: c.asunto,
      snippet: c.snippet,
      cuerpo_texto: c.cuerpo_texto,
      enlace_gmail: `https://mail.google.com/mail/u/0/#inbox/${c.gmail_id}`,
    }
  })

  // Deduplicar. Clave principal: el numero de factura cuando es distintivo
  // (tiene letra o es largo), asi una misma factura que llega de dos remitentes
  // distintos (p.ej. la e-factura + el proveedor por Gmail) se une en una sola.
  // Si no hay numero util, se cae al criterio organismo + concepto base.
  const docDistintivo = (d: string | null): boolean => {
    if (!d) return false
    // Excluir periodos/fechas (MM/YYYY, DD/MM/YYYY): no son numeros de factura.
    if (/^\d{1,2}\/\d{2,4}$/.test(d) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(d)) return false
    return /[a-z]/i.test(d) || d.replace(/\D/g, '').length >= 5
  }
  // El periodo evita fusionar facturas recurrentes de MESES DISTINTOS que comparten
  // "numero de documento" (p.ej. UTE usa el mismo nro. de cuenta todos los meses).
  // Se usa el vencimiento; si no hay, el periodo; si no, el mes del correo.
  const periodoClave = (ob: Obligacion): string =>
    (ob.fecha_vencimiento ?? ob.periodo ?? ob.fecha_correo.slice(0, 7)).slice(0, 7)
  const dedup = new Map<string, Obligacion>()
  for (const ob of todas) {
    const nd = ob.numero_documento
    // Numero de factura UNICO = tiene letra (p.ej. "A2325"): identifica la factura por si solo,
    // sin período (así dos mails de la misma factura se fusionan aunque lleguen distinto).
    // Recurrentes (nro. solo-dígitos tipo cuenta, p.ej. UTE) o sin número: se separan por período.
    const esFacturaUnica = docDistintivo(nd) && /[a-z]/i.test(nd!)
    const base = docDistintivo(nd)
      ? `doc::${nd!.toLowerCase()}`
      : `${ob.organismo.toLowerCase()}::${ob.concepto.toLowerCase()}`
    const clave = esFacturaUnica ? base : `${base}::${periodoClave(ob)}`
    const existing = dedup.get(clave)
    if (!existing) {
      dedup.set(clave, ob)
    } else {
      // Misma factura que llega dos veces (p.ej. e-factura + proveedor): se conserva el
      // correo MAS RECIENTE y se completan los huecos con el otro.
      const masReciente = ob.fecha_correo > existing.fecha_correo ? ob : existing
      const otro = masReciente === ob ? existing : ob
      dedup.set(clave, {
        ...masReciente,
        importe: masReciente.importe ?? otro.importe,
        moneda: masReciente.moneda ?? otro.moneda,
        fecha_vencimiento: masReciente.fecha_vencimiento ?? otro.fecha_vencimiento,
        numero_documento: masReciente.numero_documento ?? otro.numero_documento,
        confianza: Math.max(ob.confianza, existing.confianza),
        // Estado: si alguno quedo PAGADA, la factura esta paga. Si no, vale el del correo
        // MAS RECIENTE (no se hereda un "descartada" de un duplicado viejo, que escondia la
        // factura activa). Un descarte explicito del correo reciente si se respeta.
        estado_manual: (ob.estado_manual === 'pagada' || existing.estado_manual === 'pagada')
          ? 'pagada'
          : masReciente.estado_manual,
      })
    }
  }
  return [...dedup.values()]
}

export function estadoDisplay(ob: Obligacion): { label: string; color: string; bg: string } {
  if (ob.estado_manual === 'pagada') return { label: 'Pagada', color: 'text-green-800', bg: 'bg-green-100' }
  if (ob.estado_manual === 'descartada') return { label: 'Descartada', color: 'text-gray-600', bg: 'bg-gray-100' }
  if (ob.estado_manual === 'revisar') return { label: 'Revisar', color: 'text-purple-800', bg: 'bg-purple-100' }
  if (ob.estado === 'vencido') return { label: 'Vencida', color: 'text-red-800', bg: 'bg-red-100' }
  if (ob.estado === 'posible_pago') return { label: 'Posible pago', color: 'text-blue-800', bg: 'bg-blue-100' }
  if (ob.estado === 'revisar') return { label: 'Revisar', color: 'text-purple-800', bg: 'bg-purple-100' }
  return { label: 'Pendiente', color: 'text-amber-800', bg: 'bg-amber-100' }
}

export function categoriaLabel(cat: Categoria | null): string {
  const map: Record<string, string> = {
    bps: 'BPS', bse: 'BSE', dgi: 'DGI', banco: 'Banco',
    estudio_contable: 'Est. contable', organismo_publico: 'Organismo', proveedor: 'Proveedor',
  }
  return cat ? (map[cat] ?? cat) : 'Sin clasificar'
}

export const ORGANISMOS_FIJOS = ['BPS', 'BSE', 'DGI'] as const
export const ESTADOS_FILTRO = ['pendiente', 'vencido', 'posible_pago', 'revisar', 'pagada', 'descartada'] as const
