// Devuelve la cotización USD interbancario del BCU (último cierre disponible).
// GET /functions/v1/bcu-cotizacion → { fecha: "YYYY-MM-DD", tcc: number, tcv: number, cotizacion: number }
// "cotizacion" es el promedio TCC/TCV (uso comercial).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const hoy = new Date()
    // Buscamos hasta 10 días atrás por si hubo feriados
    const desde = new Date(hoy)
    desde.setDate(desde.getDate() - 10)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)

    const soap = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:coti="Cotiza">
  <soapenv:Body>
    <coti:wsbcucotizaciones.Execute>
      <coti:Entrada>
        <coti:Moneda><coti:item>2225</coti:item></coti:Moneda>
        <coti:FechaDesde>${fmt(desde)}</coti:FechaDesde>
        <coti:FechaHasta>${fmt(hoy)}</coti:FechaHasta>
        <coti:Grupo>2</coti:Grupo>
      </coti:Entrada>
    </coti:wsbcucotizaciones.Execute>
  </soapenv:Body>
</soapenv:Envelope>`

    const r = await fetch('https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsbcucotizaciones', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '"Cotiza"',
      },
      body: soap,
    })
    const xml = await r.text()

    if (!r.ok) return json({ error: `BCU respondió ${r.status}`, body: xml.slice(0, 400) }, 502)

    // Parseo simple: extraer todos los <datoscotizaciones.dato> y quedarnos con el de fecha más nueva
    const bloques = [...xml.matchAll(/<datoscotizaciones\.dato[^>]*>([\s\S]*?)<\/datoscotizaciones\.dato>/g)]
    if (bloques.length === 0) return json({ error: 'Sin cotizaciones en el rango', body: xml.slice(0, 400) }, 502)

    let mejor: { fecha: string; tcc: number; tcv: number } | null = null
    for (const b of bloques) {
      const contenido = b[1]
      const fecha = /<Fecha>([^<]+)<\/Fecha>/.exec(contenido)?.[1]
      const tcc = Number(/<TCC>([^<]+)<\/TCC>/.exec(contenido)?.[1] ?? '0')
      const tcv = Number(/<TCV>([^<]+)<\/TCV>/.exec(contenido)?.[1] ?? '0')
      if (!fecha || !(tcc > 0)) continue
      if (!mejor || fecha > mejor.fecha) mejor = { fecha, tcc, tcv }
    }
    if (!mejor) return json({ error: 'No pude parsear la cotización' }, 502)

    const cotizacion = (mejor.tcc + mejor.tcv) / 2
    return json({
      fecha: mejor.fecha,
      tcc: mejor.tcc,
      tcv: mejor.tcv,
      cotizacion: Number(cotizacion.toFixed(3)),
      fuente: 'BCU · Interbancario (moneda 2225)',
    })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
