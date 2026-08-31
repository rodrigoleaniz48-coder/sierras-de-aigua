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

    // En la tabla `ventas`, `total` está SIEMPRE en pesos (UYU) — la columna
    // `moneda` indica si originalmente se cobró en USD (con `cotizacion` guardada).
    // Para conciliación bancaria mantenemos ambas monedas separadas.
    function totalOriginalUSD(v: { total: number; moneda: string | null; cotizacion: number | null }): number | null {
      if ((v.moneda ?? 'UYU') !== 'USD' || !v.cotizacion || Number(v.cotizacion) <= 0) return null
      return Number(v.total) / Number(v.cotizacion)
    }

    const ventasEfectivas = ventas.filter((v) => !v.promocion_comercial)
    const ventasUYU = ventasEfectivas.filter((v) => (v.moneda ?? 'UYU') !== 'USD')
    const ventasUSD = ventasEfectivas.filter((v) => (v.moneda ?? 'UYU') === 'USD')
    const totalUYU = ventasUYU.reduce((a, v) => a + Number(v.total), 0)
    const totalUSD = ventasUSD.reduce((a, v) => a + (totalOriginalUSD(v) ?? 0), 0)
    const cantVentas = ventasEfectivas.length
    // Por socio, con ambas monedas separadas
    const porSocio = new Map<string, { nombre: string; uyu: number; usd: number; cantidad: number }>()
    for (const v of ventasEfectivas) {
      const key = v.socio_id ?? '—'
      const acc = porSocio.get(key) ?? { nombre: nombrePorId.get(v.socio_id ?? '') ?? '—', uyu: 0, usd: 0, cantidad: 0 }
      if ((v.moneda ?? 'UYU') === 'USD') acc.usd += totalOriginalUSD(v) ?? 0
      else acc.uyu += Number(v.total)
      acc.cantidad += 1
      porSocio.set(key, acc)
    }
    const ventasPorSocio = [...porSocio.values()].sort((a, b) => (b.uyu + b.usd * 40) - (a.uyu + a.usd * 40))
    const promos = ventas.length - ventasEfectivas.length

    // === GASTOS ===
    const { data: gastosRaw } = await supa
      .from('gastos')
      .select('id,fecha,socio_id,monto,moneda,categoria,descripcion,reembolsable,reembolsado,es_adelanto')
      .gte('fecha', desdeStr).lt('fecha', hastaStr)
    const gastos = gastosRaw ?? []
    // Gastos también se separan por moneda para conciliación bancaria.
    const gastoPorSocio = new Map<string, { nombre: string; uyu: number; usd: number; reembUyu: number; reembUsd: number; cantidad: number }>()
    let gastosTotalUYU = 0
    let gastosTotalUSD = 0
    for (const g of gastos) {
      const esUSD = g.moneda === 'USD'
      const monto = Number(g.monto)
      if (esUSD) gastosTotalUSD += monto
      else gastosTotalUYU += monto
      const key = g.socio_id ?? '—'
      const acc = gastoPorSocio.get(key) ?? { nombre: nombrePorId.get(g.socio_id ?? '') ?? '—', uyu: 0, usd: 0, reembUyu: 0, reembUsd: 0, cantidad: 0 }
      if (esUSD) acc.usd += monto; else acc.uyu += monto
      if (g.reembolsable && !g.reembolsado) {
        if (esUSD) acc.reembUsd += monto; else acc.reembUyu += monto
      }
      acc.cantidad += 1
      gastoPorSocio.set(key, acc)
    }
    const gastosPorSocio = [...gastoPorSocio.values()].sort((a, b) => (b.uyu + b.usd * 40) - (a.uyu + a.usd * 40))

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
      totalUYU, totalUSD, cantVentas, ventasPorSocio, promos,
      cantUYU: ventasUYU.length, cantUSD: ventasUSD.length,
      gastosTotalUYU, gastosTotalUSD, gastosPorSocio, cantGastos: gastos.length,
      jornalesAprox, cerradasEnMes, activasEnMes, comentariosPorTarea,
      APP_URL,
    })

    // === PDF adjunto ===
    const pdfBytes = await renderPDF({
      nombreMes, desdeStr, hastaStr,
      totalUYU, totalUSD, cantVentas, ventasPorSocio, promos,
      cantUYU: ventasUYU.length, cantUSD: ventasUSD.length,
      gastosTotalUYU, gastosTotalUSD, gastosPorSocio, cantGastos: gastos.length,
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
        ventas_uyu: Math.round(totalUYU),
        ventas_usd: Math.round(totalUSD * 100) / 100,
        cant_ventas: cantVentas,
        gastos_uyu: Math.round(gastosTotalUYU),
        gastos_usd: Math.round(gastosTotalUSD * 100) / 100,
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
  totalUYU: number; totalUSD: number; cantVentas: number; cantUYU: number; cantUSD: number
  ventasPorSocio: Array<{ nombre: string; uyu: number; usd: number; cantidad: number }>
  promos: number
  gastosTotalUYU: number; gastosTotalUSD: number
  gastosPorSocio: Array<{ nombre: string; uyu: number; usd: number; reembUyu: number; reembUsd: number; cantidad: number }>
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
      <td style="padding:10px 14px;border-bottom:1px solid #eee;">${esc(s.nombre)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #eee;text-align:right;">${s.cantidad}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #eee;text-align:right;font-weight:${s.uyu > 0 ? 600 : 400};color:${s.uyu > 0 ? '#1a1a1a' : '#bbb'};">${s.uyu > 0 ? money(s.uyu, 'UYU') : '—'}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #eee;text-align:right;font-weight:${s.usd > 0 ? 600 : 400};color:${s.usd > 0 ? '#1a1a1a' : '#bbb'};">${s.usd > 0 ? money(s.usd, 'USD') : '—'}</td>
    </tr>`).join('')

  const filasGastosSocio = d.gastosPorSocio.map((s) => {
    const reembTxt = s.reembUyu > 0 || s.reembUsd > 0
      ? [s.reembUyu > 0 ? money(s.reembUyu, 'UYU') : '', s.reembUsd > 0 ? money(s.reembUsd, 'USD') : ''].filter(Boolean).join(' + ')
      : '—'
    return `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #eee;">${esc(s.nombre)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #eee;text-align:right;">${s.cantidad}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #eee;text-align:right;color:${s.uyu > 0 ? '#1a1a1a' : '#bbb'};">${s.uyu > 0 ? money(s.uyu, 'UYU') : '—'}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #eee;text-align:right;color:${s.usd > 0 ? '#1a1a1a' : '#bbb'};">${s.usd > 0 ? money(s.usd, 'USD') : '—'}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #eee;text-align:right;color:${reembTxt !== '—' ? '#b45309' : '#666'};font-size:12px;">${reembTxt}</td>
    </tr>`
  }).join('')

  const filasCerradas = d.cerradasEnMes.map((t) => {
    const dur = t.fecha_iniciada && t.fecha_completada
      ? Math.max(1, Math.ceil((new Date(t.fecha_completada).getTime() - new Date(t.fecha_iniciada).getTime()) / 86400000))
      : null
    const coms = d.comentariosPorTarea.get(t.id) ?? []
    return `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #eee;">
          <div style="font-weight:600;">${esc(t.titulo)}</div>
          ${coms.length > 0 ? `<div style="font-size:12px;color:#555;margin-top:4px;">${coms.map((c) => `“${esc(c)}”`).join('<br>')}</div>` : ''}
        </td>
        <td style="padding:10px 14px;border-bottom:1px solid #eee;text-align:right;color:#666;font-size:12px;">
          ${t.fecha_iniciada ? t.fecha_iniciada.slice(0, 10) : '—'}<br>→ ${t.fecha_completada ? t.fecha_completada.slice(0, 10) : '—'}
        </td>
        <td style="padding:10px 14px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${dur ? dur + ' d' : '—'}</td>
      </tr>`
  }).join('')

  const filasActivas = d.activasEnMes.map((t) => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #eee;">${esc(t.titulo)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #eee;text-align:right;color:#666;font-size:12px;">${t.estado === 'en_progreso' ? 'en curso' : 'pendiente'}</td>
    </tr>`).join('')

  // KPIs top como tabla (los clientes de mail ignoran flex; tabla es lo más compatible)
  const kpiVentas = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;border-collapse:separate;border-spacing:8px;">
      <tr>
        <td style="background:#f5f5f0;border-radius:6px;padding:14px 16px;vertical-align:top;width:50%;">
          <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Total en pesos</div>
          <div style="font-size:20px;font-weight:700;color:#2f3d2a;line-height:1.2;">${money(d.totalUYU, 'UYU')}</div>
          <div style="font-size:12px;color:#666;margin-top:4px;">${d.cantUYU} venta${d.cantUYU === 1 ? '' : 's'} en pesos</div>
        </td>
        <td style="background:#f5f5f0;border-radius:6px;padding:14px 16px;vertical-align:top;width:50%;">
          <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Total en dólares</div>
          <div style="font-size:20px;font-weight:700;color:#2f3d2a;line-height:1.2;">${money(d.totalUSD, 'USD')}</div>
          <div style="font-size:12px;color:#666;margin-top:4px;">${d.cantUSD} venta${d.cantUSD === 1 ? '' : 's'} en U$S</div>
        </td>
      </tr>
      ${d.promos > 0 ? `<tr><td colspan="2" style="padding:8px 4px 0;font-size:12px;color:#666;text-align:right;">${d.promos} promoción${d.promos === 1 ? '' : 'es'} comercial${d.promos === 1 ? '' : 'es'} (no cuentan en totales)</td></tr>` : ''}
    </table>`

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f7f7f5;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1a1a;line-height:1.5;">
  <div style="max-width:680px;margin:24px auto;background:#fff;border:1px solid #e5e5e0;border-radius:10px;overflow:hidden;">
    <div style="background:#2f3d2a;color:#fff;padding:22px 28px;">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.75;">Reporte mensual · Sierras de Aiguá</div>
      <h1 style="margin:8px 0 0;font-size:24px;text-transform:capitalize;line-height:1.2;">${esc(d.nombreMes)}</h1>
      <div style="font-size:12px;opacity:0.75;margin-top:4px;">${d.desdeStr} — al ${d.hastaStr}</div>
    </div>

    <div style="padding:28px;">
      <!-- VENTAS -->
      <h2 style="font-size:15px;margin:0 0 12px;color:#2f3d2a;text-transform:uppercase;letter-spacing:1.5px;">Ventas</h2>
      ${kpiVentas}
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:28px;">
        <thead><tr style="background:#f5f5f0;">
          <th style="padding:10px 14px;text-align:left;font-weight:600;">Socio</th>
          <th style="padding:10px 14px;text-align:right;font-weight:600;">Vtas.</th>
          <th style="padding:10px 14px;text-align:right;font-weight:600;">Pesos</th>
          <th style="padding:10px 14px;text-align:right;font-weight:600;">Dólares</th>
        </tr></thead>
        <tbody>${filasVentasSocio || '<tr><td colspan="4" style="padding:16px;color:#888;text-align:center;">sin ventas</td></tr>'}</tbody>
      </table>

      <!-- GASTOS -->
      <h2 style="font-size:15px;margin:0 0 12px;color:#2f3d2a;text-transform:uppercase;letter-spacing:1.5px;">Gastos</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;border-collapse:separate;border-spacing:8px;">
        <tr>
          <td style="background:#f5f5f0;border-radius:6px;padding:14px 16px;vertical-align:top;width:50%;">
            <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Total en pesos</div>
            <div style="font-size:20px;font-weight:700;color:#2f3d2a;line-height:1.2;">${money(d.gastosTotalUYU, 'UYU')}</div>
          </td>
          <td style="background:#f5f5f0;border-radius:6px;padding:14px 16px;vertical-align:top;width:50%;">
            <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Total en dólares</div>
            <div style="font-size:20px;font-weight:700;color:#2f3d2a;line-height:1.2;">${money(d.gastosTotalUSD, 'USD')}</div>
          </td>
        </tr>
        <tr><td colspan="2" style="padding:6px 4px 0;font-size:12px;color:#666;text-align:right;">${d.cantGastos} gasto${d.cantGastos === 1 ? '' : 's'} en total</td></tr>
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:28px;">
        <thead><tr style="background:#f5f5f0;">
          <th style="padding:10px 14px;text-align:left;font-weight:600;">Socio</th>
          <th style="padding:10px 14px;text-align:right;font-weight:600;">Cant.</th>
          <th style="padding:10px 14px;text-align:right;font-weight:600;">Pesos</th>
          <th style="padding:10px 14px;text-align:right;font-weight:600;">Dólares</th>
          <th style="padding:10px 14px;text-align:right;font-weight:600;">Pend. reemb.</th>
        </tr></thead>
        <tbody>${filasGastosSocio || '<tr><td colspan="5" style="padding:16px;color:#888;text-align:center;">sin gastos</td></tr>'}</tbody>
      </table>

      <!-- EMILIANO -->
      <h2 style="font-size:15px;margin:0 0 12px;color:#2f3d2a;text-transform:uppercase;letter-spacing:1.5px;">Emiliano — tareas y jornales</h2>
      <div style="font-size:14px;margin-bottom:16px;background:#f5f5f0;border-radius:6px;padding:14px 16px;">
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Días con actividad</div>
        <div style="font-size:20px;font-weight:700;color:#2f3d2a;line-height:1.2;">${d.jornalesAprox}</div>
        <div style="font-size:12px;color:#666;margin-top:4px;">aprox. jornales del mes</div>
      </div>
      ${d.cerradasEnMes.length > 0 ? `
        <div style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Cerradas en el mes</div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:18px;">
          <tbody>${filasCerradas}</tbody>
        </table>` : ''}
      ${d.activasEnMes.length > 0 ? `
        <div style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Aún abiertas</div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tbody>${filasActivas}</tbody>
        </table>` : ''}
      ${d.cerradasEnMes.length === 0 && d.activasEnMes.length === 0 ? '<div style="color:#888;font-size:14px;">Sin tareas registradas en el mes.</div>' : ''}

      <div style="margin-top:32px;padding-top:20px;border-top:1px solid #eee;text-align:center;">
        <a href="${d.APP_URL}" style="display:inline-block;background:#2f3d2a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">Abrir la app</a>
      </div>
    </div>
    <div style="padding:16px 28px;background:#fafaf7;font-size:11px;color:#888;text-align:center;line-height:1.5;">
      Reporte generado automáticamente. Cada moneda se muestra por separado para facilitar la conciliación bancaria.<br>
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
  const marginX = 55
  const pageW = 595
  const pageH = 842
  const oliva = rgb(0.184, 0.239, 0.165)
  const gris = rgb(0.4, 0.4, 0.4)
  const grisClaro = rgb(0.88, 0.88, 0.85)
  const rightX = pageW - marginX
  const LH = 18 // line height base

  let page = doc.addPage([pageW, pageH])
  let y = pageH - 60

  function nuevaPagina() {
    page = doc.addPage([pageW, pageH])
    y = pageH - 60
  }

  function espacio(px: number) {
    y -= px
    if (y < 80) nuevaPagina()
  }

  function anchoTexto(s: string, size: number, useBold: boolean): number {
    const f = useBold ? bold : font
    return f.widthOfTextAtSize(ascii(s), size)
  }

  function texto(t: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; align?: 'left' | 'right' } = {}) {
    const size = opts.size ?? 10
    const f: PDFFont = opts.bold ? bold : font
    const s = ascii(t)
    let x = opts.x ?? marginX
    if (opts.align === 'right') {
      x = (opts.x ?? rightX) - f.widthOfTextAtSize(s, size)
    }
    ;(page as PDFPage).drawText(s, { x, y, size, font: f, color: opts.color ?? rgb(0.1, 0.1, 0.1) })
  }

  // Trunca la etiqueta si va a colisionar con el valor de la derecha (deja 12px de aire).
  function truncarPara(label: string, valorDer: string, sizeIzq: number, sizeDer: number, boldIzq: boolean, boldDer: boolean): string {
    const anchoDer = anchoTexto(valorDer, sizeDer, boldDer)
    const maxIzq = (rightX - marginX) - anchoDer - 12
    let l = label
    while (anchoTexto(l, sizeIzq, boldIzq) > maxIzq && l.length > 4) l = l.slice(0, -1)
    return l === label ? label : l.slice(0, -1) + '…'.replace('…', '..')
  }

  function h1(t: string) {
    espacio(10)
    texto(t, { size: 20, bold: true, color: oliva })
    espacio(6)
  }
  function h2(t: string) {
    espacio(20)
    texto(t, { size: 13, bold: true, color: oliva })
    espacio(6)
    ;(page as PDFPage).drawLine({ start: { x: marginX, y: y }, end: { x: rightX, y: y }, thickness: 0.7, color: grisClaro })
    espacio(16)
  }
  function linea(labelIzq: string, valorDer: string, opts: { bold?: boolean; sizeIzq?: number; sizeDer?: number; colorIzq?: ReturnType<typeof rgb>; colorDer?: ReturnType<typeof rgb> } = {}) {
    const sIzq = opts.sizeIzq ?? 10
    const sDer = opts.sizeDer ?? 10
    const label = truncarPara(labelIzq, valorDer, sIzq, sDer, !!opts.bold, !!opts.bold)
    texto(label, { size: sIzq, bold: opts.bold, color: opts.colorIzq })
    texto(valorDer, { size: sDer, bold: opts.bold, align: 'right', color: opts.colorDer })
    espacio(LH)
  }

  // Header
  texto('REPORTE MENSUAL - SIERRAS DE AIGUA', { size: 9, color: gris })
  espacio(16)
  h1(d.nombreMes.toUpperCase())
  texto(`${d.desdeStr}  al  ${d.hastaStr}`, { size: 10, color: gris })
  espacio(6)

  // Ventas
  h2('VENTAS')
  linea('Total en pesos', money(d.totalUYU, 'UYU'), { bold: true, sizeDer: 15 })
  linea('  ventas en pesos', `${d.cantUYU}`, { sizeIzq: 9, colorIzq: gris })
  espacio(4)
  linea('Total en dolares', money(d.totalUSD, 'USD'), { bold: true, sizeDer: 15 })
  linea('  ventas en dolares', `${d.cantUSD}`, { sizeIzq: 9, colorIzq: gris })
  if (d.promos > 0) { espacio(4); linea('Promociones (no cuentan)', String(d.promos), { sizeIzq: 9, colorIzq: gris }) }
  espacio(10)
  texto('Por socio', { size: 10, color: gris, bold: true })
  espacio(LH)
  for (const s of d.ventasPorSocio) {
    const der = [s.uyu > 0 ? money(s.uyu, 'UYU') : '', s.usd > 0 ? money(s.usd, 'USD') : ''].filter(Boolean).join('  +  ')
    linea(`  ${s.nombre}  ·  ${s.cantidad} vta.`, der || '-')
  }
  if (d.ventasPorSocio.length === 0) { texto('(sin ventas)', { size: 10, color: gris }); espacio(LH) }

  // Gastos
  h2('GASTOS')
  linea('Total en pesos', money(d.gastosTotalUYU, 'UYU'), { bold: true, sizeDer: 15 })
  linea('Total en dolares', money(d.gastosTotalUSD, 'USD'), { bold: true, sizeDer: 15 })
  espacio(4)
  linea('Cantidad total', String(d.cantGastos))
  espacio(10)
  texto('Por socio', { size: 10, color: gris, bold: true })
  espacio(LH)
  for (const s of d.gastosPorSocio) {
    const der = [s.uyu > 0 ? money(s.uyu, 'UYU') : '', s.usd > 0 ? money(s.usd, 'USD') : ''].filter(Boolean).join('  +  ')
    linea(`  ${s.nombre}  ·  ${s.cantidad} gasto${s.cantidad === 1 ? '' : 's'}`, der || '-')
    if (s.reembUyu > 0 || s.reembUsd > 0) {
      const reemb = [s.reembUyu > 0 ? money(s.reembUyu, 'UYU') : '', s.reembUsd > 0 ? money(s.reembUsd, 'USD') : ''].filter(Boolean).join(' + ')
      texto(`      pend. reembolso: ${reemb}`, { size: 9, color: rgb(0.7, 0.44, 0.03) })
      espacio(LH - 2)
    }
  }
  if (d.gastosPorSocio.length === 0) { texto('(sin gastos)', { size: 10, color: gris }); espacio(LH) }

  // Emiliano
  h2('EMILIANO - TAREAS Y JORNALES')
  linea('Dias con actividad (aprox. jornales)', String(d.jornalesAprox), { bold: true, sizeDer: 16 })
  espacio(10)
  if (d.cerradasEnMes.length > 0) {
    texto('Cerradas en el mes', { size: 10, color: gris, bold: true })
    espacio(LH)
    for (const t of d.cerradasEnMes) {
      const dur = t.fecha_iniciada && t.fecha_completada
        ? Math.max(1, Math.ceil((new Date(t.fecha_completada).getTime() - new Date(t.fecha_iniciada).getTime()) / 86400000))
        : null
      linea(`  ${t.titulo}`, dur ? `${dur} d` : '-')
      const coms = d.comentariosPorTarea.get(t.id) ?? []
      for (const c of coms) {
        texto(`      "${c}"`, { size: 9, color: gris })
        espacio(LH - 2)
      }
    }
  }
  if (d.activasEnMes.length > 0) {
    espacio(6)
    texto('Aun abiertas', { size: 10, color: gris, bold: true })
    espacio(LH)
    for (const t of d.activasEnMes) {
      linea(`  ${t.titulo}`, t.estado === 'en_progreso' ? 'en curso' : 'pendiente')
    }
  }
  if (d.cerradasEnMes.length === 0 && d.activasEnMes.length === 0) {
    texto('(sin tareas registradas en el mes)', { size: 10, color: gris })
    espacio(LH)
  }

  // Footer
  espacio(24)
  ;(page as PDFPage).drawLine({ start: { x: marginX, y }, end: { x: rightX, y }, thickness: 0.5, color: grisClaro })
  espacio(14)
  texto('Reporte generado automaticamente. Pesos y dolares se muestran por separado para conciliacion.', { size: 8, color: gris })

  return await doc.save()
}
