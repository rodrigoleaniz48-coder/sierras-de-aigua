-- =========================================================================
-- Sierras de Aiguá — esquema Supabase (Postgres)
-- Correr una sola vez en el SQL editor del proyecto Supabase.
-- Idempotente: usa IF NOT EXISTS / DROP ... IF EXISTS donde aplica.
-- =========================================================================

-- Extensiones
create extension if not exists "pgcrypto";

-- =========================================================================
-- 1. Roles y perfiles de socios
-- =========================================================================

-- 4 roles definidos: admin (Rodrigo/Santi), ventas (Gonzalo), marketing (Ayelén)
do $$ begin
  create type rol_socio as enum ('admin', 'ventas', 'marketing');
exception when duplicate_object then null; end $$;

-- Perfil enlazado 1:1 al usuario de auth.users
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol rol_socio not null default 'ventas',
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Helper: obtener el rol del usuario logueado (evita loops de RLS)
create or replace function public.rol_actual() returns rol_socio
language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid()
$$;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'admin' from public.perfiles where id = auth.uid()), false)
$$;

-- =========================================================================
-- 2. Catálogo de productos y presentaciones
-- =========================================================================

-- Líneas de producto (Blend suave, Blend intenso, Monovarietal Picual,
-- Entero sin filtrar, Premiado, Aceitunas de mesa, Miel, Jabón).
create table if not exists public.productos (
  id bigserial primary key,
  nombre text not null unique,
  categoria text not null,          -- 'aceite' | 'aceituna' | 'miel' | 'jabon'
  descripcion text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Presentaciones (envases): 250ml, 500ml, 750ml, 1L, 3L, unidad, etc.
create table if not exists public.presentaciones (
  id bigserial primary key,
  producto_id bigint not null references public.productos(id) on delete cascade,
  nombre text not null,             -- '500 ml', '3 L', 'unidad 250g', etc.
  volumen_ml integer,               -- para aceite; null para miel/jabón/aceitunas
  unidad text not null default 'botella', -- 'botella' | 'bidon' | 'frasco' | 'unidad'
  precio_minorista numeric(12,2) not null default 0,
  precio_mayorista numeric(12,2) not null default 0,
  iva_pct numeric(5,2) not null default 22.00,   -- 22 general UY, 10 mínimo
  stock_minimo integer not null default 0,       -- alerta
  activo boolean not null default true,
  unique (producto_id, nombre)
);

-- =========================================================================
-- 3. Lotes / partidas (trazabilidad)
--    Cada partida representa una tirada específica: campaña + variedad.
--    Para "Premiado" el campo `edicion` distingue la receta de cada año.
-- =========================================================================
create table if not exists public.lotes (
  id bigserial primary key,
  producto_id bigint not null references public.productos(id) on delete restrict,
  campaña integer not null,                 -- año de cosecha, p.ej. 2026
  edicion text,                             -- 'Premiado 2026', null para líneas fijas
  variedad text,                            -- 'arbequina' | 'coratina' | 'picual' | 'frantoio' | mezcla
  fecha_elaboracion date not null default current_date,
  litros_producidos numeric(12,2) not null default 0,
  litros_disponibles numeric(12,2) not null default 0,   -- granel (antes de envasar)
  acidez_pct numeric(5,3),
  notas text,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id)
);
create index if not exists idx_lotes_producto_campana on public.lotes(producto_id, campaña);

-- =========================================================================
-- 4. Stock de producto terminado (por lote + presentación)
--    Cuando envasás X litros de un lote en botellas de 500ml, se crea
--    (o se actualiza) el registro correspondiente y se descuentan litros
--    del lote a granel.
-- =========================================================================
create table if not exists public.stock (
  id bigserial primary key,
  lote_id bigint not null references public.lotes(id) on delete restrict,
  presentacion_id bigint not null references public.presentaciones(id) on delete restrict,
  unidades integer not null default 0,
  actualizado_en timestamptz not null default now(),
  unique (lote_id, presentacion_id)
);
create index if not exists idx_stock_presentacion on public.stock(presentacion_id);

-- Movimientos de stock (log de entradas, salidas, ajustes, mermas)
do $$ begin
  create type tipo_movimiento as enum ('envasado', 'venta', 'ajuste', 'merma', 'devolucion');
exception when duplicate_object then null; end $$;

create table if not exists public.movimientos_stock (
  id bigserial primary key,
  stock_id bigint not null references public.stock(id) on delete cascade,
  tipo tipo_movimiento not null,
  unidades integer not null,               -- positivo=entra, negativo=sale
  venta_id bigint,                          -- referencia opcional
  nota text,
  usuario_id uuid references auth.users(id),
  fecha timestamptz not null default now()
);

-- =========================================================================
-- 5. Clientes (CRM)
-- =========================================================================
do $$ begin
  create type tipo_cliente as enum ('minorista', 'mayorista', 'feria', 'envio', 'otro');
exception when duplicate_object then null; end $$;

create table if not exists public.clientes (
  id bigserial primary key,
  nombre text not null,
  tipo tipo_cliente not null default 'minorista',
  telefono text,
  email text,
  whatsapp text,
  direccion text,
  localidad text,
  rut text,                                 -- si es empresa
  condiciones_pago text,
  socio_asignado uuid references auth.users(id),
  notas text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  origen text                                -- 'importado_csv' | 'manual'
);
create index if not exists idx_clientes_nombre on public.clientes using gin (to_tsvector('spanish', nombre));

-- Seguimientos comerciales (recordatorios / notas fechadas)
create table if not exists public.seguimientos (
  id bigserial primary key,
  cliente_id bigint not null references public.clientes(id) on delete cascade,
  fecha_recordatorio date,
  nota text not null,
  hecho boolean not null default false,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);

-- =========================================================================
-- 6. Ventas
-- =========================================================================
do $$ begin
  create type estado_venta as enum ('pendiente', 'entregado', 'facturado', 'cobrado', 'cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type forma_pago as enum ('efectivo', 'transferencia', 'tarjeta', 'mercado_pago', 'cheque', 'otro');
exception when duplicate_object then null; end $$;

create table if not exists public.ventas (
  id bigserial primary key,
  fecha date not null default current_date,
  cliente_id bigint references public.clientes(id) on delete set null,
  socio_id uuid not null references auth.users(id),        -- quién hizo la venta
  canal text,                                              -- 'directa' | 'feria' | 'envio' | 'whatsapp'
  estado estado_venta not null default 'pendiente',
  forma_pago forma_pago,
  con_factura boolean not null default false,              -- IVA se computa solo si true
  subtotal numeric(12,2) not null default 0,
  descuento numeric(12,2) not null default 0,
  iva numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notas text,
  creado_en timestamptz not null default now()
);
create index if not exists idx_ventas_fecha on public.ventas(fecha);
create index if not exists idx_ventas_socio on public.ventas(socio_id);

create table if not exists public.items_venta (
  id bigserial primary key,
  venta_id bigint not null references public.ventas(id) on delete cascade,
  stock_id bigint not null references public.stock(id) on delete restrict,   -- de qué lote+presentación salió
  presentacion_id bigint not null references public.presentaciones(id),
  unidades integer not null check (unidades > 0),
  precio_unitario numeric(12,2) not null,
  descuento_unitario numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null
);

-- Trigger: al insertar un item_venta, descuenta unidades del stock y registra movimiento.
create or replace function public.fn_descontar_stock_venta() returns trigger
language plpgsql as $$
begin
  update public.stock set unidades = unidades - new.unidades, actualizado_en = now()
    where id = new.stock_id;

  insert into public.movimientos_stock (stock_id, tipo, unidades, venta_id, usuario_id, nota)
  values (new.stock_id, 'venta', -new.unidades, new.venta_id, auth.uid(),
          'venta #' || new.venta_id);
  return new;
end $$;

drop trigger if exists trg_descontar_stock_venta on public.items_venta;
create trigger trg_descontar_stock_venta
  after insert on public.items_venta
  for each row execute function public.fn_descontar_stock_venta();

-- Al cancelar una venta, borrar los gastos auto-generados por ella
-- (adelanto por cobro en efectivo, gasto de promocion comercial).
-- Ligados por la descripcion 'Venta #<id> ...'. Es red de seguridad
-- server-side: el cliente tambien los borra, pero esto lo garantiza.
create or replace function public.fn_borrar_gastos_venta_cancelada()
returns trigger language plpgsql security definer as $$
begin
  if new.estado = 'cancelado' and old.estado is distinct from 'cancelado' then
    delete from public.gastos where descripcion ilike 'Venta #' || new.id || ' %';
  end if;
  return new;
end $$;

drop trigger if exists trg_borrar_gastos_venta_cancelada on public.ventas;
create trigger trg_borrar_gastos_venta_cancelada
  after update of estado on public.ventas
  for each row execute function public.fn_borrar_gastos_venta_cancelada();

-- fecha_entrega: dia en que la venta se marco entregada. El plazo de cobro
-- (contador de dias + recordatorio en Pendientes) se cuenta desde aca, no
-- desde la fecha de carga. Se mantiene sincronizada por trigger.
alter table public.ventas add column if not exists fecha_entrega date;

create or replace function public.fn_sync_fecha_entrega() returns trigger
language plpgsql as $$
begin
  if not new.entregado then
    new.fecha_entrega := null;                 -- se desmarca entrega -> sin fecha
  elsif new.fecha_entrega is null then
    if tg_op = 'INSERT' then
      new.fecha_entrega := new.fecha;          -- nace ya entregada: la entrega es la fecha de la venta
    else
      new.fecha_entrega := current_date;       -- se marca entregada despues: el dia real del cambio
    end if;
  end if;                                       -- ya entregada con fecha: se respeta
  return new;
end $$;

drop trigger if exists trg_sync_fecha_entrega on public.ventas;
create trigger trg_sync_fecha_entrega
  before insert or update on public.ventas
  for each row execute function public.fn_sync_fecha_entrega();

-- envios_cadete_todos: lista de envios por cadete de todos los socios (Rod/Santi/Ayelen),
-- via SECURITY DEFINER. Reglas de fecha:
--  - Envios PENDIENTES (sin entregar) vuelven SIEMPRE, sin importar el rango:
--    arrastran mes a mes hasta entregarse (la "Lista para cadete" los muestra).
--  - Envios ENTREGADOS se filtran por el MES DE ENTREGA real (fecha_entrega), no por
--    la fecha de venta: el "Pago mensual del cadete" los cuenta en el mes que entrego.
drop function if exists public.envios_cadete_todos(date, date);
create or replace function public.envios_cadete_todos(p_desde date default null, p_hasta date default null)
returns table(
  id bigint, fecha date, fecha_entrega date, socio_id uuid, socio_nombre text,
  cliente_id bigint, cliente_nombre text, cliente_telefono text, cliente_whatsapp text,
  cliente_direccion text, cliente_localidad text, envio boolean, entregado boolean,
  cobrado boolean, costo_envio numeric, estado text, promocion_comercial boolean,
  horario_entrega text, ubicacion_id smallint, items_resumen text
)
language plpgsql security definer set search_path to 'public'
as $$
begin
  return query
    select v.id, v.fecha, v.fecha_entrega, v.socio_id, ps.nombre as socio_nombre,
      v.cliente_id, c.nombre as cliente_nombre, c.telefono, c.whatsapp, c.direccion, c.localidad,
      v.envio, v.entregado, v.cobrado, v.costo_envio, v.estado::text, v.promocion_comercial,
      v.horario_entrega, v.ubicacion_id,
      (select string_agg(iv.unidades || 'x ' || coalesce(pr.nombre,'') || ' ' || coalesce(pp.nombre,''), ', ')
         from public.items_venta iv
         left join public.presentaciones pp on pp.id = iv.presentacion_id
         left join public.productos pr on pr.id = pp.producto_id
        where iv.venta_id = v.id) as items_resumen
    from public.ventas v
    left join public.perfiles ps on ps.id = v.socio_id
    left join public.clientes c on c.id = v.cliente_id
    where v.envio = true
      and v.estado <> 'cancelado'
      and (
        not v.entregado
        or (
          (p_desde is null or coalesce(v.fecha_entrega, v.fecha) >= p_desde)
          and (p_hasta is null or coalesce(v.fecha_entrega, v.fecha) <= p_hasta)
        )
      )
      and exists (
        select 1 from public.perfiles p
        where p.id = v.socio_id and lower(p.nombre) in ('rodrigo', 'santiago', 'ayelen')
      )
    order by v.fecha desc, v.id desc;
end $$;

-- =========================================================================
-- 7. Gastos
-- =========================================================================
create table if not exists public.categorias_gasto (
  id bigserial primary key,
  nombre text not null unique,
  ambito text not null default 'personal'   -- 'personal' | 'empresa'
);

-- Gastos personales (todos los socios los cargan y los ven)
create table if not exists public.gastos_personales (
  id bigserial primary key,
  socio_id uuid not null references auth.users(id),
  fecha date not null default current_date,
  categoria_id bigint references public.categorias_gasto(id),
  descripcion text not null,
  monto numeric(12,2) not null,
  moneda text not null default 'UYU',
  comprobante_url text,                     -- Supabase Storage
  creado_en timestamptz not null default now()
);

-- Contabilidad general (solo admins)
do $$ begin
  create type tipo_movimiento_contable as enum ('ingreso', 'egreso');
exception when duplicate_object then null; end $$;

create table if not exists public.movimientos_contables (
  id bigserial primary key,
  fecha date not null default current_date,
  tipo tipo_movimiento_contable not null,
  categoria_id bigint references public.categorias_gasto(id),
  descripcion text not null,
  monto numeric(12,2) not null,
  iva numeric(12,2) not null default 0,
  con_factura boolean not null default true,
  venta_id bigint references public.ventas(id),          -- ingreso derivado de venta
  comprobante_url text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);

-- =========================================================================
-- 8. Row-Level Security
-- =========================================================================
alter table public.perfiles              enable row level security;
alter table public.productos             enable row level security;
alter table public.presentaciones        enable row level security;
alter table public.lotes                 enable row level security;
alter table public.stock                 enable row level security;
alter table public.movimientos_stock     enable row level security;
alter table public.clientes              enable row level security;
alter table public.seguimientos          enable row level security;
alter table public.ventas                enable row level security;
alter table public.items_venta           enable row level security;
alter table public.categorias_gasto      enable row level security;
alter table public.gastos_personales     enable row level security;
alter table public.movimientos_contables enable row level security;

-- Perfiles: cada uno ve su fila; admin ve todo.
drop policy if exists perfiles_select on public.perfiles;
create policy perfiles_select on public.perfiles for select
  using (id = auth.uid() or public.es_admin());

drop policy if exists perfiles_admin_all on public.perfiles;
create policy perfiles_admin_all on public.perfiles for all
  using (public.es_admin()) with check (public.es_admin());

-- Catálogo (productos, presentaciones, categorías): lectura para todos los socios, escritura solo admin.
do $$
declare t text;
begin
  foreach t in array array['productos','presentaciones','categorias_gasto'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (auth.uid() is not null)', t, t);
    execute format('drop policy if exists %I_admin_write on public.%I', t, t);
    execute format('create policy %I_admin_write on public.%I for all using (public.es_admin()) with check (public.es_admin())', t, t);
  end loop;
end $$;

-- Lotes / stock / movimientos: lectura para todos los socios, escritura para admin+ventas (marketing solo lectura).
do $$
declare t text;
begin
  foreach t in array array['lotes','stock','movimientos_stock'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (auth.uid() is not null)', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format($p$create policy %I_write on public.%I for all
      using (public.rol_actual() in ('admin','ventas'))
      with check (public.rol_actual() in ('admin','ventas'))$p$, t, t);
  end loop;
end $$;

-- Clientes y seguimientos: TODOS los socios (incluida Ayelén / marketing) pueden LEER.
-- Escritura: admin + ventas. Marketing puede crear seguimientos propios.
drop policy if exists clientes_read on public.clientes;
create policy clientes_read on public.clientes for select using (auth.uid() is not null);

drop policy if exists clientes_write on public.clientes;
create policy clientes_write on public.clientes for all
  using (public.rol_actual() in ('admin','ventas'))
  with check (public.rol_actual() in ('admin','ventas'));

drop policy if exists seg_read on public.seguimientos;
create policy seg_read on public.seguimientos for select using (auth.uid() is not null);

drop policy if exists seg_insert on public.seguimientos;
create policy seg_insert on public.seguimientos for insert
  with check (auth.uid() is not null and creado_por = auth.uid());

drop policy if exists seg_update on public.seguimientos;
create policy seg_update on public.seguimientos for update
  using (creado_por = auth.uid() or public.es_admin());

-- Ventas / items_venta: socios de venta ven todo; marketing NO.
drop policy if exists ventas_read on public.ventas;
create policy ventas_read on public.ventas for select
  using (public.rol_actual() in ('admin','ventas'));

drop policy if exists ventas_insert on public.ventas;
create policy ventas_insert on public.ventas for insert
  with check (public.rol_actual() in ('admin','ventas') and socio_id = auth.uid());

drop policy if exists ventas_update on public.ventas;
create policy ventas_update on public.ventas for update
  using (public.es_admin() or socio_id = auth.uid());

drop policy if exists ventas_delete on public.ventas;
create policy ventas_delete on public.ventas for delete
  using (public.es_admin());

drop policy if exists items_read on public.items_venta;
create policy items_read on public.items_venta for select
  using (public.rol_actual() in ('admin','ventas'));

drop policy if exists items_write on public.items_venta;
create policy items_write on public.items_venta for all
  using (public.rol_actual() in ('admin','ventas'))
  with check (public.rol_actual() in ('admin','ventas'));

-- Gastos personales: cada socio ve TODOS (transparencia), pero solo edita los propios.
drop policy if exists gp_read on public.gastos_personales;
create policy gp_read on public.gastos_personales for select using (auth.uid() is not null);

drop policy if exists gp_insert on public.gastos_personales;
create policy gp_insert on public.gastos_personales for insert
  with check (auth.uid() is not null and socio_id = auth.uid());

drop policy if exists gp_update on public.gastos_personales;
create policy gp_update on public.gastos_personales for update
  using (socio_id = auth.uid() or public.es_admin());

drop policy if exists gp_delete on public.gastos_personales;
create policy gp_delete on public.gastos_personales for delete
  using (socio_id = auth.uid() or public.es_admin());

-- Contabilidad general: SOLO admin.
drop policy if exists mc_admin on public.movimientos_contables;
create policy mc_admin on public.movimientos_contables for all
  using (public.es_admin()) with check (public.es_admin());

-- =========================================================================
-- 9. Seed inicial
-- =========================================================================
insert into public.productos (nombre, categoria, descripcion) values
  ('Blend suave',           'aceite',   'AOVE blend suave — primera extracción en frío'),
  ('Blend intenso',         'aceite',   'AOVE blend intenso — primera extracción en frío'),
  ('Monovarietal Picual',   'aceite',   'AOVE monovarietal Picual'),
  ('Entero sin filtrar',    'aceite',   'AOVE sin filtrar — edición cosecha'),
  ('Premiado',              'aceite',   'Blend para concursos — receta distinta por año'),
  ('Aceitunas de mesa',     'aceituna', 'Aceitunas de mesa de cultivo propio'),
  ('Miel orgánica',         'miel',     'Miel orgánica de las sierras de Aiguá'),
  ('Jabón oliva y lavanda', 'jabon',    'Jabón artesanal de aceite de oliva y lavanda')
on conflict (nombre) do nothing;

-- Presentaciones estándar (precios en 0 — completar desde la app)
with p as (select id, nombre from public.productos)
insert into public.presentaciones (producto_id, nombre, volumen_ml, unidad)
select p.id, x.nombre, x.vol, x.unidad from p, (values
  ('Blend suave',        '250 ml', 250, 'botella'),
  ('Blend suave',        '500 ml', 500, 'botella'),
  ('Blend suave',        '1 L',   1000, 'botella'),
  ('Blend suave',        '3 L',   3000, 'bidon'),
  ('Blend intenso',      '250 ml', 250, 'botella'),
  ('Blend intenso',      '500 ml', 500, 'botella'),
  ('Blend intenso',      '1 L',   1000, 'botella'),
  ('Blend intenso',      '3 L',   3000, 'bidon'),
  ('Monovarietal Picual','250 ml', 250, 'botella'),
  ('Monovarietal Picual','500 ml', 500, 'botella'),
  ('Monovarietal Picual','1 L',   1000, 'botella'),
  ('Monovarietal Picual','3 L',   3000, 'bidon'),
  ('Entero sin filtrar', '750 ml', 750, 'botella'),
  ('Entero sin filtrar', '3 L',   3000, 'bidon'),
  ('Premiado',           '750 ml', 750, 'botella')
) as x(prod, nombre, vol, unidad)
where p.nombre = x.prod
on conflict (producto_id, nombre) do nothing;

insert into public.categorias_gasto (nombre, ambito) values
  ('Combustible',       'personal'),
  ('Viáticos',          'personal'),
  ('Insumos oficina',   'personal'),
  ('Otros personal',    'personal'),
  ('Compra aceituna',   'empresa'),
  ('Envases',           'empresa'),
  ('Etiquetas',         'empresa'),
  ('Mantenimiento',     'empresa'),
  ('Impuestos',         'empresa'),
  ('Servicios',         'empresa'),
  ('Otros empresa',     'empresa')
on conflict (nombre) do nothing;

-- =========================================================================
-- 10. Trigger para crear perfil automáticamente al dar de alta un usuario
--     (podés después editar el rol desde la app o el SQL editor).
-- =========================================================================
create or replace function public.fn_nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre, rol)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', new.email), 'ventas')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_nuevo_usuario on auth.users;
create trigger trg_nuevo_usuario
  after insert on auth.users
  for each row execute function public.fn_nuevo_usuario();

-- =========================================================================
-- 11. Sueldos por socio: reparto del sueldo nominal por categoria/area.
--     La suma de las lineas de un socio = su sueldo nominal. Se usa en
--     "Liquidar sueldo del mes" (Finanzas) para registrar el monto exacto,
--     sin netear adelantos ni reembolsos.
-- =========================================================================
create table if not exists public.sueldos_socio (
  id bigserial primary key,
  socio_id uuid not null references public.perfiles(id) on delete cascade,
  categoria text not null,              -- slug de categorias_gasto
  monto numeric not null default 0,
  actualizado_en timestamptz not null default now()
);
create index if not exists sueldos_socio_socio_idx on public.sueldos_socio(socio_id);
alter table public.sueldos_socio enable row level security;
drop policy if exists sueldos_sel on public.sueldos_socio;
create policy sueldos_sel on public.sueldos_socio for select using (ve_todos_gastos() or socio_id = auth.uid());
drop policy if exists sueldos_ins on public.sueldos_socio;
create policy sueldos_ins on public.sueldos_socio for insert with check (ve_todos_gastos());
drop policy if exists sueldos_upd on public.sueldos_socio;
create policy sueldos_upd on public.sueldos_socio for update using (ve_todos_gastos());
drop policy if exists sueldos_del on public.sueldos_socio;
create policy sueldos_del on public.sueldos_socio for delete using (ve_todos_gastos());

-- =========================================================================
-- 12. Jornaleros: trabajadores que cobran jornal (monto variable por mes),
--     no son usuarios de la app (solo un nombre). El jornal y sus adelantos
--     se registran como gastos con gastos.jornalero_id.
-- =========================================================================
create table if not exists public.jornaleros (
  id bigserial primary key,
  nombre text not null,
  activo boolean not null default true,
  actualizado_en timestamptz not null default now()
);
alter table public.jornaleros enable row level security;
drop policy if exists jornaleros_sel on public.jornaleros;
create policy jornaleros_sel on public.jornaleros for select using (ve_todos_gastos());
drop policy if exists jornaleros_ins on public.jornaleros;
create policy jornaleros_ins on public.jornaleros for insert with check (ve_todos_gastos());
drop policy if exists jornaleros_upd on public.jornaleros;
create policy jornaleros_upd on public.jornaleros for update using (ve_todos_gastos());

alter table public.gastos add column if not exists jornalero_id bigint references public.jornaleros(id);
create index if not exists gastos_jornalero_idx on public.gastos(jornalero_id);

-- Vincula el adelanto creado al cobrar en EFECTIVO con el pago que lo origino:
-- editar el pago ajusta el adelanto; borrar el pago lo borra (ON DELETE CASCADE).
alter table public.gastos add column if not exists pago_id bigint references public.pagos(id) on delete cascade;
create index if not exists idx_gastos_pago_id on public.gastos(pago_id) where pago_id is not null;

-- =========================================================================
-- Modulo Campo — cuaderno de campo (ver supabase/migracion_campo.sql)
-- Dos cronogramas: aplicaciones de productos y manejo de cultivo (labores).
-- =========================================================================
create table if not exists public.aplicaciones (
  id bigserial primary key,
  fecha date not null,
  zafra text not null,
  sectores text,
  estado text not null default 'realizada',
  forma_aplicacion text,
  horas_tractor numeric(6,2),
  horas_hombre numeric(6,2),
  vol_total_l numeric(10,2),
  operario text,
  observaciones text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create index if not exists idx_aplicaciones_zafra on public.aplicaciones(zafra, fecha);

create table if not exists public.aplicacion_productos (
  id bigserial primary key,
  aplicacion_id bigint not null references public.aplicaciones(id) on delete cascade,
  categoria text not null,
  producto_comercial text not null,
  concentracion_100l numeric(10,3),
  dosis_ha numeric(10,3),
  dosis_total numeric(10,3),
  cantidad_planta numeric(10,3),
  vol_ha numeric(10,2),
  vol_total numeric(10,2),
  notas text
);
create index if not exists idx_aplic_prod_aplic on public.aplicacion_productos(aplicacion_id);

create table if not exists public.labores_campo (
  id bigserial primary key,
  fecha date not null,
  zafra text not null,
  sectores text,
  tipo_labor text not null,
  descripcion text,
  horas_tractor numeric(6,2),
  horas_hombre numeric(6,2),
  jornales numeric(7,2),
  operarios text,
  estado text not null default 'realizada',
  observaciones text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create index if not exists idx_labores_zafra on public.labores_campo(zafra, fecha);

create table if not exists public.productos_fito (
  id bigserial primary key,
  nombre text not null unique,
  categoria text not null,
  activo boolean not null default true
);

alter table public.aplicaciones         enable row level security;
alter table public.aplicacion_productos  enable row level security;
alter table public.labores_campo         enable row level security;
alter table public.productos_fito        enable row level security;
-- Policies: lectura para todo autenticado, escritura admin+campo (ver migracion_campo.sql).

-- Categorias editables (color + nombre) por ambito. Ver migracion_campo_categorias.sql
create table if not exists public.categorias_campo (
  id bigserial primary key,
  ambito text not null,                 -- 'aplicacion' | 'labor'
  slug text not null,
  nombre text not null,
  color text not null default '#5F5E5A',
  orden int not null default 0,
  activo boolean not null default true,
  unique (ambito, slug)
);
alter table public.categorias_campo enable row level security;
-- Policies: lectura para todo autenticado, escritura admin+campo (ver migracion_campo_categorias.sql).

-- === Cosecha (ver migracion_cosecha.sql) ================================
-- Flujo: carga de cosecha (por operario) -> procesamiento en almazara.
-- Pago a destajo con castigo por hojas sobre tolerancia (2% default). Por anio.
create table if not exists public.cosecha_operarios (
  id bigserial primary key,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0
);
create table if not exists public.cosecha_tarifas (
  id bigserial primary key,
  anio int not null unique,
  precio_kg numeric(12,4),
  tolerancia_pct numeric(5,2) not null default 2
);
create table if not exists public.cosecha_cargas (
  id bigserial primary key,
  fecha date not null,
  anio int not null,
  sector text,
  variedad text not null,
  kg_balanza numeric(12,2) not null default 0,
  kg_hojas numeric(12,2),
  notas text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create table if not exists public.cosecha_carga_operarios (
  id bigserial primary key,
  carga_id bigint not null references public.cosecha_cargas(id) on delete cascade,
  operario_id bigint references public.cosecha_operarios(id),
  kg numeric(12,2) not null default 0
);
create table if not exists public.cosecha_proceso (
  id bigserial primary key,
  fecha date not null,
  anio int not null,
  variedad text not null,
  kg_balanza numeric(12,2),
  kg_procesado numeric(12,2),
  kg_aceite numeric(12,2),
  litros numeric(12,2),
  destino text,
  notas text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create table if not exists public.cosecha_resumen (
  id bigserial primary key,
  anio int not null,
  variedad text not null,
  kg_cosecha numeric(12,2),
  litros numeric(12,2),
  rendimiento_pct numeric(6,3),
  unique (anio, variedad)
);
-- RLS en las 6: lectura autenticado, escritura admin+campo (ver migracion_cosecha.sql).
