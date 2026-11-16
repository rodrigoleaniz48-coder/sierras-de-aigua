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

---

## Dashboard / Usuarios

- [ ] Gestión de usuarios desde la UI (crear, cambiar rol, desactivar) — hoy es SQL.
- [ ] Registro de auditoría (quién cambió qué y cuándo).
- [ ] Recuperación de contraseña por email.

---

## Campo (cuaderno de campo)

Módulo con 4 sub-vistas (pestañas scrolleables): Aplicaciones, Manejo de cultivo, Cosecha, Informes.

- [x] Cronogramas de Aplicaciones y Manejo (lista/grilla, categorías de color editables).
- [x] Cosecha (resumen por variedad y sector, export Excel, editor de sectores).
- [x] **Clima = solo lluvia**, integrado al cronograma de Manejo (día + mm, total mm por mes/año). Histórico 2017–2025 importado (356 eventos; ver `migracion_campo_clima.sql`).
- [x] **Informes técnicos**: pestaña propia con las 27 visitas de Marcelo Cabrera + alta/edición.
- [ ] **Jornales**: pendiente. La idea (a definir en conversación aparte) es un resumen mensual por operario derivado de las labores/aplicaciones (que ya guardan jornales/horas), sin depender del módulo Tareas. Tareas hoy no se aprovecha bien.
- [ ] Clima 2023 no quedó cargado (el Excel solo lo tiene en detalle diario, sin agregado); 2018–2022 sin desglose. Se puede cargar a mano.
- [ ] Granizo/viento/heladas: por ahora se anotan como nota de la lluvia; evaluar si merecen su propio registro.

---

## Importación de históricos

- [ ] Importar ventas históricas de Rodrigo (planillas Google Drive). Idempotente, detectar duplicados por fecha+cliente+total. Va cuando Rodrigo pase las planillas.
