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

### Costeo del aceite (en curso, nov-2026)

Modelo acordado: contabilidad por **criterio caja**. Los costos de producir el aceite se gastan al pagarlos (categorías Olivos/Almazara), NO se descuentan por unidad en cada venta. El "Costo aceite USD/L" (config `costo_aceite_por_litro_usd`, hoy 9) es solo para la **tabla de márgenes** (costo de reposición) — no es contabilidad.

- [ ] **Panel "cierre de campaña"** en Admin, dentro del diálogo "Costo del aceite", al lado del campo Costo aceite USD/L:
  - Elegir campaña/año + **seleccionar qué categorías de gasto incluir** (operativas marcadas por defecto: Olivos poda, Olivos cultivos y MO, Olivos cosecha —aunque esté inactiva—, Almazara envasado, Almazara gastos y MO; las de Inversión NO).
  - Suma de esas categorías ÷ litros producidos de la cosecha → **costo real USD/L**.
  - Botón "usar este valor" que carga el resultado en `costo_aceite_por_litro_usd`.
- [ ] **Ajuste único de inventario inicial pre-app**: los costos de la cosecha 2025 y anteriores no se cargaron (la app no existía). Cargar UNA vez el costo del inventario inicial = litros totales incorporados al inicio × 9 USD/L × cotización, como gasto histórico (categoría Almazara). Necesito los litros iniciales (de la carga inicial de la app).
- [ ] **Revertir costos nocionales (doble conteo)**: bajo caja, un regalo/promo/merma es ingreso $0 SIN costo aparte (el costo del aceite ya se gastó en producción). Hay que borrar los gastos nocionales ya creados (promociones_comerciales de regalos + merma #26 = gasto #208) y dejar de generarlos (quitar la creación automática en Ventas regalo/promo y en Stock merma/retiro).

Notas: la categoría `olivos_cosecha` se activa estacionalmente (otoño); el cálculo debe sumarla aunque esté inactiva. Convención: egreso nocional de granel llevaba descripción "Retiro granel #..." y se excluía de conciliación — al revertir ya no se genera.

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
