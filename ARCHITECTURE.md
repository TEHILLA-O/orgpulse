# Omni — Architecture

> Internal organisational intelligence and interactive org-chart platform.

This document describes the system architecture, the layering rules, and the
reasoning behind the significant decisions. It is the entry point for any
engineer joining the project.

Companion documents:

- [`DATA_MODEL.md`](./DATA_MODEL.md) — entities, relationships, invariants
- [`INTEGRATIONS.md`](./INTEGRATIONS.md) — connector framework and sync engine
- [`SECURITY.md`](./SECURITY.md) — threat model, RBAC, privacy, deployment
- [`TODO.md`](./TODO.md) — implementation plan and deferred work
- [`docs/MICROSOFT_SETUP.md`](./docs/MICROSOFT_SETUP.md) — Entra ID configuration

---

## 1. Product framing

Omni is **not** a diagram editor. A diagram editor stores shapes and lines.
Omni stores an organisational *graph* — positions and the reporting edges
between them — and *derives* a diagram from it.

That distinction drives nearly every architectural decision in this document:

| Diagram tool                            | Omni                                                |
| --------------------------------------- | ------------------------------------------------------- |
| The picture is the source of truth       | The graph is the source of truth; the picture is derived |
| A box is a person                        | A node is a **position**; a person is *assigned* to it   |
| Deleting a box deletes the data          | Structure is versioned, soft-deleted and audited         |
| Layout is manual                         | Layout is computed (ELK) and reproducible                |
| Import is a one-off paste                | Ingestion is a repeatable, idempotent sync pipeline      |

Omni is an original product. It deliberately shares no branding, visual
identity, asset, copy or implementation with any commercial org-chart vendor.

---

## 2. Architectural principles

1. **People and positions are separate entities.** The hierarchy lives on
   positions, never on people. See §5.
2. **Business logic never lives in React components.** Components render; the
   domain layer decides. See §4.
3. **The core knows nothing about any external system.** Microsoft Graph, CSV
   and BambooHR are all just `ConnectorAdapter` implementations behind the same
   interface.
4. **Authorisation is a server-side decision.** UI affordances are a
   convenience, never a control. Every read and write re-checks permission.
5. **Privacy is enforced at the serialisation boundary.** Data is redacted
   before it leaves the server, not hidden in the browser.
6. **Everything organisationally meaningful is auditable.** Structural changes
   write an `AuditEvent` in the same transaction as the change.
7. **Defer infrastructure until it earns its place.** Background jobs go behind
   an interface now so Redis/BullMQ can arrive later without a rewrite — but we
   do not run Redis to render a chart.

---

## 3. Technology stack

| Concern              | Choice                                   | Notes                                                     |
| -------------------- | ---------------------------------------- | --------------------------------------------------------- |
| Framework            | Next.js 16 (App Router), React 19        | Server Components for data-heavy pages                     |
| Language             | TypeScript, `strict` + `noUncheckedIndexedAccess` | No `any` in domain code                          |
| Styling              | Tailwind CSS v4, shadcn/ui, Lucide       | shadcn components are vendored into `src/components/ui`    |
| Graph rendering      | `@xyflow/react` (React Flow 12)          | Custom position nodes and relationship edges               |
| Graph layout         | ELK.js (`elkjs`), in a Web Worker        | Deterministic hierarchical layout, off the main thread     |
| Database             | PostgreSQL 16                            | Recursive CTEs for hierarchy queries                       |
| ORM                  | Prisma 7 + `@prisma/adapter-pg`          | Parameterised access only; no raw string interpolation     |
| Validation           | Zod 4                                    | One schema per boundary; inferred types flow inward        |
| Server state         | TanStack Query 5                         | Client caches; Server Components handle first paint        |
| Auth                 | Auth.js v5 (`next-auth@5`)               | Credentials for local dev, Entra ID/OIDC for production    |
| Logging              | Pino                                     | Structured JSON, correlation IDs, redaction rules          |
| Unit/integration     | Vitest 4                                 | Domain logic tested without a browser                      |
| End-to-end           | Playwright                               | Real browser against a seeded database                     |
| Packaging            | Docker + docker-compose                  | Compose for dev; the image is cloud-deployable unchanged   |

### Version notes

- **Prisma**: `prisma`'s npm `latest` tag currently points at an `8.0.0-rc`.
  Architecture targets Prisma 7 + `@prisma/adapter-pg`. This workspace currently
  pins **Prisma 6.16.2** because Prisma 7.10 refuses to install on Node.js 23
  (it allows 20.19+, 22.12+ or 24+ only). Upgrade to Prisma 7 when the runtime
  is Node 22 LTS or 24; the schema itself is already 7-compatible aside from
  the generator/adapter wiring.
- **Auth.js**: v5 is the only line that supports the App Router properly. It is
  published under the `beta` tag but is the de facto stable release for Next.js
  App Router. Pinned exactly; see `TODO.md` for the upgrade watch item.

---

## 4. Layering

Strict dependency direction. **Arrows point inward only.**

```
┌──────────────────────────────────────────────────────────────────┐
│  app/            Next.js routes, layouts, Server/Client Components│
│                  Route handlers under app/api/v1/**               │
├──────────────────────────────────────────────────────────────────┤
│  components/     Presentational + interactive UI. No data access. │
├──────────────────────────────────────────────────────────────────┤
│  server/         Composition: auth context, request handlers,     │
│                  DTO serialisation, permission enforcement        │
├──────────────────────────────────────────────────────────────────┤
│  domain/         Pure business logic. Hierarchy, cycle detection, │
│                  diffing, scenario merge, layout preparation.     │
│                  ★ NO Prisma, NO Next.js, NO React imports ★      │
├──────────────────────────────────────────────────────────────────┤
│  repositories/   The ONLY place Prisma is used. Returns domain    │
│                  types, not Prisma models.                        │
├──────────────────────────────────────────────────────────────────┤
│  lib/            Cross-cutting: db client, logger, config, errors │
└──────────────────────────────────────────────────────────────────┘
```

The rule that matters most: **`src/domain/**` must be importable and testable
without a database, a browser, or a Next.js runtime.** This is enforced by an
ESLint `no-restricted-imports` rule, not by convention alone. It is what makes
cycle detection, scenario merging and diffing cheap to test exhaustively.

### Directory layout

```
src/
├── app/
│   ├── (auth)/                  Sign-in, error pages
│   ├── (app)/                   Authenticated shell: sidebar + topbar
│   │   ├── dashboard/
│   │   ├── organisation/
│   │   ├── people/
│   │   ├── positions/
│   │   ├── departments/
│   │   ├── locations/
│   │   ├── charts/[chartId]/    Full-bleed chart canvas
│   │   ├── scenarios/
│   │   ├── reports/
│   │   ├── integrations/
│   │   └── administration/
│   ├── (embed)/                 Share-link / iframe surface, no app chrome
│   └── api/v1/**                REST route handlers
├── components/
│   ├── ui/                      shadcn primitives (vendored)
│   ├── chart/                   React Flow nodes, edges, controls, drawer
│   ├── layout/                  Sidebar, topbar, shells
│   └── shared/                  Cross-feature widgets
├── domain/
│   ├── org/                     Hierarchy, reporting graph, cycle detection
│   ├── chart/                   Node/edge projection, collapse, filtering
│   ├── layout/                  ELK graph construction (pure)
│   ├── scenario/                Scenario overlay + comparison
│   ├── sync/                    Normalisation, diff engine, conflict strategy
│   ├── import/                  Staged import analysis
│   ├── privacy/                 Field visibility resolution
│   └── permissions/             RBAC policy
├── server/
│   ├── auth/                    Auth.js config, session/context resolution
│   ├── services/                Use-case orchestration (transaction owners)
│   ├── dto/                     Serialisers: entity -> permission-scoped DTO
│   └── http/                    Handler wrapper, error mapping, rate limiting
├── repositories/                Prisma data access
├── connectors/
│   ├── registry.ts
│   ├── types.ts                 ConnectorAdapter interface
│   ├── csv/
│   ├── microsoft-mock/
│   └── microsoft-graph/
├── lib/                         db, logger, config, errors, utils
└── generated/                   Prisma client output (git-ignored)
```

---

## 5. The core modelling decision

> **A person and a position are not the same entity.**

```
   Person ──< Assignment >── Position ──< ReportingRelationship >── Position
                                 │
                                 ├── Department
                                 └── Location
```

The reporting graph is defined **between positions**. A person participates in
the hierarchy only transitively, through an `Assignment`.

This is not academic pedantry. It is what makes the following possible without
schema changes:

- A **vacancy** is a position with no active assignment. It still occupies its
  place in the hierarchy and still has direct reports.
- A **job share** is two people assigned to one position at 50% each.
- A **person holding two roles** is two assignments, one marked `isPrimary`.
- **Succession and restructure planning** operate on positions; you can move a
  role before you know who fills it.
- **A leaver** ends an assignment. The position — and everyone reporting into
  it — is untouched.

Storing `managerId` on a `Person` row makes every one of the above either
impossible or a hack. See `DATA_MODEL.md` §2 for the full treatment.

### Reporting relationships

A position has **at most one** `PRIMARY` manager and **any number** of
`SECONDARY`, `DOTTED_LINE`, `FUNCTIONAL` or `PROJECT` managers.

Two invariants are enforced in the domain layer and re-checked in the database
write transaction:

1. **No self-reporting** — `subordinatePositionId !== managerPositionId`.
2. **No cycles in the primary graph** — the `PRIMARY` edge set must remain a
   forest. Non-primary edge types are explicitly permitted to form cycles,
   because matrix organisations genuinely contain them.

Cycle detection runs before any reparent is persisted. It is a pure function
over an adjacency map (`src/domain/org/cycle.ts`) and is exhaustively unit
tested.

---

## 6. Chart pipeline

Rendering is a pipeline of pure transformations. Each stage is independently
testable and memoisable.

```
Positions + Assignments + Relationships   (repository, permission-scoped)
                  ↓
          buildReportingGraph()            adjacency + ancestor index
                  ↓
          applyFilters()                   department / location / status / ...
                  ↓
          applyCollapseState()             prune subtrees under collapsed nodes
                  ↓
          projectToChartModel()            ChartNode[] / ChartEdge[]
                  ↓
          elkLayout()                      x/y coordinates (Web Worker)
                  ↓
          React Flow render
```

Design consequences:

- **Collapse prunes, it does not hide.** Nodes under a collapsed branch are
  never handed to React Flow, so a 1,000-position organisation renders only
  what is on screen. Collapse state is UI state; no data is deleted.
- **Layout runs in a Web Worker.** ELK on 1,000 nodes is measured in hundreds of
  milliseconds; that must not block input.
- **Layout is keyed and cached.** The cache key is a hash of the visible node
  set, edge set and layout direction. Panning, zooming and selecting never
  trigger re-layout.
- **`TOP_DOWN` and `LEFT_RIGHT` ship first.** They differ only in ELK options,
  so `BOTTOM_UP`, `MATRIX` and `GOVERNANCE` slot into the same
  `LayoutStrategy` registry without touching the pipeline.

### Performance budget

Target: 1,000 positions, mid-range laptop.

| Stage                        | Budget  | Technique                                  |
| ---------------------------- | ------- | ------------------------------------------ |
| Server query                 | <150 ms | Single flat fetch, indexed, no N+1          |
| Graph build + filter         | <20 ms  | `Map`-based adjacency, no repeated scans    |
| ELK layout                   | <800 ms | Web Worker, cached by visible-set hash      |
| React Flow render            | 60 fps  | Memoised custom nodes, `onlyRenderVisibleElements` |

Anti-patterns explicitly banned: recursive component trees that recompute
descendants on every render, `array.find()` inside a render loop, and fetching
per-node data from the client.

---

## 7. Live mode vs planning mode

The chart canvas has two modes, and they write to different places.

| | **Live mode** | **Planning mode** |
| --- | --- | --- |
| Writes to | Live organisational tables | `ScenarioChange` rows only |
| Requires | `EDITOR` or above | `EDITOR` or above on the scenario |
| Audited | Yes, `AuditEvent` per change | Yes, scoped to the scenario |
| Affects other users | Immediately | Never |
| Pushes to external HRIS | **No — read-only in v1** | No |

A scenario is a **copy-on-write overlay** on top of a `Snapshot`. Reading a
scenario chart means: load the snapshot's positions and edges, then apply the
ordered `ScenarioChange` list in memory. No live row is ever mutated, which
makes scenario isolation a property we can test directly rather than hope for.

Comparison (`LIVE` vs `SCENARIO`) is a diff of the two projected graphs,
reported as positions added/removed/moved, reporting lines changed and
vacancies created.

---

## 8. Integration architecture

Fully specified in [`INTEGRATIONS.md`](./INTEGRATIONS.md). The architectural
commitment is a single sentence:

> **No file outside `src/connectors/microsoft-graph/` may contain
> Microsoft-specific logic.**

Every source implements one interface:

```ts
interface ConnectorAdapter {
  getMetadata(): ConnectorMetadata;
  testConnection(cfg): Promise<ConnectionTestResult>;
  authenticate(cfg): Promise<AuthResult>;
  pullPeople(ctx): AsyncIterable<ExternalPerson>;
  pullPositions(ctx): AsyncIterable<ExternalPosition>;
  pullDepartments(ctx): AsyncIterable<ExternalDepartment>;
  pullLocations(ctx): AsyncIterable<ExternalLocation>;
  pullRelationships(ctx): AsyncIterable<ExternalRelationship>;
  pullPhotos(ctx): AsyncIterable<ExternalPhoto>;
  getChanges(cursor): AsyncIterable<ExternalChange>;
}
```

Adapters yield **raw external shapes**. They never touch Prisma, never decide
what a "department" means locally, and never write to the database. The sync
engine owns normalisation, mapping, validation, diffing and persistence.

```
Source → Adapter → Raw objects → Normalise → Field map → Validate
       → Diff → Preview → Apply (idempotent upsert) → Audit
```

Identity is anchored by `ExternalIdentity(provider, externalId, entityType)`,
carrying `syncHash` so an unchanged record is detected without a field-by-field
comparison. This is what makes sync idempotent: running the same sync twice
produces zero writes on the second run.

Microsoft ships in two implementations behind the same interface:
`MOCK_MICROSOFT_CONNECTOR` (realistic generated data, the default for local
development) and `REAL_MICROSOFT_CONNECTOR` (Microsoft Graph, read-only,
requires tenant credentials).

### Background jobs

`JobQueue` is an interface. The v1 implementation is
`InProcessJobQueue` — a bounded, in-process worker that persists state to the
`SyncJob` table so restarts are visible rather than silent. `BullMqJobQueue`
can be added later by implementing the same interface; no caller changes.

---

## 9. Security and privacy posture

Full detail in [`SECURITY.md`](./SECURITY.md). Architectural summary:

- **RBAC** — `OWNER > ADMIN > EDITOR > VIEWER`, scoped per organisation via
  `OrganisationMembership`. Evaluated by a pure policy function in
  `src/domain/permissions/`, enforced in `src/server/`.
- **Every route handler is wrapped.** The wrapper resolves the session,
  establishes the organisation context, applies rate limits, validates input
  with Zod, attaches a correlation ID and maps errors. A handler cannot forget
  to authenticate, because an unwrapped handler does not compile against the
  route contract.
- **Field visibility** — `PUBLIC | INTERNAL | ADMIN_ONLY`. Resolved server-side
  in `src/server/dto/`. Private custom fields are stripped **before**
  serialisation, so they cannot leak through share links, embeds or exports.
- **Secrets** — connector credentials and OAuth tokens are encrypted at rest
  (AES-256-GCM, key from `ENCRYPTION_KEY`). Never logged; Pino redaction paths
  cover `authorization`, `password`, `token`, `secret`, `accessToken`,
  `refreshToken`.
- **Exports** — CSV/XLSX cell values are neutralised against formula injection.
- **Embeds** — `ShareLink` tokens are high-entropy, optionally password
  protected, expiring and revocable; embed responses set a restrictive CSP with
  an explicit `frame-ancestors` allow-list.

---

## 10. API

REST under `/api/v1`, versioned so the surface can evolve without breaking
embeds or future scripted clients.

```
/api/v1/organisations   /api/v1/people        /api/v1/positions
/api/v1/departments     /api/v1/locations     /api/v1/relationships
/api/v1/charts          /api/v1/scenarios     /api/v1/snapshots
/api/v1/connectors      /api/v1/sync-jobs     /api/v1/imports
/api/v1/search          /api/v1/reports       /api/v1/audit-events
```

Conventions: cursor pagination on collections, Zod-validated bodies and query
strings, RFC 7807-style problem responses carrying a user-safe `message` and an
internal `errorId` that correlates to the server log. Stack traces are never
returned to clients.

An OpenAPI 3.1 document is generated from the Zod schemas so it cannot drift
from the implementation.

---

## 11. Observability

Structured Pino logging. Every request and every sync job carries a
`correlationId` that appears on all related log lines, the `SyncJob` row and
any `AuditEvent` written during the operation — so an audit entry can be traced
back to the exact job and log stream that produced it.

Errors carry two faces: a safe message for the user and an `errorId` for the
operator.

---

## 12. Deployment

`docker compose up` starts PostgreSQL (and the app, optionally) for local
development. The application image is a standard multi-stage Node build using
Next.js standalone output — it holds no compose-specific assumptions and runs
unchanged on any container host. All environment-specific configuration is
injected through environment variables, validated at boot by a Zod schema in
`src/lib/config.ts` so a misconfigured deployment fails fast and loudly rather
than at first request.

---

## 13. Build phases

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 0 | Foundation: repo, docs, schema, auth, RBAC, seed, Docker | in progress |
| 1 | Core org chart: React Flow, ELK, drawer, search, filters, drag/reparent, audit | planned |
| 2 | Data connection: CSV/XLSX import, connectors, mock + Graph, sync engine | planned |
| 3 | Organisational intelligence: directory, custom fields, scenarios, snapshots, reports | planned |
| 4 | Collaboration: export, sharing, embed, SSO | planned |
| 5 | Additional integrations: Google Workspace, generic REST, HRIS framework | planned |

Phase N+1 does not begin while Phase N is broken. Current status and deferred
items are tracked in [`TODO.md`](./TODO.md).
