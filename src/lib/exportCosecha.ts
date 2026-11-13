// ---------------------------------------------------------------------------
// Export de Cosecha a Excel (ExcelJS). Dos descargas:
//   1) Ano completo "estilo 2026": resumen + liquidacion + rendimiento + grilla
//      de cargas por operario + pasajes a tanque, del ano seleccionado.
//   2) Historial comparativo: todos los anos (kg total, por variedad, litros, rend).
// ExcelJS se importa dinamico para no engordar el chunk de Campo: solo se baja
// cuando el usuario toca "Descargar".
// ---------------------------------------------------------------------------
import type { CosechaCarga, CosechaCargaOperario, CosechaOperario, CosechaProceso } from './types'

const VERDE = 'FF2F3D2A'        // titulo de seccion (texto blanco)
const VERDE_MED = 'FF5A6E4A'    // encabezado de tabla (texto blanco)
const VERDE_SUAVE = 'FFEFF3E8'  // fila total / resaltado
const KG_POR_LITRO = 0.918

const FMT_KG = '#,##0'
const FMT_PCT = '0.0"%"'
const FMT_PRECIO = '#,##0.00'

function aceiteKgDe(p: CosechaProceso): number {
  return p.kg_aceite ?? (p.litros != null ? p.litros * KG_POR_LITRO : 0)
}

type WS = import('exceljs').Worksheet
type Row = import('exceljs').Row

// Titulo de seccion a todo el ancho, fondo verde oscuro.
function tituloSeccion(ws: WS, texto: string, ncols: number): Row {
  const row = ws.addRow([texto])
  ws.mergeCells(row.number, 1, row.number, Math.max(1, ncols))
  const c = row.getCell(1)
  c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }
  c.alignment = { vertical: 'middle' }
  row.height = 20
  return row
}

// Encabezado de tabla, fondo verde medio.
function encabezado(ws: WS, headers: string[]): Row {
  const row = ws.addRow(headers)
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_MED } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.border = { bottom: { style: 'thin', color: { argb: VERDE_MED } } }
  })
  return row
}

function descargar(buf: ArrayBuffer, nombre: string) {
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------------------------------------------------------------------------
// 1) Ano completo "estilo 2026"
// ---------------------------------------------------------------------------
export interface AnioExport {
  anio: number
  cargas: CosechaCarga[]
  opsPorCarga: Map<number, CosechaCargaOperario[]>
  operarios: CosechaOperario[]
  procesos: CosechaProceso[]
  liquidacion: { nombre: string; bruto: number; descuento: number; pagable: number }[]
  precioKg: number | null
  totKgCosecha: number
  totLitros: number
  totAceite: number
  rendTotal: number
  kgPorSector: [string, number][]
  rendPorVariedad: { variedad: string; kg: number; litros: number; aceite: number; rend: number }[]
}

export async function descargarCosechaAnio(d: AnioExport) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sierras de Aigua'
  wb.created = new Date()

  // --- Hoja Resumen ---------------------------------------------------------
  const res = wb.addWorksheet(`Resumen ${d.anio}`)
  tituloSeccion(res, `Cosecha ${d.anio}`, 5)
  res.addRow([])

  encabezado(res, ['Indicador', 'Valor'])
  const tiles: [string, number, string][] = [
    ['Kg cosechados', d.totKgCosecha, FMT_KG],
    ['Litros de aceite', d.totLitros, FMT_KG],
    ['Kg de aceite', d.totAceite, FMT_KG],
    ['Rendimiento', d.rendTotal, FMT_PCT],
  ]
  for (const [k, v, fmt] of tiles) {
    const r = res.addRow([k, v])
    r.getCell(2).numFmt = fmt
    r.getCell(2).alignment = { horizontal: 'right' }
  }
  res.addRow([])

  // Liquidacion por operario
  const conPrecio = d.precioKg != null
  tituloSeccion(res, 'Liquidacion por operario (destajo)', conPrecio ? 5 : 4)
  const headLiq = ['Operario', 'Kg brutos', 'Desc. hojas', 'Kg a pagar']
  if (conPrecio) headLiq.push('$ a pagar')
  encabezado(res, headLiq)
  let tBruto = 0, tDesc = 0, tPag = 0
  for (const f of d.liquidacion) {
    tBruto += f.bruto; tDesc += f.descuento; tPag += f.pagable
    const fila = [f.nombre, f.bruto, f.descuento, f.pagable]
    if (conPrecio) fila.push(f.pagable * (d.precioKg as number))
    const r = res.addRow(fila)
    for (let i = 2; i <= fila.length; i++) {
      r.getCell(i).numFmt = i === 5 ? FMT_KG : FMT_KG
      r.getCell(i).alignment = { horizontal: 'right' }
    }
  }
  const filaTot = ['TOTAL', tBruto, tDesc, tPag]
  if (conPrecio) filaTot.push(tPag * (d.precioKg as number))
  const rt = res.addRow(filaTot)
  rt.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_SUAVE } } })
  for (let i = 2; i <= filaTot.length; i++) { rt.getCell(i).numFmt = FMT_KG; rt.getCell(i).alignment = { horizontal: 'right' } }
  if (conPrecio) {
    res.addRow([])
    const rp = res.addRow(['Precio por kg', d.precioKg])
    rp.getCell(2).numFmt = FMT_PRECIO
    rp.getCell(2).alignment = { horizontal: 'right' }
  }
  res.addRow([])

  // Rendimiento por variedad
  tituloSeccion(res, 'Rendimiento por variedad (aceite / cosecha)', 5)
  encabezado(res, ['Variedad', 'Kg cosechados', 'Litros', 'Kg aceite', 'Rend. %'])
  for (const r of d.rendPorVariedad) {
    const fila = res.addRow([r.variedad, r.kg, r.litros, r.aceite, r.rend])
    fila.getCell(2).numFmt = FMT_KG; fila.getCell(3).numFmt = FMT_KG
    fila.getCell(4).numFmt = FMT_KG; fila.getCell(5).numFmt = FMT_PCT
    for (let i = 2; i <= 5; i++) fila.getCell(i).alignment = { horizontal: 'right' }
  }
  res.addRow([])

  // Kg por sector
  tituloSeccion(res, 'Kg por sector', 2)
  encabezado(res, ['Sector', 'Kg'])
  for (const [s, v] of d.kgPorSector) {
    const r = res.addRow([s, v])
    r.getCell(2).numFmt = FMT_KG; r.getCell(2).alignment = { horizontal: 'right' }
  }
  res.getColumn(1).width = 34
  res.getColumn(2).width = 15
  for (let i = 3; i <= 5; i++) res.getColumn(i).width = 14

  // --- Hoja Cargas (grilla por operario) ------------------------------------
  // Operarios que aparecen en las cargas del ano, en el orden del catalogo.
  const idsPresentes = new Set<number>()
  for (const c of d.cargas) for (const l of d.opsPorCarga.get(c.id) ?? []) if (l.operario_id != null) idsPresentes.add(l.operario_id)
  const opsCol = d.operarios.filter((o) => idsPresentes.has(o.id))

  const cg = wb.addWorksheet('Cargas')
  const ncolsCg = 3 + opsCol.length + 2
  tituloSeccion(cg, `Cargas por operario ${d.anio}`, ncolsCg)
  const headCg = ['Fecha', 'Sector', 'Variedad', ...opsCol.map((o) => o.nombre), 'Balanza (kg)', 'Hojas (kg)']
  encabezado(cg, headCg)

  const sumCol = new Array(opsCol.length).fill(0)
  let sumBal = 0, sumHoj = 0
  for (const c of d.cargas) {
    const porOp = new Map<number, number>()
    for (const l of d.opsPorCarga.get(c.id) ?? []) if (l.operario_id != null) porOp.set(l.operario_id, (porOp.get(l.operario_id) ?? 0) + (l.kg || 0))
    const kgs = opsCol.map((o) => porOp.get(o.id) ?? 0)
    kgs.forEach((k, i) => { sumCol[i] += k })
    sumBal += c.kg_balanza || 0
    sumHoj += c.kg_hojas || 0
    const fila = cg.addRow([c.fecha.slice(0, 10), c.sector ?? '', c.variedad, ...kgs, c.kg_balanza || 0, c.kg_hojas ?? null])
    for (let i = 4; i <= ncolsCg; i++) { fila.getCell(i).numFmt = FMT_KG; fila.getCell(i).alignment = { horizontal: 'right' } }
  }
  const rtot = cg.addRow(['TOTAL', '', '', ...sumCol, sumBal, sumHoj])
  rtot.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_SUAVE } } })
  for (let i = 4; i <= ncolsCg; i++) { rtot.getCell(i).numFmt = FMT_KG; rtot.getCell(i).alignment = { horizontal: 'right' } }
  cg.getColumn(1).width = 12; cg.getColumn(2).width = 9; cg.getColumn(3).width = 12
  for (let i = 4; i <= ncolsCg; i++) cg.getColumn(i).width = 12
  cg.views = [{ state: 'frozen', ySplit: 2 }]

  // --- Hoja Pasajes a tanque ------------------------------------------------
  const pt = wb.addWorksheet('Pasajes a tanque')
  tituloSeccion(pt, `Pasajes a tanque ${d.anio}`, 5)
  encabezado(pt, ['Fecha', 'Variedad', 'Litros', 'Kg aceite', 'Tanque'])
  for (const p of d.procesos) {
    const fila = pt.addRow([p.fecha.slice(0, 10), p.variedad, p.litros ?? null, aceiteKgDe(p) || null, p.destino ?? ''])
    fila.getCell(3).numFmt = FMT_KG; fila.getCell(4).numFmt = FMT_KG
    fila.getCell(3).alignment = { horizontal: 'right' }; fila.getCell(4).alignment = { horizontal: 'right' }
  }
  pt.getColumn(1).width = 12; pt.getColumn(2).width = 12; pt.getColumn(3).width = 12
  pt.getColumn(4).width = 12; pt.getColumn(5).width = 12
  pt.views = [{ state: 'frozen', ySplit: 2 }]

  const buf = await wb.xlsx.writeBuffer()
  descargar(buf as ArrayBuffer, `cosecha-${d.anio}.xlsx`)
}

// ---------------------------------------------------------------------------
// 2) Historial comparativo
// ---------------------------------------------------------------------------
export interface HistFila { anio: number; total: number; porVar: Map<string, number>; litros: number | null; rend: number | null }

export async function descargarCosechaHistorial(historial: HistFila[], variedades: string[]) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sierras de Aigua'
  wb.created = new Date()

  const ws = wb.addWorksheet('Historial')
  const ncols = 2 + variedades.length + 2
  tituloSeccion(ws, 'Historial de cosechas', ncols)
  encabezado(ws, ['Ano', 'Total kg', ...variedades, 'Litros', 'Rend. %'])

  const ordenado = [...historial].sort((a, b) => a.anio - b.anio)
  for (const h of ordenado) {
    const fila = ws.addRow([
      h.anio,
      h.total || null,
      ...variedades.map((v) => h.porVar.get(v) ?? null),
      h.litros,
      h.rend,
    ])
    fila.getCell(1).alignment = { horizontal: 'left' }
    for (let i = 2; i <= ncols; i++) {
      fila.getCell(i).numFmt = i === ncols ? FMT_PCT : FMT_KG
      fila.getCell(i).alignment = { horizontal: 'right' }
    }
  }
  ws.getColumn(1).width = 10
  for (let i = 2; i <= ncols; i++) ws.getColumn(i).width = 13
  ws.views = [{ state: 'frozen', ySplit: 2 }]

  const buf = await wb.xlsx.writeBuffer()
  descargar(buf as ArrayBuffer, 'historial-cosechas.xlsx')
}
