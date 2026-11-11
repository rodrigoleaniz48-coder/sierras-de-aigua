-- =========================================================================
-- Modulo Campo — Cosecha (v1)
-- Flujo: carga de cosecha (por operario) -> procesamiento en almazara.
-- Pago a destajo con castigo por hojas sobre la tolerancia (2% default).
-- Se agrupa por ano calendario (anio). Correr una sola vez. Idempotente.
-- Reutiliza helper rol_actual(). Nunca usar enye en identificadores.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Operarios (cosechadores) — lista editable, cambia cada ano
-- -------------------------------------------------------------------------
create table if not exists public.cosecha_operarios (
  id bigserial primary key,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0
);

-- -------------------------------------------------------------------------
-- Tarifa por ano — precio por kg del destajo y tolerancia de hojas (%)
-- -------------------------------------------------------------------------
create table if not exists public.cosecha_tarifas (
  id bigserial primary key,
  anio int not null unique,
  precio_kg numeric(12,4),                 -- lo carga el usuario cada ano
  tolerancia_pct numeric(5,2) not null default 2
);

-- -------------------------------------------------------------------------
-- Cargas de cosecha (cabecera) — kg_balanza = sin limpiar hojas
-- kg_hojas: cuanto de ese peso eran hojas (null/0 = dentro de tolerancia)
-- -------------------------------------------------------------------------
create table if not exists public.cosecha_cargas (
  id bigserial primary key,
  fecha date not null,
  anio int not null,
  sector text,                             -- '1'..'7' (texto libre, como el cuaderno)
  variedad text not null,                  -- 'Arbequina' | 'Coratina' | 'Picual'
  kg_balanza numeric(12,2) not null default 0,
  kg_hojas numeric(12,2),                  -- peso de hojas medido (opcional)
  notas text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create index if not exists idx_cosecha_cargas_anio on public.cosecha_cargas(anio, fecha);

-- Cuanto puso cada operario en una carga (hijo). Suma = kg_balanza.
create table if not exists public.cosecha_carga_operarios (
  id bigserial primary key,
  carga_id bigint not null references public.cosecha_cargas(id) on delete cascade,
  operario_id bigint references public.cosecha_operarios(id),
  kg numeric(12,2) not null default 0
);
create index if not exists idx_cosecha_carga_op on public.cosecha_carga_operarios(carga_id);

-- -------------------------------------------------------------------------
-- Procesamiento en almazara — rendimiento por variedad/dia
-- -------------------------------------------------------------------------
create table if not exists public.cosecha_proceso (
  id bigserial primary key,
  fecha date not null,
  anio int not null,
  variedad text not null,
  kg_balanza numeric(12,2),                -- entrada (sin limpiar)
  kg_procesado numeric(12,2),              -- despues de descontar hojas
  kg_aceite numeric(12,2),
  litros numeric(12,2),
  destino text,                            -- 'AOVE', etc.
  notas text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create index if not exists idx_cosecha_proceso_anio on public.cosecha_proceso(anio, fecha);

-- -------------------------------------------------------------------------
-- Resumen anual historico (solo anos cerrados) — para el comparativo.
-- Los anos vivos se calculan en vivo desde cargas/proceso.
-- -------------------------------------------------------------------------
create table if not exists public.cosecha_resumen (
  id bigserial primary key,
  anio int not null,
  variedad text not null,
  kg_cosecha numeric(12,2),
  litros numeric(12,2),
  rendimiento_pct numeric(6,3),
  unique (anio, variedad)
);

-- =========================================================================
-- RLS: lectura para todo autenticado; escritura para admin y campo.
-- =========================================================================
alter table public.cosecha_operarios       enable row level security;
alter table public.cosecha_tarifas         enable row level security;
alter table public.cosecha_cargas          enable row level security;
alter table public.cosecha_carga_operarios enable row level security;
alter table public.cosecha_proceso         enable row level security;
alter table public.cosecha_resumen         enable row level security;

do $$ begin
  create policy cos_oper_read on public.cosecha_operarios for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy cos_oper_write on public.cosecha_operarios for all
    using (public.rol_actual() in ('admin','campo')) with check (public.rol_actual() in ('admin','campo'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy cos_tar_read on public.cosecha_tarifas for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy cos_tar_write on public.cosecha_tarifas for all
    using (public.rol_actual() in ('admin','campo')) with check (public.rol_actual() in ('admin','campo'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy cos_cargas_read on public.cosecha_cargas for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy cos_cargas_write on public.cosecha_cargas for all
    using (public.rol_actual() in ('admin','campo')) with check (public.rol_actual() in ('admin','campo'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy cos_cargaop_read on public.cosecha_carga_operarios for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy cos_cargaop_write on public.cosecha_carga_operarios for all
    using (public.rol_actual() in ('admin','campo')) with check (public.rol_actual() in ('admin','campo'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy cos_proc_read on public.cosecha_proceso for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy cos_proc_write on public.cosecha_proceso for all
    using (public.rol_actual() in ('admin','campo')) with check (public.rol_actual() in ('admin','campo'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy cos_res_read on public.cosecha_resumen for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy cos_res_write on public.cosecha_resumen for all
    using (public.rol_actual() in ('admin','campo')) with check (public.rol_actual() in ('admin','campo'));
exception when duplicate_object then null; end $$;

-- =========================================================================
-- Seed: operarios y tarifa 2026 (idempotente)
-- =========================================================================
insert into public.cosecha_operarios (nombre, orden)
select v.nombre, v.orden from (values
  ('EMI',10),('DANI',20),('FER',30),('SEBA',40),('SIERRAS',50)
) as v(nombre, orden)
where not exists (
  select 1 from public.cosecha_operarios o where lower(o.nombre) = lower(v.nombre)
);

insert into public.cosecha_tarifas (anio, tolerancia_pct)
values (2026, 2)
on conflict (anio) do nothing;
