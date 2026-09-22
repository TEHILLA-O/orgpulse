# Omni

Internal organisational intelligence and interactive org-chart platform.

See [FAILURES.md](./FAILURES.md) for what can go wrong, what broke, how it was fixed, and results.

Omni models **people** and **positions** as separate entities, builds
the reporting graph between positions, and derives an interactive chart
from that graph. It is an original product — not a clone of any commercial
org-chart vendor.

Start with [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Demo mode (no external credentials)

Host port **55433** maps to Postgres 5432 in the container so it does not
collide with other local databases.

```bash
docker compose up -d
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000 and sign in:

| Role   | Email                         | Password    |
| ------ | ----------------------------- | ----------- |
| Owner  | `owner@northstar.example`     | `OrgPulse!dev` |
| Admin  | `admin@northstar.example`     | `OrgPulse!dev` |
| Editor | `editor@northstar.example`    | `OrgPulse!dev` |
| Viewer | `viewer@northstar.example`    | `OrgPulse!dev` |

Seed data is a fictional company, **Omni**: ~150 people,
8 departments, 5 locations, vacancies, dotted-line reports and provenance
from the mock Microsoft connector.

---

## Scripts

| Script | Purpose |
| ------ | ------- |
| `npm run dev` | Next.js dev server |
| `npm run db:migrate` | Prisma migrate (dev) |
| `npm run db:seed` | Idempotent demo seed |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |
| `npm run test:e2e` | Playwright |
| `npm run verify` | typecheck + lint + unit tests |

---

## Microsoft Graph

Not required locally. To connect a real tenant, see
[`docs/MICROSOFT_SETUP.md`](./docs/MICROSOFT_SETUP.md).
