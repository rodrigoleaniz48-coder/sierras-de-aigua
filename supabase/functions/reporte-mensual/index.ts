// Reporte mensual: ventas + gastos + jornales de Emiliano.
// POST/GET /functions/v1/reporte-mensual?year=2026&month=8&to=rodrigoleaniz48@gmail.com
// Sin params: reporta el mes anterior al actual (rango [primer día del mes prev, primer día del mes actual)).
// Envía HTML + PDF adjunto por Resend a los destinatarios en REPORTE_MAIL_TO (CSV).
// Requiere secrets: RESEND_API_KEY, REPORTE_MAIL_TO (opcional, default rodrigoleaniz48+harriasrl).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'https://esm.sh/pdf-lib@1.17.1'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function money(n: number, moneda: 'UYU' | 'USD' = 'UYU'): string {
  const s = new Intl.NumberFormat('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n))
  return moneda === 'USD' ? `U$S ${s}` : `$ ${s}`
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const url = new URL(req.url)
    const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_KEY) return json({ error: 'RESEND_API_KEY no configurada' }, 500)

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

    // Rango: default = mes anterior al actual (en UY, UTC-3)
    const now = new Date()
    const y0 = Number(url.searchParams.get('year')) || (now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear())
    const m0 = Number(url.searchParams.get('month')) || (now.getUTCMonth() === 0 ? 12 : now.getUTCMonth()) // 1..12
    const desdeStr = `${y0}-${String(m0).padStart(2, '0')}-01`
    const hastaStr = m0 === 12
      ? `${y0 + 1}-01-01`
      : `${y0}-${String(m0 + 1).padStart(2, '0')}-01`
    const nombreMes = `${MESES[m0 - 1]} ${y0}`

    // Perfiles (para nombres)
    const { data: perfilesRaw } = await supa.from('perfiles').select('id,nombre,rol')
    const perfiles = perfilesRaw ?? []
    const nombrePorId = new Map(perfiles.map((p) => [p.id, p.nombre]))
    const emiliano = perfiles.find((p) => (p.nombre ?? '').toLowerCase().includes('emiliano'))

    // === VENTAS ===
    const { data: ventasRaw } = await supa
      .from('ventas')
      .select('id,fecha,socio_id,total,moneda,cotizacion,estado,promocion_comercial')
      .gte('fecha', desdeStr).lt('fecha', hastaStr)
      .neq('estado', 'cancelado')
    const ventas = ventasRaw ?? []

    function totalEnUYU(v: { total: number; moneda: string | null; cotizacion: number | null }): number {
      if ((v.moneda ?? 'UYU') === 'USD' && v.cotizacion && v.cotizacion > 0) return Number(v.total) * Number(v.cotizacion)
      return Number(v.total)
    }

    const ventasEfectivas = ventas.filter((v) => !v.promocion_comercial)
    const totalVentasUYU = ventasEfectivas.reduce((a, v) => a + totalEnUYU(v), 0)
    const cantVentas = ventasEfectivas.length
    const ticket = cantVentas > 0 ? totalVentasUYU / cantVentas : 0
    // Por socio
    const porSocio = new Map<string, { nombre: string; total: number; cantidad: number }>()
    for (const v of ventasEfectivas) {
      const key = v.socio_id ?? '—'
      const acc = porSocio.get(key) ?? { nombre: nombrePorId.get(v.socio_id ?? '') ?? '—', total: 0, cantidad: 0 }
      acc.total += totalEnUYU(v)
      acc.cantidad += 1
      porSocio.set(key, acc)
    }
    const ventasPorSocio = [...porSocio.values()].sort((a, b) => b.total - a.total)
    const promos = ventas.length - ventasEfectivas.length

    // === GASTOS ===
    const { data: gastosRaw } = await supa
      .from('gastos')
      .select('id,fecha,socio_id,monto,moneda,categoria,descripcion,reembolsable,reembolsado,es_adelanto')
      .gte('fecha', desdeStr).lt('fecha', hastaStr)
    const gastos = gastosRaw ?? []
    const gastoPorSocio = new Map<string, { nombre: string; total: number; reembolsables: number; cantidad: number }>()
    let totalGastos = 0
    for (const g of gastos) {
      const monto = (g.moneda === 'USD') ? Number(g.monto) * 40 : Number(g.monto) // aprox si vino en USD
      totalGastos += monto
      const key = g.socio_id ?? '—'
      const acc = gastoPorSocio.get(key) ?? { nombre: nombrePorId.get(g.socio_id ?? '') ?? '—', total: 0, reembolsables: 0, cantidad: 0 }
      acc.total += monto
      if (g.reembolsable && !g.reembolsado) acc.reembolsables += monto
      acc.cantidad += 1
      gastoPorSocio.set(key, acc)
    }
    const gastosPorSocio = [...gastoPorSocio.values()].sort((a, b) => b.total - a.total)

    // === TAREAS DE EMILIANO ===
    interface Tarea { id: number; titulo: string; estado: string; tipo: string; fecha_creada: string; fecha_iniciada: string | null; fecha_completada: string | null }
    let tareasEmi: Tarea[] = []
    if (emiliano) {
      const { data } = await supa
        .from('tareas')
        .select('id,titulo,estado,tipo,fecha_creada,fecha_iniciada,fecha_completada')
        .eq('asignado_a', emiliano.id)
      tareasEmi = (data ?? []) as Tarea[]
    }
    // Días trabajados: fechas distintas donde Emiliano hizo algo (init o complete) dentro del mes
    const diasSet = new Set<string>()
    const cerradasEnMes: Tarea[] = []
    const activasEnMes: Tarea[] = []
    for (const t of tareasEmi) {
      const fi = t.fecha_iniciada ? t.fecha_iniciada.slice(0, 10) : null
      const fc = t.fecha_completada ? t.fecha_completada.slice(0, 10) : null
      const enRango = (d: string) => d >= desdeStr && d < hastaStr
      if (fi && enRango(fi)) diasSet.add(fi)
      if (fc && enRango(fc)) diasSet.add(fc)
      if (fc && enRango(fc) && t.estado === 'hecha') cerradasEnMes.push(t)
      else if ((t.estado === 'pendiente' || t.estado === 'en_progreso') && (!fc || enRango(fc))) {
        if (t.fecha_creada.slice(0, 10) < hastaStr) activasEnMes.push(t)
      }
    }
    const jornalesAprox = diasSet.size

    // Comentarios del mes de Emiliano
    let comentariosMes: Array<{ tarea_id: number; contenido: string; creado_en: string }> = []
    if (emiliano) {
      const { data } = await supa
        .from('tarea_comentarios')
        .select('tarea_id,contenido,creado_en')
        .eq('autor_id', emiliano.id)
        .gte('creado_en', desdeStr).lt('creado_en', hastaStr)
        .order('creado_en', { ascending: true })
      comentariosMes = data ?? []
    }
    const comentariosPorTarea = new Map<number, string[]>()
    for (const c of comentariosMes) {
      const arr = comentariosPorTarea.get(c.tarea_id) ?? []
      arr.push(c.contenido)
      comentariosPorTarea.set(c.tarea_id, arr)
    }

    // === HTML ===
    const APP_URL = 'https://rodrigoleaniz48-coder.github.io/sierras-de-aigua/'
    const html = renderHTML({
      nombreMes, desdeStr, hastaStr,
      totalVentasUYU, cantVentas, ticket, ventasPorSocio, promos,
      totalGastos, gastosPorSocio, cantGastos: gastos.length,
      jornalesAprox, cerradasEnMes, activasEnMes, comentariosPorTarea,
      APP_URL,
    })

    // === PDF adjunto ===
    const pdfBytes = await renderPDF({
      nombreMes, desdeStr, hastaStr,
      totalVentasUYU, cantVentas, ticket, ventasPorSocio, promos,
      totalGastos, gastosPorSocio, cantGastos: gastos.length,
      jornalesAprox, cerradasEnMes, activasEnMes, comentariosPorTarea,
    })
    const pdfBase64 = bytesToBase64(pdfBytes)
    const pdfName = `reporte-${y0}-${String(m0).padStart(2, '0')}.pdf`

    // === Envío ===
    const toParam = url.searchParams.get('to')
    // Ojo: mientras no se verifique un dominio propio en Resend, sólo se puede
    // enviar al email dueño de la cuenta (rodrigoleaniz48@gmail.com). Una vez
    // verificado, poner REPORTE_MAIL_TO="rodrigoleaniz48@gmail.com, harriasrl@gmail.com"
    const rawTo = toParam ?? Deno.env.get('REPORTE_MAIL_TO') ?? 'rodrigoleaniz48@gmail.com'
    const to = rawTo.split(',').map((s) => s.trim()).filter(Boolean)
    const subject = `Reporte mensual — ${nombreMes} — Sierras de Aiguá`
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Sierras de Aiguá <onboarding@resend.dev>',
        to,
        subject,
        html,
        attachments: [{ filename: pdfName, content: pdfBase64 }],
      }),
    })
    const bodyResp = await resp.text()
    if (!resp.ok) return json({ error: 'Resend falló', status: resp.status, detalle: bodyResp }, 500)

    return json({
      ok: true,
      periodo: `${desdeStr} .. ${hastaStr}`,
      enviado_a: to,
      adjunto: pdfName,
      subject,
      totales: {
        ventas_uyu: Math.round(totalVentasUYU),
        cant_ventas: cantVentas,
        gastos_uyu: Math.round(totalGastos),
        cant_gastos: gastos.length,
        emiliano_jornales_aprox: jornalesAprox,
      },
    })
  } catch (e) {
    return json({ error: 'excepción', mensaje: String((e as Error).message ?? e) }, 500)
  }
})

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

interface RenderData {
  nombreMes: string; desdeStr: string; hastaStr: string
  totalVentasUYU: number; cantVentas: number; ticket: number
  ventasPorSocio: Array<{ nombre: string; total: number; cantidad: number }>
  promos: number
  totalGastos: number
  gastosPorSocio: Array<{ nombre: string; total: number; reembolsables: number; cantidad: number }>
  cantGastos: number
  jornalesAprox: number
  cerradasEnMes: Array<{ id: number; titulo: string; fecha_iniciada: string | null; fecha_completada: string | null }>
  activasEnMes: Array<{ id: number; titulo: string; estado: string; fecha_iniciada: string | null }>
  comentariosPorTarea: Map<number, string[]>
  APP_URL: string
}

function renderHTML(d: RenderData): string {
  const filasVentasSocio = d.ventasPorSocio.map((s) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(s.nombre)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${s.cantidad}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${money(s.total)}</td>
    </tr>`).join('')

  const filasGastosSocio = d.gastosPorSocio.map((s) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(s.nombre)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${s.cantidad}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${money(s.total)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:${s.reembolsables > 0 ? '#b45309' : '#666'};">${s.reembolsables > 0 ? money(s.reembolsables) : '—'}</td>
    </tr>`).join('')

  const filasCerradas = d.cerradasEnMes.map((t) => {
    const dur = t.fecha_iniciada && t.fecha_completada
      ? Math.max(1, Math.ceil((new Date(t.fecha_completada).getTime() - new Date(t.fecha_iniciada).getTime()) / 86400000))
      : null
    const coms = d.comentariosPorTarea.get(t.id) ?? []
    return `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">
          <div style="font-weight:600;">${esc(t.titulo)}</div>
          ${coms.length > 0 ? `<div style="font-size:12px;color:#555;margin-top:4px;">${coms.map((c) => `“${esc(c)}”`).join('<br>')}</div>` : ''}
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#666;font-size:12px;">
          ${t.fecha_iniciada ? t.fecha_iniciada.slice(0, 10) : '—'}<br>→ ${t.fecha_completada ? t.fecha_completada.slice(0, 10) : '—'}
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${dur ? dur + ' d' : '—'}</td>
      </tr>`
  }).join('')

  const filasActivas = d.activasEnMes.map((t) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(t.titulo)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#666;font-size:12px;">${t.estado === 'en_progreso' ? 'en curso' : 'pendiente'}</td>
    </tr>`).join('')

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f7f7f5;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <div style="max-width:640px;margin:20px auto;background:#fff;border:1px solid #e5e5e0;border-radius:10px;overflow:hidden;">
    <div style="background:#2f3d2a;color:#fff;padding:18px 22px;">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.7;">Reporte mensual · Sierras de Aiguá</div>
      <h1 style="margin:6px 0 0;font-size:22px;text-transform:capitalize;">${esc(d.nombreMes)}</h1>
      <div style="font-size:12px;opacity:0.7;margin-top:2px;">${d.desdeStr} — al ${d.hastaStr}</div>
    </div>

    <div style="padding:22px;">
      <!-- VENTAS -->
      <h2 style="font-size:16px;margin:0 0 8px;">Ventas</h2>
      <div style="display:flex;gap:14px;margin-bottom:10px;font-size:13px;">
        <div><b style="font-size:18px;">${money(d.totalVentasUYU)}</b><br><span style="color:#666;">${d.cantVentas} operaciones</span></div>
        <div><b style="font-size:18px;">${money(d.ticket)}</b><br><span style="color:#666;">ticket promedio</span></div>
        ${d.promos > 0 ? `<div><b style="font-size:18px;color:#b45309;">${d.promos}</b><br><span style="color:#666;">promos (no cuentan)</span></div>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:22px;">
        <thead><tr style="background:#f5f5f0;">
          <th style="padding:6px 10px;text-align:left;">Socio</th>
          <th style="padding:6px 10px;text-align:right;">Ventas</th>
          <th style="padding:6px 10px;text-align:right;">Total</th>
        </tr></thead>
        <tbody>${filasVentasSocio || '<tr><td colspan="3" style="padding:12px;color:#888;text-align:center;">sin ventas</td></tr>'}</tbody>
      </table>

      <!-- GASTOS -->
      <h2 style="font-size:16px;margin:0 0 8px;">Gastos</h2>
      <div style="font-size:13px;margin-bottom:10px;">
        <b style="font-size:18px;">${money(d.totalGastos)}</b> · <span style="color:#666;">${d.cantGastos} gasto${d.cantGastos === 1 ? '' : 's'}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:22px;">
        <thead><tr style="background:#f5f5f0;">
          <th style="padding:6px 10px;text-align:left;">Socio</th>
          <th style="padding:6px 10px;text-align:right;">Cant.</th>
          <th style="padding:6px 10px;text-align:right;">Total</th>
          <th style="padding:6px 10px;text-align:right;">Pend. reembolso</th>
        </tr></thead>
        <tbody>${filasGastosSocio || '<tr><td colspan="4" style="padding:12px;color:#888;text-align:center;">sin gastos</td></tr>'}</tbody>
      </table>

      <!-- EMILIANO -->
      <h2 style="font-size:16px;margin:0 0 8px;">Emiliano — tareas y jornales</h2>
      <div style="font-size:13px;margin-bottom:10px;">
        <b style="font-size:18px;">${d.jornalesAprox}</b> <span style="color:#666;">día${d.jornalesAprox === 1 ? '' : 's'} con actividad (aprox. jornales)</span>
      </div>
      ${d.cerradasEnMes.length > 0 ? `
        <div style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Cerradas en el mes</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px;">
          <tbody>${filasCerradas}</tbody>
        </table>` : ''}
      ${d.activasEnMes.length > 0 ? `
        <div style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Aún abiertas</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tbody>${filasActivas}</tbody>
        </table>` : ''}
      ${d.cerradasEnMes.length === 0 && d.activasEnMes.length === 0 ? '<div style="color:#888;font-size:13px;">Sin tareas registradas en el mes.</div>' : ''}

      <div style="margin-top:26px;padding-top:16px;border-top:1px solid #eee;text-align:center;">
        <a href="${d.APP_URL}" style="display:inline-block;background:#2f3d2a;color:#fff;padding:9px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">Abrir la app</a>
      </div>
    </div>
    <div style="padding:12px 22px;background:#fafaf7;font-size:11px;color:#888;text-align:center;">
      Reporte generado automáticamente. Los montos en USD se convierten a UYU a cotización 40 (aprox., solo para gastos).
      El PDF adjunto tiene los mismos datos para archivo/contabilidad.
    </div>
  </div>
</body></html>`
}

// ================== PDF ==================

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

// Reemplaza chars no-latin1 por versión compatible (StandardFont Helvetica no soporta unicode)
function ascii(s: string): string {
  return s
    .replace(/[áàäâ]/g, 'a').replace(/[ÁÀÄÂ]/g, 'A')
    .replace(/[éèëê]/g, 'e').replace(/[ÉÈËÊ]/g, 'E')
    .replace(/[íìïî]/g, 'i').replace(/[ÍÌÏÎ]/g, 'I')
    .replace(/[óòöô]/g, 'o').replace(/[ÓÒÖÔ]/g, 'O')
    .replace(/[úùüû]/g, 'u').replace(/[ÚÙÜÛ]/g, 'U')
    .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/—/g, '-').replace(/–/g, '-').replace(/·/g, '-')
    .replace(/[^\x20-\x7E\n]/g, '')
}

async function renderPDF(d: Omit<RenderData, 'APP_URL'>): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const marginX = 40
  const pageW = 595
  const pageH = 842
  const oliva = rgb(0.184, 0.239, 0.165)
  const gris = rgb(0.4, 0.4, 0.4)
  const grisClaro = rgb(0.9, 0.9, 0.88)

  let page = doc.addPage([pageW, pageH])
  let y = pageH - 50

  function nuevaPagina() {
    page = doc.addPage([pageW, pageH])
    y = pageH - 50
  }

  function espacio(px: number) {
    y -= px
    if (y < 60) nuevaPagina()
  }

  function texto(t: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; align?: 'left' | 'right' } = {}) {
    const size = opts.size ?? 10
    const f: PDFFont = opts.bold ? bold : font
    const s = ascii(t)
    let x = opts.x ?? marginX
    if (opts.align === 'right') {
      const w = f.widthOfTextAtSize(s, size)
      x = (opts.x ?? (pageW - marginX)) - w
    }
    ;(page as PDFPage).drawText(s, { x, y, size, font: f, color: opts.color ?? rgb(0.1, 0.1, 0.1) })
  }

  function h1(t: string) {
    espacio(6)
    texto(t, { size: 18, bold: true, color: oliva })
    espacio(4)
  }
  function h2(t: string) {
    espacio(14)
    texto(t, { size: 13, bold: true, color: oliva })
    espacio(3)
    ;(page as PDFPage).drawLine({ start: { x: marginX, y: y - 2 }, end: { x: pageW - marginX, y: y - 2 }, thickness: 0.7, color: grisClaro })
    espacio(12)
  }
  function linea(labelIzq: string, valorDer: string, opts: { bold?: boolean; sizeIzq?: number; sizeDer?: number } = {}) {
    texto(labelIzq, { size: opts.sizeIzq ?? 10, bold: opts.bold })
    texto(valorDer, { size: opts.sizeDer ?? 10, bold: opts.bold, align: 'right', x: pageW - marginX })
    espacio(14)
  }

  // Header
  texto('REPORTE MENSUAL - SIERRAS DE AIGUA', { size: 9, color: gris })
  espacio(14)
  h1(d.nombreMes.toUpperCase())
  texto(`${d.desdeStr} al ${d.hastaStr}`, { size: 9, color: gris })
  espacio(16)

  // Ventas
  h2('VENTAS')
  linea('Total del mes', money(d.totalVentasUYU), { bold: true, sizeDer: 14 })
  linea('Cantidad de operaciones', String(d.cantVentas))
  linea('Ticket promedio', money(d.ticket))
  if (d.promos > 0) linea('Promociones (no cuentan)', String(d.promos), { sizeIzq: 9 })
  espacio(6)
  // Tabla por socio
  texto('Por socio', { size: 9, color: gris, bold: true })
  espacio(12)
  for (const s of d.ventasPorSocio) {
    linea(`  ${s.nombre}  -  ${s.cantidad} vta.`, money(s.total))
  }
  if (d.ventasPorSocio.length === 0) { texto('(sin ventas)', { size: 9, color: gris }); espacio(14) }

  // Gastos
  h2('GASTOS')
  linea('Total del mes', money(d.totalGastos), { bold: true, sizeDer: 14 })
  linea('Cantidad', String(d.cantGastos))
  espacio(6)
  texto('Por socio', { size: 9, color: gris, bold: true })
  espacio(12)
  for (const s of d.gastosPorSocio) {
    linea(`  ${s.nombre}  -  ${s.cantidad} gasto${s.cantidad === 1 ? '' : 's'}`, money(s.total))
    if (s.reembolsables > 0) {
      texto(`    pend. reembolso: ${money(s.reembolsables)}`, { size: 9, color: rgb(0.7, 0.44, 0.03) })
      espacio(12)
    }
  }
  if (d.gastosPorSocio.length === 0) { texto('(sin gastos)', { size: 9, color: gris }); espacio(14) }

  // Emiliano
  h2('EMILIANO - TAREAS Y JORNALES')
  linea('Dias con actividad (aprox. jornales)', String(d.jornalesAprox), { bold: true, sizeDer: 14 })
  espacio(6)
  if (d.cerradasEnMes.length > 0) {
    texto('Cerradas en el mes', { size: 9, color: gris, bold: true })
    espacio(12)
    for (const t of d.cerradasEnMes) {
      const dur = t.fecha_iniciada && t.fecha_completada
        ? Math.max(1, Math.ceil((new Date(t.fecha_completada).getTime() - new Date(t.fecha_iniciada).getTime()) / 86400000))
        : null
      linea(`  ${t.titulo}`, dur ? `${dur} d` : '-')
      const coms = d.comentariosPorTarea.get(t.id) ?? []
      for (const c of coms) {
        texto(`    "${c}"`, { size: 9, color: gris })
        espacio(12)
      }
    }
  }
  if (d.activasEnMes.length > 0) {
    espacio(4)
    texto('Aun abiertas', { size: 9, color: gris, bold: true })
    espacio(12)
    for (const t of d.activasEnMes) {
      linea(`  ${t.titulo}`, t.estado === 'en_progreso' ? 'en curso' : 'pendiente')
    }
  }
  if (d.cerradasEnMes.length === 0 && d.activasEnMes.length === 0) {
    texto('(sin tareas registradas en el mes)', { size: 9, color: gris })
  }

  // Footer
  espacio(20)
  ;(page as PDFPage).drawLine({ start: { x: marginX, y }, end: { x: pageW - marginX, y }, thickness: 0.5, color: grisClaro })
  espacio(10)
  texto('Reporte generado automaticamente. USD convertido a UYU a 40 (aprox., solo gastos).', { size: 8, color: gris })

  return await doc.save()
}
