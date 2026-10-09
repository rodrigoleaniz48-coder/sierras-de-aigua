/**
 * Parser de extractos bancarios en Excel (.xlsx / .xls) para la conciliacion.
 *
 * Es tolerante al formato: busca la fila de encabezados (hasta las primeras 25
 * filas) y mapea las columnas por nombre (fecha, descripcion, debito, credito,
 * importe, saldo, documento...). Soporta dos esquemas comunes:
 *   - Columnas separadas de Debito y Credito.
 *   - Una sola columna "Importe/Monto" con signo (negativo = egreso/debito).
 *
 * Devuelve el mismo shape que el parser de texto BROU, asi reutiliza la vista
 * previa y la importacion existentes, y comparte el hash de dedupe.
 */
import ExcelJS from 'exceljs'
import { hashMovimiento, type MovimientoParseado } from './parserBROU'

export interface ResultadoParseo {
  movimientos: MovimientoParseado[]
  errores: string[]
}

function norm(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Desenvuelve el valor de una celda de ExcelJS (formula, rich text, hyperlink...).
function valorCelda(v: unknown): unknown {
  if (v == null) return null
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('result' in o) return o.result
    if ('text' in o) return o.text
    if ('richText' in o && Array.isArray(o.richText)) {
      return (o.richText as { text: string }[]).map((r) => r.text).join('')
    }
    if ('hyperlink' in o && 'text' in o) return o.text
  }
  return v
}

function aTexto(v: unknown): string {
  const x = valorCelda(v)
  return x == null ? '' : String(x).trim()
}

// Convierte una celda de fecha (Date de Excel, serial o texto DD/MM/AAAA) a YYYY-MM-DD.
function aFechaISO(v: unknown): string | null {
  const x = valorCelda(v)
  if (x == null || x === '') return null
  if (x instanceof Date) {
    const y = x.getUTCFullYear()
    const m = String(x.getUTCMonth() + 1).padStart(2, '0')
    const d = String(x.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof x === 'number') {
    // Serial de Excel (dias desde 1899-12-30).
    const ms = Math.round((x - 25569) * 86400 * 1000)
    const dt = new Date(ms)
    if (!isNaN(dt.getTime())) {
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
    }
  }
  const s = String(x).trim()
  const dmy = s.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (dmy) {
    const dd = dmy[1].padStart(2, '0')
    const mm = dmy[2].padStart(2, '0')
    const yyyy = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]
    return `${yyyy}-${mm}-${dd}`
  }
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return null
}

// Convierte una celda de monto a numero. Soporta numeros nativos y strings
// con formato uruguayo (1.234,56) o internacional (1,234.56).
function aNumero(v: unknown): number {
  const x = valorCelda(v)
  if (x == null || x === '') return 0
  if (typeof x === 'number') return x
  let s = String(x).replace(/[^\d.,-]/g, '').trim()
  if (!s || s === '-') return 0
  const tieneComa = s.includes(',')
  const tienePunto = s.includes('.')
  if (tieneComa && tienePunto) {
    // El ultimo separador es el decimal.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (tieneComa) {
    s = s.replace(',', '.')
  }
  const n = Number(s)
  return isNaN(n) ? 0 : n
}

interface MapaColumnas {
  fecha: number
  desc: number
  debito: number
  credito: number
  importe: number
  saldo: number
  doc: number
  asunto: number
}

function buscarEncabezado(ws: ExcelJS.Worksheet): { fila: number; cols: MapaColumnas } | null {
  const maxFila = Math.min(25, ws.rowCount)
  for (let r = 1; r <= maxFila; r++) {
    const vals = (ws.getRow(r).values as unknown[]) ?? []
    // row.values es un array disperso (index 0 vacio, huecos en celdas vacias):
    // lo densificamos para que findIndex no reciba undefined.
    const h = Array.from({ length: vals.length }, (_, i) => norm(vals[i]))
    const fecha = h.findIndex((x) => x === 'fecha' || x.includes('fecha'))
    if (fecha < 0) continue

    const debito = h.findIndex((x) => x.includes('debito') || x.includes('debe') || x === 'egreso' || x === 'egresos' || x.includes('retiro'))
    const credito = h.findIndex((x) => x.includes('credito') || x.includes('haber') || x === 'ingreso' || x === 'ingresos' || x.includes('deposito'))
    const importe = h.findIndex((x) => x === 'importe' || x === 'monto' || x === 'importe (uyu)' || x.includes('importe'))
    if (debito < 0 && credito < 0 && importe < 0) continue // esta fila no es el encabezado

    const desc = h.findIndex((x) => x.includes('descrip') || x.includes('detalle') || x.includes('concepto') || x === 'movimiento' || x.includes('movimiento'))
    const saldo = h.findIndex((x) => x.includes('saldo'))
    const doc = h.findIndex((x) => x.includes('documento') || x.includes('comprobante') || x.includes('nro') || x.includes('numero') || x === 'ref' || x.includes('referencia'))
    const asunto = h.findIndex((x) => x.includes('asunto') || x.includes('observ') || x.includes('glosa'))
    return { fila: r, cols: { fecha, desc, debito, credito, importe, saldo, doc, asunto } }
  }
  return null
}

export async function parsearExcelBanco(buffer: ArrayBuffer): Promise<ResultadoParseo> {
  const errores: string[] = []
  const movimientos: MovimientoParseado[] = []

  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buffer)
  } catch (e) {
    return { movimientos, errores: [`No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}`] }
  }

  const ws = wb.worksheets.find((w) => w.rowCount > 1) ?? wb.worksheets[0]
  if (!ws) return { movimientos, errores: ['El archivo no tiene hojas con datos.'] }

  const enc = buscarEncabezado(ws)
  if (!enc) {
    return {
      movimientos,
      errores: [
        'No se reconocieron las columnas. El archivo debe tener una fila de encabezados con al menos "Fecha" y columnas de "Débito"/"Crédito" o "Importe".',
      ],
    }
  }

  const { cols } = enc
  const get = (vals: unknown[], idx: number): unknown => (idx >= 0 ? vals[idx] : null)

  for (let r = enc.fila + 1; r <= ws.rowCount; r++) {
    const vals = (ws.getRow(r).values as unknown[]) ?? []
    if (vals.length === 0) continue

    const fecha = aFechaISO(get(vals, cols.fecha))

    let debito = 0
    let credito = 0
    if (cols.debito >= 0 || cols.credito >= 0) {
      debito = Math.abs(aNumero(get(vals, cols.debito)))
      credito = Math.abs(aNumero(get(vals, cols.credito)))
    } else if (cols.importe >= 0) {
      const imp = aNumero(get(vals, cols.importe))
      if (imp < 0) debito = Math.abs(imp)
      else credito = imp
    }

    if (!fecha) {
      // Filas de titulo/subtotal/saldo sin fecha: se ignoran salvo que tengan monto.
      if (debito > 0 || credito > 0) {
        const d = aTexto(get(vals, cols.desc)) || aTexto(get(vals, cols.asunto))
        errores.push(`Fila ${r} sin fecha valida${d ? `: "${d.slice(0, 50)}"` : ''}`)
      }
      continue
    }
    if (debito === 0 && credito === 0) continue // fila sin importe (p.ej. saldo inicial)

    const descripcion = aTexto(get(vals, cols.desc))
    const asunto = aTexto(get(vals, cols.asunto)) || null
    const numero_doc = aTexto(get(vals, cols.doc)) || null

    movimientos.push({
      fecha,
      descripcion,
      numero_doc,
      asunto,
      dependencia: null,
      debito,
      credito,
      hash_unico: hashMovimiento(fecha, numero_doc, debito, credito),
      raw: `fila ${r}`,
    })
  }

  if (movimientos.length === 0 && errores.length === 0) {
    errores.push('Se reconocieron las columnas pero no se encontraron filas de movimientos con fecha e importe.')
  }

  return { movimientos, errores }
}
