import { supabase } from './supabase'

export interface ReporteSemanal {
  semanaISO: string        // ej '2026-W34'
  desde: string            // 'YYYY-MM-DD' (lunes)
  hasta: string            // 'YYYY-MM-DD' (domingo)
  cantidadVentas: number
  totalFacturado: number
  ticketPromedio: number
  cantidadEnvios: number
  porSocio: Array<{ nombre: string; count: number; total: number }>
  topClientes: Array<{ nombre: string; count: number; total: number }>
  topPresentaciones: Array<{ label: string; unidades: number; total: number }>
  // Comparativo vs semana anterior
  totalSemanaAnterior: number
  ventasSemanaAnterior: number
  deltaPct: number         // % de variación de totalFacturado vs semana anterior
}

/** Devuelve las fechas [lunes, domingo] de la semana que contiene la fecha dada. */
export function rangoSemanal(fecha: Date): { desde: string; hasta: string; semanaISO: string } {
  const d = new Date(fecha)
  d.setHours(0, 0, 0, 0)
  const diaSemana = d.getDay() === 0 ? 7 : d.getDay() // domingo=7
  const lunes = new Date(d)
  lunes.setDate(d.getDate() - (diaSemana - 1))
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  const iso = (x: Date) => x.toISOString().slice(0, 10)
  return { desde: iso(lunes), hasta: iso(domingo), semanaISO: semanaISO(lunes) }
}

/** Formato "YYYY-Www" (ISO 8601 week). */
function semanaISO(d: Date): string {
  const target = new Date(d.valueOf())
  const dayNr = (d.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = target.valueOf()
  target.setMonth(0, 1)
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7)
  }
  const week = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000)
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Devuelve el reporte de la semana anterior a hoy. */
export async function generarReporteSemanaPasada(): Promise<ReporteSemanal> {
  const hoy = new Date()
  const semanaPasada = new Date(hoy)
  semanaPasada.setDate(hoy.getDate() - 7)
  const rango = rangoSemanal(semanaPasada)

  const anterior = new Date(semanaPasada)
  anterior.setDate(semanaPasada.getDate() - 7)
  const rangoAnt = rangoSemanal(anterior)

  // Traer datos vía RPC (SECURITY DEFINER) para que Ayelén / Gonzalo también vean el total de todos los socios
  const { data: rpcData, error: rpcErr } = await supabase.rpc('reporte_semanal_data', {
    p_desde: rangoAnt.desde,
    p_hasta: rango.hasta,
  })
  if (rpcErr) throw new Error('Error cargando reporte: ' + rpcErr.message)
  const dataAll = rpcData as {
    ventas: Array<{ id: number; fecha: string; cliente_id: number | null; socio_id: string; total: number; envio: boolean; estado: string; promocion_comercial?: boolean }>
    items: Array<{ venta_id: number; presentacion_id: number; unidades: number; subtotal: number }>
    clientes: Array<{ id: number; nombre: string }>
    perfiles: Array<{ id: string; nombre: string }>
    presentaciones: Array<{ id: number; nombre: string; producto_id: number }>
    productos: Array<{ id: number; nombre: string }>
  }
  const ventas = (dataAll.ventas ?? []).filter((v) => !v.promocion_comercial)
  const socios = new Map((dataAll.perfiles ?? []).map((s) => [s.id, s.nombre]))
  const clientes = new Map((dataAll.clientes ?? []).map((c) => [c.id, c.nombre]))
  const items = dataAll.items ?? []
  const pres = new Map((dataAll.presentaciones ?? []).map((p) => [p.id, p]))
  const prods = new Map((dataAll.productos ?? []).map((p) => [p.id, p.nombre]))

  const ventasSemana = ventas.filter((v) => v.fecha >= rango.desde && v.fecha <= rango.hasta)
  const ventasAnt = ventas.filter((v) => v.fecha >= rangoAnt.desde && v.fecha <= rangoAnt.hasta)

  const totalFacturado = ventasSemana.reduce((s, v) => s + Number(v.total), 0)
  const totalSemanaAnterior = ventasAnt.reduce((s, v) => s + Number(v.total), 0)
  const cantidadVentas = ventasSemana.length
  const cantidadEnvios = ventasSemana.filter((v) => v.envio).length
  const ticketPromedio = cantidadVentas > 0 ? totalFacturado / cantidadVentas : 0
  const deltaPct = totalSemanaAnterior > 0
    ? ((totalFacturado - totalSemanaAnterior) / totalSemanaAnterior) * 100
    : (totalFacturado > 0 ? 100 : 0)

  // Por socio
  const mapSocio = new Map<string, { count: number; total: number }>()
  for (const v of ventasSemana) {
    const nombre = socios.get(v.socio_id) ?? '—'
    const g = mapSocio.get(nombre) ?? { count: 0, total: 0 }
    g.count += 1; g.total += Number(v.total)
    mapSocio.set(nombre, g)
  }
  const porSocio = [...mapSocio.entries()].map(([nombre, g]) => ({ nombre, ...g })).sort((a, b) => b.total - a.total)

  // Top clientes
  const mapCli = new Map<number, { count: number; total: number }>()
  for (const v of ventasSemana) {
    if (v.cliente_id == null) continue
    const g = mapCli.get(v.cliente_id) ?? { count: 0, total: 0 }
    g.count += 1; g.total += Number(v.total)
    mapCli.set(v.cliente_id, g)
  }
  const topClientes = [...mapCli.entries()]
    .map(([id, g]) => ({ nombre: clientes.get(id) ?? '—', ...g }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)

  // Top presentaciones (por unidades)
  const idsSemana = new Set(ventasSemana.map((v) => v.id))
  const mapPres = new Map<number, { unidades: number; total: number }>()
  for (const it of items) {
    if (!idsSemana.has(it.venta_id)) continue
    const g = mapPres.get(it.presentacion_id) ?? { unidades: 0, total: 0 }
    g.unidades += Number(it.unidades); g.total += Number(it.subtotal)
    mapPres.set(it.presentacion_id, g)
  }
  const topPresentaciones = [...mapPres.entries()]
    .map(([presId, g]) => {
      const p = pres.get(presId)
      const prodNombre = p ? prods.get(p.producto_id) ?? '' : ''
      return { label: `${prodNombre} · ${p?.nombre ?? ''}`.trim(), ...g }
    })
    .sort((a, b) => b.unidades - a.unidades)
    .slice(0, 5)

  return {
    semanaISO: rango.semanaISO,
    desde: rango.desde,
    hasta: rango.hasta,
    cantidadVentas,
    totalFacturado,
    ticketPromedio,
    cantidadEnvios,
    porSocio,
    topClientes,
    topPresentaciones,
    totalSemanaAnterior,
    ventasSemanaAnterior: ventasAnt.length,
    deltaPct,
  }
}

/** localStorage key para marcar un reporte semanal como visto */
export function reporteVisto(semanaISO: string): boolean {
  return localStorage.getItem('reporte-semanal-visto:' + semanaISO) === '1'
}
export function marcarReporteVisto(semanaISO: string) {
  localStorage.setItem('reporte-semanal-visto:' + semanaISO, '1')
}
