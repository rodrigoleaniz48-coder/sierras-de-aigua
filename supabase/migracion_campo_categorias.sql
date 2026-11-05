-- =========================================================================
-- Modulo Campo — categorias editables (color + nombre)
-- ambito: 'aplicacion' (fungicida, fertilizante, ...) o 'labor' (poda, cosecha, ...)
-- slug estable = el valor guardado en aplicacion_productos.categoria / labores_campo.tipo_labor
-- =========================================================================
create table if not exists public.categorias_campo (
  id bigserial primary key,
  ambito text not null,                 -- 'aplicacion' | 'labor'
  slug text not null,                   -- estable, no cambia al renombrar
  nombre text not null,                 -- editable (lo que se muestra)
  color text not null default '#5F5E5A',
  orden int not null default 0,
  activo boolean not null default true,
  unique (ambito, slug)
);

alter table public.categorias_campo enable row level security;
do $$ begin
  create policy cat_campo_read on public.categorias_campo for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy cat_campo_write on public.categorias_campo for all
    using (public.rol_actual() in ('admin','campo')) with check (public.rol_actual() in ('admin','campo'));
exception when duplicate_object then null; end $$;

-- Seed con las categorias actuales (idempotente)
insert into public.categorias_campo (ambito, slug, nombre, color, orden) values
  ('aplicacion','fungicida','Fungicida','#1D9E75',10),
  ('aplicacion','fertilizante','Fertilizante','#378ADD',20),
  ('aplicacion','insecticida','Insecticida','#EF9F27',30),
  ('aplicacion','herbicida','Herbicida','#D85A30',40),
  ('labor','poda','Poda','#639922',10),
  ('labor','rotativa','Rotativa','#BA7517',20),
  ('labor','desbrote','Desbrote','#1D9E75',30),
  ('labor','rameado','Rameado','#888780',40),
  ('labor','cosecha','Cosecha','#D4537E',50),
  ('labor','otro','Otro','#5F5E5A',60)
on conflict (ambito, slug) do nothing;
