# Sierras de Aiguá — Contexto para Claude Code

App interna de gestión (React + Vite + TS + Tailwind, backend Supabase, deploy GitHub Pages).
Rodrigo (admin), Santiago (admin), Ayelén (marketing lectura), Gonzalo (ventas Maldonado), Emiliano (campo).
Moneda UYU, IVA 10% default. **En BD nunca usar `ñ`** (rompe el SDK).

## Comandos

- `npm run dev` — dev server local
- `npm run build` — typecheck + build (correr antes de cada commit)
- `npm run typecheck` — solo TS check
- Deploy: `git push origin main` → GitHub Pages auto (1-2 min).
- SQL a Supabase: `powershell -File scripts/sql.ps1 "<query>"` (ver más abajo).

## Estructura (dónde vive cada cosa)

- `src/pages/Dashboard.tsx` — Inicio (KPIs, Pendiente ventas, alertas)
- `src/pages/Ventas.tsx` — Ventas + dialogs (Nueva/Editar, Cadete, Pago mensual, Detalle, Envío WA)
- `src/pages/Clientes.tsx` — CRM + envío masivo WhatsApp (multi-select)
- `src/pages/Stock.tsx` — Tanques, envasado, envases vacíos, movimientos, traslados
- `src/pages/Tareas.tsx` — Agenda / Equipo, multi-asignado, comentarios
- `src/pages/Finanzas.tsx` → renderiza `Gastos.tsx` (egresos + reembolsables + adelantos) + `IngresosPanel.tsx`
- `src/pages/Contabilidad.tsx` — EstadoResultados mensual + conciliación bancaria
- `src/pages/Admin.tsx` — productos, presentaciones, precios (USD/UYU + BCU), cuentas bancarias
- `src/pages/Login.tsx`
- `src/components/Layout.tsx` — sidebar desktop, topbar mobile, BottomNav, Fab, sheet "Más"
- `src/components/BottomNav.tsx` + `Fab.tsx` — nav fija mobile (5 tabs + FAB contextual, ocultarse al bajar)
- `src/components/Dialog.tsx` — dialog base con `scrollKey` (persiste scroll entre app-switches)
- `src/components/ClienteDialog.tsx`, `EnviarWhatsAppDialog.tsx`, `AlertasStockBajo/Tareas.tsx`, `ReporteSemanalCard.tsx`, `EditorCategoriasDialog.tsx`
- `src/lib/supabase.ts` — cliente. `auth.tsx` — sesión + perfil. `permisos.ts` — roles.
- `src/lib/persistencia.ts` — localStorage con TTL 24h para borradores + flags de dialogs abiertos
- `src/lib/format.ts`, `colores.ts`, `reporte.ts`, `backupExcel.ts`, `bcu.ts`, `parserBROU.ts`
- `src/lib/useOcultarAlBajar.ts` — hook para ocultar barras fijas al scrollear
- `supabase/schema.sql`, `supabase/functions/{agente,bcu-cotizacion,reporte-mensual}`

## Convenciones críticas

- **Roles**: `admin` (Rod/Santi/Ayelen) · `ventas` (Gonzalo) · `campo` (Emiliano). Se leen de `perfiles.rol`.
- **Filtros por socio en UI**: Gonzalo solo ve sus contactos/gastos/ingresos (RLS + filtro cliente). Ayelen ve todo pero es lectura.
- **Ventas**: `a_confirmar=true` = potencial (no descuenta stock, no aparece en reportes). `fecha_cobro` = mes real del cobro (reportes usan esta, no `fecha`).
- **Stock**: 6 tanques aceite (T1-T6) + Tambor miel (id 13) + Tanque cosmética (id 14, 500L). Al envasar se descuenta el tanque + envase vacío (match por `volumen_ml` en producto id 28 "Envases vacios", solo el genérico — Vina Eden se ignora).
- **Packs**: `presentacion_componente` bundle; el trigger `fn_descontar_stock_venta` itera componentes FIFO.
- **Fechas**: siempre `hoyLocalStr()` (UY local), nunca `toISOString().slice(0,10)` (UTC salta a las 21hs y desincroniza vencidas entre usuarios).
- **Borradores**: cada dialog largo (Nueva venta, Nueva tarea, Nuevo cliente) persiste en localStorage vía `guardarObj/leerObj` + flag de dialog abierto (`guardarFlag/leerFlag`).

## Trabajo con Supabase

Project ref: `ogtssmliiftxaieectny`. Region São Paulo.

**Consultas rápidas**: usar `scripts/sql.ps1 "<query>"` — encapsula el POST a la Management API, encoding UTF-8 sin BOM, escape correcto de comillas.

Token: guardar una sola vez en `.claude/supabase.token` (gitignored) o setear `$env:SUPABASE_MGMT_TOKEN`.

**Migraciones destructivas**: siempre `select coalesce(max(id),0)+1 from tabla` antes de insertar con id manual (tabla `tanques` no tiene sequence).

**RLS**: `gastos` y `ventas` filtran por `socio_id = auth.uid()` OR flag `ve_todos_gastos`. `ingresos` mirror. `tareas` incluye `asignados_a` array.

## Flujo de trabajo

- **Sesiones por área**: cada conversación toca 1 módulo (Ventas, Stock, Tareas…). No mezclar.
- **Antes de tocar código**: Grep del símbolo relevante, no leer archivo entero. Los archivos grandes (Ventas 2500L, Stock 1700L, Tareas 1200L) están mezclando dialogs anidados.
- **Commits**: descriptivos en español, sin emojis, firma `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`. `git push origin main` deploy automático.
- **Nunca**: `--no-verify`, `force push` a main, ejecutar SQL destructivo sin confirmar con el usuario.
- **Preferencia de hosting**: GitHub Pages. No montar Vercel/Netlify/servicios extra sin preguntar.
- **Pendientes por área**: `ROADMAP.md` (leer solo la sección del módulo que se toca).
