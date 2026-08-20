-- =========================================================================
-- Sierras de Aiguá — importación de clientes faltantes de planillas Montevideo
-- Fuente: PDF de ventas ago-2025 → ago-2026
-- SOLO CARGA LOS QUE FALTAN (no duplica los ya existentes de la carga previa).
-- También corrige el tipo de algunos que quedaron mal categorizados.
-- =========================================================================

-- ============================
-- CORRECCIONES DE TIPO
-- ============================
update public.clientes set tipo = 'distribuidor',
  notas = coalesce(notas, '') || case when notas is null or notas = '' then '' else E'\n' end
        || 'Distribuidor de aceitunas (5kg picual mix).'
where nombre = 'Hugo Lauretta';

update public.clientes set tipo = 'distribuidor',
  notas = coalesce(notas, '') || case when notas is null or notas = '' then '' else E'\n' end
        || 'Distribuidor de aceitunas (10-20kg picual).'
where nombre = 'Juan Quimico';

update public.clientes set tipo = 'distribuidor',
  notas = coalesce(notas, '') || case when notas is null or notas = '' then '' else E'\n' end
        || 'Cooperativa CALAI. Dejar en cooperativa.'
where nombre = 'Marisel';

update public.clientes set tipo = 'distribuidor',
  notas = coalesce(notas, '') || case when notas is null or notas = '' then '' else E'\n' end
        || 'Mayorista. Pedidos grandes tipo 100x1/2L + 2x3 suave.'
where nombre = 'Vina Eden';

update public.clientes set tipo = 'distribuidor',
  notas = coalesce(notas, '') || case when notas is null or notas = '' then '' else E'\n' end
        || 'Instituto LATU (Laboratorio Tecnologico). Pedido mensual grande, entrega sin costo en LATU.'
where nombre = 'Laura Latu';

-- ============================
-- NUEVOS DISTRIBUIDORES
-- ============================
insert into public.clientes (nombre, tipo, localidad, notas, origen)
select v.nombre, v.tipo::tipo_cliente, v.localidad, v.notas, 'importacion_2025_2026'
from (values
  ('Ale Amejeiras',  'distribuidor', 'Montevideo', 'Mayorista. Pedido 20x5L, 30% descuento por volumen + IVA.'),
  ('Guzman Cubas',   'distribuidor', 'Aigua',      'Cooperativa CALAI. Retira campo. Pedidos 2x3L suave + 2x3L intenso + 1L intenso.')
) as v(nombre, tipo, localidad, notas)
where not exists (select 1 from public.clientes c where lower(trim(c.nombre)) = lower(trim(v.nombre)));

-- ============================
-- NUEVOS MINORISTAS (parte 1)
-- ============================
insert into public.clientes (nombre, tipo, localidad, notas, origen)
select v.nombre, v.tipo::tipo_cliente, v.localidad, v.notas, 'importacion_2025_2026'
from (values
  ('Adriana G.',              'minorista', null,           'Compra miel 900gr.'),
  ('Andres (casa Santi)',     'minorista', 'Montevideo',   'Vecino de Santi (numero 501). Compra 1L suave + 3/4 premio.'),
  ('Beatriz Aigua',           'minorista', 'Aigua',        'Venta en campo. Compra suave + intenso + aceituna + miel + premio 3/4.'),
  ('Beatriz Angeles',         'minorista', 'Montevideo',   'Compra intenso premio.'),
  ('Cari Bengoa',             'minorista', 'Montevideo',   'Entrega Santi. Compra 1L intenso.'),
  ('Carlos Herrera',          'minorista', 'Montevideo',   'Compra suave + 2 miel gr.'),
  ('Carola (tia de Mari)',    'minorista', 'Montevideo',   null),
  ('Ceci (prima Ana)',        'minorista', 'Montevideo',   'A cuenta de Santiago.'),
  ('Cecilia (mama Duran)',    'minorista', 'Montevideo',   'Compra 3 suave con envio.'),
  ('Clara Hori',              'minorista', 'Montevideo',   'Compra 2x3 suave con envio.'),
  ('Claudia Corbo',           'minorista', 'Montevideo',   'Recibio regalo (premio 3/4 + SF 3/4).'),
  ('Cordoba',                 'minorista', 'Montevideo',   'Compra 1L picual + miel ch.'),
  ('Cruz',                    'minorista', 'Aigua',        '10% venta campo.'),
  ('Damian (pistas negras)',  'minorista', 'Montevideo',   'Compra 5x3 premio con envio, un solo pedido grande.'),
  ('Dani Etcheverry',         'minorista', 'Montevideo',   'Compra intenso.'),
  ('Daniel Rosich',           'minorista', 'Montevideo',   'Compra 2x3 suave + 3/4 premio con envio.'),
  ('Danilo Avion',            'minorista', 'Montevideo',   'Compra 2x1L intenso. Adelanto Rodrigo envios.'),
  ('Elisa Noriko',            'minorista', 'Montevideo',   'Compra intenso.'),
  ('Elsa Aigua',              'minorista', 'Aigua',        'Compra suave + intenso.'),
  ('Ema',                     'minorista', 'Montevideo',   'Compra 1L int + 1/2 pic + 1/4 suave + miel gr.'),
  ('Emiliano Saavedra',       'minorista', 'Montevideo',   'Compra 1 picual (verificar si es cliente propio y no el empleado Emiliano).')
) as v(nombre, tipo, localidad, notas)
where not exists (select 1 from public.clientes c where lower(trim(c.nombre)) = lower(trim(v.nombre)));

-- ============================
-- NUEVOS MINORISTAS (parte 2)
-- ============================
insert into public.clientes (nombre, tipo, localidad, notas, origen)
select v.nombre, v.tipo::tipo_cliente, v.localidad, v.notas, 'importacion_2025_2026'
from (values
  ('Fede Franco',             'minorista', 'Montevideo',   'Compra suave.'),
  ('Fede Magnone',            'minorista', 'Montevideo',   'Entrega Santi. Compra intenso.'),
  ('Fran Primo',              'minorista', 'Montevideo',   'Compra 3L suave.'),
  ('Gabriela',                'minorista', 'Montevideo',   'Compra 4x3 premio + 4 jabon. Verificar apellido.'),
  ('Gabriela Bonessi',        'minorista', 'Montevideo',   'Compra 3x3 suave + 2 miel gr con envio. Cliente recurrente.'),
  ('Gabriela (de AYE)',       'minorista', 'Montevideo',   'A cuenta de Ayelen. Compra 4x3 premio.'),
  ('Gonza Curuchet',          'minorista', 'Montevideo',   'Compra 3 suave.'),
  ('Gonzalo Santa Lucia',     'minorista', 'Santa Lucia',  'Compra 3/4 SF.'),
  ('Guillermo',               'minorista', 'Montevideo',   'Compra 3L suave con envio. Verificar apellido.'),
  ('Helena (hermana tia)',    'minorista', 'Piriapolis',   'Enviar a Piriapolis por DAC. Compra intenso.'),
  ('Javi Erramuspe',          'minorista', 'Montevideo',   'Compra intenso + premio + miel gr con envio.'),
  ('Jefe Gonza',              'minorista', 'Montevideo',   'JT/jefe de Gonzalo. Compra 3L premio.'),
  ('Joan Colo',               'minorista', 'Montevideo',   'Compra 3 suave.'),
  ('Jorge y Ana Rolo',        'minorista', 'Montevideo',   'Pareja. Compra 3L suave. Puede ser el mismo hogar que Jorge Rolo padre.'),
  ('Lucas Cobhan',            'minorista', 'Aigua',        'Venta en campo. Compra 1L suave + 3/4 SF + jabon + aceituna.'),
  ('Majo Solari',             'minorista', 'Montevideo',   'Compra 1L intenso.'),
  ('Mama Todo Caetano',       'minorista', 'Montevideo',   'Compra 3 miel grande. Puede ser familiar de Rodo Caetano.'),
  ('Mari Diaz',               'minorista', 'Montevideo',   'Compra 2x3L suave + 1L suave. Cliente recurrente.'),
  ('Mariam Vaz',              'minorista', 'Montevideo',   'Compra 3 intenso. Estado de pago quedo pendiente en planilla.'),
  ('Mariana Areosa',          'minorista', 'Montevideo',   'Factura +10% IVA. Pago a cuenta vieja.'),
  ('Mariana Haim',            'minorista', 'Montevideo',   'Compra suave + 3/4 premio con envio.')
) as v(nombre, tipo, localidad, notas)
where not exists (select 1 from public.clientes c where lower(trim(c.nombre)) = lower(trim(v.nombre)));

-- ============================
-- NUEVOS MINORISTAS (parte 3)
-- ============================
insert into public.clientes (nombre, tipo, localidad, notas, origen)
select v.nombre, v.tipo::tipo_cliente, v.localidad, v.notas, 'importacion_2025_2026'
from (values
  ('Mariela',                 'minorista', 'Punta del Diablo', 'DAC a Punta del Diablo. Compra suave.'),
  ('Mariela Quevedo',         'minorista', 'Montevideo',   'Compra 1L intenso/picual.'),
  ('Marcelo Cerminara',       'minorista', 'Montevideo',   'Compra intenso.'),
  ('Martin Ripoll',           'minorista', 'Montevideo',   'Compra 1L suave.'),
  ('Mateo',                   'minorista', 'Montevideo',   'Compra 3 intenso. Distinto de Mateo Colo.'),
  ('Michael',                 'minorista', 'Montevideo',   'Compra 1/2L int + suave + picual. Puede ser el mismo que Michael Fox.'),
  ('Monica',                  'minorista', 'Montevideo',   'Compra 2x3 int + jabon + aceituna con envio. Distinta de Monica Garagorry.'),
  ('Nacho Santi',             'minorista', 'Montevideo',   'Retira. Compra 3x3 intenso + miel gr.'),
  ('Noel Sarotto',            'minorista', 'Montevideo',   'Compra 3 suave + 2 jabon con envio.'),
  ('Oleg',                    'minorista', 'Aigua',        'Venta en campo. Compra 3 suave + miel gr.'),
  ('Pablo Jimenez',           'minorista', 'Montevideo',   'Compra 5 suave.'),
  ('Pablo Merilex',           'minorista', 'Montevideo',   'Relacionado con Merilex (misma familia/negocio, verificar).'),
  ('Patricia Ceballe',        'minorista', 'Montevideo',   'Compra premio.'),
  ('Paula Asolur',            'minorista', 'Montevideo',   'Pago exposicion agro en Punta. Distinta de la entrada previa "Asolur".'),
  ('Rafa (padrastro Ale)',    'minorista', 'Montevideo',   'Compra 1x3/4 premio.'),
  ('Remo Monseglio',          'minorista', 'Montevideo',   'Compra 3 premio + 1L picual con envio.'),
  ('Rodo Caetano',            'minorista', 'Montevideo',   'Compra suave + miel. Cliente recurrente.'),
  ('Santiago Degasperi',      'minorista', 'Montevideo',   'Cliente muy frecuente. Compra 2x3 int, 3x3 int, 5 suave, etc.'),
  ('Santiago Scremini',       'minorista', 'Aigua',        'Venta en campo.'),
  ('Seba Diaz',               'minorista', 'Montevideo',   'Compra 1L suave.'),
  ('Veronica viera izeta',    'minorista', 'Montevideo',   'Dejar a Aye. Compra 1L int + 1L pic.'),
  ('Veronica panaderia Aigua','minorista', 'Aigua',        'Panaderia local (venta ocasional).'),
  ('Victoria Aigua',          'minorista', 'Aigua',        'Retira campo. Compra 3L suave.'),
  ('Victoria Garagorry',      'minorista', 'Montevideo',   'Dejar en lo de Monica Garagorry. Compra suave + intenso.')
) as v(nombre, tipo, localidad, notas)
where not exists (select 1 from public.clientes c where lower(trim(c.nombre)) = lower(trim(v.nombre)));

-- ============================
-- Verificacion
-- ============================
select
  tipo,
  count(*) as cantidad
from public.clientes
group by tipo
order by tipo;
