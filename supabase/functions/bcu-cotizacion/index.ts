// Devuelve la cotización USD interbancario del BCU (último cierre disponible).
// GET /functions/v1/bcu-cotizacion → { fecha: "YYYY-MM-DD", tcc: number, tcv: number, cotizacion: number }
// "cotizacion" es el promedio TCC/TCV (uso comercial).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

async function consultarBCU(desde: string, hasta: string): Promise<{ fecha: string; tcc: number; tcv: number }[]> {
  const soap = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:coti="Cotiza">
  <soapenv:Body>
    <coti:wsbcucotizaciones.Execute>
      <coti:Entrada>
        <coti:Moneda><coti:item>2225</coti:item></coti:Moneda>
        <coti:FechaDesde>${desde}</coti:FechaDesde>
        <coti:FechaHasta>${hasta}</coti:FechaHasta>
        <coti:Grupo>2</coti:Grupo>
      </coti:Entrada>
    </coti:wsbcucotizaciones.Execute>
  </soapenv:Body>
</soapenv:Envelope>`

  const r = await fetch('https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsbcucotizaciones', {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '"Cotiza"' },
    body: soap,
  })
  const xml = await r.text()
  if (!r.ok) throw new Error(`BCU respondió ${r.status}: ${xml.slice(0, 200)}`)

  const bloques = [...xml.matchAll(/<datoscotizaciones\.dato[^>]*>([\s\S]*?)<\/datoscotizaciones\.dato>/g)]
  const datos: { fecha: string; tcc: number; tcv: number }[] = []
  for (const b of bloques) {
    const contenido = b[1]
    const fecha = /<Fecha>([^<]+)<\/Fecha>/.exec(contenido)?.[1]
    const tcc = Number(/<TCC>([^<]+)<\/TCC>/.exec(contenido)?.[1] ?? '0')
    const tcv = Number(/<TCV>([^<]+)<\/TCV>/.exec(contenido)?.[1] ?? '0')
    if (!fecha || !(tcc > 0)) continue
    datos.push({ fecha, tcc, tcv })
  }
  return datos
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const url = new URL(req.url)
    const mes = url.searchParams.get('mes') // "YYYY-MM" → promedio del billete del mes

    // Modo "promedio del mes": promedia (TCC+TCV)/2 de todos los días hábiles del mes.
    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      const [y, m] = mes.split('-').map(Number)
      const ultimoDia = new Date(y, m, 0).getDate()
      const desde = `${mes}-01`
      // No pedir más allá de hoy (mes en curso)
      const hoyStr = new Date().toISOString().slice(0, 10)
      let hasta = `${mes}-${String(ultimoDia).padStart(2, '0')}`
      if (hasta > hoyStr) hasta = hoyStr

      const datos = await consultarBCU(desde, hasta)
      if (datos.length === 0) return json({ error: `Sin cotizaciones del BCU para ${mes}` }, 502)
      const prom = datos.reduce((s, d) => s + (d.tcc + d.tcv) / 2, 0) / datos.length
      return json({
        mes,
        cotizacion: Number(prom.toFixed(3)),
        dias: datos.length,
        fuente: 'BCU · dólar billete, promedio del mes (moneda 2225)',
      })
    }

    // Modo por defecto: último cierre disponible (compat con Ventas/Admin/Dashboard).
    const hoy = new Date()
    const d = new Date(hoy)
    d.setDate(d.getDate() - 10)
    const fmt = (x: Date) => x.toISOString().slice(0, 10)
    const datos = await consultarBCU(fmt(d), fmt(hoy))
    if (datos.length === 0) return json({ error: 'Sin cotizaciones en el rango' }, 502)
    let mejor = datos[0]
    for (const x of datos) if (x.fecha > mejor.fecha) mejor = x
    const cotizacion = (mejor.tcc + mejor.tcv) / 2
    return json({
      fecha: mejor.fecha,
      tcc: mejor.tcc,
      tcv: mejor.tcv,
      cotizacion: Number(cotizacion.toFixed(3)),
      fuente: 'BCU · dólar billete (moneda 2225)',
    })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
