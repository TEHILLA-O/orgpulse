# Omni — Implementation Plan

Living checklist. Deferred work is recorded with **reason**, **dependency** and
**recommended implementation** so nothing is silently dropped.

Companion documents: [`ARCHITECTURE.md`](./ARCHITECTURE.md),
[`DATA_MODEL.md`](./DATA_MODEL.md), [`INTEGRATIONS.md`](./INTEGRATIONS.md),
[`SECURITY.md`](./SECURITY.md).

---

## Repository analysis (2026-09-01)

The workspace already contained:

- `ARCHITECTURE.md` and `DATA_MODEL.md` (complete design intent)
- `package.json` with scripts but **no dependencies**
- `tsconfig.json`, Prettier config, `.gitignore`

It did **not** contain: Prisma schema, Next.js application, Docker, tests,
`INTEGRATIONS.md`, `SECURITY.md`, or any source under `src/`.

Phase 0 therefore starts from documentation + empty application skeleton.

---

## Phase 0 — Foundation

Goal: a developer can `docker compose up`, migrate, seed, and sign in against
a real organisation database. No chart canvas yet.

### 0.1 Repository and tooling

- [x] Architecture documentation (`ARCHITECTURE.md`, `DATA_MODEL.md`)
- [x] `INTEGRATIONS.md`, `SECURITY.md`, `docs/MICROSOFT_SETUP.md`
- [x] `README.md` with the demo-mode boot sequence
- [x] Next.js 16 App Router + TypeScript (`strict`, `noUncheckedIndexedAccess`)
- [x] Tailwind CSS v4 + shadcn/ui primitives + Lucide
- [x] ESLint (incl. domain `no-restricted-imports`) + Prettier
- [x] Vitest + Playwright config
- [x] Docker + docker-compose (PostgreSQL 16 + optional app)
- [x] `.env.example` with no secrets
- [x] Zod-validated runtime config (`src/lib/config.ts`)
- [x] Structured Pino logger with redaction + correlation IDs

### 0.2 Database

- [x] Prisma schema implementing `DATA_MODEL.md` (Prisma 6.16 on this Node 23 machine; Prisma 7 is D11)
- [x] UUID primary keys, organisation tenancy, soft deletes
- [x] Enums for roles, statuses, relationship types, sync statuses
- [x] Indexes for chart load, directory, search, sync upsert, audit
- [x] SQL migration for CHECK constraints + partial unique index + trigram
- [ ] Prisma client via `@prisma/adapter-pg` — see D11

### 0.3 Identity and RBAC

- [x] `User`, `Organisation`, `OrganisationMembership`
- [x] Auth.js v5 credentials provider (local/demo)
- [x] Session wrapper that always re-resolves membership server-side
- [x] Pure RBAC policy in `src/domain/permissions/`
- [x] Server-side enforcement on every `/api/v1` handler
- [x] Entra ID/OIDC provider **wired in config**, not required for local boot

### 0.4 Seed and demo mode

- [x] Realistic org: 1 CEO, 5 executives, 8 departments, 20 managers,
      150 people, 5 locations, 10 vacancies
- [x] Primary reporting + a few dotted-line relationships
- [x] Multiple assignments, an assistant, vacancies
- [x] Demo users: OWNER / ADMIN / EDITOR / VIEWER
- [x] ExternalIdentity provenance on seeded Microsoft-mock records
- [x] `npm run db:seed` is idempotent

### 0.5 Domain kernel (no UI)

- [x] Reporting graph construction (`buildReportingGraph`)
- [x] Cycle detection on the primary graph
- [x] Self-reporting guard
- [x] Assignment invariants
- [x] Field-visibility policy
- [x] Unit tests for the above

**Phase 0 done when:** `docker compose up` → `npm run db:migrate` →
`npm run db:seed` → `npm run dev` → sign in as `owner@northstar.example`
and hit an authenticated API that returns the organisation.

---

## Phase 1 — Core org chart (first usable demo)

Goal: the Definition of Done for the first demo, minus CSV import and
Microsoft Graph (those are Phase 2; the mock connector satisfies “load sample
external data”).

- [x] Chart projection: Position nodes, Person inside node, VACANT labelled
- [x] React Flow canvas: pan, zoom, zoom-to-fit, minimap, select
- [ ] ELK.js `TOP_DOWN` and `LEFT_RIGHT` in a Web Worker (layout runs on the client today; worker is a follow-up)
- [x] Expand / collapse branches (prune, do not hide-in-place)
- [x] Details drawer: person, position, department, location, manager,
      secondary managers, direct reports, downstream count
- [x] Search: person / email / title / department / location; focus + expand
      ancestors + open drawer
- [x] Filters: department, location, employment status, position status;
      composable; badges; Clear All
- [x] Drag/reparent in LIVE mode with preview → validate → confirm → audit
- [x] PLANNING mode overlay (writes `ScenarioChange` only; chart reads live graph + overlay)
- [x] Keyboard navigation for selected node (arrows along primary edges)
- [x] Audit event listing for a change
- [x] Persistence: reload retains reparent
- [x] Mock connector identities visible on records (“where this came from”)

**Phase 1 done when:** the 14-point first-demo checklist in the project brief
is satisfied, with sample external data coming from `MICROSOFT_MOCK`.

---

## Phase 2 — Data connection

- [x] CSV import wizard (upload → map → validate → preview → apply; XLSX via save-as-CSV)
- [x] Staged import tables; apply with cycle detection
- [x] Duplicate / circular reporting detection on import
- [ ] `ConnectorAdapter` interface + registry
- [ ] `MOCK_MICROSOFT_CONNECTOR` generating realistic data
- [ ] `REAL_MICROSOFT_CONNECTOR` (Graph, read-only) behind env credentials
- [ ] Sync engine: normalise → map → validate → diff → preview → apply
- [ ] Sync job statuses, statistics, correlation IDs
- [ ] `InProcessJobQueue` (no Redis yet)
- [ ] Integration dashboard: last sync, health, errors
- [ ] Field provenance + `EXTERNAL_WINS` conflict strategy
- [x] Export CSV / XLSX of directory (PNG/PDF via browser print; PPTX later)
- [x] Formula-injection sanitisation on CSV/XLSX export

---

## Phase 3 — Organisational intelligence

- [ ] People directory (search, filter, sort, pagination)
- [ ] Secondary / dotted-line managers as first-class chart edges
- [ ] Custom fields (definition + values + privacy)
- [x] Scenarios: overlay + compare LIVE vs SCENARIO (create/duplicate still later)
- [ ] Snapshots: manual + automatic pre-sync / pre-import
- [x] Reports: vacancy, span-of-control, department size (dashboard + reports)
- [x] Chart surfaces: hierarchy, faces, directory, grid; spotlight; legend
- [ ] `DEPARTMENT` / `LOCATION` grouping node types

---

## Phase 4 — Collaboration

- [ ] Export CSV / XLSX / PNG / PDF (PPTX architecture only)
- [ ] Authenticated internal sharing
- [x] `ShareLink` (token, expiry, optional password, allow-list fields)
- [x] iframe embed + CSP `frame-ancestors`
- [ ] Entra ID SSO as a production login path
- [x] Field-level privacy on share/embed surfaces (export already sanitised)

---

## Phase 5 — Additional integrations

- [ ] Google Workspace adapter
- [ ] Generic REST adapter framework
- [ ] HRIS adapter framework (BambooHR as the first example)

---

## Deferred items

Each item is a real requirement that is **not** silently simplified. It is
out of the current phase because a dependency is not yet in place or because
shipping it earlier would couple the core to infrastructure we do not need.

### D1. Redis / BullMQ job queue

- **Reason:** In-process jobs are sufficient for a single-node demo and for
  organisations of ~1,000 people. Redis is operational complexity we have not
  earned.
- **Dependency:** Phase 2 sync engine + a deployment that has more than one
  app instance, or syncs that outlive an HTTP request.
- **Recommended implementation:** implement `BullMqJobQueue` against the
  existing `JobQueue` interface; swap in `src/lib/jobs/index.ts`. Persist
  job identity in `SyncJob` so in-flight work survives the cutover.

### D2. Outbound write-back to Microsoft / any HRIS

- **Reason:** v1 connectors are read-only by product decision. Pushing
  drag/drop back into Entra ID would make Omni a system of record for
  identity, which it is not.
- **Dependency:** explicit product decision, Graph `User.ReadWrite.All` (or
  narrower), conflict UX, and a legal/HR review.
- **Recommended implementation:** add `push*` methods to `ConnectorAdapter`
  as optional (`implements WritableConnector`), defaulting to unsupported.
  Never call them from Live-mode reparent.

### D3. `BOTTOM_UP`, `MATRIX`, `GOVERNANCE` layouts

- **Reason:** ELK hierarchical layout covers `TOP_DOWN` / `LEFT_RIGHT` (and
  trivially `BOTTOM_UP`). Matrix and governance are different layout
  *algorithms*, not option tweaks.
- **Dependency:** Phase 1 canvas + a real customer who needs them.
- **Recommended implementation:** register additional `LayoutStrategy`
  implementations; MATRIX is a layered ELK graph with a second axis;
  GOVERNANCE is a non-tree layout that treats committees as first-class
  nodes.

### D4. PPTX export

- **Reason:** PNG/PDF cover the first sharing need; PPTX is a specialised
  renderer.
- **Dependency:** Phase 4 export pipeline (so permissions, filters and
  private-field stripping already exist).
- **Recommended implementation:** `ExportRenderer` interface; a `PptxRenderer`
  using `pptxgenjs` that consumes the same laid-out chart model as PNG.

### D5. Field-level ACLs beyond PUBLIC / INTERNAL / ADMIN_ONLY

- **Reason:** Three visibility tiers cover the stated privacy model. True
  per-field, per-role ACLs need a policy table and a UI to maintain it.
- **Dependency:** Phase 3 custom fields shipping, plus a customer who has
  fields that are neither org-wide internal nor admin-only (e.g. compensation
  visible to HRBP but not to Engineering Admin).
- **Recommended implementation:** `FieldAccessPolicy` rows
  `(organisationId, fieldKey, role, effect)` evaluated inside the existing
  DTO redactor so every surface stays honest.

### D6. Real Microsoft Graph in local development

- **Reason:** Local demo must not require tenant credentials. The mock
  connector is the default.
- **Dependency:** An Entra app registration (see `docs/MICROSOFT_SETUP.md`)
  and `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` / `MICROSOFT_TENANT_ID`.
- **Recommended implementation:** already designed. Set
  `MICROSOFT_CONNECTOR_MODE=real` and the registry resolves
  `REAL_MICROSOFT_CONNECTOR`. No application code change.

### D7. Webhook-triggered sync

- **Reason:** Graph change notifications need a public HTTPS endpoint,
  client-state validation and a subscription renewer. Manual + cron cover
  Phase 2.
- **Dependency:** A deployed public URL and a working Graph connector.
- **Recommended implementation:** `SyncTrigger.WEBHOOK` is already on the
  enum. Add a `/api/v1/connectors/:id/webhook` route that verifies the
  Graph `clientState` and enqueues a `PREVIEW` or `APPLY` job.

### D8. Full scenario apply-to-live

- **Reason:** Applying a scenario mutates production structure. Isolation
  (Phase 3) is the hard part; promotion is a later, audited, permissioned
  action that needs a review workflow.
- **Dependency:** Phase 3 scenario overlay + snapshot + comparison.
- **Recommended implementation:** `Scenario.status = APPROVED` then an
  `ADMIN`-only `applyScenario()` that writes live rows inside one
  transaction, emitting `SCENARIO_APPLIED` and a post-apply snapshot.

### D9. `LINKED_CHART` position type

- **Reason:** Requires multiple charts and a navigation model we do not have
  until Phase 4 sharing exists in earnest.
- **Dependency:** Phase 1 charts + Phase 4 share/embed.
- **Recommended implementation:** a position of type `LINKED_CHART` stores
  `metadata.linkedChartId`; clicking it swaps the canvas data source.

### D10. Platform-admin (cross-tenant) console

- **Reason:** `User.isPlatformAdmin` is modelled so support access is not a
  hack later. Building the console now would distract from the org-chart
  demo.
- **Dependency:** More than one real organisation in production.
- **Recommended implementation:** a `/platform` route group gated on
  `isPlatformAdmin`, with impersonation that writes `AuditEvent.actorType =
  SYSTEM` plus the real actor id.

### D11. Prisma 7 driver adapter

- **Reason:** Prisma 7.10's installer rejects Node.js 23 (this machine). Prisma
  6.16.2 is pinned so local `npm install` succeeds.
- **Dependency:** Node 22 LTS or Node 24.
- **Recommended implementation:** restore `provider = "prisma-client"` with
  output at `src/generated/prisma`, add `@prisma/adapter-pg`, and instantiate
  `PrismaClient` with `new PrismaPg(pool)` in `src/lib/db.ts`.

---

- **Reason:** Requires multiple charts and a navigation model we do not have
  until Phase 4 sharing exists in earnest.
- **Dependency:** Phase 1 charts + Phase 4 share/embed.
- **Recommended implementation:** a position of type `LINKED_CHART` stores
  `metadata.linkedChartId`; clicking it swaps the canvas data source.

### D11. Prisma 7 driver adapter

- **Reason:** Prisma 7.10's installer rejects Node.js 23 (this machine). Prisma
  6.16.2 is pinned so local `npm install` succeeds.
- **Dependency:** Node 22 LTS or Node 24.
- **Recommended implementation:** restore `provider = "prisma-client"` with
  output at `src/generated/prisma`, add `@prisma/adapter-pg`, and instantiate
  `PrismaClient` with `new PrismaPg(pool)` in `src/lib/db.ts`.

- **Reason:** `User.isPlatformAdmin` is modelled so support access is not a
  hack later. Building the console now would distract from the org-chart
  demo.
- **Dependency:** More than one real organisation in production.
- **Recommended implementation:** a `/platform` route group gated on
  `isPlatformAdmin`, with impersonation that writes `AuditEvent.actorType =
  SYSTEM` plus the real actor id.

---

## Testing contract (all phases)

Domain tests (Vitest, no database):

- hierarchy construction
- cycle detection
- manager reassignment validation
- permissions
- field privacy redaction
- vacant-position derivation
- multiple assignments
- dotted-line vs primary rendering classification
- scenario isolation (pure overlay)
- sync idempotency (hash equality)

Integration tests (Vitest + Postgres):

- CSV import staging and apply
- duplicate identity detection
- reparent persistence + audit in the same transaction
- scenario writes do not mutate live tables

Playwright (against seeded demo):

- Login
- Open chart
- Search employee
- Filter department
- Select employee
- Navigate reporting chain
- Create vacancy
- Move position
- Undo/cancel scenario
- Import CSV
- View sync history

Playwright flows that belong to a later phase are skipped with
`test.skip(phase < N)` rather than deleted.

---

## Working agreement

1. Do not start Phase N+1 while Phase N is broken.
2. Do not leave major features as non-functional buttons.
3. If a Microsoft credential is missing, ship the adapter + mock and
   document the gap (D6) — do not stub the product.
4. Every structural write emits an `AuditEvent` in the same transaction.
5. `src/domain/**` remains free of Prisma, Next.js and React.
