-- Descripcion por categoria de campo (que es cada fungicida/fertilizante/etc).
-- Se muestra al tocar la leyenda de colores en el cronograma. Editable.

alter table public.categorias_campo add column if not exists descripcion text;

-- Semilla: solo si la categoria todavia no tiene descripcion.
update public.categorias_campo set descripcion =
  'Previene y combate enfermedades por hongos del olivo (repilo u ojo de pavo, antracnosis o aceituna jabonosa, verticilosis). Suelen ser a base de cobre (caldo bordeles, oxicloruro) o sistemicos.'
  where ambito = 'aplicacion' and slug = 'fungicida' and descripcion is null;

update public.categorias_campo set descripcion =
  'Aporta nutrientes al olivo para sostener crecimiento y produccion. Foliares (nitrogeno, boro, zinc) y de suelo. Corrige carencias y acompana floracion y cuajado.'
  where ambito = 'aplicacion' and slug = 'fertilizante' and descripcion is null;

update public.categorias_campo set descripcion =
  'Controla insectos plaga: mosca del olivo, cochinilla, barrenillo, prays (polilla del olivo). Se aplica cuando el monitoreo supera el umbral.'
  where ambito = 'aplicacion' and slug = 'insecticida' and descripcion is null;

update public.categorias_campo set descripcion =
  'Control de malezas en la fila y la entrefila para reducir la competencia por agua y nutrientes con el olivo.'
  where ambito = 'aplicacion' and slug = 'herbicida' and descripcion is null;

update public.categorias_campo set descripcion =
  'Corte de ramas para dar luz y forma a la planta; mejora sanidad, aireacion y la cosecha del ano siguiente.'
  where ambito = 'labor' and slug = 'poda' and descripcion is null;

update public.categorias_campo set descripcion =
  'Corte del pasto y malezas de la entrefila con rotativa, para control de cobertura y prevencion de incendios.'
  where ambito = 'labor' and slug = 'rotativa' and descripcion is null;

update public.categorias_campo set descripcion =
  'Eliminacion de brotes y chupones al pie del tronco y en la base, que compiten con la copa productiva.'
  where ambito = 'labor' and slug = 'desbrote' and descripcion is null;

update public.categorias_campo set descripcion =
  'Manejo de las ramas bajas (despunte o levante) para facilitar labores y cosecha.'
  where ambito = 'labor' and slug = 'rameado' and descripcion is null;

update public.categorias_campo set descripcion =
  'Recoleccion de la aceituna, por variedad, para su posterior molienda.'
  where ambito = 'labor' and slug = 'cosecha' and descripcion is null;

update public.categorias_campo set descripcion =
  'Otras labores del cultivo que no entran en las categorias anteriores.'
  where ambito = 'labor' and slug = 'otro' and descripcion is null;
