-- Vincula el adelanto (gasto con es_adelanto) que se crea al cobrar en EFECTIVO
-- con el pago que lo origino. Asi:
--   - al editar el pago, el adelanto se ajusta (lo hace el frontend);
--   - al borrar el pago, el adelanto se borra solo (ON DELETE CASCADE).
-- Aditiva: la columna es nullable; los gastos que no son adelanto-por-efectivo quedan en null.
alter table public.gastos
  add column if not exists pago_id bigint references public.pagos(id) on delete cascade;

create index if not exists idx_gastos_pago_id on public.gastos(pago_id) where pago_id is not null;
