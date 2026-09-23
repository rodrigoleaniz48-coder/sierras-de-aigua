function assertEquals<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg || `Esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(actual)}`)
  }
}

function assertNotNull<T>(val: T, msg?: string) {
  if (val === null || val === undefined) {
    throw new Error(msg || `Esperado valor no nulo, obtenido ${JSON.stringify(val)}`)
  }
}

import { extraer, calcularEstado, detectarImporte, detectarFechaVencimiento, detectarPeriodo, detectarNumeroDocumento } from './extractor.ts'

// ---- Test 6: Correo con PDF adjunto (extracción correcta) ----

Deno.test('Extraccion: PDF adjunto con datos de factura', () => {
  const r = extraer({
    de: 'Envases del Este <admin@envasesdeleste.com.uy>',
    asunto: 'Factura adjunta',
    cuerpo: 'Adjuntamos factura correspondiente al pedido de envases de vidrio.',
    fecha: '2026-09-20T14:00:00Z',
    gmail_id: 'msg_pdf_001',
    thread_id: 'thread_pdf_001',
    categoria: 'proveedor',
    confianza_clasificacion: 0.65,
    adjuntos_texto: [{
      nombre: 'Factura_4521.pdf',
      texto: 'FACTURA N° 4521\nFecha: 20/09/2026\nCliente: Sierras de Aiguá\nConcepto: Envases de vidrio 500ml x 200 unidades\nSubtotal: $10.000\nIVA (22%): $2.200\nTotal a pagar: $12.200\nVencimiento: 20/10/2026',
    }],
  })

  assertEquals(r.importe, 12200)
  assertEquals(r.moneda, 'UYU')
  assertEquals(r.fecha_vencimiento, '2026-10-20')
  assertEquals(r.numero_documento, '4521')
  assertNotNull(r.adjunto_relevante)
  assertEquals(r.adjunto_relevante, 'Factura_4521.pdf')
  assertEquals(r.organismo, 'Envases del Este')
  assertEquals(r.tipo_obligacion, 'factura')
  assertEquals(r.categoria, 'proveedor')
  assertEquals(r.enlace_gmail, 'https://mail.google.com/mail/u/0/#inbox/msg_pdf_001')
})

// ---- Test 7: Obligación vencida (estado vencido correcto) ----

Deno.test('Extraccion: obligacion vencida calcula estado correcto', () => {
  const r = extraer({
    de: 'BPS Notificaciones <notificaciones@bps.gub.uy>',
    asunto: 'Comunicación de adeudo - Aportes patronales',
    cuerpo: 'Se le comunica que registra aportes pendientes ante el BPS por el período 08/2026. Monto total: $45.320. Vencimiento: 15/08/2026.',
    fecha: '2026-08-01T10:00:00Z',
    gmail_id: 'msg_venc_001',
    thread_id: 'thread_venc_001',
    categoria: 'bps',
    confianza_clasificacion: 0.8,
  }, '2026-09-23')

  assertEquals(r.estado, 'vencido')
  assertEquals(r.fecha_vencimiento, '2026-08-15')
  assertEquals(r.importe, 45320)
  assertEquals(r.organismo, 'BPS')
  assertEquals(r.tipo_obligacion, 'aportes')
  assertEquals(r.periodo, '08/2026')
})

// ---- Test 8: Obligación mencionada como pagada → posible_pago ----

Deno.test('Extraccion: correo menciona pago queda como posible_pago', () => {
  const r = extraer({
    de: 'BSE Pólizas <polizas@bse.com.uy>',
    asunto: 'Confirmación de pago - Póliza 12345',
    cuerpo: 'Le confirmamos que el pago de la póliza N° 12345 ha sido recibido y acreditado. Monto abonado: $28.500.',
    fecha: '2026-09-15T09:00:00Z',
    gmail_id: 'msg_pago_001',
    thread_id: 'thread_pago_001',
    categoria: 'bse',
    confianza_clasificacion: 0.85,
  })

  assertEquals(r.estado, 'posible_pago')
  assertEquals(r.importe, 28500)
  assertEquals(r.organismo, 'BSE')
  assertEquals(r.numero_documento, '12345')
})

// ---- Tests unitarios complementarios ----

Deno.test('detectarImporte: formato uruguayo con punto separador de miles', () => {
  const r = detectarImporte('Total a pagar: $45.320')
  assertEquals(r.importe, 45320)
  assertEquals(r.moneda, 'UYU')
})

Deno.test('detectarImporte: USD', () => {
  const r = detectarImporte('Monto: USD 1.250,50')
  assertEquals(r.importe, 1250.5)
  assertEquals(r.moneda, 'USD')
})

Deno.test('detectarImporte: sin monto retorna null', () => {
  const r = detectarImporte('No hay montos en este texto')
  assertEquals(r.importe, null)
  assertEquals(r.moneda, null)
})

Deno.test('detectarFechaVencimiento: formato dd/mm/yyyy', () => {
  const f = detectarFechaVencimiento('Vencimiento: 15/08/2026')
  assertEquals(f, '2026-08-15')
})

Deno.test('detectarFechaVencimiento: con nombre de mes', () => {
  const f = detectarFechaVencimiento('Vence el 5 de octubre de 2026')
  assertEquals(f, '2026-10-05')
})

Deno.test('detectarFechaVencimiento: sin fecha retorna null', () => {
  const f = detectarFechaVencimiento('No tiene fecha de vencimiento')
  assertEquals(f, null)
})

Deno.test('detectarPeriodo: mes/anio', () => {
  const p = detectarPeriodo('Aportes del período 08/2026')
  assertEquals(p, '08/2026')
})

Deno.test('detectarPeriodo: nombre de mes', () => {
  const p = detectarPeriodo('Liquidación de sueldos septiembre 2026')
  assertEquals(p, '09/2026')
})

Deno.test('detectarNumeroDocumento: factura N°', () => {
  const n = detectarNumeroDocumento('FACTURA N° 4521')
  assertEquals(n, '4521')
})

Deno.test('detectarNumeroDocumento: poliza N°', () => {
  const n = detectarNumeroDocumento('póliza N° 12345')
  assertEquals(n, '12345')
})

Deno.test('calcularEstado: pendiente si no vencido ni pagado', () => {
  const e = calcularEstado('2026-12-31', 'Tiene aportes pendientes.', 0.5, '2026-09-23')
  assertEquals(e, 'pendiente')
})

Deno.test('calcularEstado: vencido si fecha pasada', () => {
  const e = calcularEstado('2026-08-01', 'Tiene aportes pendientes.', 0.5, '2026-09-23')
  assertEquals(e, 'vencido')
})

Deno.test('calcularEstado: posible_pago detecta "pagado"', () => {
  const e = calcularEstado('2026-08-01', 'El monto ha sido pagado correctamente.', 0.5, '2026-09-23')
  assertEquals(e, 'posible_pago')
})

Deno.test('calcularEstado: revisar si confianza muy baja', () => {
  const e = calcularEstado(null, 'Texto ambiguo sin contexto.', 0.1, '2026-09-23')
  assertEquals(e, 'revisar')
})

Deno.test('Extraccion: email sin adjuntos detecta datos del cuerpo', () => {
  const r = extraer({
    de: 'DGI <notificaciones@dgi.gub.uy>',
    asunto: 'Declaración jurada pendiente - IRPF',
    cuerpo: 'Se le recuerda que tiene pendiente la declaración jurada de IRPF correspondiente al período 07/2026. Monto estimado: $18.900. Pagar antes del 25/10/2026.',
    fecha: '2026-09-20T12:00:00Z',
    gmail_id: 'msg_dgi_001',
    thread_id: 'thread_dgi_001',
    categoria: 'dgi',
    confianza_clasificacion: 0.9,
  }, '2026-09-23')

  assertEquals(r.organismo, 'DGI')
  assertEquals(r.tipo_obligacion, 'impuesto_irpf')
  assertEquals(r.importe, 18900)
  assertEquals(r.estado, 'pendiente')
  assertEquals(r.periodo, '07/2026')
  assertEquals(r.fecha_vencimiento, '2026-10-25')
  assertEquals(r.adjunto_relevante, null)
})
