// Edge function `agente` — asistente conversacional con Gemini + tool use
// Proxifica el chat, ejecuta tools contra Supabase con permisos del usuario logueado.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const GEMINI_MODEL = 'gemini-flash-lite-latest'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// -------------------- Tools --------------------
const tools = [
  {
    name: 'listar_ventas_pendientes',
    description: 'Lista las ventas pendientes de cobro o de entrega. Devuelve id, fecha, cliente, total, y estado.',
    parameters: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['cobro', 'entrega', 'ambas'], description: 'Filtrar por tipo de pendiente' },
        limite: { type: 'integer', description: 'Cuántas devolver (default 20)' },
      },
      required: ['tipo'],
    },
  },
  {
    name: 'buscar_cliente',
    description: 'Busca clientes por nombre. Devuelve lista con id, nombre, teléfono, última compra.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texto a buscar en el nombre del cliente' },
      },
      required: ['query'],
    },
  },
  {
    name: 'crear_gasto',
    description: 'Crea un nuevo gasto del usuario logueado. Requiere confirmación del usuario antes de ejecutar (el frontend maneja el preview).',
    parameters: {
      type: 'object',
      properties: {
        descripcion: { type: 'string' },
        monto: { type: 'number' },
        moneda: { type: 'string', enum: ['UYU', 'USD'] },
        categoria: {
          type: 'string',
          enum: ['combustible', 'viaticos', 'insumos_almazara', 'insumos_campo', 'sueldos', 'jornales', 'impuestos', 'compras_generales', 'otros'],
        },
        tipo: { type: 'string', enum: ['normal', 'reembolsable', 'adelanto'] },
        fecha: { type: 'string', description: 'YYYY-MM-DD; si se omite, hoy' },
      },
      required: ['descripcion', 'monto', 'moneda', 'categoria', 'tipo'],
    },
  },
  {
    name: 'marcar_venta',
    description: 'Marca una venta como cobrada y/o entregada. Ejecuta directo sin confirmación.',
    parameters: {
      type: 'object',
      properties: {
        venta_id: { type: 'integer' },
        cobrada: { type: 'boolean' },
        entregada: { type: 'boolean' },
      },
      required: ['venta_id'],
    },
  },
  {
    name: 'resumen_mes',
    description: 'Devuelve resumen del mes: total de ventas, cantidad de operaciones, total de gastos operativos, cuenta socio (reembolsables y adelantos), litros de aceite vendidos.',
    parameters: {
      type: 'object',
      properties: {
        anio: { type: 'integer', description: 'Año, default: actual' },
        mes: { type: 'integer', description: 'Mes 1-12, default: actual' },
      },
    },
  },
  {
    name: 'listar_clientes_riesgo',
    description: 'Lista clientes que no compran hace entre 60 y 120 días (segmento "en riesgo").',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
]

function asGeminiFunctionDeclarations() {
  return tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }))
}

// -------------------- Tool execution --------------------
async function ejecutarTool(nombre: string, args: any, supabase: any, userId: string): Promise<any> {
  switch (nombre) {
    case 'listar_ventas_pendientes': {
      const q = supabase.from('ventas').select('id, fecha, cliente_id, total, entregado, cobrado, moneda').neq('estado', 'cancelado').order('fecha', { ascending: false }).limit(args.limite ?? 20)
      if (args.tipo === 'cobro') q.eq('cobrado', false)
      else if (args.tipo === 'entrega') q.eq('entregado', false)
      else q.or('entregado.eq.false,cobrado.eq.false')
      const { data, error } = await q
      if (error) return { error: error.message }
      const ids = [...new Set((data ?? []).map((v: any) => v.cliente_id).filter(Boolean))]
      const cliRes = ids.length ? await supabase.from('clientes').select('id,nombre').in('id', ids) : { data: [] }
      const cliMap = new Map((cliRes.data ?? []).map((c: any) => [c.id, c.nombre]))
      return (data ?? []).map((v: any) => ({
        id: v.id, fecha: v.fecha, cliente: cliMap.get(v.cliente_id) ?? '(sin cliente)',
        total: v.total, moneda: v.moneda ?? 'UYU',
        entregada: v.entregado, cobrada: v.cobrado,
      }))
    }
    case 'buscar_cliente': {
      const { data, error } = await supabase.from('clientes').select('id,nombre,whatsapp,tipo,socio_asignado').ilike('nombre', `%${args.query}%`).limit(20)
      if (error) return { error: error.message }
      return data ?? []
    }
    case 'crear_gasto': {
      const payload = {
        fecha: args.fecha || new Date().toISOString().slice(0, 10),
        socio_id: userId,
        categoria: args.categoria,
        monto: Number(args.monto),
        moneda: args.moneda,
        descripcion: args.descripcion,
        reembolsable: args.tipo === 'reembolsable',
        reembolsado: false,
        es_adelanto: args.tipo === 'adelanto',
      }
      const { data, error } = await supabase.from('gastos').insert(payload).select('id, fecha, monto, moneda, descripcion').single()
      if (error) return { error: error.message }
      return { ok: true, gasto: data, tipo: args.tipo }
    }
    case 'marcar_venta': {
      const patch: any = { actualizado_en: new Date().toISOString() }
      if (typeof args.cobrada === 'boolean') patch.cobrado = args.cobrada
      if (typeof args.entregada === 'boolean') patch.entregado = args.entregada
      // estado sync
      if (patch.cobrado === true) patch.estado = 'cobrado'
      else if (patch.entregado === true) patch.estado = 'entregado'
      else patch.estado = 'pendiente'
      const { data, error } = await supabase.from('ventas').update(patch).eq('id', args.venta_id).select('id, entregado, cobrado, estado').single()
      if (error) return { error: error.message }
      return { ok: true, venta: data }
    }
    case 'resumen_mes': {
      const hoy = new Date()
      const anio = args.anio || hoy.getFullYear()
      const mes = args.mes || hoy.getMonth() + 1
      const desde = `${anio}-${String(mes).padStart(2, '0')}-01`
      const ultimo = new Date(anio, mes, 0).getDate()
      const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`
      const [ventas, gastos] = await Promise.all([
        supabase.from('ventas').select('total, entregado, cobrado').gte('fecha', desde).lte('fecha', hasta).neq('estado', 'cancelado'),
        supabase.from('gastos').select('monto, moneda, reembolsable, reembolsado, es_adelanto, socio_id').gte('fecha', desde).lte('fecha', hasta),
      ])
      const vArr = (ventas.data ?? []) as any[]
      const totalVentas = vArr.reduce((s, v) => s + Number(v.total || 0), 0)
      const cantVentas = vArr.length
      const pendCobro = vArr.filter((v) => !v.cobrado).length
      const pendEntrega = vArr.filter((v) => !v.entregado).length

      const gArr = (gastos.data ?? []) as any[]
      const misGastos = gArr.filter((g) => g.socio_id === userId)
      const opUYU = gArr.filter((g) => g.moneda === 'UYU' && !g.es_adelanto).reduce((s, g) => s + Number(g.monto), 0)
      const opUSD = gArr.filter((g) => g.moneda === 'USD' && !g.es_adelanto).reduce((s, g) => s + Number(g.monto), 0)
      const reembYo = misGastos.filter((g) => g.reembolsable && !g.reembolsado).reduce((s, g) => s + Number(g.monto), 0)
      const adelYo = misGastos.filter((g) => g.es_adelanto).reduce((s, g) => s + Number(g.monto), 0)

      return {
        periodo: { anio, mes, desde, hasta },
        ventas: { total_uyu: totalVentas, cantidad: cantVentas, pendientes_cobro: pendCobro, pendientes_entrega: pendEntrega },
        gastos: { operativos_uyu: opUYU, operativos_usd: opUSD },
        cuenta_socio: { a_favor_reembolsables: reembYo, adelantos_tomados: adelYo, ajuste_neto: reembYo - adelYo },
      }
    }
    case 'listar_clientes_riesgo': {
      const { data: ventas } = await supabase.from('ventas').select('cliente_id, fecha').neq('estado', 'cancelado').order('fecha', { ascending: false })
      const ultima = new Map<number, string>()
      for (const v of (ventas ?? []) as any[]) {
        if (v.cliente_id == null) continue
        if (!ultima.has(v.cliente_id)) ultima.set(v.cliente_id, v.fecha)
      }
      const enRiesgo: number[] = []
      for (const [cid, f] of ultima) {
        const d = Math.floor((Date.now() - new Date(f + 'T00:00:00').getTime()) / 86400000)
        if (d >= 60 && d <= 120) enRiesgo.push(cid)
      }
      if (enRiesgo.length === 0) return []
      const { data } = await supabase.from('clientes').select('id,nombre,whatsapp').in('id', enRiesgo)
      return (data ?? []).map((c: any) => ({ ...c, dias_desde_ultima: Math.floor((Date.now() - new Date(ultima.get(c.id)! + 'T00:00:00').getTime()) / 86400000) }))
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

async function correrAgente(mensajes: Array<{ role: string; content: string }>, systemPrompt: string, supabase: any, userId: string) {
  const contents: any[] = mensajes.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))
  const tools_decl = [{ functionDeclarations: asGeminiFunctionDeclarations() }]
  const accionesEjecutadas: any[] = []

  for (let iter = 0; iter < 8; iter++) {
    const resp = await callGemini({
      contents,
      tools: tools_decl,
      systemInstruction: { parts: [{ text: systemPrompt }] },
    })
    const cand = resp.candidates?.[0]
    if (!cand) return { texto: 'No obtuve respuesta del modelo.', acciones: accionesEjecutadas }
    const parts = cand.content?.parts ?? []
    // Buscar llamadas a funciones
    const fnCalls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall)
    if (fnCalls.length === 0) {
      // Respuesta final de texto
      const texto = parts.map((p: any) => p.text ?? '').join('').trim()
      return { texto, acciones: accionesEjecutadas }
    }
    // Ejecutar cada tool
    contents.push({ role: 'model', parts })
    const respuestas: any[] = []
    for (const fc of fnCalls) {
      const resultado = await ejecutarTool(fc.name, fc.args ?? {}, supabase, userId)
      accionesEjecutadas.push({ tool: fc.name, args: fc.args, resultado })
      respuestas.push({
        functionResponse: { name: fc.name, response: { name: fc.name, content: resultado } },
      })
    }
    contents.push({ role: 'user', parts: respuestas })
  }
  return { texto: 'Se agotaron los pasos del agente sin llegar a una respuesta final.', acciones: accionesEjecutadas }
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
    const mensajes: Array<{ role: string; content: string }> = body.mensajes ?? []
    if (mensajes.length === 0) return json({ error: 'Falta lista de mensajes' }, 400)

    const hoy = new Date().toLocaleDateString('es-UY', { day: 'numeric', month: 'long', year: 'numeric' })
    const systemPrompt = `Sos el asistente administrativo de Sierras de Aiguá, una almazara familiar en Uruguay.
Estás hablando con ${perfil?.nombre ?? 'un socio'} (rol: ${perfil?.rol ?? '?'}). Hoy es ${hoy}.

Tu trabajo es ayudarlo con la gestión: cargar gastos, revisar pendientes de cobro y entrega, resumir el mes, listar clientes en riesgo, etc.

Reglas:
- Contestá siempre en español rioplatense (voseo), directo y conciso.
- Usá las tools disponibles cuando necesites datos reales o hacer acciones. NO inventes datos.
- Para ACCIONES que crean o modifican registros (crear_gasto, marcar_venta), primero decile qué vas a hacer y pedile confirmación con "¿confirmás?", excepto si el usuario ya dijo claramente que sí.
- Al mostrar montos, siempre incluí la moneda (\$ o U\$S).
- Fechas en formato dd/mm o "ayer", "hoy", "hace 3 días".
- Si el usuario pide algo que no podés hacer con tus tools, decilo con claridad y sugerí cómo hacerlo desde la app.`

    const resultado = await correrAgente(mensajes, systemPrompt, supabase, userId)
    return json(resultado)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(o: any, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
