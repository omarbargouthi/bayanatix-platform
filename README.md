# Bayanatix Platform

Data governance & catalog SPA — built on the same product direction as the Figma drafts, now wired to a real Postgres backend with auth.

## Stack

| Layer        | Choice                                 | Why                                                                 |
|--------------|----------------------------------------|---------------------------------------------------------------------|
| Framework    | **Next.js 14 (App Router) + TS**       | Single deployable, server components for direct DB reads, SPA-like client navigation. Ideal on Vercel. |
| Styling      | **Tailwind + brand tokens**            | Brand palette (`#201C55`, `#2A336D`, `#6058A0`, …) lives in `tailwind.config.ts`. |
| Database     | **PostgreSQL** via `postgres` (pg.js)  | Raw SQL, prepared statements, no ORM ceremony. |
| Auth         | **JWT in HttpOnly cookies** (`jose` + `bcryptjs`) | Stateless, simple, secure. Edge-compatible verification in middleware. |
| Validation   | `zod`                                  | Request body validation on API routes.                              |

> **Why not NextAuth?** It adds a lot of surface area for what is currently a single-tenant, internal product. The ~80 lines in `lib/auth.ts` handle login, logout, session reading, and middleware enforcement; we can swap to NextAuth or SAML/OIDC later without touching the UI.

## Folder structure

```
bayanatix-platform/
├── app/
│   ├── login/                          # public auth screen (server + client form)
│   ├── (app)/                          # auth-protected app shell
│   │   ├── layout.tsx                  # session check + sidebar
│   │   ├── dashboard/page.tsx          # DB-backed dashboard
│   │   └── catalog/
│   │       ├── page.tsx                # catalog index
│   │       ├── [schemaId]/page.tsx     # schema (table-level) view
│   │       └── [schemaId]/tables/[tableId]/page.tsx  # column-level
│   ├── api/auth/{login,logout,me}/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                        # → /dashboard
├── components/
│   ├── layout/    Sidebar.tsx · Header.tsx · icons.tsx
│   ├── ui/        Tag.tsx · Donut.tsx · Avatar.tsx · ProgressBar.tsx
│   └── catalog/   DomainCard.tsx · AssetTree.tsx · TableTabs.tsx · MaturityChart.tsx
├── lib/
│   ├── db.ts            # postgres.js client (singleton)
│   ├── auth.ts          # JWT cookie helpers
│   ├── types.ts         # camelCase domain types mapped from snake_case columns
│   ├── utils.ts         # cn(), initials(), fmtNumber()
│   └── queries/         # SQL grouped by entity
│       ├── users.ts
│       ├── domains.ts
│       └── catalog.ts
├── db/
│   ├── 001_users_and_domains.sql      # additive migration on top of bayanat schema
│   └── 002_seed.sql                   # demo data (idempotent)
├── scripts/
│   ├── migrate.mjs        # runs every .sql in db/ in order
│   └── hash-password.mjs  # generate a bcrypt hash for a new user
├── middleware.ts          # JWT cookie check, redirects to /login
├── tailwind.config.ts
├── next.config.mjs
└── package.json
```

## Architectural notes

- **Server components for pages, client components for interaction.** Each page is a server component that does DB reads directly through `lib/queries/*`. Anything that needs `useState` (sidebar active link, login form, tabs, tree expand/collapse) is a small client component imported from `components/`.
- **Routing.** App Router gives us SPA-like client navigation between routes for free; no manual router setup needed. Dynamic routes (`[schemaId]`, `[tableId]`) drive the schema/table pages.
- **Data shapes.** All UI consumes `lib/types.ts` (camelCase). Queries alias snake_case Postgres columns at read time so component props never see the raw schema.
- **Auth flow.**
  1. `POST /api/auth/login` → looks up user, `bcrypt.compare`, sets HttpOnly cookie with a signed JWT.
  2. `middleware.ts` runs on the edge, verifies the cookie, redirects unauthenticated traffic to `/login` (preserving `from`).
  3. `getSession()` (server) reads the cookie inside server components.
  4. `POST /api/auth/logout` clears the cookie.
- **Migrations are additive.** `001_users_and_domains.sql` only adds tables/columns. The original `bayanat.*` schema is untouched. Re-running it is safe.

## Setup

### 1. Install

```bash
cd bayanatix-platform
npm install
```

### 2. Provision Postgres

Pick one:
- **Vercel Postgres / Neon** (recommended for production) — create a DB and copy the `DATABASE_URL`.
- **Supabase** — use the connection string under Project Settings → Database.
- **Local** — `createdb bayanat` and use `postgres://USER@localhost:5432/bayanat`.

### 3. Environment

```bash
cp .env.example .env.local
```

Fill `DATABASE_URL` and generate a strong `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 4. Apply migrations and seed

The original `bayanat.*` schema (the file you provided) needs to exist first. Either run that DDL manually against your DB, **or** drop it into `db/000_base_schema.sql` so the migrator picks it up — files run alphabetically.

Then:

```bash
npm run db:migrate
```

This runs every `db/*.sql` in order.

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000>. You'll be redirected to `/login`.

**Demo credentials** (seeded):

| Email                    | Role     |
|--------------------------|----------|
| `khaled@bayanatix.demo`  | Steward  |
| `sara@bayanatix.demo`    | Admin    |
| `mohammed@bayanatix.demo`| Officer  |

Password (all): `Bayanatix123!`

## Mapping screens → DB

| Screen                    | Tables read                                                              |
|---------------------------|--------------------------------------------------------------------------|
| `/dashboard`              | `governance_domains` (added in migration)                                |
| `/catalog`                | `data_sources`, `data_schemas`, `data_entities`, `business_glossaries`   |
| `/catalog/[schemaId]`     | `data_schemas`, `data_entities`, `asset_certifications`, `asset_stakeholders`, `users` |
| `/catalog/.../[tableId]`  | `data_entities`, `data_attributes`, `asset_certifications`               |
| `/login`                  | `users` (bcrypt password check)                                          |

`asset_stakeholders` is queried by `asset_type_code = 'DATA_ENTITIES'` and joined to `users` for the steward avatars. New asset types (e.g., `DATA_ATTRIBUTES`) plug in without query changes.

## Adding a user manually

```bash
node scripts/hash-password.mjs "MyPassword123!"
# → $2b$12$...
```

Then in Postgres:

```sql
insert into bayanat.users (user_id, email, full_name, role, password_hash)
values ('jane.doe', 'jane@example.com', 'Jane Doe', 'VIEWER', '<hash>');
```

## Deploying to Vercel

1. `vercel link` (or push to GitHub and import in the Vercel dashboard).
2. Add env vars in the Vercel dashboard:
   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `NEXT_PUBLIC_APP_URL` (the production URL)
3. Run migrations against the production DB once: `DATABASE_URL=... npm run db:migrate`.
4. `vercel deploy --prod`.

## What's stubbed vs. what's live

**Live (DB-backed):**
- Login & session
- Dashboard NDMO domain cards & overall compliance summary
- Data Catalog stats, source/schema tree, glossary roots
- Schema page (tables list, certs, stewards)
- Table page (description, attributes, classification, glossary, quality scores)

**Visual placeholder for now (consistent shape, easy to swap):**
- Maturity time-series line chart (uses static SVG; backed by `domain_maturity_history` table when added)
- "Activity / Lineage / Sample Data" tabs on the table page
- "SQL Coverage" headline percent on `/catalog`
- Notification bell counts

Each placeholder is wrapped in its own component file so wiring real data later is a single-component change, not a page refactor.

## Next milestones

1. **Lineage view** (`data_lineage` table) — graph component.
2. **Data Quality dashboard** (`dq_rules`, `dq_results`).
3. **FOI Requests** workflow (`workflow_definitions`, `workflow_stages`).
4. **Audit timeline** on the table page (`audit_logs` + `history_logs` already capture the data via the trigger you provided).
5. **Saved searches** (a `user_searches` table to power the omnibar).
