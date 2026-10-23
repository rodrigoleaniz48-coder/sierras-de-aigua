import { supabase } from './supabase'

// Las edge functions, ante un error, devuelven { error: "..." } con status != 2xx.
// supabase-js reporta solo "Edge Function returned a non-2xx status code"; el detalle
// real viaja en el cuerpo de la respuesta (error.context). Lo extraemos para mostrarlo.
async function detalleErrorFn(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response } | null)?.context
  if (ctx && typeof ctx.text === 'function') {
    try {
      const txt = await ctx.text()
      if (txt) {
        try { const j = JSON.parse(txt); if (j?.error) return String(j.error) } catch { /* no era JSON */ }
        if (txt.trim()) return txt.slice(0, 500)
      }
    } catch { /* cuerpo ya consumido */ }
  }
  return (error as { message?: string } | null)?.message ?? 'Error desconocido'
}

export interface CuentaCorreo {
  id: number
  email: string
  estado: string
  ultima_sync: string | null
  error_detalle: string | null
  creada_en: string
}

export async function obtenerCuentaCorreo(): Promise<CuentaCorreo | null> {
  const { data } = await supabase
    .from('cuentas_correo')
    .select('id, email, estado, ultima_sync, error_detalle, creada_en')
    .in('estado', ['activa', 'error_token'])
    .limit(1)
    .maybeSingle()
  return (data as CuentaCorreo) ?? null
}

export async function conectarGmail(): Promise<{ url?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('gmail-auth', {
    body: { action: 'connect' },
  })
  if (error) return { error: await detalleErrorFn(error) }
  return data as { url?: string; error?: string }
}

export async function intercambiarCodigoGmail(
  code: string,
  state: string,
): Promise<{ ok?: boolean; email?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('gmail-auth', {
    body: { action: 'exchange', code, state },
  })
  if (error) return { error: await detalleErrorFn(error) }
  return data as { ok?: boolean; email?: string; error?: string }
}

export async function desconectarGmail(): Promise<{ ok?: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('gmail-auth', {
    body: { action: 'disconnect' },
  })
  if (error) return { error: await detalleErrorFn(error) }
  return data as { ok?: boolean; error?: string }
}

// ---- Sincronización ----

export interface CorreoSincronizado {
  id: number
  gmail_id: string
  de: string
  asunto: string
  fecha: string
  snippet: string
  monto_detectado: number | null
  moneda_detectada: string | null
  fecha_vencimiento: string | null
  cuerpo_texto: string | null
  estado_manual: 'pagada' | 'descartada' | 'revisar' | null
}

export async function sincronizarGmail(deep = false): Promise<{
  ok?: boolean
  correos_nuevos?: number
  primera_sync?: boolean
  error?: string
}> {
  const { data, error } = await supabase.functions.invoke('gmail-sync', {
    body: { action: 'sync', deep },
  })
  if (error) return { error: await detalleErrorFn(error) }
  return data as { ok?: boolean; correos_nuevos?: number; primera_sync?: boolean; error?: string }
}

export async function obtenerCorreosSincronizados(limite = 50): Promise<CorreoSincronizado[]> {
  const { data } = await supabase
    .from('correos_sincronizados')
    .select('id, gmail_id, de, asunto, fecha, snippet, monto_detectado, moneda_detectada, fecha_vencimiento, cuerpo_texto, estado_manual')
    .order('fecha', { ascending: false })
    .limit(limite)
  return (data as CorreoSincronizado[]) ?? []
}
