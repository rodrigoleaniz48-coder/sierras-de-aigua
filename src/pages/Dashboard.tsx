import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { money, num } from '../lib/format'
import { AlertasStockBajo } from '../components/AlertasStockBajo'
import { AlertasTareas } from '../components/AlertasTareas'

interface AvisoCadete { socio: string; cantidad: number; ubicacion: string }

interface Resumen {
  totalMes: number
  cantVentasMes: number
  totalMesAnterior: number
  litrosAceiteMes: number
  pendEntrega: number
  pendCobro: number
  pendCobroMonto: number
  pendTotal: number
}

interface MesDato { label: string; ingresos: number; egresos: number }

export function Dashboard() {
  const { perfil, puede } = useAuth()
  const nav = useNavigate()
  const puedeVender = puede(['admin', 'ventas'])
  // Empleados de campo (Emiliano) no ven el Inicio: van directo a Tareas.
  if (perfil && perfil.rol === 'campo') return <Navigate to="/tareas" replace />

  const [r, setR] = useState<Resumen>({
    totalMes: 0, cantVentasMes: 0, totalMesAnterior: 0, litrosAceiteMes: 0,
    pendEntrega: 0, pendCobro: 0, pendCobroMonto: 0, pendTotal: 0,
  })
  const [meses, setMeses] = useState<MesDato[]>([])
  const [cargando, setCargando] = useState(true)
  const [avisosCadete, setAvisosCadete] = useState<AvisoCadete[]>([])
  const [ccPorCobrar, setCcPorCobrar] = useState<{ total: number; n: number }>({ total: 0, n: 0 })
  const soyYo = perfil?.id ?? ''
  const nombreLower0 = (perfil?.nombre ?? '').toLowerCase()
  const usaCadete = nombreLower0.includes('rodrigo') || nombreLower0.includes('santi')

  // Saldo por cobrar de distribuidores/mayoristas (cuenta corriente, base UYU, post-corte)
  useEffect(() => {
    (async () => {
      const { data: cl } = await supabase.from('clientes').select('id,saldo_inicial,saldo_inicial_fecha').in('tipo', ['distribuidor', 'mayorista'])
      const cc = (cl ?? []) as { id: number; saldo_inicial: number | null; saldo_inicial_fecha: string | null }[]
      if (cc.length === 0) { setCcPorCobrar({ total: 0, n: 0 }); return }
      const ids = cc.map((c) => c.id)
      const [v, p] = await Promise.all([
        supabase.from('ventas').select('cliente_id,fecha,total,moneda').in('cliente_id', ids).neq('estado', 'cancelado').eq('promocion_comercial', false).eq('a_confirmar', false),
        supabase.from('pagos').select('cliente_id,fecha,monto,moneda').in('cliente_id', ids),
      ])
      const ventas = (v.data ?? []) as { cliente_id: number; fecha: string; total: number; moneda: string | null }[]
      const pagos = (p.data ?? []) as { cliente_id: number; fecha: string; monto: number; moneda: string }[]
      let total = 0, n = 0
      for (const c of cc) {
        const post = (f: string) => !c.saldo_inicial_fecha || f > c.saldo_inicial_fecha
        let s = Number(c.saldo_inicial ?? 0)
        for (const x of ventas) if (x.cliente_id === c.id && post(x.fecha) && x.moneda !== 'USD') s += Number(x.total)
        for (const x of pagos) if (x.cliente_id === c.id && post(x.fecha) && x.moneda !== 'USD') s -= Number(x.monto)
        if (s > 0.01) { total += s; n++ }
      }
      setCcPorCobrar({ total, n })
    })()
  }, [])

  // Aviso: pedidos con cadete pendientes de OTROS socios (para unificar el envío)
  useEffect(() => {
    if (!usaCadete || !soyYo) { setAvisosCadete([]); return }
    let cancel = false
    ;(async () => {
      const [v, s, u] = await Promise.all([
        supabase.from('ventas').select('id,socio_id,ubicacion_id').eq('envio', true).eq('entregado', false).neq('estado', 'cancelado').eq('a_confirmar', false).neq('socio_id', soyYo),
        supabase.from('perfiles').select('id,nombre'),
        supabase.from('ubicaciones').select('id,nombre'),
      ])
      if (cancel) return
      const socios = new Map((s.data ?? []).map((x: { id: string; nombre: string }) => [x.id, x.nombre]))
      const ubics = new Map((u.data ?? []).map((x: { id: number; nombre: string }) => [x.id, x.nombre]))
      const map = new Map<string, AvisoCadete>()
      for (const vv of (v.data ?? []) as { socio_id: string; ubicacion_id: number }[]) {
        const key = `${vv.socio_id}:${vv.ubicacion_id}`
        const prev = map.get(key)
        if (prev) prev.cantidad++
        else map.set(key, { socio: socios.get(vv.socio_id) ?? '?', cantidad: 1, ubicacion: ubics.get(vv.ubicacion_id) ?? '?' })
      }
      setAvisosCadete([...map.values()].sort((a, b) => b.cantidad - a.cantidad))
    })()
    return () => { cancel = true }
  }, [soyYo, usaCadete])

  useEffect(() => {
    const hoy = new Date()
    const mesInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)
    const mesFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10)
    const mesAntInicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).toISOString().slice(0, 10)
    const mesAntFin = new Date(hoy.getFullYear(), hoy.getMonth(), 0).toISOString().slice(0, 10)

    Promise.all([
      // Ventas del mes = cobradas en el mes (por fecha_cobro), igual criterio que el Estado de resultados.
      supabase.from('ventas').select('id, total, entregado, cobrado, cliente_id').gte('fecha_cobro', mesInicio).lte('fecha_cobro', mesFin).neq('estado', 'cancelado').eq('promocion_comercial', false).eq('a_confirmar', false),
      // Total del mes anterior (tambien por fecha_cobro)
      supabase.from('ventas').select('total, cliente_id').gte('fecha_cobro', mesAntInicio).lte('fecha_cobro', mesAntFin).neq('estado', 'cancelado').eq('promocion_comercial', false).eq('a_confirmar', false),
      // Items del mes con producto y presentación, para calcular litros de aceite (envasado + granel)
      supabase.from('items_venta').select('unidades, presentacion:presentaciones(volumen_ml, producto:productos(nombre, categoria)), venta:ventas!inner(fecha, estado, a_confirmar)').gte('venta.fecha', mesInicio).neq('venta.estado', 'cancelado').eq('venta.a_confirmar', false),
      // Pendientes de entrega/cobro (todas las fechas, no filtrar por mes: siguen pendientes despues del cierre)
      supabase.from('ventas').select('id, total, entregado, cobrado, promocion_comercial, cliente_id').eq('socio_id', soyYo).neq('estado', 'cancelado').eq('a_confirmar', false).or('entregado.eq.false,cobrado.eq.false'),
      // Distribuidores/mayoristas: su ingreso cuenta por el PAGO a cuenta, no por la venta.
      supabase.from('clientes').select('id').in('tipo', ['distribuidor', 'mayorista']),
      supabase.from('pagos').select('fecha,monto,moneda,cliente_id').gte('fecha', mesAntInicio),
      import('../lib/bcu').then(m => m.fetchCotizacionBCU()),
    ])
      .then(([vRes, vAntRes, iRes, pendRes, ccRes, pagRes, cotBcu]) => {
        const ccSet = new Set(((ccRes.data ?? []) as { id: number }[]).map((c) => c.id))
        const tc = cotBcu?.cotizacion ?? 42
        const pagoPesos = (p: { monto: number; moneda: string }) => (p.moneda === 'USD' ? Number(p.monto) * tc : Number(p.monto))
        const pagosCC = ((pagRes.data ?? []) as { fecha: string; monto: number; moneda: string; cliente_id: number | null }[]).filter((p) => p.cliente_id && ccSet.has(p.cliente_id))
        // Ventas del mes = ventas directas (no distribuidores) + cobros a cuenta de distribuidores del mes.
        const ventasMes = vRes.data ?? []
        const ventasDirectasMes = ventasMes.filter((v) => !(v.cliente_id && ccSet.has(v.cliente_id)))
        const pagosCCMesList = pagosCC.filter((p) => p.fecha >= mesInicio)
        const totalMes = ventasDirectasMes.reduce((s, v) => s + Number(v.total ?? 0), 0) + pagosCCMesList.reduce((s, p) => s + pagoPesos(p), 0)
        // Pendientes: TODAS las ventas no-canceladas no-entregadas o no-cobradas (independiente del mes)
        // Las promos no tienen cobro; solo cuentan si falta entregar.
        const pendientes = pendRes.data ?? []
        // Los distribuidores/mayoristas NO cuentan como "pendiente de cobro" (se saldan por cuenta
        // corriente), pero SÍ como "pendiente de entrega". Las promos no requieren cobro.
        const esCC = (v: { cliente_id?: number | null }) => !!(v.cliente_id && ccSet.has(v.cliente_id))
        const realmentePendientes = pendientes.filter((v) => !v.entregado || (!v.cobrado && !v.promocion_comercial && !esCC(v)))
        const pendEntrega = realmentePendientes.filter((v) => !v.entregado).length
        const pendCobroList = realmentePendientes.filter((v) => !v.cobrado && !v.promocion_comercial && !esCC(v))
        const pendCobro = pendCobroList.length
        const pendCobroMonto = pendCobroList.reduce((s, v) => s + Number(v.total ?? 0), 0)
        // Union: una venta puede estar pendiente por ambos motivos, pero se cuenta 1 sola vez
        const pendTotal = realmentePendientes.length

        const ventasDirectasAnt = (vAntRes.data ?? []).filter((v) => !(v.cliente_id && ccSet.has(v.cliente_id)))
        const pagosCCAnt = pagosCC.filter((p) => p.fecha >= mesAntInicio && p.fecha <= mesAntFin).reduce((s, p) => s + pagoPesos(p), 0)
        const totalMesAnterior = ventasDirectasAnt.reduce((s, v) => s + Number(v.total ?? 0), 0) + pagosCCAnt

        let litros = 0
        for (const it of (iRes.data as any[]) ?? []) {
          const cat = it.presentacion?.producto?.categoria
          const nombreProd = String(it.presentacion?.producto?.nombre ?? '').toLowerCase()
          const vol = Number(it.presentacion?.volumen_ml ?? 0)
          // Envasado (categoría 'aceite') + granel (producto 'Aceite a granel' con volumen 1000)
          const esAceite = cat === 'aceite' || nombreProd.includes('aceite a granel')
          if (esAceite && vol > 0) litros += (Number(it.unidades) * vol) / 1000
        }

        setR({
          totalMes, cantVentasMes: ventasDirectasMes.length + pagosCCMesList.length,
          totalMesAnterior, litrosAceiteMes: litros,
          pendEntrega, pendCobro, pendCobroMonto, pendTotal,
        })
      })
      .finally(() => setCargando(false))
  }, [soyYo])

  useEffect(() => {
    const ahora = new Date()
    const desde = new Date(ahora.getFullYear(), ahora.getMonth() - 5, 1).toISOString().slice(0, 10)
    Promise.all([
      supabase.from('ventas').select('fecha_cobro,total,cliente_id').gte('fecha_cobro', desde).neq('estado', 'cancelado').eq('promocion_comercial', false).eq('a_confirmar', false),
      supabase.from('gastos').select('fecha,monto,moneda').gte('fecha', desde).eq('es_adelanto', false),
      supabase.from('ingresos').select('fecha,monto,moneda').gte('fecha', desde),
      // Distribuidores/mayoristas: su ingreso se reconoce por el PAGO a cuenta, no por la venta.
      supabase.from('clientes').select('id').in('tipo', ['distribuidor', 'mayorista']),
      supabase.from('pagos').select('fecha,monto,moneda,cliente_id').gte('fecha', desde),
      import('../lib/bcu').then(m => m.fetchCotizacionBCU()),
    ]).then(([vR, gR, iR, ccR, pR, cotBcu]) => {
      const tc = cotBcu?.cotizacion ?? 42
      const ccSet = new Set(((ccR.data ?? []) as { id: number }[]).map((c) => c.id))
      const ingPorMes = new Map<string, number>()
      const egPorMes = new Map<string, number>()
      for (const v of (vR.data ?? []) as { fecha_cobro: string; total: number; cliente_id: number | null }[]) {
        if (!v.fecha_cobro) continue
        if (v.cliente_id && ccSet.has(v.cliente_id)) continue // distribuidor: cuenta por el pago
        const k = v.fecha_cobro.slice(0, 7)
        ingPorMes.set(k, (ingPorMes.get(k) ?? 0) + Number(v.total))
      }
      for (const p of (pR.data ?? []) as { fecha: string; monto: number; moneda: string; cliente_id: number | null }[]) {
        if (!(p.cliente_id && ccSet.has(p.cliente_id))) continue
        const k = p.fecha.slice(0, 7)
        const monto = p.moneda === 'USD' ? Number(p.monto) * tc : Number(p.monto)
        ingPorMes.set(k, (ingPorMes.get(k) ?? 0) + monto)
      }
      for (const i of (iR.data ?? []) as { fecha: string; monto: number; moneda: string }[]) {
        const k = i.fecha.slice(0, 7)
        const monto = i.moneda === 'USD' ? Number(i.monto) * tc : Number(i.monto)
        ingPorMes.set(k, (ingPorMes.get(k) ?? 0) + monto)
      }
      for (const g of (gR.data ?? []) as { fecha: string; monto: number; moneda: string }[]) {
        const k = g.fecha.slice(0, 7)
        const monto = g.moneda === 'USD' ? Number(g.monto) * tc : Number(g.monto)
        egPorMes.set(k, (egPorMes.get(k) ?? 0) + monto)
      }
      const arr: MesDato[] = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
        const k = d.toISOString().slice(0, 7)
        const label = d.toLocaleString('es-UY', { month: 'short' }).replace('.', '')
        arr.push({ label, ingresos: ingPorMes.get(k) ?? 0, egresos: egPorMes.get(k) ?? 0 })
      }
      setMeses(arr)
    })
  }, [])

  const primerNombre = perfil?.nombre ? perfil.nombre.split(' ')[0] : ''
  const hoy = new Date().toLocaleDateString('es-UY', { day: 'numeric', month: 'long', year: 'numeric' })
  const deltaMes = r.totalMesAnterior > 0 ? ((r.totalMes - r.totalMesAnterior) / r.totalMesAnterior) * 100 : null
  // Ayelén no ve la parte operativa (alertas de stock y pendientes) — solo reporte semanal + KPIs
  const nombreLower = (perfil?.nombre ?? '').toLowerCase()
  const soloReporte = nombreLower.includes('ayelen') || nombreLower.includes('ayelén')

  return (
    <div className="space-y-3 max-w-[1200px]">
      {/* Topbar compacto (una linea) */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-bold text-oliva-900 truncate">
          Hola{primerNombre && `, ${primerNombre}`} <span className="text-oliva-400 font-normal text-sm">· {hoy}</span>
        </h1>
        {puedeVender && (
          <button onClick={() => nav('/ventas', { state: { abrirNueva: true } })} className="btn-primary text-sm px-3 py-2 shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="inline-block mr-1">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nueva venta
          </button>
        )}
      </div>

      {/* Pendiente ventas — foco en cobros (lo urgente en plata); entregas como secundario */}
      {!soloReporte && (
        <PendientesBar
          cargando={cargando}
          entrega={r.pendEntrega}
          cobro={r.pendCobro}
          cobroMonto={r.pendCobroMonto}
          onClick={() => nav('/ventas')}
        />
      )}

      {!soloReporte && puedeVender && ccPorCobrar.total > 0 && (
        <button
          onClick={() => nav('/ventas', { state: { vista: 'ctacte' } })}
          className="card p-3 w-full flex items-center justify-between text-left hover:bg-aceite-500/10 border-aceite-500/30 bg-aceite-500/5"
        >
          <span className="text-sm text-oliva-800">📂 <b>{ccPorCobrar.n}</b> distribuidor{ccPorCobrar.n === 1 ? '' : 'es'} con saldo a cobrar</span>
          <span className="text-sm font-semibold text-aceite-600 tabular-nums">{money(ccPorCobrar.total)}</span>
        </button>
      )}


      {avisosCadete.length > 0 && (
        <div className="rounded-lg border-2 border-blue-300 bg-blue-50 p-3 flex items-start gap-3">
          <div className="text-xl">🛵</div>
          <div className="flex-1 text-sm text-blue-900">
            <div className="font-bold">Coordinar cadete con otro socio</div>
            <div className="mt-0.5 text-blue-800">
              {avisosCadete.map((a, i) => (
                <div key={i}>
                  <b>{a.socio}</b> tiene <b>{a.cantidad}</b> {a.cantidad === 1 ? 'pedido pendiente' : 'pedidos pendientes'} con envío en <b>{a.ubicacion}</b>.
                </div>
              ))}
              <div className="mt-1 text-[11px] text-blue-700">Considerá unificar el mensaje al cadete desde la lista.</div>
            </div>
          </div>
          <button className="btn-secondary text-xs shrink-0" onClick={() => nav('/ventas')}>
            Ir a Ventas →
          </button>
        </div>
      )}

      {/* KPIs del mes (dinero cobrado en el mes) */}
      <div className="rounded-lg border border-oliva-100 bg-white overflow-hidden">
        <div className="grid grid-cols-3 gap-px bg-oliva-100/60">
          <div className="bg-white px-3 py-2.5 text-center">
            <div className="text-[10px] uppercase tracking-wide text-oliva-500">Ventas mes</div>
            <div className="text-sm font-bold text-oliva-900 tabular-nums">{cargando ? '…' : money(r.totalMes)}</div>
            <div className="text-[10px] text-oliva-500">{cargando ? '' : `${r.cantVentasMes} op.`}</div>
          </div>
          <div className="bg-white px-3 py-2.5 text-center">
            <div className="text-[10px] uppercase tracking-wide text-oliva-500">Aceite</div>
            <div className="text-sm font-bold text-oliva-900 tabular-nums">{cargando ? '…' : `${num(r.litrosAceiteMes)} L`}</div>
            <div className="text-[10px] text-oliva-500">mes</div>
          </div>
          <div className="bg-white px-3 py-2.5 text-center">
            <div className="text-[10px] uppercase tracking-wide text-oliva-500">Mes anterior</div>
            <div className="text-sm font-bold text-oliva-900 tabular-nums">{cargando ? '…' : money(r.totalMesAnterior)}</div>
            {!cargando && deltaMes !== null && (
              <div className={`text-[10px] font-semibold ${deltaMes >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {deltaMes >= 0 ? '↑' : '↓'} {Math.abs(deltaMes).toFixed(0)}%
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mini gráfica ingresos vs egresos */}
      {meses.length > 0 && <GraficaMeses meses={meses} />}

      {/* Al pie: alertas menos urgentes que el resumen del dia */}
      {!soloReporte && <AlertasTareas />}
      {!soloReporte && <AlertasStockBajo />}

    </div>
  )
}

function PendientesBar({ cargando, entrega, cobro, cobroMonto, onClick }: {
  cargando: boolean; entrega: number; cobro: number; cobroMonto: number; onClick: () => void
}) {
  const tono = cobro > 0 ? 'rojo' : entrega > 0 ? 'ambar' : 'ok'
  const cls =
    tono === 'rojo'  ? 'border-red-300 bg-red-50 hover:bg-red-100 text-red-800' :
    tono === 'ambar' ? 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900' :
                       'border-oliva-200 bg-white hover:bg-oliva-50 text-oliva-900'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-4 rounded-xl border-2 px-5 py-4 transition text-left shadow-sm ${cls}`}
    >
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-xs font-bold uppercase tracking-widest text-oliva-600">Pendiente ventas</span>
        <div className="flex items-baseline gap-3 mt-1 flex-wrap">
          <span className="text-4xl font-extrabold tabular-nums leading-none">{cargando ? '…' : cobro}</span>
          <span className="text-sm font-semibold">sin cobrar{cobroMonto > 0 && ` · ${money(cobroMonto)}`}</span>
        </div>
        {entrega > 0 && (
          <div className="text-xs text-oliva-700 mt-1">+ {entrega} pendiente{entrega === 1 ? '' : 's'} de entrega</div>
        )}
        {cobro === 0 && entrega === 0 && (
          <div className="text-sm text-oliva-600 mt-1">todo al día ✓</div>
        )}
      </div>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-oliva-400 shrink-0"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
    </button>
  )
}

function GraficaMeses({ meses }: { meses: MesDato[] }) {
  const [modo, setModo] = useState<'linea' | 'barras'>('linea')
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...meses.flatMap(m => [m.ingresos, m.egresos]), 1)
  const n = meses.length
  // Coordenadas del SVG (se estira al ancho; el trazo queda fijo con non-scaling-stroke).
  const W = 1000, H = 300, padTop = 24, padBot = 20, plotH = H - padTop - padBot
  const xi = (i: number) => (n === 1 ? W / 2 : ((i + 0.5) / n) * W)
  const yv = (v: number) => padTop + (1 - v / max) * plotH
  const pts = (key: 'ingresos' | 'egresos') => meses.map((m, i) => `${xi(i).toFixed(1)},${yv(m[key]).toFixed(1)}`).join(' ')
  const leftPct = (i: number) => ((i + 0.5) / n) * 100
  const topPct = (v: number) => (yv(v) / H) * 100

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wide text-oliva-600">Ingresos vs Egresos (UYU)</div>
        <div className="flex gap-1">
          {(['linea', 'barras'] as const).map((mo) => (
            <button key={mo} type="button" onClick={() => setModo(mo)}
              className={`text-[10px] px-2 py-0.5 rounded ${modo === mo ? 'bg-oliva-800 text-oliva-50' : 'bg-oliva-100 text-oliva-700 hover:bg-oliva-200'}`}>
              {mo === 'linea' ? 'Línea' : 'Barras'}
            </button>
          ))}
        </div>
      </div>

      {modo === 'barras' ? (
        <div className="flex items-end gap-1.5 sm:gap-3 h-28">
          {meses.map((m) => {
            const hIng = Math.max((m.ingresos / max) * 100, 2)
            const hEg = Math.max((m.egresos / max) * 100, 2)
            const margen = m.ingresos - m.egresos
            return (
              <div key={m.label} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
                <div className="flex items-end gap-[2px] w-full justify-center h-20">
                  <div className="w-[40%] max-w-[18px] rounded-t bg-green-500/80" style={{ height: hIng + '%' }} title={`Ingresos: ${money(m.ingresos)}`} />
                  <div className="w-[40%] max-w-[18px] rounded-t bg-red-400/70" style={{ height: hEg + '%' }} title={`Egresos: ${money(m.egresos)}`} />
                </div>
                <div className={`text-[9px] font-semibold tabular-nums ${margen >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {m.ingresos > 0 || m.egresos > 0 ? (margen >= 0 ? '+' : '') + (margen / 1000).toFixed(0) + 'k' : ''}
                </div>
                <div className="text-[10px] text-oliva-600 capitalize truncate w-full text-center">{m.label}</div>
              </div>
            )
          })}
        </div>
      ) : (
        <>
          <div className="relative h-28" onMouseLeave={() => setHover(null)}>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
              <line x1="0" y1={yv(0)} x2={W} y2={yv(0)} className="text-oliva-200" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              {n > 1 && <polyline fill="none" points={pts('ingresos')} stroke="#16a34a" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
              {n > 1 && <polyline fill="none" points={pts('egresos')} stroke="#f43f5e" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
            </svg>
            {/* crosshair + puntos del mes activo */}
            {hover !== null && (
              <>
                <div className="absolute top-0 bottom-0 w-px bg-oliva-300 pointer-events-none" style={{ left: leftPct(hover) + '%' }} />
                <div className="absolute w-2.5 h-2.5 rounded-full bg-green-600 ring-2 ring-white -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ left: leftPct(hover) + '%', top: topPct(meses[hover].ingresos) + '%' }} />
                <div className="absolute w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ left: leftPct(hover) + '%', top: topPct(meses[hover].egresos) + '%' }} />
              </>
            )}
            {/* columnas de interacción (hover / toque) */}
            <div className="absolute inset-0 flex">
              {meses.map((m, i) => (
                <div key={m.label} className="flex-1" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
              ))}
            </div>
            {/* tooltip */}
            {hover !== null && (
              <div className="absolute top-0 z-10 -translate-x-1/2 pointer-events-none rounded-lg bg-oliva-900 text-oliva-50 px-2 py-1 text-[10px] leading-tight whitespace-nowrap shadow-lg"
                style={{ left: Math.min(Math.max(leftPct(hover), 16), 84) + '%' }}>
                <div className="font-semibold capitalize">{meses[hover].label}</div>
                <div>Ing: {money(meses[hover].ingresos)}</div>
                <div>Egr: {money(meses[hover].egresos)}</div>
                <div className={meses[hover].ingresos - meses[hover].egresos >= 0 ? 'text-green-300' : 'text-red-300'}>
                  Result: {money(meses[hover].ingresos - meses[hover].egresos)}
                </div>
              </div>
            )}
          </div>
          <div className="flex mt-1">
            {meses.map((m) => (
              <div key={m.label} className="flex-1 text-[10px] text-oliva-600 capitalize truncate text-center">{m.label}</div>
            ))}
          </div>
        </>
      )}

      <div className="flex justify-center gap-4 mt-1.5 text-[10px] text-oliva-600">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500/80 inline-block" /> Ingresos</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400/70 inline-block" /> Egresos</span>
      </div>
    </div>
  )
}


