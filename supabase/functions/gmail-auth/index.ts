// Edge Function: OAuth 2.0 solo lectura para Gmail.
// Acciones POST: connect (genera URL), exchange (code→tokens), disconnect (revoca).
// Scope unico: gmail.readonly. No se implementa envio/borrado/modificacion de correos.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CLIENT_ID = Deno.env.get('GMAIL_CLIENT_ID')!
const CLIENT_SECRET = Deno.env.get('GMAIL_CLIENT_SECRET')!
const ENC_KEY = Deno.env.get('GMAIL_ENCRYPTION_KEY')!
const APP_URL = (Deno.env.get('GMAIL_APP_URL') ?? '').replace(/\/$/, '')

const REDIRECT_URI = `${APP_URL}/contabilidad`
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ---- Crypto: AES-256-GCM para encriptar el refresh token ----

async function deriveKey(): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ENC_KEY))
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function encryptToken(token: string): Promise<string> {
  const key = await deriveKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token)),
  )
  const buf = new Uint8Array(iv.length + ct.length)
  buf.set(iv)
  buf.set(ct, iv.length)
  return btoa(String.fromCharCode(...buf))
}

async function decryptToken(b64: string): Promise<string> {
  const key = await deriveKey()
  const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12))
  return new TextDecoder().decode(dec)
}

// ---- Auth: verificar que el caller sea admin ----

async function requireAdmin(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!auth) return null
  const jwt = auth.replace('Bearer ', '')
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return null
  const { data: p } = await sb.from('perfiles').select('rol').eq('id', user.id).single()
  return p?.rol === 'admin' ? user : null
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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  let body: Record<string, string> = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Body JSON invalido' }, 400)
  }
  const { action } = body

  // ---- CONNECT: generar URL de consentimiento OAuth ----
  if (action === 'connect') {
    const user = await requireAdmin(req)
    if (!user) return json({ error: 'No autorizado' }, 403)

    const { data: existing } = await admin
      .from('cuentas_correo')
      .select('id')
      .eq('estado', 'activa')
      .limit(1)
    if (existing && existing.length > 0) return json({ error: 'Ya hay una cuenta conectada' }, 400)

    // Limpiar intentos previos incompletos
    await admin.from('cuentas_correo').delete().eq('estado', 'pendiente_oauth')

    const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('')

    const { error: insertErr } = await admin.from('cuentas_correo').insert({
      conectada_por: user.id,
      oauth_state: state,
      estado: 'pendiente_oauth',
    })
    if (insertErr) return json({ error: insertErr.message }, 500)

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
    })

    return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
  }

  // ---- EXCHANGE: intercambiar authorization code por tokens ----
  if (action === 'exchange') {
    const user = await requireAdmin(req)
    if (!user) return json({ error: 'No autorizado' }, 403)

    const { code, state } = body
    if (!code || !state) return json({ error: 'Faltan code o state' }, 400)

    const { data: cuenta } = await admin
      .from('cuentas_correo')
      .select('id')
      .eq('oauth_state', state)
      .eq('estado', 'pendiente_oauth')
      .single()
    if (!cuenta) return json({ error: 'State invalido o expirado' }, 400)

    // Intercambiar code por tokens en Google
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })
    const tokens = await tokenRes.json()

    if (tokens.error) {
      return json({ error: tokens.error_description || tokens.error }, 400)
    }
    if (!tokens.refresh_token) {
      return json(
        {
          error:
            'Google no devolvio refresh token. Revoca el acceso en myaccount.google.com/permissions y reintenta.',
        },
        400,
      )
    }

    // Obtener email de la cuenta
    const profRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const prof = await profRes.json()

    // Encriptar refresh token y guardar
    const enc = await encryptToken(tokens.refresh_token)
    await admin
      .from('cuentas_correo')
      .update({
        email: prof.emailAddress ?? '',
        refresh_token_enc: enc,
        estado: 'activa',
        oauth_state: null,
        error_detalle: null,
        ultimo_history_id: prof.historyId ? String(prof.historyId) : null,
      })
      .eq('id', cuenta.id)

    return json({ ok: true, email: prof.emailAddress })
  }

  // ---- DISCONNECT: revocar acceso y borrar cuenta ----
  if (action === 'disconnect') {
    const user = await requireAdmin(req)
    if (!user) return json({ error: 'No autorizado' }, 403)

    const { data: cuenta } = await admin
      .from('cuentas_correo')
      .select('id, refresh_token_enc')
      .eq('estado', 'activa')
      .limit(1)
      .single()
    if (!cuenta) return json({ error: 'No hay cuenta conectada' }, 400)

    // Revocar en Google (best-effort)
    try {
      const rt = await decryptToken(cuenta.refresh_token_enc)
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(rt)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    } catch {
      // Si falla la revocacion, seguimos con la limpieza local
    }

    await admin.from('cuentas_correo').delete().eq('id', cuenta.id)
    return json({ ok: true })
  }

  return json({ error: 'Accion no reconocida' }, 400)
})
