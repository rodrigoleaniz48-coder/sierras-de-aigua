import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Dialog } from './Dialog'

// Chequeo de consistencia de datos internos. Solo lectura: detecta y lista
// posibles inconsistencias para revisar a mano. No modifica nada.

interface Hallazgo {
  titulo: string
  detalle: string
  items: string[]
  severidad: 'alta' | 'media'
}

function parseVentaId(desc: string | null): number | null {
  const m = /^Venta #(\d+)/.exec(desc ?? '')
  return m ? Number(m[1]) : null
}

export function RevisionDatosDialog({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [cargando, setCargando] = useState(false)
  const [hallazgos, setHallazgos] = useState<Hallazgo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function revisar() {
    setCargando(true); setError(null); setHallazgos(null)
    try {
      const [vR, itR, gR, clR] = await Promise.all([
        supabase.from('ventas').select('id,estado,cobrado,fecha_cobro,promocion_comercial,a_confirmar,cliente_id'),
        supabase.from('items_venta').select('venta_id,es_regalo'),
        supabase.from('gastos').select('id,descripcion,categoria,es_adelanto').ilike('descripcion', 'Venta #%'),
        supabase.from('clientes').select('id,nombre,tipo,saldo_inicial_fecha'),
      ])
      const ventas = (vR.data ?? []) as Record<string, any>[]
      const items = (itR.data ?? []) as { venta_id: number; es_regalo: boolean }[]
      const gastos = (gR.data ?? []) as Record<string, any>[]
      const clientes = (clR.data ?? []) as Record<string, any>[]

      const ventaById = new Map(ventas.map((v) => [v.id, v]))
      const tieneItems = new Set(items.map((i) => i.venta_id))
      const tieneRegalo = new Set(items.filter((i) => i.es_regalo).map((i) => i.venta_id))
      const ventasPorCliente = new Map<number, number>()
      for (const v of ventas) { if (v.cliente_id) ventasPorCliente.set(v.cliente_id, (ventasPorCliente.get(v.cliente_id) ?? 0) + 1) }

      const res: Hallazgo[] = []

      // 1) Gasto de promoción sobre una venta NO marcada como promo y SIN ítem de regalo
      //    (como pasó con Megalabs: el regalo quedó como venta normal).
      const promoRaras: string[] = []
      for (const g of gastos) {
        if (g.categoria !== 'promociones_comerciales') continue
        const vid = parseVentaId(g.descripcion)
        if (!vid) continue
        const v = ventaById.get(vid)
        if (v && !v.promocion_comercial && !tieneRegalo.has(vid)) promoRaras.push(`Venta #${vid}`)
      }
      if (promoRaras.length) res.push({ titulo: 'Regalo cargado como venta', severidad: 'alta', detalle: 'Hay gasto de promoción pero la venta no está marcada como promo ni tiene ítem de regalo. Podría estar contando como ingreso algo que fue regalo.', items: [...new Set(promoRaras)] })

      // 2) Distribuidores/mayoristas con ventas pero sin fecha de corte (mostrarían falsa deuda)
      const sinCorte: string[] = []
      for (const c of clientes) {
        if ((c.tipo === 'distribuidor' || c.tipo === 'mayorista') && !c.saldo_inicial_fecha && (ventasPorCliente.get(c.id) ?? 0) > 0) sinCorte.push(c.nombre)
      }
      if (sinCorte.length) res.push({ titulo: 'Cuenta corriente sin fecha de corte', severidad: 'media', detalle: 'Distribuidores/mayoristas con ventas y sin fecha de corte: sus ventas ya cobradas pueden figurar como deuda. Cargales el saldo inicial.', items: sinCorte })

      // 3) Ventas sin ítems (no canceladas)
      const sinItems = ventas.filter((v) => v.estado !== 'cancelado' && !tieneItems.has(v.id)).map((v) => `Venta #${v.id}`)
      if (sinItems.length) res.push({ titulo: 'Ventas sin productos', severidad: 'media', detalle: 'Ventas no canceladas que no tienen ningún ítem cargado.', items: sinItems })

      // 4) Gastos ligados a una venta inexistente o cancelada (adelanto/promo huérfano)
      const huerfanos: string[] = []
      for (const g of gastos) {
        const vid = parseVentaId(g.descripcion)
        if (!vid) continue
        const v = ventaById.get(vid)
        if (!v) huerfanos.push(`Gasto #${g.id} → Venta #${vid} (no existe)`)
        else if (v.estado === 'cancelado') huerfanos.push(`Gasto #${g.id} → Venta #${vid} (cancelada)`)
      }
      if (huerfanos.length) res.push({ titulo: 'Gastos ligados a ventas inexistentes/canceladas', severidad: 'media', detalle: 'Adelantos o gastos de promoción que quedaron apuntando a una venta borrada o anulada.', items: huerfanos })

      // 5) Incoherencias de cobro
      const cobroRaro = ventas.filter((v) => v.estado !== 'cancelado' && ((v.cobrado && !v.fecha_cobro) || (!v.cobrado && v.fecha_cobro))).map((v) => `Venta #${v.id} (${v.cobrado ? 'cobrada sin fecha' : 'fecha de cobro sin estar cobrada'})`)
      if (cobroRaro.length) res.push({ titulo: 'Estado de cobro incoherente', severidad: 'media', detalle: 'Ventas marcadas cobradas sin fecha de cobro, o con fecha de cobro pero sin estar cobradas.', items: cobroRaro })

      setHallazgos(res)
    } catch (e) {
      setError('Error revisando: ' + (e as Error).message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { if (abierto) revisar() }, [abierto])

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo="Revisión de datos" ancho="md">
      <div className="space-y-3">
        <p className="text-xs text-oliva-600">
          Busca inconsistencias en los datos internos para revisar a mano. No cambia nada; solo informa.
        </p>

        {cargando ? (
          <div className="card p-4 text-sm text-oliva-700">Revisando…</div>
        ) : error ? (
          <div className="card p-3 text-sm text-red-700 bg-red-50 border-red-200">{error}</div>
        ) : hallazgos && hallazgos.length === 0 ? (
          <div className="card p-4 text-sm text-green-800 bg-green-50 border-green-200">✅ Todo en orden. No se encontraron inconsistencias.</div>
        ) : hallazgos ? (
          <div className="space-y-2">
            <div className="text-sm text-oliva-800">{hallazgos.length} punto{hallazgos.length === 1 ? '' : 's'} para revisar:</div>
            {hallazgos.map((h, i) => (
              <div key={i} className={`rounded-lg border p-3 ${h.severidad === 'alta' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex items-center gap-2">
                  <span>{h.severidad === 'alta' ? '🔴' : '🟡'}</span>
                  <span className="text-sm font-semibold text-oliva-900">{h.titulo}</span>
                  <span className="text-[11px] text-oliva-600">({h.items.length})</span>
                </div>
                <div className="text-xs text-oliva-700 mt-1">{h.detalle}</div>
                <div className="text-xs text-oliva-800 mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  {h.items.slice(0, 40).map((it, j) => <span key={j} className="tabular-nums">{it}</span>)}
                  {h.items.length > 40 && <span className="text-oliva-500">… y {h.items.length - 40} más</span>}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondary" onClick={onCerrar}>Cerrar</button>
          <button className="btn-primary" onClick={revisar} disabled={cargando}>{cargando ? 'Revisando…' : 'Volver a revisar'}</button>
        </div>
      </div>
    </Dialog>
  )
}
