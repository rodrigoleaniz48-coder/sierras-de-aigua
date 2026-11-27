# MER — Modelo entidad-relación

Diagrama entidad-relación de la base Supabase de Sierras de Aiguá (`ogtssmliiftxaieectny`).

> Armado desde la **estructura viva** de la base (claves foráneas reales), no desde
> `supabase/schema.sql`, que refleja un diseño anterior (tenía `lotes`, `gastos_personales`,
> `movimientos_contables`). Este es el que corre hoy.

- **54** tablas · **68** relaciones (FK) · **8** módulos
- Notación pata de gallo: `uno ||--o{ muchos`. Cada caja lista **PK** (clave primaria) y **FK** (foránea).
- Campos `uuid` (`socio_id`, `creado_por`, `usuario_id`, `autor_id`…) apuntan a `auth.users` de
  Supabase; `perfiles` es su 1:1 en el esquema público.
- La **conciliación bancaria** es un par 1:1: cada `movimientos_bancarios` enlaza a un gasto,
  ingreso, pago o venta (hay FK en ambos sentidos; acá se dibuja una sola línea).
- `config_global` es una tabla suelta de configuración (sin relaciones); no aparece en ningún módulo.

Para regenerarlo, las FK se leen con:

```sql
select tc.table_name as origen, kcu.column_name as col, ccu.table_name as destino
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
order by origen, col;
```

---

## Módulo A — Catálogo, stock y logística

Productos y presentaciones, tanques a granel, stock por ubicación, movimientos, traslados y listas de precios.

```mermaid
erDiagram
  productos ||--o{ presentaciones : tiene
  productos ||--o{ tanques : "a granel"
  presentaciones ||--o{ presentacion_componente : pack
  presentaciones ||--o{ presentacion_componente : componente
  presentaciones ||--o{ stock : ""
  tanques ||--o{ stock : ""
  ubicaciones ||--o{ stock : ""
  presentaciones ||--o{ stock_minimos_ubicacion : ""
  ubicaciones ||--o{ stock_minimos_ubicacion : ""
  stock ||--o{ movimientos_stock : ""
  stock ||--o{ movimientos_granel : ""
  tanques ||--o{ movimientos_granel : origen
  tanques ||--o{ movimientos_granel : destino
  ventas ||--o{ movimientos_granel : "retiro granel"
  ubicaciones ||--o{ traslados : origen
  ubicaciones ||--o{ traslados : destino
  traslados ||--o{ items_traslado : ""
  presentaciones ||--o{ items_traslado : ""
  listas_precios ||--o{ lista_precios_items : ""
  presentaciones ||--o{ lista_precios_items : ""
  listas_precios ||--o{ clientes : asignada
  productos {
    bigint id PK
    text nombre
    text categoria
    bool activo
  }
  presentaciones {
    bigint id PK
    bigint producto_id FK
    text nombre
    int volumen_ml
    numeric precio_minorista
    numeric costo_envasado
  }
  presentacion_componente {
    bigint id PK
    bigint presentacion_pack_id FK
    bigint presentacion_componente_id FK
  }
  tanques {
    bigint id PK
    bigint producto_id FK
    text nombre
  }
  ubicaciones {
    smallint id PK
    text nombre
  }
  stock {
    bigint id PK
    bigint presentacion_id FK
    bigint tanque_id FK
    smallint ubicacion_id FK
    int unidades
  }
  stock_minimos_ubicacion {
    bigint id PK
    bigint presentacion_id FK
    smallint ubicacion_id FK
  }
  movimientos_stock {
    bigint id PK
    bigint stock_id FK
    text tipo
    int unidades
  }
  movimientos_granel {
    bigint id PK
    bigint stock_id FK
    bigint tanque_origen_id FK
    bigint tanque_destino_id FK
    bigint venta_id FK
    numeric litros
  }
  traslados {
    bigint id PK
    smallint ubicacion_origen_id FK
    smallint ubicacion_destino_id FK
    date fecha
  }
  items_traslado {
    bigint id PK
    bigint traslado_id FK
    bigint presentacion_id FK
  }
  listas_precios {
    bigint id PK
    text nombre
  }
  lista_precios_items {
    bigint id PK
    bigint lista_id FK
    bigint presentacion_id FK
  }
  clientes {
    bigint id PK
    text nombre
  }
  ventas {
    bigint id PK
  }
```

---

## Módulo B — Ventas, CRM y cobros

Clientes, ventas e ítems (de qué stock/tanque salió), pagos mensuales y seguimientos comerciales.

```mermaid
erDiagram
  clientes ||--o{ ventas : ""
  clientes ||--o{ pagos : ""
  clientes ||--o{ seguimientos : ""
  ventas ||--o{ items_venta : ""
  presentaciones ||--o{ items_venta : ""
  stock ||--o{ items_venta : ""
  tanques ||--o{ items_venta : ""
  listas_precios ||--o{ clientes : asignada
  cuentas_bancarias ||--o{ ventas : ""
  ubicaciones ||--o{ ventas : ""
  cuentas_bancarias ||--o{ pagos : ""
  clientes {
    bigint id PK
    text nombre
    text tipo
    text whatsapp
    text localidad
    bigint lista_precios_id FK
  }
  ventas {
    bigint id PK
    date fecha
    bigint cliente_id FK
    uuid socio_id
    bigint cuenta_id FK
    smallint ubicacion_id FK
    text estado
    numeric total
  }
  items_venta {
    bigint id PK
    bigint venta_id FK
    bigint presentacion_id FK
    bigint stock_id FK
    bigint tanque_id FK
    int unidades
    numeric precio_unitario
  }
  pagos {
    bigint id PK
    bigint cliente_id FK
    bigint cuenta_id FK
    date fecha
    numeric monto
  }
  seguimientos {
    bigint id PK
    bigint cliente_id FK
    date fecha_recordatorio
    bool hecho
  }
  presentaciones { bigint id PK }
  stock { bigint id PK }
  tanques { bigint id PK }
  listas_precios { bigint id PK }
  cuentas_bancarias { bigint id PK }
  ubicaciones { smallint id PK }
```

---

## Módulo C — Finanzas y contabilidad

Gastos, ingresos, pagos y cuentas bancarias; los movimientos bancarios se **concilian** (1:1) con cada uno. Sueldos y jornales de socios.

```mermaid
erDiagram
  categorias_gasto ||--o{ gastos : ""
  cuentas_bancarias ||--o{ gastos : ""
  jornaleros ||--o{ gastos : ""
  pagos ||--o{ gastos : adelanto
  categorias_ingreso ||--o{ ingresos : ""
  cuentas_bancarias ||--o{ ingresos : ""
  perfiles ||--o{ ingresos : socio
  cuentas_bancarias ||--o{ movimientos_bancarios : ""
  cuentas_bancarias ||--o{ pagos : ""
  movimientos_bancarios ||--o| gastos : concilia
  movimientos_bancarios ||--o| ingresos : concilia
  movimientos_bancarios ||--o| pagos : concilia
  movimientos_bancarios ||--o| ventas : concilia
  perfiles ||--o{ sueldos_socio : ""
  perfiles ||--o{ jornales : empleado
  perfiles ||--o{ jornales : creado_por
  tareas ||--o{ jornales : ""
  cuentas_bancarias ||--o{ perfiles : "cuenta default"
  gastos {
    bigint id PK
    date fecha
    bigint categoria_id FK
    numeric monto
    text moneda
    bigint cuenta_id FK
    bigint jornalero_id FK
    bigint pago_id FK
    bigint conciliado_mov_id FK
  }
  ingresos {
    bigint id PK
    date fecha
    bigint categoria_id FK
    uuid socio_id FK
    numeric monto
    bigint cuenta_id FK
    bigint conciliado_mov_id FK
  }
  pagos {
    bigint id PK
    bigint cliente_id FK
    bigint cuenta_id FK
    numeric monto
  }
  movimientos_bancarios {
    bigint id PK
    bigint cuenta_id FK
    date fecha
    numeric monto
    bigint conciliado_gasto_id FK
    bigint conciliado_ingreso_id FK
    bigint conciliado_pago_id FK
    bigint conciliado_venta_id FK
  }
  cuentas_bancarias {
    bigint id PK
    text nombre
  }
  categorias_gasto {
    bigint id PK
    text nombre
    text ambito
  }
  categorias_ingreso {
    bigint id PK
    text nombre
  }
  jornaleros {
    bigint id PK
    text nombre
    bool activo
  }
  jornales {
    bigint id PK
    uuid empleado_id FK
    uuid creado_por FK
    bigint tarea_id FK
    date fecha
  }
  sueldos_socio {
    bigint id PK
    uuid socio_id FK
    text categoria
    numeric monto
  }
  perfiles {
    uuid id PK
    text nombre
    text rol
    bigint cuenta_default_id FK
  }
  tareas { bigint id PK }
  ventas { bigint id PK }
```

---

## Módulo D — Usuarios y pendientes

Perfiles de socios (1:1 con `auth.users`), tareas compartidas y sus comentarios.

```mermaid
erDiagram
  perfiles ||--o{ tareas : asignado_a
  perfiles ||--o{ tareas : creado_por
  tareas ||--o{ tarea_comentarios : ""
  perfiles ||--o{ tarea_comentarios : autor
  cuentas_bancarias ||--o{ perfiles : "cuenta default"
  perfiles {
    uuid id PK
    text nombre
    text rol
    bool activo
    bigint cuenta_default_id FK
  }
  tareas {
    bigint id PK
    uuid asignado_a FK
    uuid creado_por FK
    text estado
  }
  tarea_comentarios {
    bigint id PK
    bigint tarea_id FK
    uuid autor_id FK
    text texto
  }
  cuentas_bancarias { bigint id PK }
```

---

## Módulo E — Campo (cuaderno)

Aplicaciones de productos (+ detalle), labores de manejo, lluvias, informes técnicos, catálogo fito y categorías de color. Sin FK entre sí salvo aplicación → detalle: lluvias, labores, informes, fito y categorías son tablas autónomas.

```mermaid
erDiagram
  aplicaciones ||--o{ aplicacion_productos : detalle
  aplicaciones {
    bigint id PK
    date fecha
    text zafra
    text sectores
    text estado
    text operario
  }
  aplicacion_productos {
    bigint id PK
    bigint aplicacion_id FK
    text categoria
    text producto_comercial
    numeric dosis_ha
  }
  labores_campo {
    bigint id PK
    date fecha
    text zafra
    text tipo_labor
    numeric jornales
    text operarios
  }
  lluvias {
    bigint id PK
    date fecha
    numeric mm
    text nota
  }
  informes_tecnicos {
    bigint id PK
    date fecha
    text tecnico
  }
  productos_fito {
    bigint id PK
    text nombre
    text categoria
    bool activo
  }
  categorias_campo {
    bigint id PK
    text ambito
    text slug
    text nombre
    text color
  }
```

---

## Módulo F — Cosecha

Cargas por operario (destajo), proceso en almazara con mezcla de variedades por tanque, tarifas y resúmenes por año/variedad/sector.

```mermaid
erDiagram
  cosecha_cargas ||--o{ cosecha_carga_operarios : ""
  cosecha_operarios ||--o{ cosecha_carga_operarios : ""
  cosecha_proceso ||--o{ cosecha_proceso_variedades : ""
  cosecha_operarios {
    bigint id PK
    text nombre
    bool activo
  }
  cosecha_cargas {
    bigint id PK
    date fecha
    int anio
    text sector
    text variedad
    numeric kg_balanza
  }
  cosecha_carga_operarios {
    bigint id PK
    bigint carga_id FK
    bigint operario_id FK
    numeric kg
  }
  cosecha_proceso {
    bigint id PK
    date fecha
    int anio
    text variedad
    numeric litros
  }
  cosecha_proceso_variedades {
    bigint id PK
    bigint proceso_id FK
    text variedad
    numeric litros
    numeric kg_aceite
  }
  cosecha_tarifas {
    bigint id PK
    int anio
    numeric precio_kg
    numeric tolerancia_pct
  }
  cosecha_resumen {
    bigint id PK
    int anio
    text variedad
    numeric kg_cosecha
    numeric rendimiento_pct
  }
  cosecha_sector_resumen {
    bigint id PK
    int anio
    text sector
    numeric kg_cosecha
  }
```

---

## Módulo G — Correo (Gmail)

Cuentas de correo conectadas por OAuth y los correos sincronizados/clasificados de cada una.

```mermaid
erDiagram
  cuentas_correo ||--o{ correos_sincronizados : ""
  cuentas_correo {
    bigint id PK
    text email
    bool activo
  }
  correos_sincronizados {
    bigint id PK
    bigint cuenta_correo_id FK
    text remitente
    text clasificacion
  }
```

---

## Módulo H — App de finanzas personales (`fin_*`) · aislado

Cluster que **no se conecta** con el resto: vive en la misma instancia Supabase pero es otra app (usa `fin_profiles`, no `perfiles`).

```mermaid
erDiagram
  fin_profiles ||--o{ fin_categorias : ""
  fin_profiles ||--o{ fin_cuentas : ""
  fin_profiles ||--o{ fin_tarjetas : ""
  fin_profiles ||--o{ fin_movimientos : ""
  fin_profiles ||--o{ fin_presupuestos : ""
  fin_categorias ||--o{ fin_movimientos : ""
  fin_cuentas ||--o{ fin_movimientos : ""
  fin_tarjetas ||--o{ fin_movimientos : ""
  fin_movimientos ||--o{ fin_movimientos : padre
  fin_categorias ||--o{ fin_presupuestos : ""
  fin_profiles { uuid id PK }
  fin_categorias {
    bigint id PK
    uuid user_id FK
  }
  fin_cuentas {
    bigint id PK
    uuid user_id FK
  }
  fin_tarjetas {
    bigint id PK
    uuid user_id FK
  }
  fin_movimientos {
    bigint id PK
    uuid user_id FK
    bigint categoria_id FK
    bigint cuenta_id FK
    bigint tarjeta_id FK
    bigint movimiento_padre_id FK
  }
  fin_presupuestos {
    bigint id PK
    uuid user_id FK
    bigint categoria_id FK
  }
```
