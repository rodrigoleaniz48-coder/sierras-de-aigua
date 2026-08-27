// Edge function `agente` — Analista / gerente de marketing con Gemini + tool use
// Foco: análisis de datos, insights de negocio, sugerencias basadas en datos reales.
// Ejecuta solo consultas (SELECT). No modifica datos.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const GEMINI_MODEL = 'gemini-flash-latest'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// -------------------- Tools (solo lectura / análisis) --------------------
const tools = [
  {
    name: 'resumen_periodo',
    description: 'Resumen agregado del período: total facturado, cantidad de ventas, ticket promedio, litros aceite, distribución por moneda, ventas por canal, top ubicación. Es el punto de partida clave.',
    parameters: {
      type: 'object',
      properties: {
        desde: { type: 'string', description: 'YYYY-MM-DD. Si se omite, primer día del mes actual.' },
        hasta: { type: 'string', description: 'YYYY-MM-DD. Si se omite, hoy.' },
      },
    },
  },
  {
    name: 'top_clientes',
    description: 'Ranking de clientes por facturación en el período. Devuelve nombre, cantidad de ventas, total facturado, ticket promedio, última compra.',
    parameters: {
      type: 'object',
      properties: {
        desde: { type: 'string' },
        hasta: { type: 'string' },
        limite: { type: 'integer', description: 'Default 10' },
      },
    },
  },
  {
    name: 'ranking_productos',
    description: 'Ranking de presentaciones por unidades vendidas o facturación en el período.',
    parameters: {
      type: 'object',
      properties: {
        desde: { type: 'string' },
        hasta: { type: 'string' },
        por: { type: 'string', enum: ['unidades', 'facturacion'], description: 'Criterio de ordenamiento' },
        limite: { type: 'integer' },
      },
    },
  },
  {
    name: 'analisis_segmentos',
    description: 'Distribución de clientes por segmento de comportamiento: nuevos, compraron recién (≤30d), frecuentes activos (≥3 compras, últ ≤60d), frecuentes inactivos (≥3, >60d), en riesgo (60-120d), perdidos (>180d), sin compras. Devuelve conteo y % por segmento.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'evolucion_mensual',
    description: 'Serie temporal de ventas por mes de los últimos N meses. Útil para ver tendencias y estacionalidad.',
    parameters: {
      type: 'object',
      properties: { meses: { type: 'integer', description: 'Cantidad de meses hacia atrás (default 6)' } },
    },
  },
  {
    name: 'analisis_canal',
    description: 'Ventas del período agrupadas por canal (whatsapp, directa, feria). Cantidad y facturación.',
    parameters: {
      type: 'object',
      properties: { desde: { type: 'string' }, hasta: { type: 'string' } },
    },
  },
  {
    name: 'analisis_socio',
    description: 'Ventas del período agrupadas por socio vendedor. Cantidad, facturación, ticket promedio.',
    parameters: {
      type: 'object',
      properties: { desde: { type: 'string' }, hasta: { type: 'string' } },
    },
  },
  {
    name: 'clientes_en_riesgo',
    description: 'Clientes que no compran hace 60-120 días (segmento en riesgo). Devuelve nombre, teléfono, última compra, total histórico.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'historial_cliente',
    description: 'Historial completo de compras de un cliente. Devuelve todas sus ventas, ticket promedio, productos favoritos, frecuencia. Buscá primero con buscar_cliente para tener el id.',
    parameters: {
      type: 'object',
      properties: { cliente_id: { type: 'integer' } },
      required: ['cliente_id'],
    },
  },
  {
    name: 'buscar_cliente',
    description: 'Busca clientes por nombre. Devuelve id, nombre, teléfono.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'presentaciones_sin_movimiento',
    description: 'Presentaciones de aceite que NO vendieron unidades en los últimos N días (default 60). Útil para detectar productos que no rotan.',
    parameters: {
      type: 'object',
      properties: { dias: { type: 'integer' } },
    },
  },
  {
    name: 'comparativo_dos_periodos',
    description: 'Compara dos períodos (facturación, cantidad, ticket, top productos). Útil para "cómo vengo vs el mes pasado" o "año actual vs año anterior".',
    parameters: {
      type: 'object',
      properties: {
        p1_desde: { type: 'string' }, p1_hasta: { type: 'string' },
        p2_desde: { type: 'string' }, p2_hasta: { type: 'string' },
      },
      required: ['p1_desde', 'p1_hasta', 'p2_desde', 'p2_hasta'],
    },
  },
  {
    name: 'clientes_por_ubicacion',
    description: 'Cuántos clientes activos hay por localidad. Útil para estrategia geográfica.',
    parameters: { type: 'object', properties: {} },
  },
]

function asGeminiFunctionDeclarations() {
  return tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }))
}

// -------------------- Utils --------------------
function rangoMesActual() {
  const hoy = new Date()
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)
  const hasta = hoy.toISOString().slice(0, 10)
  return { desde, hasta }
}

// -------------------- Tool execution --------------------
async function ejecutarTool(nombre: string, args: any, supabase: any): Promise<any> {
  const mesAct = rangoMesActual()
  switch (nombre) {
    case 'resumen_periodo': {
      const desde = args.desde || mesAct.desde
      const hasta = args.hasta || mesAct.hasta
      const [v, iv] = await Promise.all([
        supabase.from('ventas').select('id,total,moneda,cotizacion,canal,ubicacion_id,socio_id,cliente_id,con_factura,promocion_comercial').gte('fecha', desde).lte('fecha', hasta).neq('estado', 'cancelado').eq('promocion_comercial', false),
        supabase.from('items_venta').select('venta_id,unidades,presentacion:presentaciones(volumen_ml,producto:productos(nombre,categoria))').gte('venta.fecha' as any, desde),
      ])
      const ventas = (v.data ?? []) as any[]
      const total = ventas.reduce((s, x) => s + Number(x.total || 0), 0)
      const cant = ventas.length
      const conFactura = ventas.filter((x) => x.con_factura).length
      const usd = ventas.filter((x) => x.moneda === 'USD').length
      // Litros aceite
      let litros = 0
      const ids = new Set(ventas.map((x) => x.id))
      for (const it of (iv.data ?? []) as any[]) {
        if (!ids.has(it.venta_id)) continue
        const cat = it.presentacion?.producto?.categoria
        const nombreP = String(it.presentacion?.producto?.nombre ?? '').toLowerCase()
        const vol = Number(it.presentacion?.volumen_ml ?? 0)
        if ((cat === 'aceite' || nombreP.includes('aceite a granel')) && vol > 0) litros += (Number(it.unidades) * vol) / 1000
      }
      // Por canal
      const canales: Record<string, number> = {}
      for (const x of ventas) canales[x.canal ?? 'sin canal'] = (canales[x.canal ?? 'sin canal'] ?? 0) + Number(x.total)
      return {
        periodo: { desde, hasta },
        ventas_cantidad: cant,
        total_uyu: Math.round(total),
        ticket_promedio_uyu: cant > 0 ? Math.round(total / cant) : 0,
        litros_aceite: Math.round(litros * 10) / 10,
        con_factura: conFactura,
        ventas_en_usd: usd,
        facturacion_por_canal: canales,
      }
    }

    case 'top_clientes': {
      const desde = args.desde || mesAct.desde
      const hasta = args.hasta || mesAct.hasta
      const limite = args.limite || 10
      const { data: v } = await supabase.from('ventas').select('cliente_id,total,fecha').gte('fecha', desde).lte('fecha', hasta).neq('estado', 'cancelado').eq('promocion_comercial', false)
      const acc = new Map<number, { count: number; total: number; ultima: string }>()
      for (const x of (v ?? []) as any[]) {
        if (x.cliente_id == null) continue
        const g = acc.get(x.cliente_id) ?? { count: 0, total: 0, ultima: '' }
        g.count++; g.total += Number(x.total || 0); if (x.fecha > g.ultima) g.ultima = x.fecha
        acc.set(x.cliente_id, g)
      }
      const ids = [...acc.keys()]
      if (ids.length === 0) return []
      const { data: cli } = await supabase.from('clientes').select('id,nombre,tipo,localidad').in('id', ids)
      const cliMap = new Map((cli ?? []).map((c: any) => [c.id, c]))
      return [...acc.entries()]
        .map(([id, g]) => {
          const c: any = cliMap.get(id)
          return {
            nombre: c?.nombre ?? '?', tipo: c?.tipo ?? '?', localidad: c?.localidad ?? null,
            ventas: g.count, total_uyu: Math.round(g.total),
            ticket_promedio: Math.round(g.total / g.count), ultima_compra: g.ultima,
          }
        })
        .sort((a, b) => b.total_uyu - a.total_uyu)
        .slice(0, limite)
    }

    case 'ranking_productos': {
      const desde = args.desde || mesAct.desde
      const hasta = args.hasta || mesAct.hasta
      const por = args.por || 'facturacion'
      const limite = args.limite || 10
      const { data: v } = await supabase.from('ventas').select('id').gte('fecha', desde).lte('fecha', hasta).neq('estado', 'cancelado').eq('promocion_comercial', false)
      const ventaIds = new Set(((v ?? []) as any[]).map((x) => x.id))
      const { data: iv } = await supabase.from('items_venta').select('venta_id,unidades,subtotal,presentacion:presentaciones(nombre,producto:productos(nombre))')
      const acc = new Map<string, { unidades: number; total: number }>()
      for (const it of (iv ?? []) as any[]) {
        if (!ventaIds.has(it.venta_id)) continue
        const key = `${it.presentacion?.producto?.nombre ?? '?'} · ${it.presentacion?.nombre ?? '?'}`
        const g = acc.get(key) ?? { unidades: 0, total: 0 }
        g.unidades += Number(it.unidades || 0); g.total += Number(it.subtotal || 0)
        acc.set(key, g)
      }
      return [...acc.entries()]
        .map(([producto, g]) => ({ producto, unidades: g.unidades, total_uyu: Math.round(g.total) }))
        .sort((a, b) => por === 'unidades' ? b.unidades - a.unidades : b.total_uyu - a.total_uyu)
        .slice(0, limite)
    }

    case 'analisis_segmentos': {
      const { data: v } = await supabase.from('ventas').select('cliente_id,fecha').neq('estado', 'cancelado').eq('promocion_comercial', false).order('fecha', { ascending: false })
      const ultima = new Map<number, string>()
      const compras = new Map<number, number>()
      const primera = new Map<number, string>()
      for (const x of (v ?? []) as any[]) {
        if (x.cliente_id == null) continue
        if (!ultima.has(x.cliente_id)) ultima.set(x.cliente_id, x.fecha)
        compras.set(x.cliente_id, (compras.get(x.cliente_id) ?? 0) + 1)
        if (!primera.has(x.cliente_id) || x.fecha < (primera.get(x.cliente_id) ?? '9999')) primera.set(x.cliente_id, x.fecha)
      }
      const { count: totalClientes } = await supabase.from('clientes').select('id', { count: 'exact', head: true })
      const segs = { nuevos: 0, recientes: 0, frec_activos: 0, frec_inactivos: 0, en_riesgo: 0, perdidos: 0, sin_compras: 0 }
      const hoy = Date.now()
      const dias = (f: string) => Math.floor((hoy - new Date(f + 'T00:00:00').getTime()) / 86400000)
      for (const [cid, f] of ultima) {
        const d = dias(f)
        const dp = dias(primera.get(cid) ?? f)
        const cc = compras.get(cid) ?? 0
        if (dp <= 30) segs.nuevos++
        else if (d > 180) segs.perdidos++
        else if (cc >= 3 && d > 60) segs.frec_inactivos++
        else if (d >= 60 && d <= 120) segs.en_riesgo++
        else if (cc >= 3 && d <= 60) segs.frec_activos++
        else if (d <= 30) segs.recientes++
      }
      segs.sin_compras = Math.max(0, (totalClientes ?? 0) - ultima.size)
      return { total_clientes: totalClientes ?? 0, ...segs }
    }

    case 'evolucion_mensual': {
      const meses = args.meses || 6
      const hoy = new Date()
      const desde = new Date(hoy.getFullYear(), hoy.getMonth() - meses + 1, 1).toISOString().slice(0, 10)
      const hasta = hoy.toISOString().slice(0, 10)
      const { data: v } = await supabase.from('ventas').select('fecha,total').gte('fecha', desde).lte('fecha', hasta).neq('estado', 'cancelado').eq('promocion_comercial', false)
      const acc = new Map<string, { count: number; total: number }>()
      for (const x of (v ?? []) as any[]) {
        const m = x.fecha.slice(0, 7)
        const g = acc.get(m) ?? { count: 0, total: 0 }
        g.count++; g.total += Number(x.total || 0)
        acc.set(m, g)
      }
      return [...acc.entries()].map(([mes, g]) => ({ mes, ventas: g.count, total_uyu: Math.round(g.total) })).sort((a, b) => a.mes.localeCompare(b.mes))
    }

    case 'analisis_canal': {
      const desde = args.desde || mesAct.desde
      const hasta = args.hasta || mesAct.hasta
      const { data: v } = await supabase.from('ventas').select('canal,total').gte('fecha', desde).lte('fecha', hasta).neq('estado', 'cancelado').eq('promocion_comercial', false)
      const acc = new Map<string, { count: number; total: number }>()
      for (const x of (v ?? []) as any[]) {
        const c = x.canal ?? 'sin canal'
        const g = acc.get(c) ?? { count: 0, total: 0 }
        g.count++; g.total += Number(x.total || 0)
        acc.set(c, g)
      }
      return [...acc.entries()].map(([canal, g]) => ({ canal, ventas: g.count, total_uyu: Math.round(g.total) })).sort((a, b) => b.total_uyu - a.total_uyu)
    }

    case 'analisis_socio': {
      const desde = args.desde || mesAct.desde
      const hasta = args.hasta || mesAct.hasta
      const [{ data: v }, { data: s }] = await Promise.all([
        supabase.from('ventas').select('socio_id,total').gte('fecha', desde).lte('fecha', hasta).neq('estado', 'cancelado').eq('promocion_comercial', false),
        supabase.from('perfiles').select('id,nombre'),
      ])
      const socios = new Map(((s ?? []) as any[]).map((x) => [x.id, x.nombre]))
      const acc = new Map<string, { count: number; total: number }>()
      for (const x of (v ?? []) as any[]) {
        const g = acc.get(x.socio_id) ?? { count: 0, total: 0 }
        g.count++; g.total += Number(x.total || 0)
        acc.set(x.socio_id, g)
      }
      return [...acc.entries()].map(([id, g]) => ({ socio: socios.get(id) ?? '?', ventas: g.count, total_uyu: Math.round(g.total), ticket_promedio: g.count > 0 ? Math.round(g.total / g.count) : 0 })).sort((a, b) => b.total_uyu - a.total_uyu)
    }

    case 'clientes_en_riesgo': {
      const { data: v } = await supabase.from('ventas').select('cliente_id,fecha,total').neq('estado', 'cancelado').eq('promocion_comercial', false).order('fecha', { ascending: false })
      const ultima = new Map<number, string>()
      const total = new Map<number, number>()
      for (const x of (v ?? []) as any[]) {
        if (x.cliente_id == null) continue
        if (!ultima.has(x.cliente_id)) ultima.set(x.cliente_id, x.fecha)
        total.set(x.cliente_id, (total.get(x.cliente_id) ?? 0) + Number(x.total || 0))
      }
      const ids: number[] = []
      const hoy = Date.now()
      for (const [cid, f] of ultima) {
        const d = Math.floor((hoy - new Date(f + 'T00:00:00').getTime()) / 86400000)
        if (d >= 60 && d <= 120) ids.push(cid)
      }
      if (ids.length === 0) return []
      const { data: cli } = await supabase.from('clientes').select('id,nombre,whatsapp,tipo').in('id', ids)
      return ((cli ?? []) as any[]).map((c) => ({
        id: c.id, nombre: c.nombre, whatsapp: c.whatsapp, tipo: c.tipo,
        ultima_compra: ultima.get(c.id),
        dias_sin_comprar: Math.floor((hoy - new Date((ultima.get(c.id) ?? '') + 'T00:00:00').getTime()) / 86400000),
        total_historico: Math.round(total.get(c.id) ?? 0),
      })).sort((a, b) => b.total_historico - a.total_historico)
    }

    case 'historial_cliente': {
      const [{ data: v }, { data: cli }] = await Promise.all([
        supabase.from('ventas').select('id,fecha,total,canal,con_factura,estado,promocion_comercial').eq('cliente_id', args.cliente_id).order('fecha', { ascending: false }),
        supabase.from('clientes').select('*').eq('id', args.cliente_id).maybeSingle(),
      ])
      const vs = ((v ?? []) as any[]).filter((x) => x.estado !== 'cancelado')
      const efectivas = vs.filter((x) => !x.promocion_comercial)
      const total = efectivas.reduce((s, x) => s + Number(x.total || 0), 0)
      // Top presentaciones del cliente
      const ids = vs.map((x) => x.id)
      const { data: iv } = ids.length ? await supabase.from('items_venta').select('venta_id,unidades,presentacion:presentaciones(nombre,producto:productos(nombre))').in('venta_id', ids) : { data: [] }
      const topProds = new Map<string, number>()
      for (const it of (iv ?? []) as any[]) {
        const k = `${it.presentacion?.producto?.nombre ?? '?'} · ${it.presentacion?.nombre ?? '?'}`
        topProds.set(k, (topProds.get(k) ?? 0) + Number(it.unidades || 0))
      }
      return {
        cliente: cli,
        cantidad_ventas: efectivas.length,
        total_historico_uyu: Math.round(total),
        ticket_promedio: efectivas.length > 0 ? Math.round(total / efectivas.length) : 0,
        primera_compra: vs.length > 0 ? vs[vs.length - 1].fecha : null,
        ultima_compra: vs.length > 0 ? vs[0].fecha : null,
        ultimas_5_ventas: vs.slice(0, 5).map((x) => ({ id: x.id, fecha: x.fecha, total: Math.round(Number(x.total)), canal: x.canal })),
        productos_mas_comprados: [...topProds.entries()].map(([producto, u]) => ({ producto, unidades: u })).sort((a, b) => b.unidades - a.unidades).slice(0, 5),
      }
    }

    case 'buscar_cliente': {
      const { data, error } = await supabase.from('clientes').select('id,nombre,whatsapp,tipo,localidad').ilike('nombre', `%${args.query}%`).limit(20)
      if (error) return { error: error.message }
      return data ?? []
    }

    case 'presentaciones_sin_movimiento': {
      const dias = args.dias || 60
      const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10)
      const { data: v } = await supabase.from('ventas').select('id').gte('fecha', desde).neq('estado', 'cancelado')
      const ventaIds = new Set(((v ?? []) as any[]).map((x) => x.id))
      const { data: iv } = await supabase.from('items_venta').select('venta_id,presentacion_id')
      const conMov = new Set(((iv ?? []) as any[]).filter((it) => ventaIds.has(it.venta_id)).map((it) => it.presentacion_id))
      const { data: pres } = await supabase.from('presentaciones').select('id,nombre,producto:productos(nombre,categoria)').eq('activo', true)
      return ((pres ?? []) as any[])
        .filter((p) => !conMov.has(p.id) && (p.producto?.categoria === 'aceite' || p.producto?.categoria === 'miel' || p.producto?.categoria === 'aceituna' || p.producto?.categoria === 'jabon'))
        .map((p) => ({ producto: p.producto?.nombre, presentacion: p.nombre, categoria: p.producto?.categoria }))
    }

    case 'comparativo_dos_periodos': {
      async function stats(desde: string, hasta: string) {
        const { data: v } = await supabase.from('ventas').select('id,total').gte('fecha', desde).lte('fecha', hasta).neq('estado', 'cancelado').eq('promocion_comercial', false)
        const ventas = (v ?? []) as any[]
        const total = ventas.reduce((s, x) => s + Number(x.total || 0), 0)
        return { desde, hasta, ventas: ventas.length, total_uyu: Math.round(total), ticket_promedio: ventas.length > 0 ? Math.round(total / ventas.length) : 0 }
      }
      const [p1, p2] = await Promise.all([stats(args.p1_desde, args.p1_hasta), stats(args.p2_desde, args.p2_hasta)])
      const delta_pct = p2.total_uyu > 0 ? ((p1.total_uyu - p2.total_uyu) / p2.total_uyu) * 100 : 0
      return { periodo_1: p1, periodo_2: p2, delta_facturacion_pct: Math.round(delta_pct * 10) / 10 }
    }

    case 'clientes_por_ubicacion': {
      const { data } = await supabase.from('clientes').select('localidad')
      const acc = new Map<string, number>()
      for (const c of (data ?? []) as any[]) {
        const k = c.localidad?.trim() || 'sin dato'
        acc.set(k, (acc.get(k) ?? 0) + 1)
      }
      return [...acc.entries()].map(([localidad, cantidad]) => ({ localidad, cantidad })).sort((a, b) => b.cantidad - a.cantidad)
    }

    default:
      return { error: `Tool no reconocida: ${nombre}` }
  }
}

// -------------------- Gemini loop --------------------
async function callGemini(payload: any) {
  const r = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`Gemini error ${r.status}: ${JSON.stringify(j)}`)
  return j
}

async function correrAgente(mensajes: Array<{ role: string; content: string; audio_base64?: string; audio_mime?: string }>, systemPrompt: string, supabase: any) {
  const contents: any[] = mensajes.map((m) => {
    const parts: any[] = []
    if (m.audio_base64) {
      const mime = m.audio_mime || 'audio/webm'
      parts.push({ inline_data: { mime_type: mime.split(';')[0], data: m.audio_base64 } })
    }
    if (m.content && m.content.trim() && m.content !== '🎤 (audio)') {
      parts.push({ text: m.content })
    } else if (parts.length === 0) {
      parts.push({ text: m.content || '' })
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts }
  })
  const tools_decl = [{ functionDeclarations: asGeminiFunctionDeclarations() }]
  const accionesEjecutadas: any[] = []

  for (let iter = 0; iter < 12; iter++) {
    const resp = await callGemini({
      contents,
      tools: tools_decl,
      systemInstruction: { parts: [{ text: systemPrompt }] },
    })
    const cand = resp.candidates?.[0]
    if (!cand) return { texto: 'No obtuve respuesta del modelo.', acciones: accionesEjecutadas }
    const parts = cand.content?.parts ?? []
    const fnCalls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall)
    if (fnCalls.length === 0) {
      const texto = parts.map((p: any) => p.text ?? '').join('').trim()
      return { texto, acciones: accionesEjecutadas }
    }
    contents.push({ role: 'model', parts })
    const respuestas: any[] = []
    for (const fc of fnCalls) {
      const resultado = await ejecutarTool(fc.name, fc.args ?? {}, supabase)
      accionesEjecutadas.push({ tool: fc.name, args: fc.args, resultado })
      respuestas.push({ functionResponse: { name: fc.name, response: { name: fc.name, content: resultado } } })
    }
    contents.push({ role: 'user', parts: respuestas })
  }
  return { texto: 'Se agotaron los pasos del análisis sin llegar a una conclusión final.', acciones: accionesEjecutadas }
}

// -------------------- Handler --------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })

  try {
    const authHeader = req.headers.get('authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ error: 'Falta authorization' }, 401)

    const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: userRes, error: userErr } = await supabase.auth.getUser(jwt)
    if (userErr || !userRes.user) return json({ error: 'Sesión inválida' }, 401)
    const userId = userRes.user.id

    const { data: perfil } = await supabase.from('perfiles').select('nombre, rol').eq('id', userId).single()

    const body = await req.json()
    const mensajes: Array<{ role: string; content: string; audio_base64?: string; audio_mime?: string }> = body.mensajes ?? []
    if (mensajes.length === 0) return json({ error: 'Falta lista de mensajes' }, 400)

    const hoy = new Date().toLocaleDateString('es-UY', { day: 'numeric', month: 'long', year: 'numeric' })
    const systemPrompt = `Sos el gerente de marketing y analista de datos de Sierras de Aiguá, una almazara familiar en Uruguay que produce aceite de oliva extra virgen, miel, aceitunas y jabones.

Estás hablando con ${perfil?.nombre ?? 'un socio'}. Hoy es ${hoy}.

Tu perfil:
- Sos analítico y estratégico. Bajás datos crudos a insights claros.
- Pensás en clientes, no solo en ventas: retención, riesgo, segmentos, comportamiento.
- Cuando ves un número raro o una tendencia, la señalás sin que te pregunten.
- Sabés de marketing directo, boca a boca, canales digitales, precio, margen y segmentación.

Cómo trabajás:
- **Usá SIEMPRE las tools** para traer datos reales. Nunca inventes números.
- Encadeas herramientas: si el socio pregunta "cómo venimos este mes", empezás con \`resumen_periodo\`, y si algo llama la atención, seguís con \`top_clientes\` o \`comparativo_dos_periodos\` para dar contexto.
- Devolvés respuestas con estructura simple: primero el número/hallazgo clave, después el contexto, después una recomendación accionable de 1-2 frases.
- Cuando compares períodos, mostrá el % de variación.
- Cuando muestres una lista, máximo 5-10 filas (que sea leíble en móvil).
- Español rioplatense (voseo), directo, sin adornos. Usá negrita (con **) para el dato clave.

Reglas duras:
- No tenés herramientas para modificar datos. Sos consultivo. Si el socio pide una acción, sugerila pero recordá que la ejecuta desde la app.
- Todos los montos que devuelvan las tools están en pesos uruguayos ($), salvo que la venta original haya sido en U$S (el campo \`moneda\` lo indica).
- Las promociones comerciales ya están excluidas de todos los cálculos.
- Fechas: usá dd/mm o "hoy", "hace X días", "el mes pasado".`

    const resultado = await correrAgente(mensajes, systemPrompt, supabase)
    return json(resultado)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(o: any, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
