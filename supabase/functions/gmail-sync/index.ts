// Edge Function: sincronizacion de facturas/obligaciones desde Gmail (solo lectura).
// Agrupa por thread, lee adjuntos PDF para detectar montos con unpdf + fallback basico.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import { getDocumentProxy, extractText as unpdfExtract } from 'https://esm.sh/unpdf@0.12.1'

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

// ---- Extraer texto plano del body (recursivo) ----

function base64UrlDecode(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#?\w+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractPlainText(payload: GmailPayload): string {
  if (!payload) return ''

  // Texto plano directo
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return base64UrlDecode(payload.body.data)
  }

  // HTML directo (sin parts)
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return stripHtml(base64UrlDecode(payload.body.data))
  }

  if (!payload.parts) return ''

  // Buscar text/plain en cualquier nivel
  for (const part of payload.parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return base64UrlDecode(part.body.data)
    }
  }

  // Buscar recursivamente en sub-parts (multipart/alternative dentro de multipart/mixed)
  for (const part of payload.parts) {
    if (part.mimeType?.startsWith('multipart/') && part.parts) {
      const found = extractPlainText(part)
      if (found) return found
    }
  }

  // Fallback: extraer de HTML
  for (const part of payload.parts) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      return stripHtml(base64UrlDecode(part.body.data))
    }
  }
  for (const part of payload.parts) {
    if (part.parts) {
      for (const sub of part.parts) {
        if (sub.mimeType === 'text/html' && sub.body?.data) {
          return stripHtml(base64UrlDecode(sub.body.data))
        }
      }
    }
  }

  return ''
}

// ---- Adjuntos: descarga y extraccion de texto ----

interface AdjuntoPart {
  attachmentId: string
  filename: string
  mimeType: string
  size: number
}

function getAdjuntos(payload: GmailPayload): AdjuntoPart[] {
  const parts: AdjuntoPart[] = []
  function scan(p: GmailPayload) {
    if (p.filename && p.body?.attachmentId) {
      parts.push({
        attachmentId: p.body.attachmentId,
        filename: p.filename,
        mimeType: p.mimeType || '',
        size: p.body.size || 0,
      })
    }
    if (p.parts) for (const sub of p.parts) scan(sub)
  }
  scan(payload)
  return parts
}

async function downloadAdjunto(accessToken: string, msgId: string, attId: string): Promise<Uint8Array> {
  const resp = (await gmailGet(accessToken, `messages/${msgId}/attachments/${attId}`)) as { data: string }
  const b64 = resp.data.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

// ---- PDF: extraccion con unpdf (pdfjs) + fallback basico ----

async function extraerTextoPdf(data: Uint8Array): Promise<string> {
  // unpdf: parser completo basado en pdfjs-dist
  try {
    const pdf = await getDocumentProxy(new Uint8Array(data))
    const { text } = await unpdfExtract(pdf, { mergePages: true })
    if (text && text.trim().length > 10) return text
  } catch {
    // Si unpdf falla, intentar extraccion basica
  }
  return extraerTextoPdfBasico(data)
}

// Fallback: extraccion basica de streams PDF (funciona con PDFs simples)
function decodePdfStr(s: string): string {
  return s.replace(/\\([nrtbf\\()]|[0-7]{1,3})/g, (_, c: string) => {
    const map: Record<string, string> = {
      n: '\n', r: '\r', t: '\t', b: '\b', f: '\f',
      '\\': '\\', '(': '(', ')': ')',
    }
    return map[c] ?? String.fromCharCode(parseInt(c, 8))
  })
}

function extraerOpsTexto(stream: string, out: string[]) {
  let match
  const tjRe = /\(([^)]*)\)\s*Tj/g
  while ((match = tjRe.exec(stream)) !== null) {
    const t = decodePdfStr(match[1])
    if (t.trim()) out.push(t)
  }
  const tjArrRe = /\[((?:\([^)]*\)|[^[\]])*)\]\s*TJ/gi
  while ((match = tjArrRe.exec(stream)) !== null) {
    const parts = [...match[1].matchAll(/\(([^)]*)\)/g)]
    const combined = parts.map((p) => decodePdfStr(p[1])).join('')
    if (combined.trim()) out.push(combined)
  }
}

async function extraerTextoPdfBasico(data: Uint8Array): Promise<string> {
  const raw = new TextDecoder('latin1').decode(data)
  const textos: string[] = []

  let pos = 0
  while (pos < raw.length) {
    const idx = raw.indexOf('stream', pos)
    if (idx === -1) break
    let start = idx + 6
    if (raw[start] === '\r') start++
    if (raw[start] === '\n') start++
    const end = raw.indexOf('endstream', start)
    if (end === -1) break

    const content = raw.substring(start, end)
    const bytes = new Uint8Array(content.length)
    for (let i = 0; i < content.length; i++) bytes[i] = content.charCodeAt(i)

    let decompressed = ''
    for (const fmt of ['deflate', 'deflate-raw'] as CompressionFormat[]) {
      try {
        const ds = new DecompressionStream(fmt)
        const w = ds.writable.getWriter()
        w.write(bytes).catch(() => {})
        w.close().catch(() => {})
        const r = ds.readable.getReader()
        const chunks: Uint8Array[] = []
        while (true) {
          const { value, done } = await r.read()
          if (done) break
          if (value) chunks.push(value)
        }
        const total = chunks.reduce((a, c) => a + c.length, 0)
        const merged = new Uint8Array(total)
        let off = 0
        for (const c of chunks) { merged.set(c, off); off += c.length }
        decompressed = new TextDecoder('latin1').decode(merged)
        break
      } catch { continue }
    }

    extraerOpsTexto(decompressed || content, textos)
    pos = end + 9
  }

  extraerOpsTexto(raw, textos)
  return textos.join(' ').replace(/\s+/g, ' ').trim()
}

// ---- Extraer texto de adjuntos ----

async function extraerTextoAdjuntos(
  accessToken: string,
  msgId: string,
  payload: GmailPayload,
): Promise<string> {
  const adjuntos = getAdjuntos(payload)
  const relevantes = adjuntos
    .filter((a) => {
      const n = a.filename.toLowerCase()
      const m = a.mimeType.toLowerCase()
      return (
        m === 'application/pdf' || n.endsWith('.pdf') ||
        m.startsWith('text/') || n.endsWith('.txt') || n.endsWith('.csv') ||
        n.endsWith('.html') || n.endsWith('.htm')
      )
    })
    .filter((a) => a.size < 5_000_000)
    .slice(0, 3)

  const textos: string[] = []
  for (const att of relevantes) {
    try {
      const bytes = await downloadAdjunto(accessToken, msgId, att.attachmentId)
      const nombre = att.filename.toLowerCase()
      const mime = att.mimeType.toLowerCase()

      if (mime === 'application/pdf' || nombre.endsWith('.pdf')) {
        textos.push(await extraerTextoPdf(bytes))
      } else if (mime === 'text/html' || nombre.endsWith('.html') || nombre.endsWith('.htm')) {
        textos.push(stripHtml(new TextDecoder('utf-8', { fatal: false }).decode(bytes)))
      } else {
        textos.push(new TextDecoder('utf-8', { fatal: false }).decode(bytes))
      }
    } catch {
      // Ignorar errores de descarga/parseo
    }
  }
  return textos.join(' ')
}

// ---- Deteccion de monto y fecha de vencimiento ----

function parseAmount(raw: string): number | null {
  let s = raw.trim()
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes(',')) {
    const afterComma = s.split(',')[1]
    if (afterComma && afterComma.length <= 2) {
      s = s.replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (s.includes('.')) {
    const parts = s.split('.')
    if (parts.length > 2) {
      s = s.replace(/\./g, '')
    } else {
      const afterDot = parts[1]
      if (afterDot && afterDot.length === 3) {
        s = s.replace('.', '')
      }
    }
  }
  const val = parseFloat(s)
  return isNaN(val) ? null : val
}

function detectarMonto(texto: string): number | null {
  const patterns = [
    /(?:total|monto|importe|pagar|abonar|deuda|saldo|cobrar|cuota|prima|aporte)[\s:$U]*(\d[\d.,]*)/gi,
    /\$\s*([\d.]+(?:,\d{1,2})?)/g,
    /(?:UYU|U\$S|USD|US\$)\s*([\d.]+(?:,\d{1,2})?)/gi,
    /(\d[\d.]*,\d{2})\s*(?:pesos|UYU|\$)/gi,
  ]
  let best: number | null = null
  for (const re of patterns) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(texto)) !== null) {
      const val = parseAmount(match[1])
      if (val != null && val > 10 && val < 5_000_000) {
        if (best === null || val > best) best = val
      }
    }
  }
  return best
}

function detectarFechaVencimiento(texto: string): string | null {
  const patterns = [
    /venc\w*[\s.:]*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/gi,
    /fecha\s*l[ií]mite[\s.:]*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/gi,
    /plazo[\s.:]*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/gi,
    /venc\w*[\s.:]*(\d{1,2})\s+de\s+(\w+)\s+(?:de\s+)?(\d{2,4})/gi,
    /(?:pagar|abonar)\s+(?:antes|hasta)\s+(?:el\s+)?(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/gi,
  ]
  const meses: Record<string, string> = {
    enero: '01', febrero: '02', marzo: '03', abril: '04',
    mayo: '05', junio: '06', julio: '07', agosto: '08',
    septiembre: '09', setiembre: '09', octubre: '10',
    noviembre: '11', diciembre: '12',
  }
  for (const re of patterns) {
    re.lastIndex = 0
    const match = re.exec(texto)
    if (match) {
      const [, d, mRaw, yRaw] = match
      const m = meses[mRaw.toLowerCase()] ?? mRaw
      let y = yRaw
      if (y.length === 2) y = `20${y}`
      const mm = m.padStart(2, '0')
      const dd = d.padStart(2, '0')
      const yNum = Number(y)
      if (Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31 && yNum >= 2020 && yNum <= 2035) {
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

  // Fetch full messages en lotes de 5
  const allRows: CorreoRow[] = []
  for (let i = 0; i < allIds.length; i += 5) {
    const batch = allIds.slice(i, i + 5)
    const results = await Promise.all(
      batch.map((id) =>
        gmailGet(accessToken, `messages/${id}?format=full`) as Promise<GmailMessage>,
      ),
    )
    for (const m of results) {
      const cuerpo = extractPlainText(m.payload)
      const textoCuerpo = `${headerValue(m, 'Subject')} ${m.snippet ?? ''} ${cuerpo}`

      let montoDetectado = detectarMonto(textoCuerpo)
      let textoCompleto = textoCuerpo
      let fechaVenc = detectarFechaVencimiento(textoCuerpo)

      // Si no hay monto en el cuerpo, leer adjuntos (PDF, TXT, HTML)
      if (montoDetectado == null) {
        try {
          const textoAdj = await extraerTextoAdjuntos(accessToken, m.id, m.payload)
          if (textoAdj) {
            textoCompleto += ' ' + textoAdj
            montoDetectado = detectarMonto(textoCompleto)
            if (!fechaVenc) fechaVenc = detectarFechaVencimiento(textoAdj)
          }
        } catch {
          // Si falla la lectura de adjuntos, seguir sin ellos
        }
      }

      allRows.push({
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
        monto_detectado: montoDetectado,
        fecha_vencimiento: fechaVenc,
      })
    }
  }

  // Deduplicar por thread: quedarse con el mensaje que tenga monto
  const byThread = new Map<string, CorreoRow>()
  for (const row of allRows) {
    const existing = byThread.get(row.thread_id)
    if (!existing) {
      byThread.set(row.thread_id, row)
    } else if (row.monto_detectado != null && existing.monto_detectado == null) {
      byThread.set(row.thread_id, row)
    } else if (
      row.monto_detectado != null &&
      existing.monto_detectado != null &&
      row.cuerpo_texto.length > existing.cuerpo_texto.length
    ) {
      byThread.set(row.thread_id, row)
    }
  }

  // Guardar todos los threads fiscales
  const rows = [...byThread.values()]

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
        .upsert(rows, { onConflict: 'thread_id,cuenta_correo_id', ignoreDuplicates: false })

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
