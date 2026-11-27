-- Amortizacion de inversiones (CAPEX): repartir el costo de un activo en varios anios.
-- Campos opcionales en gastos; solo aplican a categorias de inversion.
--   amortiza_anios        : vida util en anios. null = no se amortiza (se cuenta entero el mes del pago).
--   amortiza_residual_pct : % del costo que el bien CONSERVA al final (0 = se amortiza por completo). Opcional.
-- Base amortizable = monto * (1 - amortiza_residual_pct/100); se reparte lineal en amortiza_anios.
-- Hereda el RLS de gastos (no requiere politicas nuevas).

alter table public.gastos
  add column if not exists amortiza_anios integer,
  add column if not exists amortiza_residual_pct numeric not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gastos_amortiza_anios_chk') then
    alter table public.gastos add constraint gastos_amortiza_anios_chk
      check (amortiza_anios is null or amortiza_anios > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gastos_amortiza_residual_chk') then
    alter table public.gastos add constraint gastos_amortiza_residual_chk
      check (amortiza_residual_pct >= 0 and amortiza_residual_pct < 100);
  end if;
end $$;
