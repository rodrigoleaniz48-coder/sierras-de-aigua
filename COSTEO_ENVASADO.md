# Costeo de envasado — composición y actualización pendiente

> Documento de trabajo. Los costos **vigentes en el sistema NO están tocados**.
> Acá queda armada la actualización para ejecutarla **cuando se compren** los insumos nuevos.

## Criterio acordado (nov-2026)

- Insumos importados (botellas, tapas) cotizados en **USD** → cargar **SIN IVA**, convertidos a
  **UYU al BCU del momento de compra** (el costo queda congelado en pesos).
- Insumos locales (etiqueta, caja) y **servicio/MO ($30 fijo por unidad)** van en pesos.
- Común vs premiado: **un solo costo por volumen** por ahora (el premiado se envasa en ambas
  presentaciones; se separará a futuro si hace falta — cambia solo la etiqueta).
- El envasado **NO** entra en el costo del aceite a granel (USD/L): es costo por unidad, no por litro.
- Para productos NO aceite, el campo de costo es el **costo total del producto** (ver miel abajo).

## Composición vigente (cargada hoy)

| Presentación | Botella/Bidón | Etiqueta | Tapa | Capucho | Caja | Servicio | **Total** |
|---|---|---|---|---|---|---|---|
| 250 ml | 32,58* | 25,12 | 3,8 | 1,4 | 8,2 | 30 | **101,1** |
| 500 ml | 22,3 | 25,12 | 3,8 | 1,4 | 8,2 | 30 | **90,8** |
| 750 ml (premiada) | 35,8 | 13,5 | 3,8 | 1,4 | 8,2 | 30 | **92,7** |
| 1 L | 41 | 25,12 | 3,8 | 1,4 | 8,2 | 30 | **109,5** |
| 3 L (común) | 25 | 9 | — | — | — | 30 | **64** |
| 3 L premiado | 25 | 13,5 | — | — | — | 30 | 68,5 (no cargado aparte) |
| 5 L | ⚠️ sin definir | | | | | | **64** (= 3 L, casi seguro mal) |
| Pack | ⚠️ sin composición | | | | | | **55** |

\* 250 ml: botella derivada del total cargado (101,1 − 68,52 de resto). Confirmar composición real.

## Precios de insumo por unidad

| Insumo | Precio vigente | Estado |
|---|---|---|
| Servicio / MO | 30 | vigente |
| Botella 1 L | 41 | **nuevo cotizado: USD 0,79 +IVA (no comprado)** |
| Botella 500 ml | 22,3 | **nuevo cotizado: USD 0,48 +IVA (no comprado)** |
| Botella 250 ml | 32,58* | **nuevo cotizado: USD 0,36 +IVA (no comprado)** |
| Botella 750 ml (premiada) | 35,8 | falta precio nuevo |
| Bidón 3 L / 5 L | 25 | falta precio nuevo (real trazado nov-2026: **$23,80**) |
| Tapa | 3,8 | falta precio nuevo |
| Capucho | 1,4 | falta precio nuevo |
| Caja | 8,2 | falta precio nuevo |
| Etiqueta botella (1 L/500/250) | 25,12 | falta precio nuevo |
| Etiqueta 750 premiada | 13,5 | falta precio nuevo |
| Etiqueta bidón común / premiado | 9 / 13,5 | falta precio nuevo |

## Precios nuevos ya cotizados (NO comprados aún)

Solo botellas, sin IVA, a convertir por BCU del momento de compra:

| Botella | USD +IVA | Preview a BCU 40,72 (sin IVA) |
|---|---|---|
| 1 L | 0,79 | 32,17 |
| 500 ml | 0,48 | 19,55 |
| 250 ml | 0,36 | 14,66 |

Reemplazando **solo la botella** (resto igual), los totales quedarían:
`1 L → 100,69 · 500 ml → 88,07 · 250 ml → 83,18` (las botellas **bajan** vs. lo viejo).

## Pendiente para completar la actualización

1. **Comprar** las botellas nuevas y cargar al BCU de ese día.
2. Precios nuevos de: **750 premiada, bidón 3 L, bidón 5 L, tapa, capucho, caja, etiquetas, servicio**
   (aclarar si USD o pesos; estandarizar todo **sin IVA**).
3. Definir composición de: **250 ml** (confirmar), **5 L**, **Pack**.
4. Revisar el **5 L** (hoy $64, igual que 3 L — falta su bidón + etiqueta).

## Cómo ejecutar (plantilla SQL)

Costo = botella(USD × BCU_compra) + etiqueta + tapa + capucho + caja + servicio.
Actualiza TODAS las presentaciones de aceite de ese volumen:

```sql
-- Ejemplo 1 L con BCU=40,72 (ajustar valor):
update presentaciones set costo_envasado = round(0.79*40.72 + 25.12 + 3.8 + 1.4 + 8.2 + 30, 2), costo_envasado_usd = null
where volumen_ml = 1000 and producto_id in (select id from productos where categoria = 'aceite');
```

## Miel (resuelto, no entra acá)

Trueque por arrendamiento (1 colmena = 1 kg). Costeada a valor de reposición **$300/kg**.
Cargado: frasco + peso × 300 → Chico 300 g = **$116**, Grande 900 g = **$309,5**.
