# Failure modes, fixes, and results

Honest engineering notes for this project. Nothing here is invented for polish.

## What can go wrong

- **Vercel build / Edge Prisma mismatch.** Hosting Next with Prisma on Edge or with local `DATABASE_URL` values can crash cold starts. Impact: blank deploy. Mitigation: keep Prisma off the Edge proxy, fall back to an in-memory demo when Postgres is not configured, and fail closed on missing auth secrets rather than throwing uncaught.
- **Tenant IDOR and private-field leakage.** Guessing UUIDs or stuffing share/export paths could expose another org or ADMIN_ONLY fields. Impact: HR data leak. Mitigation: org-scoped handlers, server-side RBAC on every `/api/v1` call, redaction at the serialisation boundary (documented in `SECURITY.md`).
- **CSS layering killing chart chrome.** An unlayered universal `border-color` outranked Tailwind utilities and silently disabled selected-node and vacancy borders. Impact: broken visual feedback while editing. Mitigation: move base styles into `@layer base` (see rename/theme commit).
- **Sync overwrite / formula injection.** Crafted connector or CSV payloads can overwrite graph data or inject spreadsheet formulas on export. Impact: bad chart or spreadsheet risk. Mitigation: idempotent sync preview/apply, formula-cell prefixing on export (threat model in `SECURITY.md`).

## What went wrong

**No recorded production incident in this repo yet.** Documented engineering mistakes and deploy fixes that *are* in history:

1. Universal border CSS sat outside `@layer`, so every `border-*` utility stopped working after the theme rework.
2. Vercel production builds failed on TypeScript errors and a duplicate organisation GET route.
3. Missing auth secret and Docker-local `DATABASE_URL` on Vercel caused crashes or wrong data paths; Prisma on the Edge proxy blocked dashboard render.
4. Early workspace was docs-only (no Prisma/Next/`src`), so Phase 0 had to bootstrap the app from an empty skeleton (`TODO.md`).

## How it was resolved

1. Moved the border default into `@layer base` and retokenised colours in the Omni rename commit (`21adb54`).
2. Fixed TypeScript errors that blocked Vercel; removed the duplicate organisation GET (`459a6ac`, `34d2d2e`).
3. Stopped missing auth secret from crashing Vercel; run in-memory demo when `DATABASE_URL` points at local Docker; keep Prisma off Edge (`213b990`, `2b50645`, `7bf58bb`).
4. Implemented Prisma schema, Auth.js demo users, seed, and domain kernel per `TODO.md` / `ARCHITECTURE.md`.

## Results

- Local demo: `docker compose up`, migrate, seed, sign in as owner/admin/editor/viewer against fictional Omni (~150 people, 8 departments, 5 locations).
- Scripts: `npm run verify` runs typecheck + lint + unit tests; Playwright e2e is configured.
- Live site referenced in repo metadata: org-chart Vercel app. No production outage metrics are claimed here.
