# Sierras de Aiguá — Roadmap

Fuente única de verdad para el estado del proyecto y las pendencias por área.
Se actualiza en cada sesión de trabajo con Claude Code.

**Cómo trabajamos**: una conversación de Claude Code por área. Al arrancar cada
sesión, Claude lee este archivo + el código de esa área y ya está al día.

---

## Contexto del proyecto

- **Empresa**: Sierras de Aiguá — producción familiar de aceite de oliva, miel
  y aceitunas en la zona de Aiguá (Maldonado / Lavalleja, Uruguay).
- **Socios y roles** (todos con login individual):
  - Rodrigo — admin (administra + vende)
  - Santiago — admin (administra + vende)
  - Gonzalo — ventas (carga sus ventas y gastos, ve stock compartido)
  - Ayelén — marketing / redes (solo lectura de clientes y stock)
- **Stack**: React + TypeScript + Vite + Tailwind. Base y auth: Supabase
  (project `ogtssmliiftxaieectny`, región São Paulo). Hosting: GitHub Pages.
- **URL app**: <https://rodrigoleaniz48-coder.github.io/sierras-de-aigua/>
- **Repo**: <https://github.com/rodrigoleaniz48-coder/sierras-de-aigua>
- **Deploy**: automático a Pages en cada push a `main`.

### Decisiones transversales

- **Moneda**: UYU. **IVA**: 10 % por defecto (todas las presentaciones); si un
  producto necesita 22 %, se edita puntualmente desde Administración.
- **Precios**: `precio_minorista` y `precio_mayorista` son sin IVA. El IVA se
  agrega solo cuando la venta se marca "con factura".
- **Encoding**: no usar `ñ` en identificadores de DB (columnas, funciones).
  En strings de UI sí, en textos de negocio sí — solo evitamos ñ en nombres de
  campos de Postgres (se rompe el parser de tipos del SDK). Ejemplo: usamos
  `campana` en la columna, mostramos "Campaña" en la UI.
- **Idioma**: castellano rioplatense. Nada de emojis en código a menos que el
  usuario los pida (los usados en UI de envíos/cadete están explícitamente
  aceptados).
- **RLS**: activo en todas las tablas. Roles verifican vía funciones
  `es_admin()` y `tiene_rol(text[])`.

---

## 1. Sierras — Stock

### Estado actual (listo)

- **Modelo de tanques físicos** (6 tanques cargados con capacidad real):
  T1 3000L, T2 2000L, T3 1000L, T4 1000L, T5 3000L, T6 1000L. Los tanques
  arrancan vacíos y el contenido se define al primer "cargar cosecha".
- **Tabla `tanques`**: capacidad, contenido (producto vendible o variedad
  libre), campaña, litros actuales, notas.
- **Tabla `movimientos_granel`**: tipos `cargar`, `trasegar`, `envasar`,
  `merma`, `ajuste`, `muestra`.
- **Tabla `stock`**: unidades envasadas por presentación, ligadas al tanque
  de origen (o `null` para carga externa vía "Ajuste envasado").
- **UI Stock con 3 pestañas**: Tanques (tarjetas visuales con barra de
  llenado y colores por variedad), Stock envasado, Movimientos.
- **Acciones**: Cargar cosecha, Trasegar / blend, Envasar, Merma / muestra,
  Ajuste envasado, Editar tanque.
- **Colores por variedad**: verde=Blend suave · rojo=Blend intenso ·
  azul=Picual · amarillo=resto · gris=vacío.
- **Packs**: modelados como bundle (`presentacion_componente`). Pack
  degustación x3 250ml descuenta 1× de cada 250ml (Suave, Intenso, Picual)
  FIFO al venderse. No aparecen en Stock envasado.
- **Producto genérico "Blend"** disponible al cargar cosecha, para tanques
  cuya composición se define después. `granel = true`.
- **Pack degustación excluido** de todos los dropdowns de tanques (`granel
  = false`).

### Pendientes / mejoras

- [ ] Cargar el stock envasado inicial real (Picual ya envasado, botellas de
  blends que ya estén envasadas, miel, jabón, aceitunas). Se hace vía
  "Ajuste envasado" o directamente por API con el token de Supabase.
- [ ] Alertas por email cuando una presentación cae bajo `stock_minimo`.
- [ ] Imprimir etiquetas de lote (para el depósito) con QR o datos clave.
- [ ] Snapshot histórico de contenido en `movimientos_granel` (hoy muestra
  contenido actual del tanque, no el que había al momento del movimiento).
- [ ] Reporte de rendimiento por campaña (litros producidos vs litros
  envasados vs unidades vendidas).

### Datos operativos

- Variedades cultivadas: arbequina, coratina, picual, frantoio.
- Producción promedio anual: ~6.000 L. 10 hectáreas plantadas.
- Cosecha: una vez al año. Después se arman los blends y quedan
  almacenados.
- El Picual y el "Entero sin filtrar" **no se venden en bidón 3L**
  (presentaciones inactivas / eliminadas).
- T3 suele contener un blend a granel para una clienta brasileña
  (exportación); T4 suele contener coratina pura para "levantar" blends.
- El Premiado es un blend distinto cada año para participar de concursos
  (ej: Mario Solinas 2026).

---

## 2. Sierras — Ventas y CRM

### Estado actual (listo)

- **Alta de venta** con múltiples ítems, cliente opcional, canal, forma de
  pago, estado, "con factura" (agrega IVA), envío por cadete con costo
  editable.
- **Precio auto** según tipo de cliente (minorista / mayorista). Si el
  precio se editó a mano, no se sobreescribe al cambiar cliente.
- **FIFO** para elegir el stock más viejo al agregar un ítem (el usuario
  puede cambiar el origen manualmente).
- **Descuento de stock automático** vía trigger `fn_descontar_stock_venta`
  (maneja packs iterando componentes).
- **Alta rápida de cliente inline** desde el formulario de venta (botón
  "+ nuevo cliente", modal reducido con nombre/tipo/teléfono).
- **Detalle de venta clickeable**: modal con cabecera editable, ítems
  read-only, botones de estado y "Anular venta" (reversa stock).
- **Envío por cadete**: checkbox + costo (default $190) + horario opcional
  + dirección y teléfono. Dirección y teléfono actualizan la ficha del
  cliente al guardar.
- **Lista para cadete**: modal con selección por checkbox, numeración
  mensual estable, botón "Copiar" y "Abrir WhatsApp". Formato del mensaje:
  #pedido · nombre · items · 📞 · 📍 · 🕐.
- **Filtros**: por fecha (desde/hasta), socio, "solo con envío".
- **CRM básico (Clientes)**: alta / edición / búsqueda / tipo /
  socio asignado. Se comparte el `ClienteDialog` con Ventas.

### Pendientes / mejoras

- [ ] Guardar el **número del cadete** como config y que "Abrir WhatsApp"
  vaya directo a su chat (`https://wa.me/598...`).
- [ ] Descarga del mensaje del cadete como archivo `.txt` (además de
  copiar / WhatsApp).
- [ ] Editar ítems de una venta sin tener que anular (ahora no se puede,
  hay que anular y recargar).
- [ ] Buscador de cliente con autocompletado dentro del formulario (cuando
  haya cientos de clientes).
- [ ] Reportes: ventas por período / socio / producto / cliente; ranking
  de clientes; comparativo mensual.
- [ ] Ficha de cliente ampliada con historial de compras + próximos
  seguimientos (para uso de Ayelén en marketing).
- [ ] Recibo imprimible / compartible por WhatsApp con el detalle de la
  venta al cliente.

### Decisiones específicas del área

- **Envío**: obligatorio elegir cliente (o crearlo con "+ nuevo cliente")
  para que la dirección quede guardada para futuras ventas.
- **Anular**: en lugar de editar ítems, se anula la venta (marca
  `estado='cancelado'`) y se reversa stock via movimientos con
  `tipo='devolucion'`. Después se carga una nueva.
- **Numeración de pedido para cadete**: mensual, estable, calculada en
  vivo (no persistida). Índice cronológico entre las ventas con envío del
  mes.

---

## 3. Sierras — Gastos y Contabilidad

### Estado actual (listo)

- **Placeholders** en las páginas `Mis gastos` y `Contabilidad` — están
  ruteadas y visibles según rol pero sin funcionalidad.
- Tabla `gastos` existe en el schema con: fecha, socio_id, categoria,
  monto, con_iva, iva_pct, descripcion, comprobante_url.

### Pendientes / mejoras

- [ ] **Mis gastos** (todos los socios excepto Ayelén): alta de gasto
  personal (combustible, viáticos, compras generales, insumos), con
  categoría, fecha, monto, comprobante opcional (foto). Listado propio y
  filtros por período.
- [ ] **Contabilidad general** (solo Rodrigo/Santi): ingresos (todas las
  ventas) vs egresos (compras de aceituna, insumos, mantenimiento,
  gastos personales sumarizados). Estado de resultados por período.
  Cálculo de IVA aportado / recibido.
- [ ] Categorías predefinidas de gastos + posibilidad de crear nuevas.
- [ ] Adjuntar comprobantes (usar Supabase Storage).
- [ ] Export a Excel/CSV para el contador.
- [ ] Separar ventas con factura vs sin factura para IVA.

### Decisiones específicas del área

- **Gastos personales** no se compensan automáticamente. Son solo
  registro (transparencia entre socios).
- **Contabilidad** oculta para Ayelén y Gonzalo.

---

## 4. Sierras — Dashboard, reportes y usuarios

### Estado actual (listo)

- **Dashboard placeholder**: saludo por rol, tarjetas KPI vacías,
  descripción de módulos.
- **Layout responsive** con sidebar en desktop y menú hamburguesa mobile.
- **Login** con email + password (Supabase Auth).
- **Roles** con RLS: admin / ventas / marketing.
- **Perfil por usuario** (`public.perfiles`): id (fk a auth.users),
  nombre, rol, activo. Se crea automáticamente al alta con trigger.

### Pendientes / mejoras

- [ ] **Dashboard real**: KPIs con datos (ventas del mes, ventas por
  socio, total granel disponible, unidades envasadas por producto, stock
  bajo, últimos movimientos, envíos pendientes de entregar).
- [ ] **Gestión de usuarios** desde la UI (para Rodrigo/Santi): crear
  nuevos socios, cambiar rol, desactivar. Hoy se hace por SQL.
- [ ] **Crear usuarios de Santi, Gonzalo y Ayelén** en Supabase Auth con
  Auto Confirm y setear rol correcto. Requiere sus emails reales.
- [ ] Registro de auditoría (quién hizo qué cambio y cuándo).
- [ ] Recuperación de contraseña por email.
- [ ] Cambio de contraseña desde el perfil.

### Datos operativos

- El único usuario creado hoy es Rodrigo (`rodrigoleaniz48@gmail.com`,
  rol admin).

---

## 5. Sierras — Importación de históricos

### Estado actual

- Sin arrancar. El modelo de datos de `clientes` y `ventas` fue diseñado
  para admitir carga masiva vía CSV sin cambios de schema.

### Pendientes / mejoras

- [ ] **Importar clientes** desde las planillas de Google Drive de
  Rodrigo (contactos, compras pasadas). Detectar duplicados por teléfono
  / email / nombre normalizado.
- [ ] **Importar ventas históricas**: mapear productos/presentaciones,
  fechas, montos. Preservar el número de pedido si estaba anotado.
- [ ] Reporte post-importación: cuántas filas OK, cuántas con warning,
  cuántas rechazadas.
- [ ] Idempotencia: poder re-correr sin duplicar.

### Datos operativos

- Las planillas viven en Google Drive de Rodrigo (aún no compartidas).
- Rodrigo va a pasar las planillas cuando el módulo Ventas esté
  estabilizado y probado con datos reales del día a día.

---

## Cómo abrir una sesión nueva por tema

Ejemplo de mensaje inicial en Claude Code:

> Sierras — Stock: retomamos. Leé `ROADMAP.md` y el código de
> `src/pages/Stock.tsx` + `supabase/migracion_tanques.sql`. Contame
> estado y qué te parece atacar primero de la lista de pendientes.

Claude va a leer el archivo, orientarse en 2 minutos y responder con
propuesta concreta. A partir de ahí trabajamos en esa área sin arrastrar
contexto de las otras.
