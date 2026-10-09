/**
 * Parser de extractos bancarios en Excel para la conciliacion.
 * Usa SheetJS (xlsx), que lee tanto .xlsx (OOXML) como .xls (BIFF/Excel 97-2003),
 * que es el formato que exportan varios homebanking uruguayos.
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
import type * as XLSXType from 'xlsx'
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

function aTexto(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

// Convierte una celda de fecha (Date, serial de Excel o texto DD/MM/AAAA) a YYYY-MM-DD.
function aFechaISO(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) {
    // SheetJS con cellDates arma la fecha en hora local: usamos getters locales.
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof v === 'number') {
    // Serial de Excel (dias desde 1899-12-30).
    const ms = Math.round((v - 25569) * 86400 * 1000)
    const dt = new Date(ms)
    if (!isNaN(dt.getTime())) {
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
    }
  }
  const s = String(v).trim()
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
  if (v == null || v === '') return 0
  if (typeof v === 'number') return v
  let s = String(v).replace(/[^\d.,-]/g, '').trim()
  if (!s || s === '-') return 0
  const tieneComa = s.includes(',')
  const tienePunto = s.includes('.')
  if (tieneComa && tienePunto) {
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

function buscarEncabezado(filas: unknown[][]): { fila: number; cols: MapaColumnas } | null {
  const maxFila = Math.min(25, filas.length)
  for (let r = 0; r < maxFila; r++) {
    const fila = filas[r] ?? []
    const h = Array.from({ length: fila.length }, (_, i) => norm(fila[i]))
    const fecha = h.findIndex((x) => x === 'fecha' || x.includes('fecha'))
    if (fecha < 0) continue

    const debito = h.findIndex((x) => x.includes('debito') || x.includes('debe') || x === 'egreso' || x === 'egresos' || x.includes('retiro'))
    const credito = h.findIndex((x) => x.includes('credito') || x.includes('haber') || x === 'ingreso' || x === 'ingresos' || x.includes('deposito'))
    const importe = h.findIndex((x) => x === 'importe' || x === 'monto' || x.includes('importe'))
    if (debito < 0 && credito < 0 && importe < 0) continue // esta fila no es el encabezado

    const desc = h.findIndex((x) => x.includes('descrip') || x.includes('detalle') || x.includes('concepto') || x.includes('movimiento'))
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

  // Carga diferida de SheetJS (solo cuando se importa un Excel) para no inflar el bundle principal.
  const XLSX = await import('xlsx')
  let wb: XLSXType.WorkBook
  try {
    wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true })
  } catch (e) {
    return { movimientos, errores: [`No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}`] }
  }

  // Primera hoja con datos.
  const nombreHoja = wb.SheetNames.find((n) => wb.Sheets[n] && wb.Sheets[n]['!ref']) ?? wb.SheetNames[0]
  const ws = nombreHoja ? wb.Sheets[nombreHoja] : null
  if (!ws) return { movimientos, errores: ['El archivo no tiene hojas con datos.'] }

  const filas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, blankrows: false })

  const enc = buscarEncabezado(filas)
  if (!enc) {
    return {
      movimientos,
      errores: [
        'No se reconocieron las columnas. El archivo debe tener una fila de encabezados con al menos "Fecha" y columnas de "Débito"/"Crédito" o "Importe".',
      ],
    }
  }

  const { cols } = enc
  const get = (fila: unknown[], idx: number): unknown => (idx >= 0 ? fila[idx] : null)

  for (let r = enc.fila + 1; r < filas.length; r++) {
    const fila = filas[r] ?? []
    if (fila.length === 0) continue

    const fecha = aFechaISO(get(fila, cols.fecha))

    let debito = 0
    let credito = 0
    if (cols.debito >= 0 || cols.credito >= 0) {
      debito = Math.abs(aNumero(get(fila, cols.debito)))
      credito = Math.abs(aNumero(get(fila, cols.credito)))
    } else if (cols.importe >= 0) {
      const imp = aNumero(get(fila, cols.importe))
      if (imp < 0) debito = Math.abs(imp)
      else credito = imp
    }

    if (!fecha) {
      if (debito > 0 || credito > 0) {
        const d = aTexto(get(fila, cols.desc)) || aTexto(get(fila, cols.asunto))
        errores.push(`Fila ${r + 1} sin fecha valida${d ? `: "${d.slice(0, 50)}"` : ''}`)
      }
      continue
    }
    if (debito === 0 && credito === 0) continue // fila sin importe (p.ej. saldo inicial)

    const descripcion = aTexto(get(fila, cols.desc))
    const asunto = aTexto(get(fila, cols.asunto)) || null
    const numero_doc = aTexto(get(fila, cols.doc)) || null

    movimientos.push({
      fecha,
      descripcion,
      numero_doc,
      asunto,
      dependencia: null,
      debito,
      credito,
      hash_unico: hashMovimiento(fecha, numero_doc, debito, credito),
      raw: `fila ${r + 1}`,
    })
  }

  if (movimientos.length === 0 && errores.length === 0) {
    errores.push('Se reconocieron las columnas pero no se encontraron filas de movimientos con fecha e importe.')
  }

  return { movimientos, errores }
}
