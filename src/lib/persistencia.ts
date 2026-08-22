/**
 * Utilidades para persistir estado UI en localStorage con TTL.
 * Uso típico: mantener abierto un diálogo cuando el navegador móvil mata la pestaña.
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000 // 24 h

/** Guarda un flag booleano bajo una key. */
export function guardarFlag(key: string, value: boolean) {
  try {
    if (value) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch { /* nada */ }
}

/** Lee un flag booleano guardado. */
export function leerFlag(key: string): boolean {
  try { return localStorage.getItem(key) === '1' } catch { return false }
}

/** Guarda un objeto con timestamp para expirar con TTL. */
export function guardarObj<T>(key: string, value: T, ttl = DEFAULT_TTL_MS) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), ttl, data: value }))
  } catch { /* nada */ }
}

/** Lee un objeto guardado; devuelve null si expiró o no existe. */
export function leerObj<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { ts?: number; ttl?: number; data?: T }
    if (!parsed?.ts || Date.now() - parsed.ts > (parsed.ttl ?? DEFAULT_TTL_MS)) {
      localStorage.removeItem(key)
      return null
    }
    return (parsed.data ?? null) as T | null
  } catch { return null }
}

export function borrarKey(key: string) {
  try { localStorage.removeItem(key) } catch { /* nada */ }
}
