function assertEquals<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg || `Esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(actual)}`)
  }
}
import { clasificar } from './clasificador.ts'

// ---- 1. Correo válido de BPS ----

Deno.test('BPS: clasifica por dominio y keywords', () => {
  const r = clasificar({
    de: 'BPS Notificaciones <notificaciones@bps.gub.uy>',
    asunto: 'Comunicación de adeudo - Aportes patronales',
    cuerpo: 'Se le comunica que registra aportes pendientes ante el BPS por el período 08/2026. Monto total: $45.320,00.',
  })
  assertEquals(r.categoria, 'bps')
  assertEquals(r.confianza >= 0.5, true)
})

Deno.test('BPS: clasifica solo por dominio (sin keywords específicos)', () => {
  const r = clasificar({
    de: 'noreply@bps.gub.uy',
    asunto: 'Notificación importante',
    cuerpo: 'Tiene una nueva notificación disponible en su buzón.',
  })
  assertEquals(r.categoria, 'bps')
})

// ---- 2. Correo válido del BSE ----

Deno.test('BSE: clasifica por dominio y keywords', () => {
  const r = clasificar({
    de: 'BSE Pólizas <polizas@bse.com.uy>',
    asunto: 'Vencimiento de póliza - Seguro de accidentes de trabajo',
    cuerpo: 'Le informamos que su póliza de seguro de accidentes de trabajo N° 12345 vence el 15/10/2026. Prima a abonar: $28.500.',
  })
  assertEquals(r.categoria, 'bse')
  assertEquals(r.confianza >= 0.5, true)
})

Deno.test('BSE: clasifica por dominio sin keywords exactos', () => {
  const r = clasificar({
    de: 'comunicaciones@bse.com.uy',
    asunto: 'Renovación pendiente',
    cuerpo: 'Estimado cliente, su cobertura está próxima a vencer.',
  })
  assertEquals(r.categoria, 'bse')
})

// ---- 3. Correo del estudio contable ----

Deno.test('Estudio contable: clasifica por nombre remitente + keywords', () => {
  const r = clasificar({
    de: 'Estudio Contable López & Asoc. <contacto@estudiolopez.com.uy>',
    asunto: 'Liquidación de sueldos Septiembre 2026',
    cuerpo: 'Adjuntamos la liquidación de sueldos del mes de septiembre y los recibos de sueldo para firma.',
  })
  assertEquals(r.categoria, 'estudio_contable')
  assertEquals(r.confianza >= 0.3, true)
})

Deno.test('Estudio contable: clasifica con nombre "Cr." en remitente', () => {
  const r = clasificar({
    de: 'Cr. Martínez <cr.martinez@gmail.com>',
    asunto: 'Cierre mensual agosto - estados financieros',
    cuerpo: 'Les envío el balance y estados financieros del cierre de agosto. Quedo a las órdenes, Cr. Martínez.',
  })
  assertEquals(r.categoria, 'estudio_contable')
})

// ---- 4. Correo irrelevante ----

Deno.test('Irrelevante: no clasifica spam/marketing', () => {
  const r = clasificar({
    de: 'Promo Store <marketing@tienda.com>',
    asunto: 'Ofertas de temporada - 50% de descuento en toda la tienda',
    cuerpo: 'Aprovechá las mejores ofertas de la temporada en toda nuestra línea de productos. Envío gratis a todo el país.',
  })
  assertEquals(r.categoria, null)
})

Deno.test('Irrelevante: no clasifica newsletter genérica', () => {
  const r = clasificar({
    de: 'Tech News <newsletter@technews.io>',
    asunto: 'Las 10 tendencias tech de 2026',
    cuerpo: 'En este artículo repasamos las principales tendencias tecnológicas que marcarán el próximo año.',
  })
  assertEquals(r.categoria, null)
})

Deno.test('Irrelevante: no clasifica email personal sin contexto fiscal', () => {
  const r = clasificar({
    de: 'Juan Pérez <juan@gmail.com>',
    asunto: 'Te paso las fotos del asado',
    cuerpo: 'Hola, acá van las fotos del fin de semana. Abrazo!',
  })
  assertEquals(r.categoria, null)
})

// ---- 5. Correo reenviado ----

Deno.test('Reenviado: clasifica Fwd de BPS por dominio en body + keywords', () => {
  const r = clasificar({
    de: 'Santiago <santiago@sierrasdeaigua.com>',
    asunto: 'Fwd: Comunicación de adeudo - BPS',
    cuerpo: `---------- Forwarded message ----------
De: BPS Notificaciones <notificaciones@bps.gub.uy>
Fecha: 15 de septiembre de 2026
Asunto: Comunicación de adeudo

Se le comunica que registra aportes pendientes ante el BPS por el período 08/2026.`,
  })
  assertEquals(r.categoria, 'bps')
})

Deno.test('Reenviado: clasifica RV del BSE', () => {
  const r = clasificar({
    de: 'Rodrigo <rodrigo@empresa.com>',
    asunto: 'RV: Vencimiento póliza BSE',
    cuerpo: `De: polizas@bse.com.uy
Asunto: Vencimiento de póliza

Estimado, su póliza de seguro de accidentes de trabajo vence el 30/09/2026. Prima: $28.500.`,
  })
  assertEquals(r.categoria, 'bse')
})

Deno.test('Reenviado: clasifica Fwd de DGI sin prefijo Fwd en asunto', () => {
  const r = clasificar({
    de: 'Contador <cr.lopez@estudio.com>',
    asunto: 'Te reenvío esto de DGI - obligación tributaria',
    cuerpo: `Hola, te paso esto que llegó de DGI:

De: notificaciones@dgi.gub.uy
Asunto: Obligación tributaria pendiente

Se le informa que registra una obligación tributaria pendiente de pago. Impuesto: IRAE.`,
  })
  assertEquals(r.categoria, 'dgi')
})

// ---- Extras: DGI, Banco, Organismo, Proveedor ----

Deno.test('DGI: clasifica por dominio', () => {
  const r = clasificar({
    de: 'DGI <notificaciones@dgi.gub.uy>',
    asunto: 'Declaración jurada pendiente - IRPF',
    cuerpo: 'Se le recuerda que tiene pendiente la presentación de la declaración jurada de IRPF.',
  })
  assertEquals(r.categoria, 'dgi')
  assertEquals(r.confianza >= 0.5, true)
})

Deno.test('Banco: clasifica BROU por dominio', () => {
  const r = clasificar({
    de: 'BROU Digital <notificaciones@brou.com.uy>',
    asunto: 'Estado de cuenta - Septiembre 2026',
    cuerpo: 'Su estado de cuenta del mes de septiembre está disponible.',
  })
  assertEquals(r.categoria, 'banco')
})

Deno.test('Organismo publico: clasifica .gub.uy genérico', () => {
  const r = clasificar({
    de: 'MTSS <notificaciones@mtss.gub.uy>',
    asunto: 'Resolución sobre habilitación',
    cuerpo: 'El Ministerio de Trabajo comunica la resolución del expediente N° 2026/1234 sobre la habilitación solicitada.',
  })
  assertEquals(r.categoria, 'organismo_publico')
})

Deno.test('Proveedor: clasifica por keywords de factura', () => {
  const r = clasificar({
    de: 'Envases del Este <admin@envasesdeleste.com.uy>',
    asunto: 'Factura N° 4521 - Envases de vidrio',
    cuerpo: 'Adjuntamos factura correspondiente al pedido de envases de vidrio. Vencimiento: 30/10/2026. Monto a pagar: $12.500.',
  })
  assertEquals(r.categoria, 'proveedor')
})

Deno.test('Proveedor: clasifica presupuesto/cotización', () => {
  const r = clasificar({
    de: 'Imprenta Sur <ventas@imprentasur.com>',
    asunto: 'Presupuesto etiquetas personalizadas',
    cuerpo: 'Le enviamos el presupuesto solicitado para la cotización de etiquetas. Precio incluye diseño.',
  })
  assertEquals(r.categoria, 'proveedor')
})
