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
