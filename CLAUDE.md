# Bayanatix Platform — Claude Code Context

**Full project notes (Obsidian vault):** `C:\Omar\Bayanatix-Vault\`
**GitHub:** https://github.com/omarbargouthi/bayanatix-platform (branch: master)

## Stack
Next.js 14 App Router · TypeScript · Tailwind CSS · PostgreSQL 18 · postgres.js · JWT (jose) · Zod

## Local Dev

- **DB:** Docker container `test_postgres` · host port 5431 · user `postgres` · password `test_password` · DB `bayanatix`
- **Dev server:** `npm run dev` → http://localhost:3000
- **"prepare bayanatix"** = start container + verify DB + start dev server

## Rules

1. Always commit and push to GitHub after every meaningful set of changes — do not wait to be asked.
2. Never run `scripts/migrate.mjs` — it re-runs all files and breaks on existing tables. Apply migrations individually via `docker exec`.
3. Each page renders its own `<Header crumbs={...} user={user} />`. Admin layout ALSO renders a Header — don't add a second one in admin child pages.
4. All UI strings use `useLang()` / `t.xxx` — don't hardcode English strings in components.
5. The admin layout checks `user.role !== "ADMIN"` and redirects — admin pages don't need to repeat this check, but non-admin pages do need their own auth guard.

## Demo Credentials (all use `Bayanatix123!`)

| Email | Role |
|-------|------|
| sara@bayanatix.demo | ADMIN |
| khaled@bayanatix.demo | STEWARD |
| mohammed@bayanatix.demo | OFFICER |
| fahad@bayanatix.demo | STEWARD |

## Key Files

| Purpose | Path |
|---------|------|
| DB singleton | `lib/db.ts` |
| Auth helpers | `lib/auth.ts` |
| Types | `lib/types.ts` |
| Catalog queries | `lib/queries/catalog.ts` |
| Register queries | `lib/queries/gov-registers.ts` |
| Compliance queries | `lib/queries/gov-compliance.ts` |
| Domain queries | `lib/queries/domains.ts` |
| API routes | `app/api/` |
| App pages | `app/(app)/` |
| UI components | `components/` |
| Migrations (applied 000–040) | `db/` |

## Migrations Applied

000–040 all applied. Next migration: `041_...sql`
Run via: `docker exec test_postgres psql -U postgres -d bayanatix -c "SQL"`
