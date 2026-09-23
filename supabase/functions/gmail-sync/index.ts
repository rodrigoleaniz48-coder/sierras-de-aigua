// Edge Function: sincronizacion incremental de correos Gmail (solo lectura).
// POST action: sync — primera vez lista ultimos 30 dias, despues usa History API.
// No clasifica ni extrae datos. Solo trae metadata (de, asunto, fecha, snippet).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CLIENT_ID = Deno.env.get('GMAIL_CLIENT_ID')!
const CLIENT_SECRET = Deno.env.get('GMAIL_CLIENT_SECRET')!
const ENC_KEY = Deno.env.get('GMAIL_ENCRYPTION_KEY')!

const DIAS_PRIMERA_SYNC = 30
const MAX_MENSAJES_PRIMERA_SYNC = 100

// Filtro Gmail: solo correos de organismos fiscales, proveedores con facturas, etc.
// Usa sintaxis de busqueda Gmail: {a b c} = a OR b OR c
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

// ---- Crypto: misma logica que gmail-auth ----

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

// ---- Gmail API helpers ----

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

interface GmailHeader {
  name: string
  value: string
}

interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: {
    headers?: GmailHeader[]
  }
}

function headerValue(msg: GmailMessage, name: string): string {
  return msg.payload?.headers?.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  )?.value ?? ''
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

async function fetchMessageMeta(accessToken: string, msgId: string): Promise<GmailMessage> {
  return (await gmailGet(
    accessToken,
    `messages/${msgId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
  )) as GmailMessage
}

// ---- Sync logic ----

async function listarMensajesFiltrados(
  accessToken: string,
  afterDate: Date,
  maxMensajes: number,
): Promise<{ messages: GmailMessage[]; historyId: string }> {
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

  const messages: GmailMessage[] = []
  for (let i = 0; i < allIds.length; i += 10) {
    const batch = allIds.slice(i, i + 10)
    const results = await Promise.all(batch.map((id) => fetchMessageMeta(accessToken, id)))
    messages.push(...results)
  }

  const profile = (await gmailGet(accessToken, 'profile')) as { historyId: string }
  return { messages, historyId: profile.historyId }
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

  // Obtener cuenta activa
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

    // Primera sync: ultimos 30 dias. Incremental: desde ultima sync.
    // Ambas usan el mismo filtro por remitente/asunto fiscal.
    const afterDate = new Date()
    if (esPrimera) {
      afterDate.setDate(afterDate.getDate() - DIAS_PRIMERA_SYNC)
    } else {
      afterDate.setTime(new Date(cuenta.ultima_sync).getTime())
      afterDate.setDate(afterDate.getDate() - 1) // 1 dia de margen
    }

    const { messages, historyId: newHistoryId } = await listarMensajesFiltrados(
      accessToken,
      afterDate,
      MAX_MENSAJES_PRIMERA_SYNC,
    )

    // Insertar correos (upsert por gmail_id + cuenta_correo_id)
    if (messages!.length > 0) {
      const rows = messages!.map((m) => ({
        gmail_id: m.id,
        thread_id: m.threadId,
        de: headerValue(m, 'From'),
        asunto: headerValue(m, 'Subject'),
        fecha: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : new Date().toISOString(),
        snippet: m.snippet ?? '',
        label_ids: m.labelIds ?? [],
        cuenta_correo_id: cuenta.id,
      }))

      const { error: insertErr } = await admin
        .from('correos_sincronizados')
        .upsert(rows, { onConflict: 'gmail_id,cuenta_correo_id', ignoreDuplicates: true })

      if (insertErr) {
        return json({ error: `Error guardando correos: ${insertErr.message}` }, 500)
      }
    }

    // Solo actualizar estado tras exito completo
    await admin
      .from('cuentas_correo')
      .update({
        ultima_sync: new Date().toISOString(),
        ultimo_history_id: newHistoryId!,
        estado: 'activa',
        error_detalle: null,
      })
      .eq('id', cuenta.id)

    return json({
      ok: true,
      primera_sync: esPrimera,
      correos_nuevos: messages!.length,
      history_id: newHistoryId!,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: `Error en sincronizacion: ${msg}` }, 500)
  }
})
