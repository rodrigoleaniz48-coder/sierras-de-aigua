// Helper para obtener la cotización USD/UYU desde el BCU (via edge function).
// Compartido por Ventas (nueva venta USD) y Admin (costo envasado en USD).

export interface CotizacionBCU {
  fecha: string           // 'YYYY-MM-DD'
  cotizacion: number      // pesos por 1 USD (promedio TCC/TCV)
}

export async function fetchCotizacionBCU(): Promise<CotizacionBCU | null> {
  try {
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bcu-cotizacion`, {
      headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
    })
    const j = await resp.json()
    if (!resp.ok || j.error) throw new Error(j.error || `HTTP ${resp.status}`)
    return { fecha: j.fecha, cotizacion: Number(j.cotizacion) }
  } catch {
    return null
  }
}
