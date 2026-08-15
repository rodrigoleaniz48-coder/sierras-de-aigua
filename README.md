# Sierras de Aiguá — Gestión

App web interna para los 4 socios: stock, ventas + CRM, gastos personales y contabilidad general.

- **Frontend**: Vite + React + TypeScript + Tailwind.
- **Backend**: Supabase (Postgres + Auth + Storage).
- **Hosting**: GitHub Pages (deploy automático desde `main`).

Sitio final: `https://rodrigoleaniz48-coder.github.io/sierras-de-aigua/`

---

## Puesta en marcha (primera vez)

Necesitás hacer estos pasos una sola vez. Después, cada `git push` a `main` deploya solo.

### 1. Crear proyecto en Supabase

1. Entrá a <https://supabase.com>, creá una cuenta (o entrá con GitHub).
2. **New project** → nombre `sierras-de-aigua`, región **South America (São Paulo)**, poné una contraseña de base fuerte y guardala.
3. Esperá 1–2 minutos a que se cree.

### 2. Cargar el esquema

1. En Supabase, panel izquierdo → **SQL Editor** → **New query**.
2. Abrí el archivo [`supabase/schema.sql`](supabase/schema.sql) de este repo, copiá TODO el contenido y pegalo.
3. Clic en **Run**. Debería terminar sin errores y crear todas las tablas, políticas y datos iniciales (productos y presentaciones estándar).

### 3. Crear los 4 usuarios

En Supabase → **Authentication** → **Users** → **Add user** → **Create new user** (email + password, marcar *Auto Confirm User*).

Creá uno para cada socio, con emails reales:

| Socio     | Email sugerido                    | Rol final |
|-----------|-----------------------------------|-----------|
| Rodrigo   | rodrigoleaniz48@gmail.com         | `admin`   |
| Santiago  | (email de Santi)                  | `admin`   |
| Gonzalo   | (email de Gonzalo)                | `ventas`  |
| Ayelén    | (email de Ayelén)                 | `marketing` |

**Después**, en el SQL Editor corré esto para asignar los roles y nombres reales (reemplazá los emails):

```sql
update public.perfiles set rol='admin',     nombre='Rodrigo'  where id = (select id from auth.users where email='rodrigoleaniz48@gmail.com');
update public.perfiles set rol='admin',     nombre='Santiago' where id = (select id from auth.users where email='SANTI@ejemplo.com');
update public.perfiles set rol='ventas',    nombre='Gonzalo'  where id = (select id from auth.users where email='GONZALO@ejemplo.com');
update public.perfiles set rol='marketing', nombre='Ayelén'   where id = (select id from auth.users where email='AYELEN@ejemplo.com');
```

### 4. Copiar las credenciales de la app

En Supabase → **Project Settings** → **API**. Copiá:

- **Project URL** (algo como `https://xxxx.supabase.co`)
- **anon public key** (empieza con `eyJ...`, esta es pública y segura de publicar)

⚠️ NO uses la `service_role` key en el frontend.

### 5. Configurar el repo de GitHub

En <https://github.com/rodrigoleaniz48-coder/sierras-de-aigua/settings/secrets/actions> agregá dos secrets:

- `VITE_SUPABASE_URL` = el Project URL del paso 4
- `VITE_SUPABASE_ANON_KEY` = la anon key del paso 4

Después, en **Settings → Pages** → *Build and deployment* → **Source**: elegí **GitHub Actions**.

### 6. Primer deploy

Desde esta carpeta:

```bash
git init
git add .
git commit -m "Scaffold inicial"
git branch -M main
git remote add origin https://github.com/rodrigoleaniz48-coder/sierras-de-aigua.git
git push -u origin main
```

En la pestaña **Actions** del repo vas a ver el workflow *Deploy a GitHub Pages* corriendo. Cuando termine (2–4 minutos), la app queda en:

**<https://rodrigoleaniz48-coder.github.io/sierras-de-aigua/>**

Entrá con el usuario + contraseña que creaste en el paso 3.

---

## Desarrollo local (opcional)

Solo si querés probar cambios en tu compu antes de pushear.

1. Instalá **Node.js 20+** desde <https://nodejs.org>.
2. En esta carpeta:
   ```bash
   cp .env.example .env.local
   ```
   y completá `.env.local` con los valores del paso 4.
3. ```bash
   npm install
   npm run dev
   ```
4. Abrí <http://localhost:5173/sierras-de-aigua/>.

---

## Estructura del proyecto

```
├── supabase/
│   └── schema.sql            ← Correr una vez en Supabase
├── src/
│   ├── lib/
│   │   ├── supabase.ts       ← Cliente Supabase
│   │   ├── auth.tsx          ← AuthProvider + useAuth
│   │   └── types.ts
│   ├── components/
│   │   ├── Layout.tsx        ← Sidebar + topbar mobile
│   │   ├── ProtectedRoute.tsx
│   │   └── PlaceholderPagina.tsx
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Stock.tsx         ← Placeholder (fase siguiente)
│   │   ├── Ventas.tsx        ← Placeholder
│   │   ├── Clientes.tsx      ← Placeholder
│   │   ├── Gastos.tsx        ← Placeholder
│   │   ├── Contabilidad.tsx  ← Placeholder (admin)
│   │   └── Admin.tsx         ← Placeholder (admin)
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── .github/workflows/deploy.yml
├── vite.config.ts
├── tailwind.config.js
└── package.json
```

## Roles y permisos

Los permisos se aplican en dos capas: en el frontend (menú y rutas) y en la base con **Row-Level Security**. Aunque un socio manipulara el navegador, no podría leer datos que no le corresponden.

| Módulo         | admin (Rodrigo/Santi) | ventas (Gonzalo) | marketing (Ayelén) |
|----------------|:---------------------:|:----------------:|:------------------:|
| Stock          | R/W                   | R/W              | Lectura            |
| Ventas         | R/W                   | R/W (propias)    | —                  |
| Clientes / CRM | R/W                   | R/W              | Lectura            |
| Mis gastos     | R/W                   | R/W              | R/W (propios)      |
| Contabilidad   | R/W                   | —                | —                  |
| Administración | R/W                   | —                | —                  |

## Roadmap por fases

1. ✅ **Fase 0 — Esqueleto** (esto). Login, layout, roles, deploy funcionando.
2. **Fase 1 — Stock**. Lotes, envasado, movimientos, alertas.
3. **Fase 2 — Ventas + CRM**. Ficha de cliente, alta rápida de venta, descuenta stock automático.
4. **Fase 3 — Gastos personales**. Formulario móvil con foto de comprobante.
5. **Fase 4 — Contabilidad general** (admins). Ingresos/egresos, IVA, exportación al contador.
6. **Fase 5 — Importador CSV**. Cargar el histórico de clientes/ventas de las planillas.

Después de cada fase, probás y me decís qué ajustar antes de seguir.
