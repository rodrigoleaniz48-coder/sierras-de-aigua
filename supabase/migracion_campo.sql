-- =========================================================================
-- Modulo Campo — Cuaderno de campo digital
-- Dos cronogramas: aplicaciones de productos y manejo de cultivo (labores).
-- Correr una sola vez. Idempotente (IF NOT EXISTS).
-- =========================================================================

-- -------------------------------------------------------------------------
-- Aplicaciones (cabecera) — 1 evento = fecha + sectores + varios productos
-- -------------------------------------------------------------------------
create table if not exists public.aplicaciones (
  id bigserial primary key,
  fecha date not null,
  zafra text not null,                         -- '2024-2025'
  sectores text,                               -- '1 al 7', '3,4,5' (texto libre como en el cuaderno)
  estado text not null default 'realizada',    -- 'realizada' | 'planificada'
  forma_aplicacion text,                       -- 'Pulverizadora', 'Atomizadora', 'Localizado', etc.
  horas_tractor numeric(6,2),
  horas_hombre numeric(6,2),
  vol_total_l numeric(10,2),                   -- volumen total de caldo aplicado
  operario text,
  observaciones text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create index if not exists idx_aplicaciones_zafra on public.aplicaciones(zafra, fecha);

-- Lineas de producto de cada aplicacion (mezcla de tanque)
create table if not exists public.aplicacion_productos (
  id bigserial primary key,
  aplicacion_id bigint not null references public.aplicaciones(id) on delete cascade,
  categoria text not null,                     -- 'fungicida'|'fertilizante'|'insecticida'|'herbicida'
  producto_comercial text not null,
  concentracion_100l numeric(10,3),            -- concentracion /100 L
  dosis_ha numeric(10,3),
  dosis_total numeric(10,3),
  cantidad_planta numeric(10,3),               -- ml o gr por planta
  vol_ha numeric(10,2),
  vol_total numeric(10,2),
  notas text
);
create index if not exists idx_aplic_prod_aplic on public.aplicacion_productos(aplicacion_id);

-- -------------------------------------------------------------------------
-- Labores de manejo de cultivo (poda, rotativa, cosecha, etc.)
-- -------------------------------------------------------------------------
create table if not exists public.labores_campo (
  id bigserial primary key,
  fecha date not null,
  zafra text not null,
  sectores text,
  tipo_labor text not null,                    -- 'poda'|'rotativa'|'desbrote'|'rameado'|'cosecha'|'otro'
  descripcion text,
  horas_tractor numeric(6,2),
  horas_hombre numeric(6,2),
  jornales numeric(7,2),
  operarios text,
  estado text not null default 'realizada',    -- 'realizada' | 'planificada'
  observaciones text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create index if not exists idx_labores_zafra on public.labores_campo(zafra, fecha);

-- -------------------------------------------------------------------------
-- Catalogo opcional de productos fitosanitarios (autocompletar al cargar)
-- -------------------------------------------------------------------------
create table if not exists public.productos_fito (
  id bigserial primary key,
  nombre text not null unique,
  categoria text not null,
  activo boolean not null default true
);

-- =========================================================================
-- RLS: lectura para todo autenticado; escritura para admin y campo.
-- Reutiliza los helpers existentes rol_actual() / es_admin().
-- =========================================================================
alter table public.aplicaciones        enable row level security;
alter table public.aplicacion_productos enable row level security;
alter table public.labores_campo       enable row level security;
alter table public.productos_fito      enable row level security;

do $$ begin
  create policy aplic_read on public.aplicaciones for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy aplic_write on public.aplicaciones for all
    using (public.rol_actual() in ('admin','campo')) with check (public.rol_actual() in ('admin','campo'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy aplic_prod_read on public.aplicacion_productos for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy aplic_prod_write on public.aplicacion_productos for all
    using (public.rol_actual() in ('admin','campo')) with check (public.rol_actual() in ('admin','campo'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy labores_read on public.labores_campo for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy labores_write on public.labores_campo for all
    using (public.rol_actual() in ('admin','campo')) with check (public.rol_actual() in ('admin','campo'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy fito_read on public.productos_fito for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy fito_write on public.productos_fito for all
    using (public.rol_actual() in ('admin','campo')) with check (public.rol_actual() in ('admin','campo'));
exception when duplicate_object then null; end $$;
