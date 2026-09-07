import ExcelJS from 'exceljs'
import { supabase } from './supabase'

interface ColSpec { header: string; key: string; width?: number }

function addSheet(wb: ExcelJS.Workbook, nombre: string, rows: Record<string, unknown>[], cols: ColSpec[]) {
  const ws = wb.addWorksheet(nombre.slice(0, 30))
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 15 }))
  const head = ws.getRow(1)
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F3D2A' } }
  head.height = 22
  head.alignment = { vertical: 'middle', horizontal: 'left' }
  for (const r of rows) ws.addRow(r)
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

/**
 * Genera un .xlsx con las 6 pestañas principales: Ventas, Gastos, Clientes, Tareas,
 * Movimientos bancarios, Stock actual. Todo lo que el usuario puede ver por RLS.
 * Devuelve el ArrayBuffer para descargar en el navegador.
 */
export async function generarBackupExcel(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sierras de Aiguá'
  wb.created = new Date()

  // Lookups
  const [perfilesR, ubicacionesR, cuentasR, clientesR, categoriasGR, presR, prodR] = await Promise.all([
    supabase.from('perfiles').select('id,nombre'),
    supabase.from('ubicaciones').select('id,nombre'),
    supabase.from('cuentas_bancarias').select('id,nombre'),
    supabase.from('clientes').select('id,nombre'),
    supabase.from('categorias_gasto').select('slug,nombre'),
    supabase.from('presentaciones').select('id,nombre,producto_id'),
    supabase.from('productos').select('id,nombre'),
  ])
  const perfNombre = new Map((perfilesR.data ?? []).map((x) => [x.id, x.nombre]))
  const ubicNombre = new Map((ubicacionesR.data ?? []).map((x) => [x.id, x.nombre]))
  const cuentaNombre = new Map((cuentasR.data ?? []).map((x) => [x.id, x.nombre]))
  const cliNombre = new Map((clientesR.data ?? []).map((x) => [x.id, x.nombre]))
  const catGNombre = new Map((categoriasGR.data ?? []).map((x) => [x.slug, x.nombre]))
  const presMap = new Map((presR.data ?? []).map((x) => [x.id, x]))
  const prodNombre = new Map((prodR.data ?? []).map((x) => [x.id, x.nombre]))

  // 1) Ventas
  const { data: ventas } = await supabase
    .from('ventas')
    .select('*')
    .order('fecha', { ascending: false }).order('id', { ascending: false })
  addSheet(wb, 'Ventas', (ventas ?? []).map((v) => ({
    id: v.id,
    fecha: v.fecha,
    cliente: v.cliente_id ? cliNombre.get(v.cliente_id) ?? '—' : '—',
    socio: perfNombre.get(v.socio_id) ?? '—',
    ubicacion: ubicNombre.get(v.ubicacion_id) ?? '—',
    canal: v.canal, forma_pago: v.forma_pago, estado: v.estado,
    con_factura: v.con_factura, envio: v.envio, entregado: v.entregado, cobrado: v.cobrado,
    moneda: v.moneda, cotizacion: v.cotizacion,
    subtotal: Number(v.subtotal), iva: Number(v.iva), total: Number(v.total),
    costo_envio: Number(v.costo_envio),
    notas: v.notas,
    cuenta_destino: v.cuenta_id ? cuentaNombre.get(v.cuenta_id) ?? '—' : '',
    creado_en: v.creado_en,
  })), [
    { header: 'ID', key: 'id', width: 6 },
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Cliente', key: 'cliente', width: 30 },
    { header: 'Socio', key: 'socio', width: 12 },
    { header: 'Ubicación', key: 'ubicacion', width: 14 },
    { header: 'Canal', key: 'canal', width: 12 },
    { header: 'Forma pago', key: 'forma_pago', width: 14 },
    { header: 'Estado', key: 'estado', width: 12 },
    { header: 'Con factura', key: 'con_factura', width: 12 },
    { header: 'Envío', key: 'envio', width: 8 },
    { header: 'Entregado', key: 'entregado', width: 10 },
    { header: 'Cobrado', key: 'cobrado', width: 10 },
    { header: 'Moneda', key: 'moneda', width: 8 },
    { header: 'Cotización', key: 'cotizacion', width: 10 },
    { header: 'Subtotal UYU', key: 'subtotal', width: 12 },
    { header: 'IVA UYU', key: 'iva', width: 10 },
    { header: 'Total UYU', key: 'total', width: 12 },
    { header: 'Costo envío', key: 'costo_envio', width: 12 },
    { header: 'Notas', key: 'notas', width: 30 },
    { header: 'Cuenta destino', key: 'cuenta_destino', width: 20 },
    { header: 'Creado', key: 'creado_en', width: 20 },
  ])

  // 2) Gastos
  const { data: gastos } = await supabase
    .from('gastos')
    .select('*')
    .order('fecha', { ascending: false }).order('id', { ascending: false })
  addSheet(wb, 'Gastos', (gastos ?? []).map((g) => ({
    id: g.id,
    fecha: g.fecha,
    socio: perfNombre.get(g.socio_id) ?? '—',
    categoria: catGNombre.get(g.categoria) ?? g.categoria,
    monto: Number(g.monto),
    moneda: g.moneda,
    metodo_pago: g.metodo_pago,
    cuenta_origen: g.cuenta_id ? cuentaNombre.get(g.cuenta_id) ?? '—' : '',
    reembolsable: g.reembolsable, reembolsado: g.reembolsado, es_adelanto: g.es_adelanto,
    descripcion: g.descripcion,
    creado_en: g.creado_en,
  })), [
    { header: 'ID', key: 'id', width: 6 },
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Socio', key: 'socio', width: 12 },
    { header: 'Categoría', key: 'categoria', width: 22 },
    { header: 'Monto', key: 'monto', width: 12 },
    { header: 'Moneda', key: 'moneda', width: 8 },
    { header: 'Método pago', key: 'metodo_pago', width: 14 },
    { header: 'Cuenta origen', key: 'cuenta_origen', width: 20 },
    { header: 'Reembolsable', key: 'reembolsable', width: 12 },
    { header: 'Reembolsado', key: 'reembolsado', width: 12 },
    { header: 'Adelanto', key: 'es_adelanto', width: 10 },
    { header: 'Descripción', key: 'descripcion', width: 40 },
    { header: 'Creado', key: 'creado_en', width: 20 },
  ])

  // 3) Clientes
  const { data: clientes } = await supabase.from('clientes').select('*').order('nombre')
  addSheet(wb, 'Clientes', (clientes ?? []).map((c) => ({
    id: c.id, nombre: c.nombre, tipo: c.tipo,
    telefono: c.telefono, whatsapp: c.whatsapp, email: c.email,
    direccion: c.direccion, localidad: c.localidad, rut: c.rut,
    condiciones_pago: c.condiciones_pago,
    socio_asignado: c.socio_asignado ? perfNombre.get(c.socio_asignado) ?? '' : '',
    notas: c.notas, origen: c.origen, actualizado_en: c.actualizado_en,
  })), [
    { header: 'ID', key: 'id', width: 6 },
    { header: 'Nombre', key: 'nombre', width: 30 },
    { header: 'Tipo', key: 'tipo', width: 14 },
    { header: 'Teléfono', key: 'telefono', width: 14 },
    { header: 'WhatsApp', key: 'whatsapp', width: 14 },
    { header: 'Email', key: 'email', width: 25 },
    { header: 'Dirección', key: 'direccion', width: 40 },
    { header: 'Localidad', key: 'localidad', width: 15 },
    { header: 'RUT', key: 'rut', width: 15 },
    { header: 'Cond. pago', key: 'condiciones_pago', width: 15 },
    { header: 'Socio asignado', key: 'socio_asignado', width: 15 },
    { header: 'Notas', key: 'notas', width: 30 },
    { header: 'Origen', key: 'origen', width: 12 },
    { header: 'Actualizado', key: 'actualizado_en', width: 20 },
  ])

  // 4) Tareas
  const { data: tareas } = await supabase.from('tareas').select('*').order('fecha_creada', { ascending: false })
  addSheet(wb, 'Tareas', (tareas ?? []).map((t) => ({
    id: t.id, titulo: t.titulo, descripcion: t.descripcion,
    prioridad: t.prioridad, estado: t.estado, tipo: t.tipo, jornales: Number(t.jornales),
    asignado: perfNombre.get(t.asignado_a) ?? '', creado_por: perfNombre.get(t.creado_por) ?? '',
    fecha_creada: t.fecha_creada, fecha_vence: t.fecha_vence,
    fecha_iniciada: t.fecha_iniciada, fecha_completada: t.fecha_completada,
    notas: t.notas,
  })), [
    { header: 'ID', key: 'id', width: 6 },
    { header: 'Título', key: 'titulo', width: 40 },
    { header: 'Descripción', key: 'descripcion', width: 30 },
    { header: 'Prioridad', key: 'prioridad', width: 10 },
    { header: 'Estado', key: 'estado', width: 12 },
    { header: 'Tipo', key: 'tipo', width: 10 },
    { header: 'Jornales', key: 'jornales', width: 10 },
    { header: 'Asignado', key: 'asignado', width: 12 },
    { header: 'Creado por', key: 'creado_por', width: 12 },
    { header: 'Creada', key: 'fecha_creada', width: 20 },
    { header: 'Vence', key: 'fecha_vence', width: 12 },
    { header: 'Iniciada', key: 'fecha_iniciada', width: 20 },
    { header: 'Completada', key: 'fecha_completada', width: 20 },
    { header: 'Notas', key: 'notas', width: 30 },
  ])

  // 5) Movimientos bancarios
  const { data: movs } = await supabase.from('movimientos_bancarios').select('*').order('fecha', { ascending: false })
  addSheet(wb, 'Movimientos bancarios', (movs ?? []).map((m) => ({
    id: m.id, fecha: m.fecha,
    cuenta: cuentaNombre.get(m.cuenta_id) ?? '',
    descripcion: m.descripcion,
    debito: Number(m.debito), credito: Number(m.credito), monto: Number(m.monto),
    saldo: m.saldo !== null ? Number(m.saldo) : null,
    conc_gasto: m.conciliado_gasto_id, conc_venta: m.conciliado_venta_id,
    categoria_manual: m.categoria_manual,
    transf_interna: m.es_transferencia_interna,
    nota: m.nota,
  })), [
    { header: 'ID', key: 'id', width: 6 },
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Cuenta', key: 'cuenta', width: 20 },
    { header: 'Descripción', key: 'descripcion', width: 40 },
    { header: 'Débito', key: 'debito', width: 12 },
    { header: 'Crédito', key: 'credito', width: 12 },
    { header: 'Monto', key: 'monto', width: 12 },
    { header: 'Saldo', key: 'saldo', width: 12 },
    { header: 'Conc. gasto', key: 'conc_gasto', width: 12 },
    { header: 'Conc. venta', key: 'conc_venta', width: 12 },
    { header: 'Categoría manual', key: 'categoria_manual', width: 20 },
    { header: 'Transf. interna', key: 'transf_interna', width: 14 },
    { header: 'Nota', key: 'nota', width: 30 },
  ])

  // 6) Stock actual
  const { data: stock } = await supabase.from('stock').select('*')
  addSheet(wb, 'Stock actual', (stock ?? []).map((s) => {
    const p = presMap.get(s.presentacion_id)
    return {
      id: s.id,
      producto: p ? prodNombre.get(p.producto_id) ?? '' : '',
      presentacion: p?.nombre ?? '',
      ubicacion: ubicNombre.get(s.ubicacion_id) ?? '',
      unidades: Number(s.unidades),
      actualizado_en: s.actualizado_en,
    }
  }).sort((a, b) => a.producto.localeCompare(b.producto) || a.presentacion.localeCompare(b.presentacion)), [
    { header: 'ID', key: 'id', width: 6 },
    { header: 'Producto', key: 'producto', width: 25 },
    { header: 'Presentación', key: 'presentacion', width: 18 },
    { header: 'Ubicación', key: 'ubicacion', width: 15 },
    { header: 'Unidades', key: 'unidades', width: 10 },
    { header: 'Actualizado', key: 'actualizado_en', width: 20 },
  ])

  const buf = await wb.xlsx.writeBuffer()
  return buf as ArrayBuffer
}

export async function descargarBackupExcel() {
  const buf = await generarBackupExcel()
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
