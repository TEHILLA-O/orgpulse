# Omni — Integrations

How external organisational data enters the system, and how the core stays
ignorant of any particular vendor.

This document is the contract for every connector. Microsoft Graph is the
first *production* adapter; it is not special inside the domain.

---

## 1. Non-negotiable rule

**No file outside `src/connectors/<adapter>/` may contain vendor-specific
logic.** The rest of Omni speaks only in normalised domain types and
`ExternalIdentity` rows.

CSV, Microsoft 365, Entra ID, Google Workspace, BambooHR and a future HRIS
are interchangeable behind `ConnectorAdapter`. Adding a source must never
require rewriting the core application.

---

## 2. ConnectorAdapter

```ts
interface ConnectorAdapter {
  getMetadata(): ConnectorMetadata;
  testConnection(cfg: ConnectorConfig): Promise<ConnectionTestResult>;
  authenticate(cfg: ConnectorConfig): Promise<AuthResult>;
  pullPeople(ctx: PullContext): AsyncIterable<ExternalPerson>;
  pullPositions(ctx: PullContext): AsyncIterable<ExternalPosition>;
  pullDepartments(ctx: PullContext): AsyncIterable<ExternalDepartment>;
  pullLocations(ctx: PullContext): AsyncIterable<ExternalLocation>;
  pullRelationships(ctx: PullContext): AsyncIterable<ExternalRelationship>;
  pullPhotos(ctx: PullContext): AsyncIterable<ExternalPhoto>;
  getChanges(ctx: PullContext, cursor: string | null): AsyncIterable<ExternalChange>;
}
```

### Responsibilities

| Adapter does | Adapter does not |
| ------------ | ---------------- |
| Authenticate with the source | Touch Prisma |
| Yield raw external objects | Decide what a “department” means locally |
| Honour the incremental cursor | Write `Person` / `Position` rows |
| Surface source errors with an `errorId` | Apply field mappings |
| Hash nothing domain-related | Resolve conflicts |

`ConnectorMetadata` declares: provider id, display name, supported entities,
auth scheme (`OAUTH2_OIDC` | `API_KEY` | `NONE`), whether incremental sync
is available, and whether the adapter is read-only (v1: always yes).

Optional `push*` methods are **not** on the v1 interface. See TODO D2.

---

## 3. Registry

`src/connectors/registry.ts` maps `ConnectorProvider` → factory.

```
CSV                → CsvConnector
MICROSOFT_MOCK     → MockMicrosoftConnector      (default in local/dev)
MICROSOFT_GRAPH    → MicrosoftGraphConnector     (requires tenant credentials)
GOOGLE_WORKSPACE   → (Phase 5)
BAMBOO_HR          → (Phase 5)
GENERIC_REST       → (Phase 5)
```

Resolution is data-driven from the `Connector` row. The application never
`switch`es on provider names outside the registry.

Mode flag `MICROSOFT_CONNECTOR_MODE=mock|real` controls which Microsoft
factory the registry returns for `MICROSOFT_GRAPH` *requests in development*.
Production deployments that have not supplied credentials refuse to
instantiate the real adapter rather than silently falling back — falling
back would hide a misconfiguration.

---

## 4. Identity and provenance

Every external object is anchored by an `ExternalIdentity`:

| Field | Purpose |
| ----- | ------- |
| `provider` | Which adapter produced it |
| `externalId` | Stable id in the source |
| `entityType` | `PERSON` \| `POSITION` \| `DEPARTMENT` \| `LOCATION` \| `RELATIONSHIP` |
| `lastSeenAt` | Last successful pull that still contained it |
| `sourceModifiedAt` | Source's own modified timestamp, if any |
| `syncHash` | Hash of the *mapped* local fields |

Unique: `(organisationId, provider, entityType, externalId)`.

A person may have identities in several systems at once. That is why
`Person.externalIdentifiers` is **not** a JSON column.

Per-field provenance (`FieldProvenance`) records, for each managed field:

```
jobTitle: { value, source: MICROSOFT_365, lastSyncedAt, isLocallyOverridden }
```

---

## 5. Sync pipeline

```
Source system
    → ConnectorAdapter          raw external objects
    → Normalisation             canonical External* shapes, UTF-8, empty→null
    → Field mapping             sourceField → targetField via FieldMapping
    → Validation                Zod + domain invariants
    → Diff engine               compare syncHash; classify create/update/unchanged/deactivate
    → Preview                   SyncRecord rows, mode = PREVIEW
    → Apply                     idempotent upserts inside a transaction
    → Audit                     AuditEvent per applied mutation, same transaction
```

### Statuses

`QUEUED` → `RUNNING` → `COMPLETED` | `COMPLETED_WITH_WARNINGS` | `FAILED`

Statistics stored on `SyncJob`: `created`, `updated`, `unchanged`,
`deactivated`, `errors`.

### Idempotency

The apply step is a no-op when `incoming.syncHash === stored.syncHash`.
Re-running the same pull twice produces zero writes on the second run. This
is a tested property, not a hope.

### Destructive operations

Manual syncs that would deactivate records must be run as `PREVIEW` first
and require an explicit `APPLY`. Scheduled syncs honour a connector flag
`autoDeactivate`; the default is `false`.

A `PRE_SYNC` snapshot is taken before any `APPLY` that may deactivate.

---

## 6. Conflict strategy

v1 rule, behind a `ConflictStrategy` interface:

> For a field claimed by a connector: **external source wins**, unless
> `FieldProvenance.isLocallyOverridden` is set, in which case the conflict
> is surfaced in the preview and the local value is left untouched.

Fields never claimed by any connector remain local-only. Sync never writes
them.

Future strategies (`LOCAL_WINS`, `MANUAL_REVIEW`) plug in without touching
the pipeline. Do not scatter `if (source === 'MICROSOFT')` through services.

---

## 7. Field mapping

`FieldMapping` rows are per-connector and per-entity. Transforms are names
from a fixed registry (`trim`, `lower`, `parseDateISO`, `splitDisplayName`)
— **never evaluated code**.

Recognised local targets for people/positions include:

`firstName`, `lastName`, `displayName`, `preferredName`, `email`, `phone`,
`title`, `department`, `managerEmail`, `location`, `employeeId`,
`employmentType`, `startDate`.

Unmapped source fields are retained on `metadata.unmapped` for diagnosis
and never silently dropped from the preview.

---

## 8. Microsoft adapters

### Mock (`MOCK_MICROSOFT_CONNECTOR`)

Generates a deterministic, realistic organisation (seeded RNG). No network,
no secrets. Used by:

- local development (default)
- Vitest integration tests
- Playwright “load sample external data”

It implements the full adapter, including `getChanges`, so the sync engine
is exercised end-to-end without a tenant.

### Real (`REAL_MICROSOFT_CONNECTOR`)

Read-only Microsoft Graph. Least-privilege application permissions; see
[`docs/MICROSOFT_SETUP.md`](./docs/MICROSOFT_SETUP.md).

Imported when the source provides them:

| Graph | Local |
| ----- | ----- |
| `id` | `ExternalIdentity.externalId` |
| `displayName` | `Person.displayName` |
| `givenName` / `surname` | `firstName` / `lastName` |
| `mail` / `userPrincipalName` | `email` |
| `jobTitle` | `Position.title` |
| `department` | `Department.name` (matched or created) |
| `officeLocation` | `Location.name` (matched or created) |
| `manager` relationship | `ReportingRelationship` (PRIMARY) |
| `/photos` | `Person.profilePhotoUrl` (stored locally) |

OAuth2/OIDC client-credentials (app-only) for daemon sync; delegated
authorization-code for interactive admin consent. Tokens are encrypted at
rest (`encryptedCredentials`, AES-256-GCM) and never logged.

If credentials are absent, the real adapter is not instantiable. The mock
remains available. This is documented, not hidden.

**v1 is read-only.** Omni will not patch Graph users.

---

## 9. CSV / XLSX (first-class connector)

CSV and XLSX are adapters, not a back door into `prisma.person.create`.

Wizard:

1. Upload (MIME + extension allow-list, size cap, malware-naive but
   structurally validated)
2. Analyse columns
3. Map fields
4. Validate
5. Preview changes (new / changed / missing / duplicate / invalid manager /
   circular / unknown department / unknown location)
6. Import (staged apply)
7. Results

Required/recognised columns: `firstName`, `lastName`, `displayName`,
`email`, `title`, `department`, `managerEmail`, `location`, `employeeId`.

Staged rows live in `ImportJob` / `ImportRow` until applied or expired.
Apply is idempotent on `(organisationId, email | employeeId)`.

CSV formula injection is neutralised on the way **out** (exports) by
prefixing cells that start with `=`, `+`, `-`, `@`, tab or CR with a
single quote. Imports never `eval` cell text.

---

## 10. Job execution

`JobQueue` is an interface.

v1: `InProcessJobQueue` — bounded concurrency, state persisted on `SyncJob`
so a process restart leaves jobs in `FAILED` or re-runnable `QUEUED` rather
than vanishing.

Later: `BullMqJobQueue` (TODO D1). Callers depend only on the interface.

Every job has a `correlationId` that is:

- generated before enqueue
- stored on `SyncJob`
- bound onto the Pino logger
- copied onto every `AuditEvent` written during the job

---

## 11. Scheduling

`Connector.syncSchedule` is a cron expression or null (manual only).

v1 scheduler is a single in-process interval that wakes every minute and
enqueues due jobs. It is disabled unless `SYNC_SCHEDULER_ENABLED=true`.
This is enough for one app instance; multi-instance deployments must turn
it off on all but one replica **or** introduce BullMQ (D1).

---

## 12. Error contract

Adapter and engine errors expose:

- `message` — safe for an administrator UI
- `errorId` — correlates to the log line
- `retryable` — whether the job runner should retry

Stack traces never leave the server. Graph error bodies are logged with
tokens stripped.

---

## 13. What “the core does not care” means in practice

A `Person` row has no `microsoftId` column.
A `Position` row has no `entraObjectId` column.
Services in `src/server/services/` never import from
`src/connectors/microsoft-graph/`.

If you are about to write `if (connector.provider === 'MICROSOFT_GRAPH')`
outside the registry, stop: you are breaking this architecture.
