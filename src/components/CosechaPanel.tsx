import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { Dialog } from './Dialog'
import { fFecha } from '../lib/format'
import { guardarFlag, leerFlag, guardarObj, leerObj, borrarKey } from '../lib/persistencia'
import type {
  CosechaOperario, CosechaTarifa, CosechaCarga, CosechaCargaOperario, CosechaProceso, CosechaResumen,
} from '../lib/types'

// ---------------------------------------------------------------------------
// Cosecha — carga por operario + procesamiento en almazara.
// Pago a destajo con castigo por hojas sobre la tolerancia del ano.
// ---------------------------------------------------------------------------

const VARIEDADES = ['Arbequina', 'Coratina', 'Picual']
const inputCls = 'w-full rounded-lg border border-oliva-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-oliva-300'
const labelCls = 'block text-xs font-medium text-oliva-600 mb-1'

const FLAG_CARGA = 'dialog:nueva-carga'
const FLAG_PROCESO = 'dialog:nuevo-proceso'
const BORRADOR_CARGA = 'borrador:carga'
const BORRADOR_PROCESO = 'borrador:proceso'

function nOrNull(s: string): number | null {
  const t = (s ?? '').trim().replace(',', '.')
  if (t === '') return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}
function n0(s: string): number {
  return nOrNull(s) ?? 0
}
const fmtKg = (v: number) => new Intl.NumberFormat('es-UY', { maximumFractionDigits: 0 }).format(v)
const fmtKg1 = (v: number) => new Intl.NumberFormat('es-UY', { maximumFractionDigits: 1 }).format(v)
const fmt$ = (v: number) => new Intl.NumberFormat('es-UY', { maximumFractionDigits: 0 }).format(v)
const fmtPrecio = (v: number) => new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 }).format(v) // precio/kg con decimales
const KG_POR_LITRO = 0.918 // 1 L de aceite = 918 gr (factor del cuaderno)

// Kg de aceite de un pasaje: el valor cargado, o estimado desde los litros.
function aceiteKgDe(p: CosechaProceso): number {
  return p.kg_aceite ?? (p.litros != null ? p.litros * KG_POR_LITRO : 0)
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------
interface CargaLineaForm { operario_id: string; kg: string }
interface CargaForm {
  fecha: string
  sector: string
  variedad: string
  kg_balanza: string
  kg_hojas: string
  notas: string
  lineas: CargaLineaForm[]
}
interface ProcesoForm {
  fecha: string
  variedad: string
  kg_aceite: string
  litros: string
  destino: string // tanque de destino
  notas: string
}

function hoyLocalStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function cargaVacia(): CargaForm {
  return { fecha: hoyLocalStr(), sector: '', variedad: VARIEDADES[0], kg_balanza: '', kg_hojas: '', notas: '', lineas: [{ operario_id: '', kg: '' }] }
}
function procesoVacio(): ProcesoForm {
  return { fecha: hoyLocalStr(), variedad: VARIEDADES[0], kg_aceite: '', litros: '', destino: '', notas: '' }
}
function cargaAForm(c: CosechaCarga, ops: CosechaCargaOperario[]): CargaForm {
  return {
    fecha: c.fecha.slice(0, 10),
    sector: c.sector ?? '',
    variedad: c.variedad,
    kg_balanza: c.kg_balanza != null ? String(c.kg_balanza) : '',
    kg_hojas: c.kg_hojas != null ? String(c.kg_hojas) : '',
    notas: c.notas ?? '',
    lineas: ops.length
      ? ops.map((o) => ({ operario_id: o.operario_id != null ? String(o.operario_id) : '', kg: o.kg != null ? String(o.kg) : '' }))
      : [{ operario_id: '', kg: '' }],
  }
}
function procesoAForm(p: CosechaProceso): ProcesoForm {
  return {
    fecha: p.fecha.slice(0, 10),
    variedad: p.variedad,
    kg_aceite: p.kg_aceite != null ? String(p.kg_aceite) : '',
    litros: p.litros != null ? String(p.litros) : '',
    destino: p.destino ?? '',
    notas: p.notas ?? '',
  }
}

// ---------------------------------------------------------------------------
// Liquidacion: reparte el exceso de hojas (sobre la tolerancia) entre los
// operarios de cada carga, prorrateado por los kg que puso cada uno.
// ---------------------------------------------------------------------------
interface FilaLiquidacion { operario_id: number | null; nombre: string; bruto: number; descuento: number; pagable: number }

function liquidar(
  cargas: CosechaCarga[],
  opsPorCarga: Map<number, CosechaCargaOperario[]>,
  nombreOp: (id: number | null) => string,
  tolPct: number,
): FilaLiquidacion[] {
  const acc = new Map<number | null, FilaLiquidacion>()
  for (const c of cargas) {
    const lineas = opsPorCarga.get(c.id) ?? []
    const sumOp = lineas.reduce((s, l) => s + (l.kg || 0), 0)
    const base = c.kg_balanza || sumOp
    const tolKg = base * (tolPct / 100)
    const exceso = Math.max(0, (c.kg_hojas || 0) - tolKg)
    for (const l of lineas) {
      const kg = l.kg || 0
      const share = sumOp > 0 ? kg / sumOp : 0
      const desc = exceso * share
      const key = l.operario_id
      const prev = acc.get(key) ?? { operario_id: key, nombre: nombreOp(key), bruto: 0, descuento: 0, pagable: 0 }
      prev.bruto += kg
      prev.descuento += desc
      prev.pagable += kg - desc
      acc.set(key, prev)
    }
  }
  return [...acc.values()].sort((a, b) => b.pagable - a.pagable)
}

// ---------------------------------------------------------------------------
// Panel principal
// ---------------------------------------------------------------------------
export function CosechaPanel({ anio, puedeEscribir }: { anio: string; puedeEscribir: boolean }) {
  const [cargas, setCargas] = useState<CosechaCarga[]>([])
  const [cargaOps, setCargaOps] = useState<CosechaCargaOperario[]>([])
  const [procesos, setProcesos] = useState<CosechaProceso[]>([])
  const [operarios, setOperarios] = useState<CosechaOperario[]>([])
  const [tarifas, setTarifas] = useState<CosechaTarifa[]>([])
  const [resumen, setResumen] = useState<CosechaResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [bajando, setBajando] = useState(false)

  const [nuevaCarga, setNuevaCargaRaw] = useState(() => leerFlag(FLAG_CARGA))
  const setNuevaCarga = (v: boolean) => { setNuevaCargaRaw(v); guardarFlag(FLAG_CARGA, v) }
  const [nuevoProceso, setNuevoProcesoRaw] = useState(() => leerFlag(FLAG_PROCESO))
  const setNuevoProceso = (v: boolean) => { setNuevoProcesoRaw(v); guardarFlag(FLAG_PROCESO, v) }
  const [editCarga, setEditCarga] = useState<CosechaCarga | null>(null)
  const [editProceso, setEditProceso] = useState<CosechaProceso | null>(null)
  const [editorOperarios, setEditorOperarios] = useState(false)
  const [editorTarifa, setEditorTarifa] = useState(false)
  const [editorHistorial, setEditorHistorial] = useState(false)

  const anioNum = Number(anio) || new Date().getFullYear()

  async function cargar() {
    setCargando(true)
    const [c, co, p, o, t, r] = await Promise.all([
      supabase.from('cosecha_cargas').select('*').eq('anio', anioNum).order('fecha', { ascending: true }),
      supabase.from('cosecha_carga_operarios').select('*'),
      supabase.from('cosecha_proceso').select('*').eq('anio', anioNum).order('fecha', { ascending: true }),
      supabase.from('cosecha_operarios').select('*').order('orden'),
      supabase.from('cosecha_tarifas').select('*'),
      supabase.from('cosecha_resumen').select('*'),
    ])
    setCargas((c.data as CosechaCarga[]) ?? [])
    setCargaOps((co.data as CosechaCargaOperario[]) ?? [])
    setProcesos((p.data as CosechaProceso[]) ?? [])
    setOperarios((o.data as CosechaOperario[]) ?? [])
    setTarifas((t.data as CosechaTarifa[]) ?? [])
    setResumen((r.data as CosechaResumen[]) ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [anioNum])

  useEffect(() => {
    function h() { if (puedeEscribir) setNuevaCarga(true) }
    window.addEventListener('app:fab-nuevo', h)
    return () => window.removeEventListener('app:fab-nuevo', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeEscribir])

  const tarifa = useMemo(() => tarifas.find((t) => t.anio === anioNum) ?? null, [tarifas, anioNum])
  const tolPct = tarifa?.tolerancia_pct ?? 2
  const precioKg = tarifa?.precio_kg ?? null

  const nombreOp = useMemo(() => {
    const m = new Map(operarios.map((o) => [o.id, o.nombre]))
    return (id: number | null) => (id != null ? m.get(id) ?? '—' : 'Sin asignar')
  }, [operarios])

  const opsPorCarga = useMemo(() => {
    const m = new Map<number, CosechaCargaOperario[]>()
    for (const o of cargaOps) {
      const arr = m.get(o.carga_id) ?? []
      arr.push(o); m.set(o.carga_id, arr)
    }
    return m
  }, [cargaOps])

  const liquidacion = useMemo(
    () => liquidar(cargas, opsPorCarga, nombreOp, tolPct),
    [cargas, opsPorCarga, nombreOp, tolPct],
  )

  const kgPorVariedad = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of cargas) m.set(c.variedad, (m.get(c.variedad) ?? 0) + (c.kg_balanza || 0))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [cargas])

  const kgPorSector = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of cargas) { const s = c.sector || '—'; m.set(s, (m.get(s) ?? 0) + (c.kg_balanza || 0)) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }))
  }, [cargas])

  // Rendimiento = aceite que salio (pasajes a tanque) / kg que entraron (cargas), por variedad.
  const rendPorVariedad = useMemo(() => {
    const kgIn = new Map<string, number>()
    for (const c of cargas) kgIn.set(c.variedad, (kgIn.get(c.variedad) ?? 0) + (c.kg_balanza || 0))
    const litrosM = new Map<string, number>()
    const aceiteM = new Map<string, number>()
    for (const p of procesos) {
      litrosM.set(p.variedad, (litrosM.get(p.variedad) ?? 0) + (p.litros || 0))
      aceiteM.set(p.variedad, (aceiteM.get(p.variedad) ?? 0) + aceiteKgDe(p))
    }
    const vars = new Set<string>([...kgIn.keys(), ...aceiteM.keys()])
    return [...vars].map((v) => {
      const kg = kgIn.get(v) ?? 0, litros = litrosM.get(v) ?? 0, aceite = aceiteM.get(v) ?? 0
      return { variedad: v, kg, litros, aceite, rend: kg > 0 ? (aceite / kg) * 100 : 0 }
    }).sort((a, b) => b.kg - a.kg)
  }, [cargas, procesos])

  const totKgCosecha = useMemo(() => cargas.reduce((s, c) => s + (c.kg_balanza || 0), 0), [cargas])
  const totLitros = useMemo(() => procesos.reduce((s, p) => s + (p.litros || 0), 0), [procesos])
  const totAceite = useMemo(() => procesos.reduce((s, p) => s + aceiteKgDe(p), 0), [procesos])
  const rendTotal = totKgCosecha > 0 ? (totAceite / totKgCosecha) * 100 : 0
  const totPagable = useMemo(() => liquidacion.reduce((s, f) => s + f.pagable, 0), [liquidacion])

  // Historial por ano: historico importado (cosecha_resumen) + ano vivo (cargas/pasajes).
  const historial = useMemo(() => {
    const m = new Map<number, { total: number; porVar: Map<string, number>; litros: number | null; rend: number | null }>()
    for (const r of resumen) {
      const e = m.get(r.anio) ?? { total: 0, porVar: new Map<string, number>(), litros: null, rend: null }
      if (r.variedad === 'TOTAL') { e.total = r.kg_cosecha ?? 0; e.litros = r.litros; e.rend = r.rendimiento_pct }
      else e.porVar.set(r.variedad, r.kg_cosecha ?? 0)
      m.set(r.anio, e)
    }
    // ano vivo: pisa el resumen con los datos reales si hay cargas cargadas
    if (totKgCosecha > 0 || totLitros > 0) {
      m.set(anioNum, { total: totKgCosecha, porVar: new Map(kgPorVariedad), litros: totLitros || null, rend: rendTotal || null })
    }
    return [...m.entries()].map(([anio, e]) => ({ anio, ...e })).sort((a, b) => b.anio - a.anio)
  }, [resumen, anioNum, totKgCosecha, totLitros, rendTotal, kgPorVariedad])

  // ------------------------------------------------------------------ guardar
  async function guardarCarga(form: CargaForm, id?: number) {
    const sumOp = form.lineas.reduce((s, l) => s + n0(l.kg), 0)
    const row = {
      fecha: form.fecha,
      anio: Number(form.fecha.slice(0, 4)),
      sector: form.sector.trim() || null,
      variedad: form.variedad,
      kg_balanza: nOrNull(form.kg_balanza) ?? sumOp,
      kg_hojas: nOrNull(form.kg_hojas),
      notas: form.notas.trim() || null,
    }
    let cargaId = id
    if (id) {
      await supabase.from('cosecha_cargas').update(row).eq('id', id)
      await supabase.from('cosecha_carga_operarios').delete().eq('carga_id', id)
    } else {
      const { data } = await supabase.from('cosecha_cargas').insert(row).select('id').single()
      cargaId = (data as { id: number } | null)?.id
    }
    if (cargaId) {
      const lineas = form.lineas
        .filter((l) => l.operario_id !== '' && n0(l.kg) > 0)
        .map((l) => ({ carga_id: cargaId!, operario_id: Number(l.operario_id), kg: n0(l.kg) }))
      if (lineas.length) await supabase.from('cosecha_carga_operarios').insert(lineas)
    }
    await cargar()
  }

  async function guardarProceso(form: ProcesoForm, id?: number) {
    const row = {
      fecha: form.fecha,
      anio: Number(form.fecha.slice(0, 4)),
      variedad: form.variedad,
      kg_aceite: nOrNull(form.kg_aceite),
      litros: nOrNull(form.litros),
      destino: form.destino.trim() || null,
      notas: form.notas.trim() || null,
    }
    if (id) await supabase.from('cosecha_proceso').update(row).eq('id', id)
    else await supabase.from('cosecha_proceso').insert(row)
    await cargar()
  }

  async function borrarCarga(id: number) {
    if (!confirm('¿Borrar esta carga?')) return
    await supabase.from('cosecha_cargas').delete().eq('id', id)
    await cargar()
  }
  async function borrarProceso(id: number) {
    if (!confirm('¿Borrar este pasaje a tanque?')) return
    await supabase.from('cosecha_proceso').delete().eq('id', id)
    await cargar()
  }

  const operariosActivos = useMemo(() => operarios.filter((o) => o.activo), [operarios])

  // ------------------------------------------------------------------ export
  async function descargarAnio() {
    setBajando(true)
    try {
      const { descargarCosechaAnio } = await import('../lib/exportCosecha')
      await descargarCosechaAnio({
        anio: anioNum, cargas, opsPorCarga, operarios, procesos, liquidacion,
        precioKg, totKgCosecha, totLitros, totAceite, rendTotal, kgPorSector, rendPorVariedad,
      })
    } catch (e) { console.error(e); alert('No se pudo generar el Excel del ano.') }
    finally { setBajando(false) }
  }
  async function descargarHist() {
    setBajando(true)
    try {
      const { descargarCosechaHistorial } = await import('../lib/exportCosecha')
      await descargarCosechaHistorial(historial, VARIEDADES)
    } catch (e) { console.error(e); alert('No se pudo generar el Excel del historial.') }
    finally { setBajando(false) }
  }

  // ------------------------------------------------------------------ render
  return (
    <div>
      {puedeEscribir && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <button onClick={() => setNuevaCarga(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-oliva-800 text-oliva-50 px-3.5 py-2 text-sm font-medium hover:bg-oliva-900">
            <span className="text-base leading-none">+</span> Nueva carga
          </button>
          <button onClick={() => setNuevoProceso(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-oliva-300 text-oliva-800 px-3.5 py-2 text-sm font-medium hover:border-oliva-400">
            <span className="text-base leading-none">+</span> Pasaje a tanque
          </button>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <button onClick={() => setEditorTarifa(true)} className="text-oliva-600 hover:text-oliva-900 underline decoration-dotted">
              Tarifa {anioNum}: {precioKg != null ? `$${fmtPrecio(precioKg)}/kg` : 'sin precio'} · tol {fmtKg1(tolPct)}%
            </button>
            <button onClick={() => setEditorOperarios(true)} className="text-oliva-600 hover:text-oliva-900 underline decoration-dotted">Operarios</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <button onClick={descargarAnio} disabled={bajando} className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-oliva-200 text-oliva-700 px-3 py-1.5 text-xs font-medium hover:border-oliva-400 disabled:opacity-50">
          <span className="leading-none">↓</span> Descargar año {anioNum} (Excel)
        </button>
      </div>

      {cargando ? (
        <p className="text-oliva-500 text-sm py-8 text-center">Cargando…</p>
      ) : (
        <div className="space-y-5">
          {/* Resumen */}
          <div className="grid grid-cols-3 gap-2.5">
            <Tile label="Kg cosechados" valor={fmtKg(totKgCosecha)} />
            <Tile label="Litros de aceite" valor={fmtKg(totLitros)} />
            <Tile label="Rendimiento" valor={rendTotal > 0 ? `${fmtKg1(rendTotal)}%` : '—'} />
          </div>

          {/* Liquidacion por operario */}
          <Seccion titulo="Liquidación por operario (destajo)">
            {liquidacion.length === 0 ? (
              <VacioMini texto="Sin cargas cargadas este año." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-oliva-500 border-b border-oliva-100">
                      <th className="text-left font-medium py-1.5">Operario</th>
                      <th className="text-right font-medium">Kg brutos</th>
                      <th className="text-right font-medium">Desc. hojas</th>
                      <th className="text-right font-medium">Kg a pagar</th>
                      {precioKg != null && <th className="text-right font-medium">$ a pagar</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {liquidacion.map((f) => (
                      <tr key={String(f.operario_id)} className="border-b border-oliva-50">
                        <td className="py-1.5 text-oliva-800">{f.nombre}</td>
                        <td className="text-right tabular-nums text-oliva-700">{fmtKg(f.bruto)}</td>
                        <td className="text-right tabular-nums text-red-600">{f.descuento > 0 ? `−${fmtKg(f.descuento)}` : '—'}</td>
                        <td className="text-right tabular-nums font-medium text-oliva-900">{fmtKg(f.pagable)}</td>
                        {precioKg != null && <td className="text-right tabular-nums font-medium text-oliva-900">${fmt$(f.pagable * precioKg)}</td>}
                      </tr>
                    ))}
                    <tr className="font-medium text-oliva-900">
                      <td className="py-1.5">Total</td>
                      <td className="text-right tabular-nums">{fmtKg(liquidacion.reduce((s, f) => s + f.bruto, 0))}</td>
                      <td className="text-right tabular-nums text-red-600">−{fmtKg(liquidacion.reduce((s, f) => s + f.descuento, 0))}</td>
                      <td className="text-right tabular-nums">{fmtKg(totPagable)}</td>
                      {precioKg != null && <td className="text-right tabular-nums">${fmt$(totPagable * precioKg)}</td>}
                    </tr>
                  </tbody>
                </table>
                {precioKg == null && <p className="text-xs text-oliva-400 mt-2">Cargá el precio por kg del año en «Tarifa» para ver el monto a pagar.</p>}
              </div>
            )}
          </Seccion>

          {/* Kg por variedad y sector */}
          <div className="grid sm:grid-cols-2 gap-5">
            <Seccion titulo="Kg por variedad">
              {kgPorVariedad.length === 0 ? <VacioMini texto="Sin datos." /> : (
                <BarrasKg filas={kgPorVariedad} />
              )}
            </Seccion>
            <Seccion titulo="Kg por sector">
              {kgPorSector.length === 0 ? <VacioMini texto="Sin datos." /> : (
                <BarrasKg filas={kgPorSector} />
              )}
            </Seccion>
          </div>

          {/* Rendimiento por variedad */}
          <Seccion titulo="Rendimiento por variedad (aceite ÷ cosecha)">
            {rendPorVariedad.length === 0 ? <VacioMini texto="Sin datos este año." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-oliva-500 border-b border-oliva-100">
                      <th className="text-left font-medium py-1.5">Variedad</th>
                      <th className="text-right font-medium">Kg cosechados</th>
                      <th className="text-right font-medium">Litros</th>
                      <th className="text-right font-medium">Rendimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rendPorVariedad.map((r) => (
                      <tr key={r.variedad} className="border-b border-oliva-50">
                        <td className="py-1.5 text-oliva-800">{r.variedad}</td>
                        <td className="text-right tabular-nums text-oliva-700">{fmtKg(r.kg)}</td>
                        <td className="text-right tabular-nums text-oliva-700">{fmtKg(r.litros)}</td>
                        <td className="text-right tabular-nums font-medium text-oliva-900">{r.rend > 0 ? `${fmtKg1(r.rend)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Seccion>

          {/* Historial por ano (detallado) */}
          <Seccion titulo="Historial de cosechas" accion={(
            <div className="flex items-center gap-3">
              <button onClick={descargarHist} disabled={bajando} className="text-xs font-medium text-oliva-600 hover:text-oliva-900 underline decoration-dotted disabled:opacity-50">Descargar</button>
              {puedeEscribir && <button onClick={() => setEditorHistorial(true)} className="text-xs font-medium text-oliva-600 hover:text-oliva-900 underline decoration-dotted">Editar</button>}
            </div>
          )}>
            {historial.length === 0 ? <VacioMini texto="Sin histórico." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="text-xs text-oliva-500 border-b border-oliva-100">
                      <th className="text-left font-medium py-1.5 pr-3">Año</th>
                      <th className="text-right font-medium px-2">Total kg</th>
                      {VARIEDADES.map((v) => <th key={v} className="text-right font-medium px-2">{v}</th>)}
                      <th className="text-right font-medium px-2">Litros</th>
                      <th className="text-right font-medium pl-2">Rend.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.map((h) => (
                      <tr key={h.anio} className={`border-b border-oliva-50 ${h.anio === anioNum ? 'bg-oliva-50/40' : ''}`}>
                        <td className="py-1.5 pr-3 text-oliva-800 font-medium">{h.anio}</td>
                        <td className="text-right tabular-nums px-2 text-oliva-900">{fmtKg(h.total)}</td>
                        {VARIEDADES.map((v) => <td key={v} className="text-right tabular-nums px-2 text-oliva-600">{h.porVar.get(v) ? fmtKg(h.porVar.get(v)!) : '—'}</td>)}
                        <td className="text-right tabular-nums px-2 text-oliva-700">{h.litros != null ? fmtKg(h.litros) : '—'}</td>
                        <td className="text-right tabular-nums pl-2 font-medium text-oliva-900">{h.rend != null ? `${fmtKg1(h.rend)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-oliva-400 mt-2">2018–2025 importado del cuaderno. El rendimiento de 2023–2025 no estaba en la planilla.</p>
              </div>
            )}
          </Seccion>

          {/* Listas (cargas y procesos del ano) */}
          <div className="grid sm:grid-cols-2 gap-5">
            <Seccion titulo={`Cargas (${cargas.length})`}>
              {cargas.length === 0 ? <VacioMini texto="Sin cargas." /> : (
                <div className="space-y-1.5">
                  {cargas.map((c) => {
                    const lineas = opsPorCarga.get(c.id) ?? []
                    return (
                      <button key={c.id} onClick={() => puedeEscribir && setEditCarga(c)} className="w-full text-left flex items-center gap-2 rounded-lg border border-oliva-100 bg-white px-3 py-2 hover:border-oliva-300 transition">
                        <span className="text-xs text-oliva-500 w-12 shrink-0">{fFecha(c.fecha).slice(0, 5)}</span>
                        <span className="text-sm text-oliva-800 flex-1 min-w-0 truncate">
                          {c.variedad}{c.sector ? ` · S${c.sector}` : ''} · {lineas.map((l) => nombreOp(l.operario_id)).join(', ') || '—'}
                        </span>
                        <span className="text-sm tabular-nums font-medium text-oliva-900 shrink-0">{fmtKg(c.kg_balanza)} kg</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </Seccion>
            <Seccion titulo={`Pasajes a tanque (${procesos.length})`}>
              {procesos.length === 0 ? <VacioMini texto="Sin pasajes a tanque." /> : (
                <div className="space-y-1.5">
                  {procesos.map((p) => (
                    <button key={p.id} onClick={() => puedeEscribir && setEditProceso(p)} className="w-full text-left flex items-center gap-2 rounded-lg border border-oliva-100 bg-white px-3 py-2 hover:border-oliva-300 transition">
                      <span className="text-xs text-oliva-500 w-12 shrink-0">{fFecha(p.fecha).slice(0, 5)}</span>
                      <span className="text-sm text-oliva-800 flex-1 min-w-0 truncate">{p.variedad}{p.destino ? ` · ${p.destino}` : ''}</span>
                      <span className="text-sm tabular-nums text-oliva-700 shrink-0">{p.litros != null ? `${fmtKg(p.litros)} L` : '—'}</span>
                    </button>
                  ))}
                </div>
              )}
            </Seccion>
          </div>
        </div>
      )}

      {/* ---- Dialogs ---- */}
      {nuevaCarga && (
        <CargaDialog
          titulo="Nueva carga" operarios={operariosActivos} borradorKey={BORRADOR_CARGA}
          onCerrar={() => { setNuevaCarga(false); borrarKey(BORRADOR_CARGA) }}
          onGuardar={async (f) => { await guardarCarga(f); setNuevaCarga(false); borrarKey(BORRADOR_CARGA) }}
        />
      )}
      {editCarga && (
        <CargaDialog
          titulo="Editar carga" operarios={operariosActivos} inicial={cargaAForm(editCarga, opsPorCarga.get(editCarga.id) ?? [])}
          onBorrar={async () => { await borrarCarga(editCarga.id); setEditCarga(null) }}
          onCerrar={() => setEditCarga(null)}
          onGuardar={async (f) => { await guardarCarga(f, editCarga.id); setEditCarga(null) }}
        />
      )}
      {nuevoProceso && (
        <ProcesoDialog
          titulo="Pasaje a tanque" borradorKey={BORRADOR_PROCESO}
          onCerrar={() => { setNuevoProceso(false); borrarKey(BORRADOR_PROCESO) }}
          onGuardar={async (f) => { await guardarProceso(f); setNuevoProceso(false); borrarKey(BORRADOR_PROCESO) }}
        />
      )}
      {editProceso && (
        <ProcesoDialog
          titulo="Editar pasaje a tanque" inicial={procesoAForm(editProceso)}
          onBorrar={async () => { await borrarProceso(editProceso.id); setEditProceso(null) }}
          onCerrar={() => setEditProceso(null)}
          onGuardar={async (f) => { await guardarProceso(f, editProceso.id); setEditProceso(null) }}
        />
      )}
      {editorOperarios && <OperariosDialog operarios={operarios} onCerrar={() => setEditorOperarios(false)} onCambio={cargar} />}
      {editorTarifa && <TarifaDialog anio={anioNum} tarifa={tarifa} onCerrar={() => setEditorTarifa(false)} onCambio={cargar} />}
      {editorHistorial && <HistorialDialog resumen={resumen} onCerrar={() => setEditorHistorial(false)} onCambio={cargar} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-componentes de presentacion
// ---------------------------------------------------------------------------
function Tile({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl border border-oliva-100 bg-white px-3 py-3 text-center">
      <div className="text-lg font-semibold text-oliva-900 leading-tight">{valor}</div>
      <div className="text-[11px] text-oliva-500 mt-0.5">{label}</div>
    </div>
  )
}
function Seccion({ titulo, children, accion }: { titulo: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-oliva-400">{titulo}</h3>
        {accion}
      </div>
      {children}
    </div>
  )
}
function VacioMini({ texto }: { texto: string }) {
  return <p className="text-oliva-400 text-sm py-3">{texto}</p>
}
function BarrasKg({ filas }: { filas: [string, number][] }) {
  const max = Math.max(1, ...filas.map((f) => f[1]))
  return (
    <div className="space-y-1.5">
      {filas.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2">
          <span className="w-20 text-xs text-oliva-600 shrink-0 truncate">{k}</span>
          <div className="flex-1 bg-oliva-50 rounded h-5 overflow-hidden">
            <div className="h-full bg-oliva-300 rounded" style={{ width: `${(v / max) * 100}%` }} />
          </div>
          <span className="w-16 text-right text-xs tabular-nums text-oliva-700 shrink-0">{fmtKg(v)} kg</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialog: Carga
// ---------------------------------------------------------------------------
function CargaDialog({ titulo, inicial, operarios, borradorKey, onCerrar, onGuardar, onBorrar }: {
  titulo: string
  inicial?: CargaForm
  operarios: CosechaOperario[]
  borradorKey?: string
  onCerrar: () => void
  onGuardar: (f: CargaForm) => Promise<void>
  onBorrar?: () => Promise<void>
}) {
  const [form, setForm] = useState<CargaForm>(() => inicial ?? ((borradorKey && leerObj<CargaForm>(borradorKey)) || cargaVacia()))
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { if (borradorKey) guardarObj(borradorKey, form) }, [form, borradorKey])

  const set = <K extends keyof CargaForm>(k: K, v: CargaForm[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setLinea = (i: number, patch: Partial<CargaLineaForm>) => setForm((f) => ({ ...f, lineas: f.lineas.map((l, j) => (j === i ? { ...l, ...patch } : l)) }))
  const addLinea = () => setForm((f) => ({ ...f, lineas: [...f.lineas, { operario_id: '', kg: '' }] }))
  const delLinea = (i: number) => setForm((f) => ({ ...f, lineas: f.lineas.filter((_, j) => j !== i) }))

  const sumOp = form.lineas.reduce((s, l) => s + n0(l.kg), 0)

  async function submit() {
    if (!form.fecha) { alert('Falta la fecha.'); return }
    setGuardando(true)
    try { await onGuardar(form) } finally { setGuardando(false) }
  }

  return (
    <Dialog abierto onCerrar={onCerrar} titulo={titulo} ancho="lg" scrollKey={borradorKey}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Fecha</label>
            <input type="date" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Sector</label>
            <input value={form.sector} onChange={(e) => set('sector', e.target.value)} placeholder="2" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Variedad</label>
            <select value={form.variedad} onChange={(e) => set('variedad', e.target.value)} className={inputCls}>
              {VARIEDADES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className={labelCls + ' mb-0'}>Kg por operario</span>
            <button onClick={addLinea} className="text-xs font-medium text-oliva-700 hover:text-oliva-900">+ Agregar operario</button>
          </div>
          <div className="space-y-2">
            {form.lineas.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <select value={l.operario_id} onChange={(e) => setLinea(i, { operario_id: e.target.value })} className={inputCls + ' flex-1'}>
                  <option value="">— operario —</option>
                  {operarios.map((o) => <option key={o.id} value={String(o.id)}>{o.nombre}</option>)}
                </select>
                <input inputMode="decimal" value={l.kg} onChange={(e) => setLinea(i, { kg: e.target.value })} placeholder="kg" className={inputCls + ' w-24'} />
                {form.lineas.length > 1 && (
                  <button onClick={() => delLinea(i)} className="text-red-500 hover:text-red-700 text-sm" aria-label="Quitar operario">✕</button>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-oliva-400 mt-1">Suma operarios: {fmtKg(sumOp)} kg</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Kg balanza (sin limpiar)</label>
            <input inputMode="decimal" value={form.kg_balanza} onChange={(e) => set('kg_balanza', e.target.value)} placeholder={String(sumOp || '')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Kg de hojas (opcional)</label>
            <input inputMode="decimal" value={form.kg_hojas} onChange={(e) => set('kg_hojas', e.target.value)} placeholder="0" className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Notas</label>
          <input value={form.notas} onChange={(e) => set('notas', e.target.value)} className={inputCls} />
        </div>

        <div className="flex items-center justify-between pt-1">
          {onBorrar ? (
            <button onClick={onBorrar} className="text-sm text-red-600 hover:text-red-800">Borrar</button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onCerrar} className="px-3 py-2 text-sm text-oliva-600 hover:text-oliva-900">Cancelar</button>
            <button onClick={submit} disabled={guardando} className="px-4 py-2 text-sm font-medium rounded-lg bg-oliva-800 text-oliva-50 hover:bg-oliva-900 disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Dialog: Proceso
// ---------------------------------------------------------------------------
function ProcesoDialog({ titulo, inicial, borradorKey, onCerrar, onGuardar, onBorrar }: {
  titulo: string
  inicial?: ProcesoForm
  borradorKey?: string
  onCerrar: () => void
  onGuardar: (f: ProcesoForm) => Promise<void>
  onBorrar?: () => Promise<void>
}) {
  const [form, setForm] = useState<ProcesoForm>(() => inicial ?? ((borradorKey && leerObj<ProcesoForm>(borradorKey)) || procesoVacio()))
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { if (borradorKey) guardarObj(borradorKey, form) }, [form, borradorKey])

  const set = <K extends keyof ProcesoForm>(k: K, v: ProcesoForm[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function submit() {
    if (!form.fecha) { alert('Falta la fecha.'); return }
    setGuardando(true)
    try { await onGuardar(form) } finally { setGuardando(false) }
  }

  return (
    <Dialog abierto onCerrar={onCerrar} titulo={titulo} ancho="lg" scrollKey={borradorKey}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Fecha</label>
            <input type="date" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Variedad</label>
            <select value={form.variedad} onChange={(e) => set('variedad', e.target.value)} className={inputCls}>
              {VARIEDADES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Litros a tanque</label>
            <input inputMode="decimal" value={form.litros} onChange={(e) => set('litros', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Kg de aceite (opcional)</label>
            <input inputMode="decimal" value={form.kg_aceite} onChange={(e) => set('kg_aceite', e.target.value)} placeholder="si no, se estima de litros" className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Tanque</label>
          <input value={form.destino} onChange={(e) => set('destino', e.target.value)} placeholder="T1" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Notas</label>
          <input value={form.notas} onChange={(e) => set('notas', e.target.value)} className={inputCls} />
        </div>

        <div className="flex items-center justify-between pt-1">
          {onBorrar ? (
            <button onClick={onBorrar} className="text-sm text-red-600 hover:text-red-800">Borrar</button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onCerrar} className="px-3 py-2 text-sm text-oliva-600 hover:text-oliva-900">Cancelar</button>
            <button onClick={submit} disabled={guardando} className="px-4 py-2 text-sm font-medium rounded-lg bg-oliva-800 text-oliva-50 hover:bg-oliva-900 disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Dialog: Operarios (editable)
// ---------------------------------------------------------------------------
function OperariosDialog({ operarios, onCerrar, onCambio }: {
  operarios: CosechaOperario[]; onCerrar: () => void; onCambio: () => Promise<void>
}) {
  const [nuevo, setNuevo] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function agregar() {
    const nombre = nuevo.trim()
    if (!nombre) return
    setGuardando(true)
    const orden = Math.max(0, ...operarios.map((o) => o.orden)) + 10
    await supabase.from('cosecha_operarios').insert({ nombre, orden })
    setNuevo('')
    await onCambio()
    setGuardando(false)
  }
  async function toggle(o: CosechaOperario) {
    await supabase.from('cosecha_operarios').update({ activo: !o.activo }).eq('id', o.id)
    await onCambio()
  }
  async function renombrar(o: CosechaOperario, nombre: string) {
    await supabase.from('cosecha_operarios').update({ nombre }).eq('id', o.id)
    await onCambio()
  }

  return (
    <Dialog abierto onCerrar={onCerrar} titulo="Operarios" ancho="sm">
      <div className="space-y-2">
        {operarios.map((o) => (
          <div key={o.id} className="flex items-center gap-2">
            <input
              defaultValue={o.nombre}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== o.nombre) renombrar(o, v) }}
              className={inputCls + (o.activo ? '' : ' opacity-50')}
            />
            <button onClick={() => toggle(o)} className={`text-xs px-2 py-1 rounded shrink-0 ${o.activo ? 'bg-oliva-100 text-oliva-700' : 'bg-oliva-50 text-oliva-400'}`}>
              {o.activo ? 'Activo' : 'Inactivo'}
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-2 border-t border-oliva-100">
          <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nuevo operario" className={inputCls} />
          <button onClick={agregar} disabled={guardando} className="text-sm font-medium px-3 py-2 rounded-lg bg-oliva-800 text-oliva-50 hover:bg-oliva-900 disabled:opacity-50 shrink-0">Agregar</button>
        </div>
        <p className="text-xs text-oliva-400">No se borran para no perder el histórico: desactivalos cuando no cosechen más.</p>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Dialog: Tarifa del ano
// ---------------------------------------------------------------------------
function TarifaDialog({ anio, tarifa, onCerrar, onCambio }: {
  anio: number; tarifa: CosechaTarifa | null; onCerrar: () => void; onCambio: () => Promise<void>
}) {
  const [precio, setPrecio] = useState(tarifa?.precio_kg != null ? String(tarifa.precio_kg) : '')
  const [tol, setTol] = useState(tarifa?.tolerancia_pct != null ? String(tarifa.tolerancia_pct) : '2')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    const row = { anio, precio_kg: nOrNull(precio), tolerancia_pct: nOrNull(tol) ?? 2 }
    if (tarifa) await supabase.from('cosecha_tarifas').update(row).eq('id', tarifa.id)
    else await supabase.from('cosecha_tarifas').insert(row)
    await onCambio()
    setGuardando(false)
    onCerrar()
  }

  return (
    <Dialog abierto onCerrar={onCerrar} titulo={`Tarifa ${anio}`} ancho="sm">
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Precio por kg (destajo)</label>
          <input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="$ / kg" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Tolerancia de hojas (%)</label>
          <input inputMode="decimal" value={tol} onChange={(e) => setTol(e.target.value)} className={inputCls} />
          <p className="text-xs text-oliva-400 mt-1">Hasta este % no se descuenta. El exceso se resta del pago, prorrateado por operario.</p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCerrar} className="px-3 py-2 text-sm text-oliva-600 hover:text-oliva-900">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="px-4 py-2 text-sm font-medium rounded-lg bg-oliva-800 text-oliva-50 hover:bg-oliva-900 disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Dialog: Historial editable — kg por variedad, litros y rendimiento por ano
// ---------------------------------------------------------------------------
interface FilaHist { anio: string; arb: string; cor: string; pic: string; litros: string; rend: string; nueva?: boolean }

function resumenAFilas(resumen: CosechaResumen[]): FilaHist[] {
  const m = new Map<number, FilaHist>()
  for (const r of resumen) {
    const f = m.get(r.anio) ?? { anio: String(r.anio), arb: '', cor: '', pic: '', litros: '', rend: '' }
    const kg = r.kg_cosecha != null ? String(r.kg_cosecha) : ''
    if (r.variedad === 'Arbequina') f.arb = kg
    else if (r.variedad === 'Coratina') f.cor = kg
    else if (r.variedad === 'Picual') f.pic = kg
    else if (r.variedad === 'TOTAL') { f.litros = r.litros != null ? String(r.litros) : ''; f.rend = r.rendimiento_pct != null ? String(r.rendimiento_pct) : '' }
    m.set(r.anio, f)
  }
  return [...m.values()].sort((a, b) => Number(b.anio) - Number(a.anio))
}

function HistorialDialog({ resumen, onCerrar, onCambio }: {
  resumen: CosechaResumen[]; onCerrar: () => void; onCambio: () => Promise<void>
}) {
  const [filas, setFilas] = useState<FilaHist[]>(() => resumenAFilas(resumen))
  const [removidos, setRemovidos] = useState<number[]>([])
  const [guardando, setGuardando] = useState(false)

  const setFila = (i: number, patch: Partial<FilaHist>) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const addFila = () => setFilas((fs) => [{ anio: '', arb: '', cor: '', pic: '', litros: '', rend: '', nueva: true }, ...fs])
  const delFila = (i: number) => {
    const f = filas[i]
    if (!f.nueva && f.anio) setRemovidos((r) => [...r, Number(f.anio)])
    setFilas((fs) => fs.filter((_, j) => j !== i))
  }

  async function guardar() {
    setGuardando(true)
    const rows: Partial<CosechaResumen>[] = []
    for (const f of filas) {
      const anio = Number(f.anio)
      if (!Number.isFinite(anio) || anio < 2000) continue
      const arb = nOrNull(f.arb), cor = nOrNull(f.cor), pic = nOrNull(f.pic)
      const total = (arb ?? 0) + (cor ?? 0) + (pic ?? 0)
      rows.push(
        { anio, variedad: 'Arbequina', kg_cosecha: arb, litros: null, rendimiento_pct: null },
        { anio, variedad: 'Coratina', kg_cosecha: cor, litros: null, rendimiento_pct: null },
        { anio, variedad: 'Picual', kg_cosecha: pic, litros: null, rendimiento_pct: null },
        { anio, variedad: 'TOTAL', kg_cosecha: total || null, litros: nOrNull(f.litros), rendimiento_pct: nOrNull(f.rend) },
      )
    }
    if (removidos.length) await supabase.from('cosecha_resumen').delete().in('anio', removidos)
    if (rows.length) await supabase.from('cosecha_resumen').upsert(rows, { onConflict: 'anio,variedad' })
    await onCambio()
    setGuardando(false)
    onCerrar()
  }

  const miniCls = 'w-full rounded border border-oliva-200 px-1.5 py-1 text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-oliva-300'

  return (
    <Dialog abierto onCerrar={onCerrar} titulo="Editar historial" ancho="lg">
      <div className="space-y-3">
        <button onClick={addFila} className="text-xs font-medium text-oliva-700 hover:text-oliva-900">+ Agregar año</button>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-oliva-500 border-b border-oliva-100">
                <th className="text-left font-medium py-1 pr-1">Año</th>
                <th className="font-medium px-1">Arbequina</th>
                <th className="font-medium px-1">Coratina</th>
                <th className="font-medium px-1">Picual</th>
                <th className="font-medium px-1">Litros</th>
                <th className="font-medium px-1">Rend.%</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} className="border-b border-oliva-50">
                  <td className="py-1 pr-1 w-16">
                    <input inputMode="numeric" value={f.anio} onChange={(e) => setFila(i, { anio: e.target.value })} className={miniCls + ' text-left'} />
                  </td>
                  <td className="px-1"><input inputMode="decimal" value={f.arb} onChange={(e) => setFila(i, { arb: e.target.value })} className={miniCls} /></td>
                  <td className="px-1"><input inputMode="decimal" value={f.cor} onChange={(e) => setFila(i, { cor: e.target.value })} className={miniCls} /></td>
                  <td className="px-1"><input inputMode="decimal" value={f.pic} onChange={(e) => setFila(i, { pic: e.target.value })} className={miniCls} /></td>
                  <td className="px-1"><input inputMode="decimal" value={f.litros} onChange={(e) => setFila(i, { litros: e.target.value })} className={miniCls} /></td>
                  <td className="px-1"><input inputMode="decimal" value={f.rend} onChange={(e) => setFila(i, { rend: e.target.value })} className={miniCls} /></td>
                  <td className="pl-1"><button onClick={() => delFila(i)} className="text-red-500 hover:text-red-700" aria-label="Quitar año">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-oliva-400">El total de kg se calcula como la suma de las variedades.</p>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCerrar} className="px-3 py-2 text-sm text-oliva-600 hover:text-oliva-900">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="px-4 py-2 text-sm font-medium rounded-lg bg-oliva-800 text-oliva-50 hover:bg-oliva-900 disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
