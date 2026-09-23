// Edge Function: sincronizacion incremental de correos Gmail (solo lectura).
// Trae metadata + cuerpo texto, extrae monto y fecha de vencimiento con regex.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CLIENT_ID = Deno.env.get('GMAIL_CLIENT_ID')!
const CLIENT_SECRET = Deno.env.get('GMAIL_CLIENT_SECRET')!
const ENC_KEY = Deno.env.get('GMAIL_ENCRYPTION_KEY')!

const DIAS_PRIMERA_SYNC = 30
const MAX_MENSAJES = 100

const GMAIL_QUERY_FILTER = [
  'from:dgi.gub.uy',
  'from:bps.gub.uy',
  'from:bse.com.uy',
  'subject:factura',
  'subject:impuesto',
  'subject:vencimiento',
  'subject:obligacion',
  'subject:tributo',
  'subject:DGI',
  'subject:BPS',
  'subject:BSE',
  'subject:IRPF',
  'subject:IVA',
  'subject:IRAE',
  'subject:aportes',
  'subject:contribucion',
  'subject:proveedor',
].join(' ')

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ---- Crypto ----

async function deriveKey(): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ENC_KEY))
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function decryptToken(b64: string): Promise<string> {
  const key = await deriveKey()
  const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const dec = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: buf.slice(0, 12) },
    key,
    buf.slice(12),
  )
  return new TextDecoder().decode(dec)
}

// ---- Auth ----

async function requireAdmin(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!auth) return null
  const jwt = auth.replace('Bearer ', '')
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: p } = await sb.from('perfiles').select('rol').eq('id', user.id).single()
  return p?.rol === 'admin' ? user : null
}

// ---- Gmail API ----

async function getAccessToken(refreshTokenEnc: string): Promise<string> {
  const refreshToken = await decryptToken(refreshTokenEnc)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error_description || data.error)
  return data.access_token
}

// deno-lint-ignore no-explicit-any
type GmailPayload = any

interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: GmailPayload
}

function headerValue(msg: GmailMessage, name: string): string {
  const headers = msg.payload?.headers as { name: string; value: string }[] | undefined
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

async function gmailGet(accessToken: string, path: string): Promise<unknown> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gmail API ${res.status}: ${err}`)
  }
  return res.json()
}

async function fetchMessageFull(accessToken: string, msgId: string): Promise<GmailMessage> {
  return (await gmailGet(accessToken, `messages/${msgId}?format=full`)) as GmailMessage
}

// ---- Extraer texto plano del body ----

function base64UrlDecode(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function extractPlainText(payload: GmailPayload): string {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return base64UrlDecode(payload.body.data)
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return base64UrlDecode(part.body.data)
      }
    }
    for (const part of payload.parts) {
      if (part.parts) {
        const t = extractPlainText(part)
        if (t) return t
      }
    }
  }
  return ''
}

// ---- Deteccion de monto y fecha de vencimiento ----

function detectarMonto(texto: string): number | null {
  const patterns = [
    /(?:total|monto|importe|pagar|abonar|deuda|saldo)[\s:$]*(\d[\d.,]*)/gi,
    /\$\s*([\d.]+(?:,\d{1,2})?)/g,
    /(?:UYU|U\$S|USD)\s*([\d.]+(?:,\d{1,2})?)/gi,
  ]
  for (const re of patterns) {
    re.lastIndex = 0
    const match = re.exec(texto)
    if (match) {
      let numStr = match[1]
      if (numStr.includes(',')) {
        numStr = numStr.replace(/\./g, '').replace(',', '.')
      }
      const val = parseFloat(numStr)
      if (!isNaN(val) && val > 0 && val < 100_000_000) return val
    }
  }
  return null
}

function detectarFechaVencimiento(texto: string): string | null {
  const patterns = [
    /venc\w*[\s.:]*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/gi,
    /fecha\s*l[ií]mite[\s.:]*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/gi,
    /plazo[\s.:]*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/gi,
    /venc\w*[\s.:]*(\d{1,2})\s+de\s+(\w+)\s+(?:de\s+)?(\d{2,4})/gi,
  ]
  for (const re of patterns) {
    re.lastIndex = 0
    const match = re.exec(texto)
    if (match) {
      const [, d, mRaw, yRaw] = match
      let m = mRaw
      let y = yRaw
      // Si m es texto (enero, febrero...) convertir a numero
      const meses: Record<string, string> = {
        enero: '01', febrero: '02', marzo: '03', abril: '04',
        mayo: '05', junio: '06', julio: '07', agosto: '08',
        septiembre: '09', setiembre: '09', octubre: '10',
        noviembre: '11', diciembre: '12',
      }
      if (meses[m.toLowerCase()]) m = meses[m.toLowerCase()]
      if (y.length === 2) y = `20${y}`
      const mm = m.padStart(2, '0')
      const dd = d.padStart(2, '0')
      if (Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31) {
        return `${y}-${mm}-${dd}`
      }
    }
  }
  return null
}

// ---- Sync ----

interface CorreoRow {
  gmail_id: string
  thread_id: string
  de: string
  asunto: string
  fecha: string
  snippet: string
  label_ids: string[]
  cuenta_correo_id: number
  cuerpo_texto: string
  monto_detectado: number | null
  fecha_vencimiento: string | null
}

async function listarYProcesar(
  accessToken: string,
  afterDate: Date,
  maxMensajes: number,
  cuentaId: number,
): Promise<{ rows: CorreoRow[]; historyId: string }> {
  const afterStr = `${afterDate.getFullYear()}/${String(afterDate.getMonth() + 1).padStart(2, '0')}/${String(afterDate.getDate()).padStart(2, '0')}`
  const q = `{${GMAIL_QUERY_FILTER}} after:${afterStr}`

  const allIds: string[] = []
  let pageToken: string | undefined

  while (allIds.length < maxMensajes) {
    const params = new URLSearchParams({
      q,
      maxResults: String(Math.min(50, maxMensajes - allIds.length)),
    })
    if (pageToken) params.set('pageToken', pageToken)

    const list = (await gmailGet(accessToken, `messages?${params}`)) as {
      messages?: { id: string }[]
      nextPageToken?: string
    }

    if (list.messages) {
      for (const m of list.messages) allIds.push(m.id)
    }
    if (!list.nextPageToken || !list.messages) break
    pageToken = list.nextPageToken
  }

  const rows: CorreoRow[] = []
  for (let i = 0; i < allIds.length; i += 5) {
    const batch = allIds.slice(i, i + 5)
    const results = await Promise.all(batch.map((id) => fetchMessageFull(accessToken, id)))
    for (const m of results) {
      const cuerpo = extractPlainText(m.payload)
      const textoCompleto = `${headerValue(m, 'Subject')} ${m.snippet ?? ''} ${cuerpo}`
      rows.push({
        gmail_id: m.id,
        thread_id: m.threadId,
        de: headerValue(m, 'From'),
        asunto: headerValue(m, 'Subject'),
        fecha: m.internalDate
          ? new Date(Number(m.internalDate)).toISOString()
          : new Date().toISOString(),
        snippet: m.snippet ?? '',
        label_ids: m.labelIds ?? [],
        cuenta_correo_id: cuentaId,
        cuerpo_texto: cuerpo.slice(0, 5000),
        monto_detectado: detectarMonto(textoCompleto),
        fecha_vencimiento: detectarFechaVencimiento(textoCompleto),
      })
    }
  }

  const profile = (await gmailGet(accessToken, 'profile')) as { historyId: string }
  return { rows, historyId: profile.historyId }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ---- Handler ----

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Metodo no soportado' }, 405)

  const user = await requireAdmin(req)
  if (!user) return json({ error: 'No autorizado' }, 403)

  let body: Record<string, string> = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Body JSON invalido' }, 400)
  }

  if (body.action !== 'sync') return json({ error: 'Accion no reconocida' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: cuenta } = await admin
    .from('cuentas_correo')
    .select('id, email, refresh_token_enc, ultimo_history_id, ultima_sync')
    .eq('estado', 'activa')
    .limit(1)
    .single()

  if (!cuenta) return json({ error: 'No hay cuenta de Gmail conectada' }, 400)

  let accessToken: string
  try {
    accessToken = await getAccessToken(cuenta.refresh_token_enc)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await admin
      .from('cuentas_correo')
      .update({ estado: 'error_token', error_detalle: msg })
      .eq('id', cuenta.id)
    return json({ error: `Error de autenticacion: ${msg}` }, 401)
  }

  try {
    const esPrimera = !cuenta.ultima_sync

    const afterDate = new Date()
    if (esPrimera) {
      afterDate.setDate(afterDate.getDate() - DIAS_PRIMERA_SYNC)
    } else {
      afterDate.setTime(new Date(cuenta.ultima_sync).getTime())
      afterDate.setDate(afterDate.getDate() - 1)
    }

    const { rows, historyId: newHistoryId } = await listarYProcesar(
      accessToken,
      afterDate,
      MAX_MENSAJES,
      cuenta.id,
    )

    if (rows.length > 0) {
      const { error: insertErr } = await admin
        .from('correos_sincronizados')
        .upsert(rows, { onConflict: 'gmail_id,cuenta_correo_id', ignoreDuplicates: true })

      if (insertErr) {
        return json({ error: `Error guardando correos: ${insertErr.message}` }, 500)
      }
    }

    await admin
      .from('cuentas_correo')
      .update({
        ultima_sync: new Date().toISOString(),
        ultimo_history_id: newHistoryId,
        estado: 'activa',
        error_detalle: null,
      })
      .eq('id', cuenta.id)

    return json({
      ok: true,
      primera_sync: esPrimera,
      correos_nuevos: rows.length,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: `Error en sincronizacion: ${msg}` }, 500)
  }
})
