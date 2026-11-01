-- Agrega fecha_entrega a envios_cadete_todos y cambia el filtro de fecha:
--  - Envios PENDIENTES (sin entregar) vuelven SIEMPRE, sin importar el rango:
--    arrastran mes a mes hasta que se entregan (rollover automatico).
--  - Envios ENTREGADOS se filtran por el MES DE ENTREGA real (fecha_entrega),
--    no por la fecha de venta: asi el pago al cadete cae en el mes que entrego.
drop function if exists public.envios_cadete_todos(date, date);

create or replace function public.envios_cadete_todos(p_desde date default null, p_hasta date default null)
returns table(
  id bigint, fecha date, fecha_entrega date, socio_id uuid, socio_nombre text,
  cliente_id bigint, cliente_nombre text, cliente_telefono text, cliente_whatsapp text,
  cliente_direccion text, cliente_localidad text, envio boolean, entregado boolean,
  cobrado boolean, costo_envio numeric, estado text, promocion_comercial boolean,
  horario_entrega text, ubicacion_id smallint, items_resumen text
)
language plpgsql security definer set search_path to 'public'
as $function$
begin
  return query
    select v.id, v.fecha, v.fecha_entrega, v.socio_id, ps.nombre as socio_nombre,
      v.cliente_id, c.nombre as cliente_nombre, c.telefono, c.whatsapp, c.direccion, c.localidad,
      v.envio, v.entregado, v.cobrado, v.costo_envio, v.estado::text, v.promocion_comercial,
      v.horario_entrega, v.ubicacion_id,
      (select string_agg(iv.unidades || 'x ' || coalesce(pr.nombre,'') || ' ' || coalesce(pp.nombre,''), ', ')
         from public.items_venta iv
         left join public.presentaciones pp on pp.id = iv.presentacion_id
         left join public.productos pr on pr.id = pp.producto_id
        where iv.venta_id = v.id) as items_resumen
    from public.ventas v
    left join public.perfiles ps on ps.id = v.socio_id
    left join public.clientes c on c.id = v.cliente_id
    where v.envio = true
      and v.estado <> 'cancelado'
      and (
        not v.entregado
        or (
          (p_desde is null or coalesce(v.fecha_entrega, v.fecha) >= p_desde)
          and (p_hasta is null or coalesce(v.fecha_entrega, v.fecha) <= p_hasta)
        )
      )
      and exists (
        select 1 from public.perfiles p
        where p.id = v.socio_id and lower(p.nombre) in ('rodrigo', 'santiago', 'ayelen')
      )
    order by v.fecha desc, v.id desc;
end;
$function$;
