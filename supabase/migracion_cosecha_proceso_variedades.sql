-- =========================================================================
-- Pasaje a tanque con varias variedades (mezcla).
-- La cosecha sigue siendo por variedad (cosecha_cargas). Pero el aceite que va
-- a un tanque puede ser mezcla: se guarda el detalle por variedad (litros + kg
-- aceite) para mantener exacto el rendimiento por variedad.
-- cosecha_proceso queda como cabecera (fecha, tanque, notas); las columnas
-- variedad/litros/kg_aceite quedan como legado (los datos viejos se migran a
-- las lineas). Lectura: autenticado. Escritura: admin + campo.
-- =========================================================================
create table if not exists public.cosecha_proceso_variedades (
  id bigserial primary key,
  proceso_id bigint not null references public.cosecha_proceso(id) on delete cascade,
  variedad text not null,
  litros numeric(12,2),
  kg_aceite numeric(12,2)
);
create index if not exists idx_cos_procvar_proceso on public.cosecha_proceso_variedades(proceso_id);

alter table public.cosecha_proceso_variedades enable row level security;

do $$ begin
  create policy cos_procvar_read on public.cosecha_proceso_variedades
    for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy cos_procvar_write on public.cosecha_proceso_variedades
    for all using (public.rol_actual() in ('admin','campo'))
    with check (public.rol_actual() in ('admin','campo'));
exception when duplicate_object then null; end $$;

-- Migracion idempotente: cada pasaje existente -> una linea con su variedad.
insert into public.cosecha_proceso_variedades (proceso_id, variedad, litros, kg_aceite)
select p.id, p.variedad, p.litros, p.kg_aceite
from public.cosecha_proceso p
where p.variedad is not null
  and not exists (select 1 from public.cosecha_proceso_variedades v where v.proceso_id = p.id);
