-- =========================================================================
-- Resumen de cosecha por sector y ano (para anos sin detalle diario cargado).
-- Paralelo a cosecha_resumen (que es por variedad). Lectura abierta a usuarios
-- logueados; escritura admin/campo.
-- =========================================================================
create table if not exists public.cosecha_sector_resumen (
  id bigserial primary key,
  anio int not null,
  sector text not null,
  kg_cosecha numeric(12,2),
  unique (anio, sector)
);

alter table public.cosecha_sector_resumen enable row level security;

do $$ begin
  create policy cos_secres_read on public.cosecha_sector_resumen
    for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy cos_secres_write on public.cosecha_sector_resumen
    for all using (rol_actual() = any (array['admin'::rol_socio, 'campo'::rol_socio]));
exception when duplicate_object then null; end $$;

-- Sumas por ano cuadran con el total del ano (cosecha_resumen 'TOTAL').
-- 2024/2025: del 'Cuaderno de Campo 2017 al 2025 cosechas.xls' (bloques SECTOR n).
-- 2026: de 'Numeros cosecha 2026.xlsx' (bloque Sector/Kg).
insert into public.cosecha_sector_resumen (anio, sector, kg_cosecha) values
  (2024,'1',12955),(2024,'2',12813),(2024,'3',5309),(2024,'4',10984),(2024,'5',7708),(2024,'6',1726),(2024,'7',1730),
  (2025,'1',7465),(2025,'2',8047),(2025,'3',2447),(2025,'4',3054),(2025,'5',9386),(2025,'6',2020),(2025,'7',4317),
  (2026,'1',11746),(2026,'2',12433),(2026,'3',3393),(2026,'4',8519),(2026,'5',9023),(2026,'6',2289),(2026,'7',3732)
on conflict (anio, sector) do nothing;
