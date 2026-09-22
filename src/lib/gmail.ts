import { supabase } from './supabase'

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
    .eq('estado', 'activa')
    .limit(1)
    .maybeSingle()
  return (data as CuentaCorreo) ?? null
}

export async function conectarGmail(): Promise<{ url?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('gmail-auth', {
    body: { action: 'connect' },
  })
  if (error) return { error: error.message }
  return data as { url?: string; error?: string }
}

export async function intercambiarCodigoGmail(
  code: string,
  state: string,
): Promise<{ ok?: boolean; email?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('gmail-auth', {
    body: { action: 'exchange', code, state },
  })
  if (error) return { error: error.message }
  return data as { ok?: boolean; email?: string; error?: string }
}

export async function desconectarGmail(): Promise<{ ok?: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('gmail-auth', {
    body: { action: 'disconnect' },
  })
  if (error) return { error: error.message }
  return data as { ok?: boolean; error?: string }
}
