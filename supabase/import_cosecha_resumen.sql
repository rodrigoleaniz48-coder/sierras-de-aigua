-- =========================================================================
-- Import historico de cosecha (resumen por ano) para el comparativo.
-- Fuente: 'Cuaderno de Campo 2017 al 2025 cosechas.xls' (bloques de analitica).
-- Por ano: 3 filas de variedad (kg) + 1 fila 'TOTAL' (litros y rendimiento del ano).
-- Litros/rendimiento solo donde la planilla los tenia validos (2023-2025 estaban rotos).
-- Idempotente: on conflict (anio, variedad) do nothing.
-- =========================================================================
insert into public.cosecha_resumen (anio, variedad, kg_cosecha, litros, rendimiento_pct) values
  (2018,'Arbequina',17442,null,null),
  (2018,'Coratina',10672,null,null),
  (2018,'Picual',1989,null,null),
  (2018,'TOTAL',30103,3940,12.78),

  (2019,'Arbequina',17327,null,null),
  (2019,'Coratina',20096,null,null),
  (2019,'Picual',8149,null,null),
  (2019,'TOTAL',45572,6047,12.91),

  (2020,'Arbequina',13828,null,null),
  (2020,'Coratina',3513,null,null),
  (2020,'Picual',2305,null,null),
  (2020,'TOTAL',19646,2756,14.40),

  (2021,'Arbequina',8779,null,null),
  (2021,'Coratina',13334,null,null),
  (2021,'Picual',4858,null,null),
  (2021,'TOTAL',26971,2885,10.99),

  (2022,'Arbequina',16109,null,null),
  (2022,'Coratina',15285,null,null),
  (2022,'Picual',5210,null,null),
  (2022,'TOTAL',36604,5178,13.88),

  (2023,'Arbequina',21696,null,null),
  (2023,'Coratina',17865,null,null),
  (2023,'Picual',6481,null,null),
  (2023,'TOTAL',46042,null,null),

  (2024,'Arbequina',31344,null,null),
  (2024,'Coratina',16923,null,null),
  (2024,'Picual',4958,null,null),
  (2024,'TOTAL',53225,null,null),

  (2025,'Arbequina',13071,null,null),
  (2025,'Coratina',18283,null,null),
  (2025,'Picual',5382,null,null),
  (2025,'TOTAL',36736,null,null)
on conflict (anio, variedad) do nothing;
