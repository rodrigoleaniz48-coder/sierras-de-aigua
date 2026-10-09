import ExcelJS from 'exceljs'
import { supabase } from './supabase'

// Datasets que el usuario puede elegir al descargar.
export type BackupDataset = 'ventas' | 'gastos' | 'ingresos' | 'pagos' | 'movimientos' | 'clientes' | 'ctacte' | 'stock' | 'tareas'
export const BACKUP_DATASETS: { key: BackupDataset; label: string; grupo: 'mes' | 'foto' }[] = [
  { key: 'ventas', label: 'Ventas', grupo: 'mes' },
  { key: 'gastos', label: 'Gastos', grupo: 'mes' },
  { key: 'ingresos', label: 'Ingresos', grupo: 'mes' },
  { key: 'pagos', label: 'Pagos a cuenta', grupo: 'mes' },
  { key: 'movimientos', label: 'Movimientos bancarios', grupo: 'mes' },
  { key: 'clientes', label: 'Clientes', grupo: 'foto' },
  { key: 'ctacte', label: 'Cuentas corrientes', grupo: 'foto' },
  { key: 'stock', label: 'Stock actual', grupo: 'foto' },
  { key: 'tareas', label: 'Tareas', grupo: 'foto' },
]

interface ColSpec { header: string; key: string; width?: number }
interface Seccion { titulo: string; cols: ColSpec[]; rows: Record<string, unknown>[] }

const VERDE = 'FF2F3D2A'
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre']

function mesKey(fecha: string | null | undefined): string | null {
  if (!fecha || fecha.length < 7) return null
  return fecha.slice(0, 7) // YYYY-MM
}
function mesLabel(k: string): string {
  const [y, m] = k.split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}

// Hoja "foto" (una sola tabla): Clientes, Stock, etc.
function addSheet(wb: ExcelJS.Workbook, nombre: string, rows: Record<string, unknown>[], cols: ColSpec[]) {
  const ws = wb.addWorksheet(nombre.slice(0, 31))
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 15 }))
  const head = ws.getRow(1)
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }
  head.height = 22
  head.alignment = { vertical: 'middle', horizontal: 'left' }
  for (const r of rows) ws.addRow(r)
  if (cols.length > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

// Hoja de mes: varias secciones (tablas) apiladas.
function addSheetMes(wb: ExcelJS.Workbook, nombre: string, secciones: Seccion[]) {
  const conDatos = secciones.filter((s) => s.rows.length > 0)
  if (conDatos.length === 0) return
  const ws = wb.addWorksheet(nombre.slice(0, 31))
  // Ancho por columna = máx entre todas las secciones.
  const widths: number[] = []
  for (const s of conDatos) s.cols.forEach((c, i) => { widths[i] = Math.max(widths[i] ?? 10, c.width ?? 14) })
  ws.columns = widths.map((w) => ({ width: w }))

  let r = 1
  for (const s of conDatos) {
    const titulo = ws.getRow(r)
    const tc = titulo.getCell(1)
    tc.value = `${s.titulo}  (${s.rows.length})`
    tc.font = { bold: true, size: 12, color: { argb: VERDE } }
    r++
    const hdr = ws.getRow(r)
    s.cols.forEach((c, i) => {
      const cell = hdr.getCell(i + 1)
      cell.value = c.header
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }
    })
    r++
    for (const row of s.rows) {
      const dr = ws.getRow(r)
      s.cols.forEach((c, i) => { dr.getCell(i + 1).value = (row[c.key] ?? null) as ExcelJS.CellValue })
      r++
    }
    r += 2 // dos filas en blanco entre secciones
  }
}

/**
 * Genera un .xlsx. Lo transaccional (ventas, gastos, ingresos, pagos, movimientos)
 * va en una pestaña por mes, con una sección por tipo. Clientes, cuentas corrientes,
 * stock y tareas van en pestañas "foto" (estado actual). Se incluye solo lo seleccionado.
 */
export async function generarBackupExcel(datasets: Set<BackupDataset>): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sierras de Aiguá'
  wb.created = new Date()

  const quiere = (d: BackupDataset) => datasets.has(d)

  // Lookups
  const [perfilesR, ubicacionesR, cuentasR, clientesR, categoriasGR, categoriasIR, presR, prodR] = await Promise.all([
    supabase.from('perfiles').select('id,nombre'),
    supabase.from('ubicaciones').select('id,nombre'),
    supabase.from('cuentas_bancarias').select('id,nombre'),
    supabase.from('clientes').select('id,nombre'),
    supabase.from('categorias_gasto').select('slug,nombre'),
    supabase.from('categorias_ingreso').select('id,nombre'),
    supabase.from('presentaciones').select('id,nombre,producto_id'),
    supabase.from('productos').select('id,nombre'),
  ])
  const perfNombre = new Map((perfilesR.data ?? []).map((x) => [x.id, x.nombre]))
  const ubicNombre = new Map((ubicacionesR.data ?? []).map((x) => [x.id, x.nombre]))
  const cuentaNombre = new Map((cuentasR.data ?? []).map((x) => [x.id, x.nombre]))
  const cliNombre = new Map((clientesR.data ?? []).map((x) => [x.id, x.nombre]))
  const catGNombre = new Map((categoriasGR.data ?? []).map((x) => [x.slug, x.nombre]))
  const catINombre = new Map((categoriasIR.data ?? []).map((x) => [x.id, x.nombre]))
  const presMap = new Map((presR.data ?? []).map((x) => [x.id, x]))
  const prodNombre = new Map((prodR.data ?? []).map((x) => [x.id, x.nombre]))

  // --- Traer datos transaccionales seleccionados ---
  const [ventasR, gastosR, ingresosR, pagosR, movsR] = await Promise.all([
    quiere('ventas') ? supabase.from('ventas').select('*').order('fecha', { ascending: false }).order('id', { ascending: false }) : Promise.resolve({ data: [] }),
    quiere('gastos') ? supabase.from('gastos').select('*').order('fecha', { ascending: false }).order('id', { ascending: false }) : Promise.resolve({ data: [] }),
    quiere('ingresos') ? supabase.from('ingresos').select('*').order('fecha', { ascending: false }) : Promise.resolve({ data: [] }),
    quiere('pagos') ? supabase.from('pagos').select('*').order('fecha', { ascending: false }) : Promise.resolve({ data: [] }),
    quiere('movimientos') ? supabase.from('movimientos_bancarios').select('*').order('fecha', { ascending: false }) : Promise.resolve({ data: [] }),
  ])
  const ventas = (ventasR.data ?? []) as Record<string, any>[]
  const gastos = (gastosR.data ?? []) as Record<string, any>[]
  const ingresos = (ingresosR.data ?? []) as Record<string, any>[]
  const pagos = (pagosR.data ?? []) as Record<string, any>[]
  const movs = (movsR.data ?? []) as Record<string, any>[]

  // --- Columnas de cada sección ---
  const colsVentas: ColSpec[] = [
    { header: 'ID', key: 'id', width: 6 }, { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Cliente', key: 'cliente', width: 28 }, { header: 'Socio', key: 'socio', width: 12 },
    { header: 'Ubicación', key: 'ubicacion', width: 12 }, { header: 'Estado', key: 'estado', width: 12 },
    { header: 'Forma pago', key: 'forma_pago', width: 13 }, { header: 'Con factura', key: 'con_factura', width: 11 },
    { header: 'Entregado', key: 'entregado', width: 10 }, { header: 'Cobrado', key: 'cobrado', width: 9 },
    { header: 'Promo', key: 'promo', width: 8 }, { header: 'Moneda', key: 'moneda', width: 8 },
    { header: 'Cotización', key: 'cotizacion', width: 10 }, { header: 'Total UYU', key: 'total', width: 12 },
    { header: 'IVA UYU', key: 'iva', width: 10 }, { header: 'Notas', key: 'notas', width: 28 },
  ]
  const mapVenta = (v: Record<string, any>) => ({
    id: v.id, fecha: v.fecha, cliente: v.cliente_id ? cliNombre.get(v.cliente_id) ?? '—' : '—',
    socio: perfNombre.get(v.socio_id) ?? '—', ubicacion: ubicNombre.get(v.ubicacion_id) ?? '—',
    estado: v.estado, forma_pago: v.forma_pago, con_factura: v.con_factura, entregado: v.entregado,
    cobrado: v.cobrado, promo: v.promocion_comercial, moneda: v.moneda, cotizacion: v.cotizacion,
    total: Number(v.total), iva: Number(v.iva), notas: v.notas,
  })

  const colsGastos: ColSpec[] = [
    { header: 'ID', key: 'id', width: 6 }, { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Socio', key: 'socio', width: 12 }, { header: 'Categoría', key: 'categoria', width: 22 },
    { header: 'Monto', key: 'monto', width: 12 }, { header: 'Moneda', key: 'moneda', width: 8 },
    { header: 'Método pago', key: 'metodo_pago', width: 13 }, { header: 'Cuenta', key: 'cuenta', width: 18 },
    { header: 'Reembolsable', key: 'reembolsable', width: 11 }, { header: 'Reembolsado', key: 'reembolsado', width: 11 },
    { header: 'Adelanto', key: 'es_adelanto', width: 9 }, { header: 'Descripción', key: 'descripcion', width: 40 },
  ]
  const mapGasto = (g: Record<string, any>) => ({
    id: g.id, fecha: g.fecha, socio: perfNombre.get(g.socio_id) ?? '—',
    categoria: catGNombre.get(g.categoria) ?? g.categoria, monto: Number(g.monto), moneda: g.moneda,
    metodo_pago: g.metodo_pago, cuenta: g.cuenta_id ? cuentaNombre.get(g.cuenta_id) ?? '—' : '',
    reembolsable: g.reembolsable, reembolsado: g.reembolsado, es_adelanto: g.es_adelanto, descripcion: g.descripcion,
  })

  const colsIngresos: ColSpec[] = [
    { header: 'ID', key: 'id', width: 6 }, { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Socio', key: 'socio', width: 12 }, { header: 'Categoría', key: 'categoria', width: 24 },
    { header: 'Monto', key: 'monto', width: 12 }, { header: 'Moneda', key: 'moneda', width: 8 },
    { header: 'Descripción', key: 'descripcion', width: 40 },
  ]
  const mapIngreso = (i: Record<string, any>) => ({
    id: i.id, fecha: i.fecha, socio: perfNombre.get(i.socio_id) ?? '—',
    categoria: i.categoria_id ? catINombre.get(i.categoria_id) ?? '—' : '—',
    monto: Number(i.monto), moneda: i.moneda, descripcion: i.descripcion,
  })

  const colsPagos: ColSpec[] = [
    { header: 'ID', key: 'id', width: 6 }, { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Cliente', key: 'cliente', width: 28 }, { header: 'Monto', key: 'monto', width: 12 },
    { header: 'Moneda', key: 'moneda', width: 8 }, { header: 'Medio', key: 'medio_pago', width: 14 },
    { header: 'Cuenta', key: 'cuenta', width: 18 }, { header: 'Nota', key: 'nota', width: 40 },
  ]
  const mapPago = (p: Record<string, any>) => ({
    id: p.id, fecha: p.fecha, cliente: p.cliente_id ? cliNombre.get(p.cliente_id) ?? '—' : '—',
    monto: Number(p.monto), moneda: p.moneda, medio_pago: p.medio_pago,
    cuenta: p.cuenta_id ? cuentaNombre.get(p.cuenta_id) ?? '—' : '', nota: p.nota,
  })

  const colsMovs: ColSpec[] = [
    { header: 'ID', key: 'id', width: 6 }, { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Cuenta', key: 'cuenta', width: 18 }, { header: 'Descripción', key: 'descripcion', width: 38 },
    { header: 'Débito', key: 'debito', width: 12 }, { header: 'Crédito', key: 'credito', width: 12 },
    { header: 'Conciliado', key: 'conc', width: 22 }, { header: 'Interna', key: 'interna', width: 9 },
  ]
  const mapMov = (m: Record<string, any>) => ({
    id: m.id, fecha: m.fecha, cuenta: cuentaNombre.get(m.cuenta_id) ?? '', descripcion: m.descripcion,
    debito: Number(m.debito), credito: Number(m.credito),
    conc: m.conciliado_gasto_id ? `Gasto #${m.conciliado_gasto_id}` : m.conciliado_venta_id ? `Venta #${m.conciliado_venta_id}` : m.conciliado_ingreso_id ? `Ingreso #${m.conciliado_ingreso_id}` : m.conciliado_pago_id ? `Pago #${m.conciliado_pago_id}` : m.es_transferencia_interna ? 'Interna' : 'Sin conciliar',
    interna: m.es_transferencia_interna,
  })

  // --- Armar pestañas por mes ---
  const mesesSet = new Set<string>()
  for (const v of ventas) { const k = mesKey(v.fecha); if (k) mesesSet.add(k) }
  for (const g of gastos) { const k = mesKey(g.fecha); if (k) mesesSet.add(k) }
  for (const i of ingresos) { const k = mesKey(i.fecha); if (k) mesesSet.add(k) }
  for (const p of pagos) { const k = mesKey(p.fecha); if (k) mesesSet.add(k) }
  for (const m of movs) { const k = mesKey(m.fecha); if (k) mesesSet.add(k) }
  const meses = [...mesesSet].sort().reverse() // más reciente primero

  for (const k of meses) {
    const secciones: Seccion[] = []
    if (quiere('ventas')) secciones.push({ titulo: 'VENTAS', cols: colsVentas, rows: ventas.filter((v) => mesKey(v.fecha) === k).map(mapVenta) })
    if (quiere('gastos')) secciones.push({ titulo: 'GASTOS', cols: colsGastos, rows: gastos.filter((g) => mesKey(g.fecha) === k).map(mapGasto) })
    if (quiere('ingresos')) secciones.push({ titulo: 'INGRESOS', cols: colsIngresos, rows: ingresos.filter((i) => mesKey(i.fecha) === k).map(mapIngreso) })
    if (quiere('pagos')) secciones.push({ titulo: 'PAGOS A CUENTA', cols: colsPagos, rows: pagos.filter((p) => mesKey(p.fecha) === k).map(mapPago) })
    if (quiere('movimientos')) secciones.push({ titulo: 'MOVIMIENTOS BANCARIOS', cols: colsMovs, rows: movs.filter((m) => mesKey(m.fecha) === k).map(mapMov) })
    addSheetMes(wb, mesLabel(k), secciones)
  }

  // --- Hojas "foto" ---
  if (quiere('clientes')) {
    const { data: clientes } = await supabase.from('clientes').select('*').order('nombre')
    addSheet(wb, 'Clientes', (clientes ?? []).map((c: Record<string, any>) => ({
      id: c.id, nombre: c.nombre, tipo: c.tipo, telefono: c.telefono, whatsapp: c.whatsapp, email: c.email,
      direccion: c.direccion, localidad: c.localidad, rut: c.rut, condiciones_pago: c.condiciones_pago,
      socio_asignado: c.socio_asignado ? perfNombre.get(c.socio_asignado) ?? '' : '', notas: c.notas, origen: c.origen,
    })), [
      { header: 'ID', key: 'id', width: 6 }, { header: 'Nombre', key: 'nombre', width: 30 },
      { header: 'Tipo', key: 'tipo', width: 13 }, { header: 'Teléfono', key: 'telefono', width: 14 },
      { header: 'WhatsApp', key: 'whatsapp', width: 14 }, { header: 'Email', key: 'email', width: 25 },
      { header: 'Dirección', key: 'direccion', width: 35 }, { header: 'Localidad', key: 'localidad', width: 15 },
      { header: 'RUT', key: 'rut', width: 15 }, { header: 'Cond. pago', key: 'condiciones_pago', width: 14 },
      { header: 'Socio asignado', key: 'socio_asignado', width: 15 }, { header: 'Notas', key: 'notas', width: 30 },
      { header: 'Origen', key: 'origen', width: 12 },
    ])
  }

  if (quiere('ctacte')) {
    const { data: ccCl } = await supabase.from('clientes').select('id,nombre,tipo,saldo_inicial,saldo_inicial_usd,saldo_inicial_fecha').in('tipo', ['distribuidor', 'mayorista']).order('nombre')
    const cc = (ccCl ?? []) as Record<string, any>[]
    const ids = cc.map((c) => c.id)
    let ccVentas: Record<string, any>[] = []
    let ccPagos: Record<string, any>[] = []
    if (ids.length > 0) {
      const [vv, pp] = await Promise.all([
        supabase.from('ventas').select('cliente_id,fecha,total,moneda,cotizacion').in('cliente_id', ids).neq('estado', 'cancelado').eq('promocion_comercial', false).eq('a_confirmar', false),
        supabase.from('pagos').select('cliente_id,fecha,monto,moneda').in('cliente_id', ids),
      ])
      ccVentas = (vv.data ?? []) as Record<string, any>[]
      ccPagos = (pp.data ?? []) as Record<string, any>[]
    }
    const post = (c: Record<string, any>, fecha: string) => !c.saldo_inicial_fecha || fecha > c.saldo_inicial_fecha
    const vUSD = (v: Record<string, any>) => (v.moneda === 'USD' && Number(v.cotizacion) > 0) ? Number(v.total) / Number(v.cotizacion) : null
    const rows = cc.map((c) => {
      let vU = 0, vD = 0, pU = 0, pD = 0
      for (const v of ccVentas) { if (v.cliente_id !== c.id || !post(c, v.fecha)) continue; const u = vUSD(v); if (u != null) vD += u; else vU += Number(v.total) }
      for (const p of ccPagos) { if (p.cliente_id !== c.id || !post(c, p.fecha)) continue; if (p.moneda === 'USD') pD += Number(p.monto); else pU += Number(p.monto) }
      const iniU = Number(c.saldo_inicial ?? 0), iniD = Number(c.saldo_inicial_usd ?? 0)
      return {
        cliente: c.nombre, tipo: c.tipo, corte: c.saldo_inicial_fecha ?? '',
        ini_uyu: iniU, ini_usd: iniD, ventas_uyu: vU, ventas_usd: vD, pagos_uyu: pU, pagos_usd: pD,
        saldo_uyu: iniU + vU - pU, saldo_usd: iniD + vD - pD,
      }
    }).filter((r) => r.saldo_uyu !== 0 || r.saldo_usd !== 0 || r.ventas_uyu > 0 || r.ventas_usd > 0 || r.pagos_uyu > 0 || r.pagos_usd > 0)
    addSheet(wb, 'Cuentas corrientes', rows, [
      { header: 'Cliente', key: 'cliente', width: 28 }, { header: 'Tipo', key: 'tipo', width: 12 },
      { header: 'Corte', key: 'corte', width: 12 },
      { header: 'Inicial UYU', key: 'ini_uyu', width: 12 }, { header: 'Inicial USD', key: 'ini_usd', width: 12 },
      { header: 'Ventas UYU', key: 'ventas_uyu', width: 12 }, { header: 'Ventas USD', key: 'ventas_usd', width: 12 },
      { header: 'Pagos UYU', key: 'pagos_uyu', width: 12 }, { header: 'Pagos USD', key: 'pagos_usd', width: 12 },
      { header: 'Saldo UYU', key: 'saldo_uyu', width: 13 }, { header: 'Saldo USD', key: 'saldo_usd', width: 13 },
    ])
  }

  if (quiere('stock')) {
    const { data: stock } = await supabase.from('stock').select('*')
    addSheet(wb, 'Stock actual', (stock ?? []).map((s: Record<string, any>) => {
      const p = presMap.get(s.presentacion_id)
      return {
        producto: p ? prodNombre.get(p.producto_id) ?? '' : '', presentacion: p?.nombre ?? '',
        ubicacion: ubicNombre.get(s.ubicacion_id) ?? '', unidades: Number(s.unidades),
      }
    }).sort((a, b) => a.producto.localeCompare(b.producto) || a.presentacion.localeCompare(b.presentacion)), [
      { header: 'Producto', key: 'producto', width: 25 }, { header: 'Presentación', key: 'presentacion', width: 18 },
      { header: 'Ubicación', key: 'ubicacion', width: 15 }, { header: 'Unidades', key: 'unidades', width: 10 },
    ])
  }

  if (quiere('tareas')) {
    const { data: tareas } = await supabase.from('tareas').select('*').order('fecha_creada', { ascending: false })
    addSheet(wb, 'Tareas', (tareas ?? []).map((t: Record<string, any>) => ({
      id: t.id, titulo: t.titulo, prioridad: t.prioridad, estado: t.estado, tipo: t.tipo, jornales: Number(t.jornales),
      asignado: perfNombre.get(t.asignado_a) ?? '', fecha_creada: t.fecha_creada, fecha_vence: t.fecha_vence,
      fecha_completada: t.fecha_completada, notas: t.notas,
    })), [
      { header: 'ID', key: 'id', width: 6 }, { header: 'Título', key: 'titulo', width: 38 },
      { header: 'Prioridad', key: 'prioridad', width: 10 }, { header: 'Estado', key: 'estado', width: 12 },
      { header: 'Tipo', key: 'tipo', width: 10 }, { header: 'Jornales', key: 'jornales', width: 9 },
      { header: 'Asignado', key: 'asignado', width: 12 }, { header: 'Creada', key: 'fecha_creada', width: 20 },
      { header: 'Vence', key: 'fecha_vence', width: 12 }, { header: 'Completada', key: 'fecha_completada', width: 20 },
      { header: 'Notas', key: 'notas', width: 30 },
    ])
  }

  // Si no quedó ninguna hoja (p.ej. sin datos), agregar una vacía para que el archivo sea válido.
  if (wb.worksheets.length === 0) addSheet(wb, 'Backup', [], [{ header: 'Sin datos', key: 'x', width: 20 }])

  const buf = await wb.xlsx.writeBuffer()
  return buf as ArrayBuffer
}

export async function descargarBackupExcel(datasets: Set<BackupDataset>) {
  const buf = await generarBackupExcel(datasets)
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const hoy = new Date().toISOString().slice(0, 10)
  a.download = `backup-sierras-${hoy}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
