-- =========================================================================
-- Migración: pasar de "lotes" a "tanques" físicos
-- Sierras de Aiguá — cambio de modelo tras charla con Rodrigo
-- Ejecutar una sola vez.
-- Precondición: no hay datos reales cargados (verificado con count(*) = 0).
-- =========================================================================

-- 0) Rename: "Monovarietal Picual" -> "Picual"
update public.productos set nombre = 'Picual' where nombre = 'Monovarietal Picual';

-- 1) Sacar la fk vieja de stock y renombrar la columna
alter table public.stock drop constraint if exists stock_lote_id_fkey;
alter table public.stock drop column if exists lote_id;
alter table public.stock add column if not exists tanque_id smallint;

-- 2) Eliminar lotes (ya no se usa)
drop table if exists public.lotes cascade;

-- 3) Crear tabla tanques
create table if not exists public.tanques (
  id                smallint primary key,
  nombre            text not null unique,
  capacidad_litros  numeric(10,2) not null check (capacidad_litros > 0),
  producto_id       int null references public.productos(id) on delete set null,
  variedad_libre    text null,
  campaña           smallint null,
  litros_actuales   numeric(10,2) not null default 0 check (litros_actuales >= 0),
  notas             text null,
  activo            boolean not null default true,
  actualizado_en    timestamptz not null default now()
);

comment on column public.tanques.producto_id is 'Si el contenido corresponde a un producto vendible (Blend suave/intenso/Picual/Premiado/Sin filtrar). Puede ser null si es materia prima o blend custom.';
comment on column public.tanques.variedad_libre is 'Nombre libre para materia prima o blends que no son productos vendibles (ej: Coratina pura, Blend cliente Brasil).';

-- 4) Fk de stock a tanques
alter table public.stock
  add constraint stock_tanque_fkey foreign key (tanque_id) references public.tanques(id);

-- 5) Índice para queries por tanque
create index if not exists idx_stock_tanque on public.stock(tanque_id);

-- 6) Movimientos de granel (tanques)
create table if not exists public.movimientos_granel (
  id                  bigserial primary key,
  fecha               timestamptz not null default now(),
  tipo                text not null check (tipo in ('cargar','trasegar','envasar','merma','ajuste','muestra')),
  tanque_origen_id    smallint null references public.tanques(id) on delete restrict,
  tanque_destino_id   smallint null references public.tanques(id) on delete restrict,
  litros              numeric(10,2) not null,
  stock_id            bigint null references public.stock(id) on delete set null,
  usuario_id          uuid null references auth.users(id),
  nota                text null
);

create index if not exists idx_mov_granel_fecha on public.movimientos_granel(fecha desc);
create index if not exists idx_mov_granel_tanque_o on public.movimientos_granel(tanque_origen_id);
create index if not exists idx_mov_granel_tanque_d on public.movimientos_granel(tanque_destino_id);

-- 7) RLS
alter table public.tanques enable row level security;
alter table public.movimientos_granel enable row level security;

drop policy if exists tanques_sel on public.tanques;
drop policy if exists tanques_ins on public.tanques;
drop policy if exists tanques_upd on public.tanques;
create policy tanques_sel on public.tanques for select to authenticated using (true);
create policy tanques_ins on public.tanques for insert to authenticated with check (public.es_admin() or public.tiene_rol(array['ventas']));
create policy tanques_upd on public.tanques for update to authenticated using (public.es_admin() or public.tiene_rol(array['ventas']));

drop policy if exists mov_granel_sel on public.movimientos_granel;
drop policy if exists mov_granel_ins on public.movimientos_granel;
create policy mov_granel_sel on public.movimientos_granel for select to authenticated using (true);
create policy mov_granel_ins on public.movimientos_granel for insert to authenticated with check (public.es_admin() or public.tiene_rol(array['ventas']));

-- 8) Seed de los 6 tanques (según info que pasó Rodrigo)
insert into public.tanques (id, nombre, capacidad_litros, producto_id, variedad_libre, campaña, litros_actuales, notas) values
  (1, 'T1', 3000, (select id from public.productos where nombre='Blend suave'),   null, 2026, 3000, null),
  (2, 'T2', 2000, (select id from public.productos where nombre='Blend intenso'), null, 2026, 2000, null),
  (3, 'T3', 1000, null, 'Blend a granel — clienta Brasil', 2026, 1000, 'Reservado para exportación'),
  (4, 'T4', 1000, null, 'Coratina pura',                    2026, 1000, 'Materia prima para blends'),
  (5, 'T5', 3000, (select id from public.productos where nombre='Blend suave'),   null, 2025, 3000, 'Remanente de campaña anterior'),
  (6, 'T6', 1000, (select id from public.productos where nombre='Premiado'),      null, 2026, 1000, 'Mario Solinas 2026')
on conflict (id) do nothing;

-- 9) Verificación
select
  t.id, t.nombre, t.capacidad_litros, t.litros_actuales, t.campaña,
  coalesce(p.nombre, t.variedad_libre) as contenido,
  t.notas
from public.tanques t
left join public.productos p on p.id = t.producto_id
order by t.id;
