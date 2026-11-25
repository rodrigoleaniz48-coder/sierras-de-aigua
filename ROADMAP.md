# Sierras de Aiguá — Roadmap

Pendientes por área. El contexto de proyecto (stack, roles, comandos, convenciones) vive en `CLAUDE.md`. La historia de features listos vive en `git log` — este archivo se enfoca en lo que falta.

---

## Stock

- [ ] Cargar el stock envasado inicial real que aún falta (revisar por presentación: Picual, blends, miel, jabón, aceitunas). Vía "Ajuste envasado".
- [ ] Alertas por email cuando una presentación cae bajo `stock_minimo`.
- [ ] Imprimir etiquetas de lote (para el depósito) con QR o datos clave.
- [ ] Snapshot histórico de contenido en `movimientos_granel` (hoy muestra contenido actual del tanque, no el que había al momento del movimiento).
- [ ] Reporte de rendimiento por campaña (litros producidos vs envasados vs vendidos).

### Datos operativos

- Variedades cultivadas: arbequina, coratina, picual, frantoio.
- Producción promedio anual: ~6.000 L. 10 hectáreas plantadas.
- Cosecha 1 vez al año; después blends y almacenamiento.
- Picual y "Entero sin filtrar" **no se venden en bidón 3L** (presentaciones inactivas).
- T3 suele contener blend para clienta brasileña (exportación); T4 coratina pura para "levantar" blends.
- Premiado = blend distinto cada año para concursos (ej. Mario Solinas 2026).
- Tambor miel (id 13): 25 kg cap. Tratamos kg como L internamente.
- Tanque cosmética (id 14): 500 L. Producto id 32 "Aceite cosmetica" granel; venta granel producto id 33.

---

## Ventas y CRM

- [ ] Guardar **número del cadete** como config y que "Abrir WhatsApp" vaya directo a su chat.
- [ ] Descarga del mensaje del cadete como archivo `.txt` (además de copiar / WhatsApp).
- [ ] Editar ítems de una venta sin tener que anular.
- [x] Buscador de cliente con autocompletado (nueva venta y detalle). Ordena por actividad reciente: los que compran aparecen primero.
- [x] Cobros pendientes: en la lista de Pendientes, cada venta sin cobrar muestra días de atraso + botón "Recordar" (WhatsApp con datos bancarios).
- [ ] Reportes: ventas por período / socio / producto / cliente; ranking; comparativo mensual.
- [ ] Ficha de cliente ampliada con historial de compras + próximos seguimientos.
- [ ] Recibo imprimible / compartible por WhatsApp con el detalle de la venta al cliente.
- [ ] **WhatsApp Business Cloud API** para envío masivo real (cuando Rodrigo decida chip nuevo vs 099301320). Requiere plantillas aprobadas por Meta.

### Decisiones específicas

- Envío: obligatorio elegir cliente (para guardar dirección/teléfono).
- Anular en lugar de editar ítems: `estado='cancelado'` + reversión de stock con `tipo='devolucion'`.
- Numeración de pedido cadete: mensual, estable, calculada en vivo.

---

## Finanzas / Contabilidad

- [ ] Adjuntar comprobantes a gastos (Supabase Storage).
- [ ] Export a Excel/CSV para el contador (parcial: hay `backupExcel.ts`).
- [ ] Cálculo de IVA aportado / recibido separado.
- [ ] Categorías predefinidas de gastos con auto-sugerencia por texto.

### Costeo del aceite (listo, nov-2026)

Modelo acordado: contabilidad por **criterio caja**. Los costos de producir el aceite se gastan al pagarlos (categorías Olivos/Almazara), NO se descuentan por unidad en cada venta. El "Costo aceite USD/L" (config `costo_aceite_por_litro_usd`, hoy 9) es solo para la **tabla de márgenes** (costo de reposición) — no es contabilidad.

- [x] **Panel "cierre de campaña"** en Admin, dentro del diálogo "Costo del aceite", al lado del campo Costo aceite USD/L. Elegir año + **seleccionar qué categorías incluir** → suma ÷ litros producidos = costo real USD/L, con botón "usar este valor".
  - Preseleccionadas: Olivos poda, Olivos cultivos y MO, Olivos cosecha (inactiva, estacional), Almazara cosecha, Almazara gastos y MO. **Inversión NO.**
  - **Envasado FUERA del USD/L**: "Almazara - envasado" (slug `olivos_procesamiento`) es empaque por unidad que se paga durante todo el año, no parte del costo del litro a granel. Queda en la lista por si algún año se quiere incluir a mano.
- [x] **Ajuste único de inventario inicial pre-app** → gasto **#210** (Almazara - cosecha, 2026-08-21, **84.456 USD**, sin método de pago, no conciliable). = 9.384 L incorporados al arranque (granel 6.994 L T1–T6 incl. Viña Eden + envasado 2.390 L ago-2026) × 9 USD/L. Desde la cosecha 2027 los costos reales se cargan bien y este ajuste ya no se repite.
  - **Viña Eden es aceite propio** (reservado para ese cliente, se cobra al envasar; el envasado lo paga el cliente aparte) → se incluye en el inventario.
- [x] **Revertir costos nocionales (doble conteo)**: bajo caja, regalo/promo/merma es ingreso $0 SIN costo aparte (ya se gastó en producción). Borrados los gastos nocionales y quitada su creación automática (Ventas regalo/promo, Stock merma/retiro). Convención vieja: egreso "Retiro granel #..." excluido de conciliación — ya no se genera.
- [x] **Tabla de costos por presentación** (Admin, nov-2026): el foco es el **costo real** de cada presentación = costo envasado + costo aceite (litros × USD/L × BCU), para derivar precios desde ahí. Columnas: Presentación · Costo env. · Costo aceite · **Costo total** · Consumidor · Marg. consum. % · IVA % · Stock mín. Sacadas las columnas de **distribuidor/mayorista** y el **USD/L de aceite** (eran ruido para costear).
  - **Envasado = materiales + MO**: el campo "Costo envasado" por presentación (envase + tapa + etiqueta + caja + servicio) es el estándar por unidad. El gasto real "Almazara - envasado" son los materiales (botellas, tapas, etiquetas, film) comprados por lote durante el año **+ la MO** cuando se cargue en esa categoría. No va en el USD/L a granel porque escala por unidad, no por litro (envasado por litro: ~$404/L en 250 ml vs ~$21/L en 3 L).
- [ ] **Conciliación envasado real vs estándar** (pendiente): contrastar lo gastado de verdad en "Almazara - envasado" (materiales + MO, corre todo el año) contra el estándar implícito (Σ costo_envasado por presentación × unidades envasadas del período). Sirve para saber si los costos por presentación cargados a mano siguen frescos.
- [x] **Productos NO aceite** (aceituna, jabón, miel, vinagre): el campo "costo_envasado" es el **costo total del producto** (no hay costo de aceite). En la tabla de Admin la columna se muestra como **"Costo prod."** y se ocultan las columnas env./aceite/total (ahí redundantes). En gastos estos se cargan como productos (ej. categoría "Almazara - productos").
- [x] **Miel = trueque por arrendamiento** (nov-2026): la miel no se compra, se recibe como pago del arrendamiento del campo para colmenas (1 colmena = 1 kg de miel). No hay egreso de caja, así que se costea a **valor de reposición** = valor de mercado de la miel orgánica. Definido **$300/kg** (miel orgánica genérica UY, nov-2026). Costo cargado = frasco + peso × $300: Chico 300g = $116, Grande 900g = $309,5. Revisar el valor/kg si cambia el mercado.
- [ ] **Actualizar costos de envasado por insumo** (pendiente, armado): composición por presentación, precios por unidad, criterio (sin IVA, UYU al BCU de compra) y plantilla SQL en [`COSTEO_ENVASADO.md`](COSTEO_ENVASADO.md). Hay botellas nuevas ya cotizadas (USD, **no compradas aún**) listas para cargar cuando se compren; faltan precios del resto de insumos y definir 5 L / Pack / 250 ml.

---

## Dashboard / Usuarios

- [ ] Gestión de usuarios desde la UI (crear, cambiar rol, desactivar) — hoy es SQL.
- [ ] Registro de auditoría (quién cambió qué y cuándo).
- [ ] Recuperación de contraseña por email.

---

## Campo (cuaderno de campo)

Módulo con 3 sub-vistas (pestañas): Cosecha, Manejo de cultivo, Informes. "Manejo de cultivo" unifica labores + aplicaciones + clima (lluvia) en un solo cronograma (lista/grilla).

- [x] Cronograma unificado de Manejo (labores + aplicaciones + lluvias, lista/grilla). Categorías de color editables con descripción (se ve al tocar la leyenda). Grilla multicolor por categoría.
- [x] Cosecha (resumen por variedad y sector, export Excel, editor de sectores).
- [x] **Clima = solo lluvia**, integrado al cronograma de Manejo (día + mm, total mm por mes/año). Histórico 2017–2025 importado (356 eventos; ver `migracion_campo_clima.sql`).
- [x] **Informes técnicos**: pestaña propia con las 27 visitas de Marcelo Cabrera + alta/edición.
- [ ] **Jornales**: pendiente. La idea (a definir en conversación aparte) es un resumen mensual por operario derivado de las labores/aplicaciones (que ya guardan jornales/horas), sin depender del módulo Tareas. Tareas hoy no se aprovecha bien.
- [ ] Clima 2023 no quedó cargado (el Excel solo lo tiene en detalle diario, sin agregado); 2018–2022 sin desglose. Se puede cargar a mano.
- [ ] Granizo/viento/heladas: por ahora se anotan como nota de la lluvia; evaluar si merecen su propio registro.
- [ ] **Cosecha ↔ Stock**: vincular el pasaje a tanque con el granel de Stock (hoy están separados). Que la cosecha alimente el stock por tanque y poder ver/gestionar lo disponible en tanques de años anteriores (mezclar, retirar). Falta definir cómo se conectan los dos módulos.
- [ ] **Costo de cosecha desde los datos**: a futuro, deducir el costo de cosecha (más allá del destajo por kg: comida, traslados, etc.) a partir de lo que ya se carga en la app. Es complejo; queda para definir.

---

## Importación de históricos

- [ ] Importar ventas históricas de Rodrigo (planillas Google Drive). Idempotente, detectar duplicados por fecha+cliente+total. Va cuando Rodrigo pase las planillas.
