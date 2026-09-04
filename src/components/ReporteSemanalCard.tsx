import { useEffect, useState } from 'react'
import { Dialog } from './Dialog'
import { money, num } from '../lib/format'
import {
  generarReporteSemanaPasada,
  marcarReporteVisto,
  reporteVisto,
  type ReporteSemanal,
} from '../lib/reporte'

interface Props {
  /** Si es true, se marca automáticamente como visto al abrir el modal. */
  autoMarcarVisto?: boolean
  /** Callback cuando se marca como visto (para refrescar el badge en Layout). */
  onVisto?: () => void
  /** Versión compacta (1 fila) para el dashboard. */
  compact?: boolean
}

// Renderiza el par pesos + dólares en una línea (ambos si aplican, si no solo el que tenga monto)
function ambosMontos(uyu: number, usd: number): string {
  if (uyu > 0 && usd > 0) return `${money(uyu, 'UYU')} + ${money(usd, 'USD')}`
  if (usd > 0) return money(usd, 'USD')
  return money(uyu, 'UYU')
}

export function ReporteSemanalCard({ autoMarcarVisto = true, onVisto, compact }: Props) {
  const [rep, setRep] = useState<ReporteSemanal | null>(null)
  const [cargando, setCargando] = useState(true)
  const [modal, setModal] = useState(false)

  useEffect(() => {
    generarReporteSemanaPasada().then((r) => { setRep(r); setCargando(false) })
  }, [])

  if (cargando) {
    return <div className="card p-4 text-sm text-oliva-700">Preparando reporte de la semana pasada…</div>
  }
  if (!rep) return null

  const visto = reporteVisto(rep.semanaISO)
  const nuevo = !visto
  const deltaClaseUYU = rep.deltaPctUYU >= 0 ? 'text-green-700' : 'text-red-700'
  const deltaClaseUSD = rep.deltaPctUSD >= 0 ? 'text-green-700' : 'text-red-700'
  const sig = (n: number) => n >= 0 ? '↑' : '↓'

  function abrir() {
    setModal(true)
    if (autoMarcarVisto && !visto) {
      marcarReporteVisto(rep!.semanaISO)
      onVisto?.()
    }
  }

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={abrir}
          className={`w-full flex items-center gap-3 text-left rounded-lg border px-3 py-2.5 transition ${nuevo ? 'border-aceite-500/60 bg-aceite-500/10 hover:bg-aceite-500/20' : 'border-oliva-100 bg-white hover:bg-oliva-50'}`}
        >
          <span className="text-[10px] font-bold uppercase tracking-widest text-oliva-500 shrink-0">Reporte sem.</span>
          <span className="text-xs text-oliva-600 shrink-0 hidden sm:inline">{rep.desde}–{rep.hasta}</span>
          <span className="text-sm font-bold text-oliva-900 tabular-nums">{ambosMontos(rep.totalUYU, rep.totalUSD)}</span>
          <span className="text-[11px] text-oliva-500">·</span>
          <span className="text-xs text-oliva-700">{rep.cantidadVentas} vta.</span>
          {nuevo && (
            <span className="text-[9px] uppercase tracking-wide rounded-full bg-aceite-500 text-white px-1.5 py-0.5 font-bold">nuevo</span>
          )}
          <span className="ml-auto text-xs text-oliva-700 font-semibold">Ver detalle →</span>
        </button>
      ) : (
      <div className={`card p-4 ${nuevo ? 'border-2 border-aceite-500/60 bg-aceite-500/5' : ''}`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-oliva-600">📊 Reporte semanal</span>
              {nuevo && (
                <span className="text-[10px] uppercase tracking-wide rounded-full bg-aceite-500 text-white px-2 py-[1px] font-semibold">Nuevo</span>
              )}
            </div>
            <div className="text-lg font-semibold text-oliva-900 mt-1">
              Semana del {rep.desde} al {rep.hasta}
            </div>
            <div className="text-xs text-oliva-600 mt-0.5">
              {rep.cantidadVentas} ventas · {rep.cantidadEnvios} con envío
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold text-oliva-900 tabular-nums">{ambosMontos(rep.totalUYU, rep.totalUSD)}</div>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button className="btn-primary text-sm" onClick={abrir}>
            {nuevo ? 'Ver reporte' : 'Ver de nuevo'}
          </button>
        </div>
      </div>
      )}

      <Dialog abierto={modal} onCerrar={() => setModal(false)} titulo={`Reporte semanal · ${rep.desde} → ${rep.hasta}`} ancho="lg">
        <div className="space-y-5">
          {/* KPIs - separados por moneda */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-oliva-50 border border-oliva-100 p-3">
              <div className="text-[11px] uppercase tracking-wide text-oliva-600">Total en pesos</div>
              <div className="text-lg font-semibold text-oliva-900 tabular-nums">{money(rep.totalUYU, 'UYU')}</div>
              <div className="text-[11px] text-oliva-500 mt-0.5">{rep.cantUYU} venta{rep.cantUYU === 1 ? '' : 's'}</div>
            </div>
            <div className="rounded-lg bg-oliva-50 border border-oliva-100 p-3">
              <div className="text-[11px] uppercase tracking-wide text-oliva-600">Total en dólares</div>
              <div className="text-lg font-semibold text-oliva-900 tabular-nums">{money(rep.totalUSD, 'USD')}</div>
              <div className="text-[11px] text-oliva-500 mt-0.5">{rep.cantUSD} venta{rep.cantUSD === 1 ? '' : 's'}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Kpi titulo="Cant. ventas" valor={rep.cantidadVentas.toString()} />
            <Kpi titulo="🛵 Envíos" valor={rep.cantidadEnvios.toString()} />
          </div>

          {/* Comparativo */}
          <div className="rounded-xl border border-oliva-100 bg-oliva-50/60 p-4 space-y-2">
            <div className="text-xs uppercase tracking-wide text-oliva-600">Comparativo vs semana anterior</div>
            <div className="text-sm text-oliva-800">
              Pesos: <b className="tabular-nums">{money(rep.totalUYUAnterior, 'UYU')}</b>
              {' '}
              {rep.totalUYUAnterior > 0 && (
                <span className={deltaClaseUYU + ' font-semibold ml-1'}>
                  {sig(rep.deltaPctUYU)} {Math.abs(rep.deltaPctUYU).toFixed(1)}%
                </span>
              )}
            </div>
            <div className="text-sm text-oliva-800">
              Dólares: <b className="tabular-nums">{money(rep.totalUSDAnterior, 'USD')}</b>
              {' '}
              {rep.totalUSDAnterior > 0 && (
                <span className={deltaClaseUSD + ' font-semibold ml-1'}>
                  {sig(rep.deltaPctUSD)} {Math.abs(rep.deltaPctUSD).toFixed(1)}%
                </span>
              )}
            </div>
            <div className="text-xs text-oliva-600">{rep.ventasSemanaAnterior} ventas la semana anterior.</div>
          </div>

          {/* Por socio - con ambas columnas */}
          <Seccion titulo="Ventas por socio">
            {rep.porSocio.length === 0 ? (
              <div className="text-sm text-oliva-600 italic">Sin datos.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-oliva-100 text-[10px] uppercase tracking-wide text-oliva-500">
                    <th className="py-1 text-left font-semibold">Socio</th>
                    <th className="py-1 text-right font-semibold">Vtas.</th>
                    <th className="py-1 text-right font-semibold">Pesos</th>
                    <th className="py-1 text-right font-semibold">Dólares</th>
                  </tr>
                </thead>
                <tbody>
                  {rep.porSocio.map((s) => (
                    <tr key={s.nombre} className="border-b border-oliva-100/70 last:border-0">
                      <td className="py-1.5 text-oliva-800">{s.nombre}</td>
                      <td className="py-1.5 text-right text-oliva-600 text-xs">{s.count}</td>
                      <td className={`py-1.5 text-right tabular-nums font-medium ${s.uyu > 0 ? 'text-oliva-900' : 'text-oliva-300'}`}>{s.uyu > 0 ? money(s.uyu, 'UYU') : '—'}</td>
                      <td className={`py-1.5 text-right tabular-nums font-medium ${s.usd > 0 ? 'text-oliva-900' : 'text-oliva-300'}`}>{s.usd > 0 ? money(s.usd, 'USD') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Seccion>

          {/* Top clientes - con ambas columnas */}
          <Seccion titulo="Top 5 clientes">
            {rep.topClientes.length === 0 ? (
              <div className="text-sm text-oliva-600 italic">Sin datos.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-oliva-100 text-[10px] uppercase tracking-wide text-oliva-500">
                    <th className="py-1 text-left font-semibold">Cliente</th>
                    <th className="py-1 text-right font-semibold">Vtas.</th>
                    <th className="py-1 text-right font-semibold">Pesos</th>
                    <th className="py-1 text-right font-semibold">Dólares</th>
                  </tr>
                </thead>
                <tbody>
                  {rep.topClientes.map((c, i) => (
                    <tr key={c.nombre + i} className="border-b border-oliva-100/70 last:border-0">
                      <td className="py-1.5 text-oliva-800">#{i + 1} {c.nombre}</td>
                      <td className="py-1.5 text-right text-oliva-600 text-xs">{c.count}</td>
                      <td className={`py-1.5 text-right tabular-nums font-medium ${c.uyu > 0 ? 'text-oliva-900' : 'text-oliva-300'}`}>{c.uyu > 0 ? money(c.uyu, 'UYU') : '—'}</td>
                      <td className={`py-1.5 text-right tabular-nums font-medium ${c.usd > 0 ? 'text-oliva-900' : 'text-oliva-300'}`}>{c.usd > 0 ? money(c.usd, 'USD') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Seccion>

          {/* Top presentaciones */}
          <Seccion titulo="Top 5 productos (por unidades)">
            {rep.topPresentaciones.length === 0 ? (
              <div className="text-sm text-oliva-600 italic">Sin datos.</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {rep.topPresentaciones.map((p, i) => (
                    <tr key={p.label + i} className="border-b border-oliva-100/70 last:border-0">
                      <td className="py-1.5 text-oliva-800">{p.label}</td>
                      <td className="py-1.5 text-right text-oliva-600 tabular-nums">{num(p.unidades)} u</td>
                      <td className="py-1.5 text-right tabular-nums font-medium">{money(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Seccion>

          <div className="flex justify-end">
            <button className="btn-secondary" onClick={() => setModal(false)}>Cerrar</button>
          </div>
        </div>
      </Dialog>
    </>
  )
}

function Kpi({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg bg-oliva-50 border border-oliva-100 p-3">
      <div className="text-[11px] uppercase tracking-wide text-oliva-600">{titulo}</div>
      <div className="text-lg font-semibold text-oliva-900 tabular-nums">{valor}</div>
    </div>
  )
}
function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-oliva-600 mb-2">{titulo}</div>
      <div className="rounded-lg border border-oliva-100 bg-white p-3">{children}</div>
    </div>
  )
}
