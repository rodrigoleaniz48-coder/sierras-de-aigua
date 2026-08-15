-- =========================================================================
-- Sierras de Aiguá — carga inicial de precios (Otoño 2026)
-- Basado en la Lista de Precios que Rodrigo compartió.
-- Precios SIN IVA (el IVA se agrega solo cuando la venta es "con factura").
-- Correr una vez en el SQL Editor de Supabase. Es idempotente.
-- =========================================================================

-- =========================
-- 1) Actualizar precios de presentaciones existentes (aceites)
-- =========================

-- Blends suave e intenso
update public.presentaciones set precio_minorista = 450  where nombre='250 ml' and producto_id=(select id from public.productos where nombre='Blend suave');
update public.presentaciones set precio_minorista = 650  where nombre='500 ml' and producto_id=(select id from public.productos where nombre='Blend suave');
update public.presentaciones set precio_minorista = 1100 where nombre='1 L'    and producto_id=(select id from public.productos where nombre='Blend suave');
update public.presentaciones set precio_minorista = 2900 where nombre='3 L'    and producto_id=(select id from public.productos where nombre='Blend suave');

update public.presentaciones set precio_minorista = 450  where nombre='250 ml' and producto_id=(select id from public.productos where nombre='Blend intenso');
update public.presentaciones set precio_minorista = 650  where nombre='500 ml' and producto_id=(select id from public.productos where nombre='Blend intenso');
update public.presentaciones set precio_minorista = 1100 where nombre='1 L'    and producto_id=(select id from public.productos where nombre='Blend intenso');
update public.presentaciones set precio_minorista = 2900 where nombre='3 L'    and producto_id=(select id from public.productos where nombre='Blend intenso');

-- Monovarietal Picual (NO tiene bidón 3L en la lista de precios)
update public.presentaciones set precio_minorista = 450  where nombre='250 ml' and producto_id=(select id from public.productos where nombre='Monovarietal Picual');
update public.presentaciones set precio_minorista = 650  where nombre='500 ml' and producto_id=(select id from public.productos where nombre='Monovarietal Picual');
update public.presentaciones set precio_minorista = 1100 where nombre='1 L'    and producto_id=(select id from public.productos where nombre='Monovarietal Picual');
-- Desactivo el bidón 3L de Picual (no está a la venta). Reactivarlo desde Admin si cambia.
update public.presentaciones set activo = false where nombre='3 L' and producto_id=(select id from public.productos where nombre='Monovarietal Picual');

-- Premiado
update public.presentaciones set precio_minorista = 950  where nombre='750 ml' and producto_id=(select id from public.productos where nombre='Premiado');
-- Y le agrego el bidón 3L de Premiado (aparece en la lista a $3000)
insert into public.presentaciones (producto_id, nombre, volumen_ml, unidad, precio_minorista)
select id, '3 L', 3000, 'bidon', 3000 from public.productos where nombre='Premiado'
on conflict (producto_id, nombre) do update set precio_minorista = excluded.precio_minorista;

-- Entero sin filtrar
update public.presentaciones set precio_minorista = 950  where nombre='750 ml' and producto_id=(select id from public.productos where nombre='Entero sin filtrar');
-- El bidón 3L no aparece en la lista: lo dejo inactivo. Reactivar si vuelve a venderse.
update public.presentaciones set activo = false where nombre='3 L' and producto_id=(select id from public.productos where nombre='Entero sin filtrar');

-- =========================
-- 2) Producto nuevo: Pack variedad x3 250ml ($1200)
-- =========================
insert into public.productos (nombre, categoria, descripcion)
values ('Pack degustación x3 250ml', 'aceite', 'Pack de 3 botellas de 250ml — una de cada variedad (suave, intenso, picual)')
on conflict (nombre) do nothing;

insert into public.presentaciones (producto_id, nombre, volumen_ml, unidad, precio_minorista)
select id, 'Pack', null, 'unidad', 1200 from public.productos where nombre='Pack degustación x3 250ml'
on conflict (producto_id, nombre) do update set precio_minorista = excluded.precio_minorista;

-- =========================
-- 3) Miel — dos presentaciones
-- =========================
insert into public.presentaciones (producto_id, nombre, volumen_ml, unidad, precio_minorista)
select id, 'Grande 900 g', null, 'frasco', 600 from public.productos where nombre='Miel orgánica'
on conflict (producto_id, nombre) do update set precio_minorista = excluded.precio_minorista;

insert into public.presentaciones (producto_id, nombre, volumen_ml, unidad, precio_minorista)
select id, 'Chico 300 g',  null, 'frasco', 250 from public.productos where nombre='Miel orgánica'
on conflict (producto_id, nombre) do update set precio_minorista = excluded.precio_minorista;

-- =========================
-- 4) Aceitunas verdes en salmuera — Frasco 380 g
-- =========================
insert into public.presentaciones (producto_id, nombre, volumen_ml, unidad, precio_minorista)
select id, 'Frasco 380 g', null, 'frasco', 400 from public.productos where nombre='Aceitunas de mesa'
on conflict (producto_id, nombre) do update set precio_minorista = excluded.precio_minorista;

-- =========================
-- 5) Jabón oliva y lavanda — 100 g
-- =========================
insert into public.presentaciones (producto_id, nombre, volumen_ml, unidad, precio_minorista)
select id, '100 g', null, 'unidad', 250 from public.productos where nombre='Jabón oliva y lavanda'
on conflict (producto_id, nombre) do update set precio_minorista = excluded.precio_minorista;

-- =========================
-- 6) Verificación rápida (mirá el resultado)
-- =========================
select
  pr.nombre as producto,
  p.nombre  as presentacion,
  p.precio_minorista,
  p.precio_mayorista,
  p.activo
from public.presentaciones p
join public.productos pr on pr.id = p.producto_id
order by pr.categoria, pr.nombre, p.volumen_ml nulls last;
