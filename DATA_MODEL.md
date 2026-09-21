# Omni — Data Model

Authoritative description of the persistent domain model: entities, keys,
relationships, invariants and indexing strategy. The Prisma schema in
[`prisma/schema.prisma`](./prisma/schema.prisma) is the implementation of this
document; where they disagree, this document states the intent and the schema
is the bug.

---

## 1. Conventions

| Convention        | Rule                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| Primary keys      | UUID v4, generated in the database (`@default(uuid())`)                   |
| Tenancy           | Nearly every table carries `organisationId`; it is the first index column |
| Timestamps        | `createdAt` / `updatedAt` on all mutable entities                         |
| Soft deletion     | `deletedAt: DateTime?` where auditability requires it (see §9)            |
| Temporal validity | `effectiveFrom` / `effectiveTo`, or `startDate` / `endDate`               |
| Free-form data    | `metadata Json` — never used for anything queried or filtered             |
| Enums             | Postgres native enums, so invalid states are unrepresentable              |
| Money/percentages | Integers or `Decimal`; never `Float`                                      |

**Naming.** Model names are singular and PascalCase. Foreign keys are
`<relation>Id`. Join/associative entities are named for the concept they carry
(`Assignment`, `ReportingRelationship`), not for the tables they join.

---

## 2. The central decision: Person ≠ Position

This is the single most important property of the model, and the one most
commonly got wrong by org-chart tools.

```
  ┌────────┐      ┌────────────┐      ┌──────────┐
  │ Person │─────<│ Assignment │>─────│ Position │
  └────────┘      └────────────┘      └────┬─────┘
                                            │
                          ReportingRelationship (self-referencing)
                                            │
                                      ┌─────┴────┐
                                      │ Position │
                                      └──────────┘
```

**The hierarchy is stored between positions. It is never stored on a person.**

A `Person` record answers "who is this human?". A `Position` record answers
"what is this seat in the organisation?". An `Assignment` answers "who is
sitting in that seat, when, and for how much of their time?".

### Why this matters concretely

| Scenario                        | With person→manager                  | With this model                                     |
| ------------------------------- | ------------------------------------ | --------------------------------------------------- |
| Vacant role with 8 reports      | Impossible — no person to hang them on | Position with no active assignment; reports intact |
| Job share, two people at 50%    | Duplicate person rows, or a fudge     | Two assignments, `allocationPercentage = 50`        |
| One person, two roles           | Impossible                            | Two assignments, one `isPrimary = true`             |
| Employee leaves                 | Their reports become orphans          | End the assignment; the position is untouched       |
| Plan a role before hiring       | Impossible                            | `Position.status = PLANNED`, `plannedHireDate`      |
| Restructure without naming people | Impossible                           | Move positions; assignments follow or don't         |

Every one of these is a real requirement in this project. None of them is
reachable from a `Person.managerId` column, which is why that column does not
exist and must never be added.

---

## 3. Entity reference

### 3.1 Tenancy and identity

#### `Organisation`

Tenant root. Every organisational record belongs to exactly one.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | UUID | PK |
| `name` | String | Display name |
| `slug` | String | Unique, URL-safe |
| `timezone` | String | IANA, default `Europe/London` |
| `settings` | Json | Org-level preferences |
| `createdAt` / `updatedAt` | DateTime | |
| `deletedAt` | DateTime? | Soft delete |

#### `User`

An authentication principal — someone who can *sign in*. Deliberately distinct
from `Person`, who is someone who *appears in the chart*. Most staff are a
`Person` and never a `User`. A contractor administrator may be a `User` and
never a `Person`. Where both exist they are linked via `Person.userId`.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | UUID | PK |
| `email` | String | Unique, lower-cased on write |
| `name` | String? | |
| `image` | String? | |
| `emailVerified` | DateTime? | Auth.js contract |
| `passwordHash` | String? | bcrypt. **Local/dev credentials only** — null for SSO users |
| `isPlatformAdmin` | Boolean | Cross-organisation support access |
| `lastLoginAt` | DateTime? | |

Auth.js also owns `Account`, `Session` and `VerificationToken` tables. They are
infrastructure, not domain, and carry no organisational meaning.

#### `OrganisationMembership`

The RBAC edge: which user holds which role in which organisation.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `userId` / `organisationId` | UUID | Composite unique |
| `role` | `OrgRole` | `OWNER` \| `ADMIN` \| `EDITOR` \| `VIEWER` |
| `invitedAt` / `acceptedAt` | DateTime? | |

> A user with no membership row for an organisation has **no access to it at
> all** — not even read. Absence of a row is a denial, not a default.

---

### 3.2 Organisational core

#### `Person`

A human. Holds no hierarchy.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | UUID | PK |
| `organisationId` | UUID | FK |
| `userId` | UUID? | Optional link to a sign-in principal |
| `firstName` / `lastName` | String | |
| `displayName` | String | Denormalised for search and rendering |
| `preferredName` | String? | |
| `email` | String? | Unique per organisation when present |
| `phone` | String? | `INTERNAL` visibility |
| `profilePhotoUrl` | String? | |
| `status` | `PersonStatus` | `ACTIVE` \| `INACTIVE` \| `ON_LEAVE` \| `TERMINATED` \| `PENDING` |
| `startDate` / `endDate` | DateTime? | Employment dates |
| `employeeId` | String? | Unique per organisation; the usual HRIS import key |
| `metadata` | Json | |
| `createdAt` / `updatedAt` / `deletedAt` | DateTime | Soft delete |

`externalIdentifiers` is **not** a column. It is the `ExternalIdentity`
relation (§3.6) — a person can be present in Entra ID *and* BambooHR *and* a
CSV simultaneously, each with its own id, timestamps and sync hash. A JSON blob
could not carry per-source provenance.

**Indexes:** `(organisationId, status)`, `(organisationId, email)` unique,
`(organisationId, employeeId)` unique, `(organisationId, displayName)`,
`(organisationId, lastName, firstName)`.

#### `Position`

A seat in the organisation. **This is the node in the chart.**

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | UUID | PK |
| `organisationId` | UUID | FK |
| `title` | String | e.g. "Finance Analyst" |
| `code` | String? | Unique per organisation; the HRIS position code |
| `departmentId` | UUID? | |
| `locationId` | UUID? | |
| `positionType` | `PositionType` | See below |
| `employmentType` | `EmploymentType` | `FULL_TIME` \| `PART_TIME` \| `CONTRACT` \| `INTERN` \| `TEMPORARY` \| `VOLUNTEER` |
| `status` | `PositionStatus` | `ACTIVE` \| `VACANT` \| `PLANNED` \| `FROZEN` \| `CLOSED` |
| `plannedHireDate` | DateTime? | For `PLANNED` / `VACANT` |
| `headcount` | Int | Default 1; > 1 for pooled `SHARED` seats |
| `sortOrder` | Int? | Sibling ordering hint passed to ELK |
| `metadata` | Json | |
| `createdAt` / `updatedAt` / `deletedAt` | DateTime | Soft delete |

`PositionType`:

| Value | Meaning | Phase |
| ----- | ------- | ----- |
| `SINGLE` | One seat, one holder | 1 |
| `SHARED` | One seat, multiple part-allocation holders | 1 |
| `ASSISTANT` | Rendered beside its manager, not below | 1 |
| `DEPARTMENT` | Grouping node representing a whole department | 3 |
| `LOCATION` | Grouping node representing a site | 3 |
| `LINKED_CHART` | Placeholder that expands into another chart | 4 |

> **Vacancy is derived, not duplicated.** A position is vacant when it has no
> active `Assignment` on the effective date. `status = VACANT` records
> *intent*; the chart trusts the assignment check. Keeping one authoritative
> answer avoids the classic bug where the flag and the reality disagree.

**Indexes:** `(organisationId, status)`, `(organisationId, departmentId)`,
`(organisationId, locationId)`, `(organisationId, code)` unique,
`(organisationId, title)`.

#### `Assignment`

Person ↔ Position, over time.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | UUID | PK |
| `organisationId` / `personId` / `positionId` | UUID | FKs |
| `assignmentType` | `AssignmentType` | `PERMANENT` \| `INTERIM` \| `ACTING` \| `SECONDMENT` \| `TEMPORARY` |
| `startDate` | DateTime | |
| `endDate` | DateTime? | Null = current |
| `isPrimary` | Boolean | The person's main role |
| `allocationPercentage` | Int | 1–100, default 100 |
| `createdAt` / `updatedAt` / `deletedAt` | DateTime | |

**Invariants**

- A person has at most **one** `isPrimary` assignment active at any instant.
- Overlapping assignments for one person must total ≤ 100% allocation.
- `endDate` must be after `startDate`.
- A position may hold multiple concurrent assignments only when
  `positionType = SHARED` or `headcount > 1`.

**Indexes:** `(positionId, endDate)`, `(personId, endDate)`,
`(organisationId, isPrimary)`.

#### `ReportingRelationship`

The edge of the organisational graph. **Position → Position.**

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | UUID | PK |
| `organisationId` | UUID | FK |
| `subordinatePositionId` | UUID | The reporting position |
| `managerPositionId` | UUID | The position reported to |
| `relationshipType` | `RelationshipType` | `PRIMARY` \| `SECONDARY` \| `DOTTED_LINE` \| `FUNCTIONAL` \| `PROJECT` |
| `isPrimary` | Boolean | Mirrors `relationshipType = PRIMARY`; kept for partial-index enforcement |
| `effectiveFrom` | DateTime | |
| `effectiveTo` | DateTime? | Null = current |
| `label` | String? | e.g. "Programme oversight" |
| `createdAt` / `updatedAt` / `deletedAt` | DateTime | |

**Invariants — enforced in the domain layer *and* the database**

1. `subordinatePositionId != managerPositionId` (CHECK constraint).
2. At most one active `PRIMARY` manager per subordinate — partial unique index
   on `(subordinatePositionId)` where `isPrimary AND effectiveTo IS NULL AND deletedAt IS NULL`.
3. The active `PRIMARY` edge set contains **no cycles**. Not expressible as a
   constraint; enforced by `detectCycle()` inside the write transaction.
4. Non-primary edge types **may** form cycles — matrix organisations do, and
   suppressing that would misrepresent reality.

**Rendering:** `PRIMARY` → solid line. `SECONDARY`, `DOTTED_LINE`,
`FUNCTIONAL`, `PROJECT` → visually distinct dashed/dotted styling per type.

**Indexes:** `(organisationId, effectiveTo)`, `(subordinatePositionId, relationshipType)`,
`(managerPositionId, relationshipType)`, plus the partial unique index above.

#### `Department`

Self-referencing tree, independent of the reporting graph. Departments describe
*function*; reporting relationships describe *authority*. They are frequently
not the same shape, so they are not the same structure.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` / `organisationId` | UUID | |
| `name` | String | |
| `code` | String? | Unique per organisation |
| `parentDepartmentId` | UUID? | Self-FK |
| `colour` | String? | Chart accent |
| `headPositionId` | UUID? | Optional department head |
| `deletedAt` | DateTime? | Soft delete |

#### `Location`

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` / `organisationId` | UUID | |
| `name` | String | |
| `country` / `city` | String? | |
| `address` | String? | |
| `timezone` | String? | |
| `latitude` / `longitude` | Decimal? | Not `Float` |
| `deletedAt` | DateTime? | Soft delete |

---

### 3.3 Charts

#### `Chart`

A saved *view* of the organisation. Charts never own structure; they reference
it. Deleting a chart cannot delete a position.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` / `organisationId` | UUID | |
| `name` / `description` | String | |
| `rootPositionId` | UUID? | Null = whole organisation |
| `scenarioId` | UUID? | Non-null = a planning chart |
| `isDefault` | Boolean | |
| `visibility` | `ChartVisibility` | `PRIVATE` \| `ORGANISATION` \| `SHARED` |
| `createdById` | UUID | |

#### `ChartConfiguration`

Presentation, split out so a chart's *content* and its *appearance* version
independently.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `chartId` | UUID | Unique — 1:1 |
| `layoutDirection` | `LayoutDirection` | `TOP_DOWN` \| `LEFT_RIGHT` (`BOTTOM_UP`, `MATRIX`, `GOVERNANCE` reserved) |
| `nodeStyle` | `NodeStyle` | `COMPACT` \| `STANDARD` \| `DETAILED` |
| `showPhotos` / `showVacancies` / `showSecondaryLines` / `showDirectReportCount` / `showLocation` | Boolean | |
| `visibleFields` | String[] | Field allow-list |
| `defaultFilters` | Json | |
| `collapsedPositionIds` | String[] | Collapse is presentation, never deletion |

---

### 3.4 Scenarios and history

#### `Snapshot`

A point-in-time capture sufficient to reconstruct organisational state.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` / `organisationId` | UUID | |
| `name` / `description` | String | |
| `capturedAt` | DateTime | |
| `createdById` | UUID? | Null for system snapshots |
| `source` | `SnapshotSource` | `MANUAL` \| `SCHEDULED` \| `PRE_SYNC` \| `PRE_IMPORT` \| `SCENARIO_BASE` |
| `changeCount` | Int | Changes since the previous snapshot |
| `payload` | Json | Compressed serialised graph |

Snapshots are **immutable**. A snapshot is taken automatically before any
destructive sync or import, so every bulk operation is reversible in principle.

#### `Scenario`

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` / `organisationId` | UUID | |
| `name` / `description` | String | e.g. "2027 Restructure" |
| `baseSnapshotId` | UUID | The starting point |
| `status` | `ScenarioStatus` | `DRAFT` \| `IN_REVIEW` \| `APPROVED` \| `ARCHIVED` \| `APPLIED` |
| `createdById` | UUID | |
| `appliedAt` | DateTime? | Set only if promoted to live |

#### `ScenarioChange`

An **ordered, append-only** list of proposed operations. This is the mechanism
that guarantees scenario isolation: a scenario is a list of intentions, not a
copy of the organisation, and applying it is an explicit, separate act.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` / `scenarioId` | UUID | |
| `sequence` | Int | Ordering |
| `changeType` | `ScenarioChangeType` | `ADD_POSITION`, `REMOVE_POSITION`, `MOVE_POSITION`, `UPDATE_POSITION`, `ASSIGN_PERSON`, `UNASSIGN_PERSON`, `ADD_RELATIONSHIP`, `REMOVE_RELATIONSHIP`, `CREATE_VACANCY` |
| `entityType` / `entityId` | String / UUID? | Null `entityId` for scenario-created entities |
| `payload` | Json | Zod-validated per `changeType` |
| `createdById` | UUID | |

> **No `ScenarioChange` write may touch a live table.** This is asserted by
> integration tests that snapshot the live tables before and after scenario
> editing and require byte-equality.

---

### 3.5 Custom fields

#### `CustomFieldDefinition`

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` / `organisationId` | UUID | |
| `key` | String | Unique per organisation + `appliesTo`; stable API name |
| `label` | String | |
| `fieldType` | `CustomFieldType` | `TEXT` \| `NUMBER` \| `BOOLEAN` \| `DATE` \| `SELECT` \| `MULTI_SELECT` \| `URL` |
| `appliesTo` | `CustomFieldTarget` | `PERSON` \| `POSITION` |
| `options` | String[] | For `SELECT` / `MULTI_SELECT` |
| `visibility` | `FieldVisibility` | `PUBLIC` \| `INTERNAL` \| `ADMIN_ONLY` |
| `isPrivate` | Boolean | Shorthand for "never leaves via share/embed/export" |
| `isSearchable` / `isFilterable` / `isRequired` | Boolean | |
| `sortOrder` | Int | |

#### `CustomFieldValue`

| Field | Type | Notes |
| ----- | ---- | ----- |
| `definitionId` | UUID | |
| `personId` / `positionId` | UUID? | Exactly one is non-null (CHECK) |
| `value` | Json | Shape validated against `fieldType` |
| `source` | `DataSource` | Provenance |

**Privacy:** `isPrivate` or `visibility = ADMIN_ONLY` fields are stripped in
`src/server/dto/` before serialisation. There is one redaction path, shared by
the API, share links, embeds and exports, so a new surface cannot accidentally
skip it.

---

### 3.6 Integration

#### `Connector`

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` / `organisationId` | UUID | |
| `provider` | `ConnectorProvider` | `CSV` \| `MICROSOFT_MOCK` \| `MICROSOFT_GRAPH` \| `GOOGLE_WORKSPACE` \| `BAMBOO_HR` \| `GENERIC_REST` |
| `name` | String | |
| `status` | `ConnectorStatus` | `NOT_CONFIGURED` \| `CONNECTED` \| `ERROR` \| `DISABLED` |
| `config` | Json | Non-secret configuration only |
| `encryptedCredentials` | Bytes? | AES-256-GCM. **Never logged, never serialised to any client.** |
| `syncCursor` | String? | Incremental delta token |
| `syncSchedule` | String? | Cron expression; null = manual only |
| `lastSyncAt` / `lastSuccessfulSyncAt` | DateTime? | |
| `isReadOnly` | Boolean | Default **true** — v1 never writes outbound |

#### `ExternalIdentity`

The provenance anchor. One row per (entity, provider).

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` / `organisationId` | UUID | |
| `provider` | `ConnectorProvider` | |
| `externalId` | String | Id in the source system |
| `entityType` | `ExternalEntityType` | `PERSON` \| `POSITION` \| `DEPARTMENT` \| `LOCATION` \| `RELATIONSHIP` |
| `personId` / `positionId` / `departmentId` / `locationId` | UUID? | Exactly one non-null |
| `lastSeenAt` | DateTime | Last time the source still returned it |
| `sourceModifiedAt` | DateTime? | Source's own modified timestamp |
| `syncHash` | String | Hash of mapped fields — the idempotency key |

**Unique:** `(organisationId, provider, entityType, externalId)`.

`syncHash` is what makes re-running a sync a no-op: if the incoming hash equals
the stored hash, the record is classified `unchanged` and no write is issued.

#### `FieldMapping`

Source field → local field, per connector. Editable by administrators so a new
HRIS does not require a code change.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `connectorId` | UUID | |
| `entityType` | `ExternalEntityType` | |
| `sourceField` / `targetField` | String | |
| `transform` | String? | Named transform from a fixed registry — never evaluated code |
| `isRequired` | Boolean | |

#### `SyncJob` / `SyncRecord`

| `SyncJob` field | Type | Notes |
| --------------- | ---- | ----- |
| `id` / `organisationId` / `connectorId` | UUID | |
| `status` | `SyncStatus` | `QUEUED` \| `RUNNING` \| `COMPLETED` \| `COMPLETED_WITH_WARNINGS` \| `FAILED` |
| `trigger` | `SyncTrigger` | `MANUAL` \| `SCHEDULED` \| `WEBHOOK` |
| `mode` | `SyncMode` | `PREVIEW` \| `APPLY` |
| `correlationId` | String | Ties job → logs → audit events |
| `startedAt` / `finishedAt` | DateTime? | |
| `createdCount` / `updatedCount` / `unchangedCount` / `deactivatedCount` / `errorCount` | Int | |
| `cursorBefore` / `cursorAfter` | String? | Incremental sync bookkeeping |
| `error` | Json? | User-safe message + internal `errorId` |

`SyncRecord` is the per-entity ledger: `entityType`, `externalId`, `action`
(`CREATE` \| `UPDATE` \| `UNCHANGED` \| `DEACTIVATE` \| `ERROR` \| `SKIP`),
`before`, `after`, `message`. It is what the Sync Preview screen renders, and
what makes a failed sync diagnosable per record instead of per job.

#### `FieldProvenance`

Per-field source of truth. Answers "where did this job title come from, and
when?" for every externally managed field.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `entityType` / `entityId` | String / UUID | |
| `fieldName` | String | e.g. `jobTitle` |
| `source` | `DataSource` | `LOCAL` \| `CSV_IMPORT` \| `MICROSOFT_MOCK` \| `MICROSOFT_365` \| `ENTRA_ID` \| `GOOGLE_WORKSPACE` \| `BAMBOO_HR` \| `GENERIC_REST` |
| `lastSyncedAt` | DateTime | |
| `isLocallyOverridden` | Boolean | Local edit that sync must not silently clobber |

**Conflict rule (v1):** external source wins for externally managed fields —
*unless* `isLocallyOverridden` is set, in which case the conflict is surfaced
in the sync preview rather than resolved silently. Fields never claimed by a
connector remain purely local. The rule lives behind a `ConflictStrategy`
interface so `LOCAL_WINS` and `MANUAL_REVIEW` can be added without touching the
sync engine.

---

### 3.7 Sharing and audit

#### `ShareLink`

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` / `organisationId` / `chartId` | UUID | |
| `token` | String | Unique; 32 bytes from a CSPRNG, stored hashed |
| `passwordHash` | String? | Optional bcrypt |
| `expiresAt` | DateTime? | |
| `permissions` | `SharePermission` | `VIEW_ONLY` \| `VIEW_AND_EXPORT` |
| `allowedFields` | String[] | Explicit allow-list — never a deny-list |
| `allowEmbed` | Boolean | |
| `allowedFrameAncestors` | String[] | CSP `frame-ancestors` |
| `viewCount` / `lastViewedAt` | Int / DateTime? | |
| `revokedAt` | DateTime? | Revocation is immediate |
| `createdById` | UUID | |

`allowedFields` being an allow-list is deliberate: adding a new sensitive column
later cannot retroactively widen an existing share link.

#### `AuditEvent`

Append-only. Never updated, never hard-deleted.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` / `organisationId` | UUID | |
| `actorId` | UUID? | Null for system actions |
| `actorType` | `ActorType` | `USER` \| `SYSTEM` \| `CONNECTOR` \| `SHARE_LINK` |
| `action` | `AuditAction` | `CREATE`, `UPDATE`, `DELETE`, `MOVE_POSITION`, `ASSIGN_PERSON`, `UNASSIGN_PERSON`, `SYNC_APPLIED`, `IMPORT_APPLIED`, `SCENARIO_APPLIED`, `PERMISSION_CHANGED`, `SHARE_CREATED`, `SHARE_REVOKED`, `EXPORT`, `LOGIN`, `LOGIN_FAILED` |
| `entityType` / `entityId` | String / UUID? | |
| `previousState` / `newState` | Json? | Redacted of secret fields before write |
| `source` | `DataSource` | |
| `correlationId` | String? | |
| `ipAddress` / `userAgent` | String? | |
| `createdAt` | DateTime | |

Structural writes emit their `AuditEvent` **inside the same transaction** as the
change, so an audit record cannot be lost when a later step fails.

**Indexes:** `(organisationId, createdAt DESC)`, `(entityType, entityId)`,
`(actorId, createdAt DESC)`, `(correlationId)`.

---

## 4. Hierarchy queries

Reading an organisation chart is one flat, indexed query — never a recursive
per-node fetch:

```sql
SELECT p.*, rr.manager_position_id
FROM   positions p
LEFT JOIN reporting_relationships rr
       ON rr.subordinate_position_id = p.id
      AND rr.is_primary
      AND rr.effective_to IS NULL
      AND rr.deleted_at IS NULL
WHERE  p.organisation_id = $1
  AND  p.deleted_at IS NULL;
```

The tree is assembled in memory in O(n) by `buildReportingGraph()`, which also
produces the ancestor index used for "expand to reveal this node" during search.

Postgres recursive CTEs are reserved for the cases where the answer is genuinely
a database question — total downstream report counts, reporting-chain
extraction, and cycle re-verification at write time.

---

## 5. Soft deletion

Soft deleted (`deletedAt`), because history must remain reconstructable:

`Person`, `Position`, `Assignment`, `ReportingRelationship`, `Department`,
`Location`, `Chart`, `Scenario`, `Organisation`

Hard deleted, because they carry no organisational history:

`Session`, `VerificationToken`, staged import rows past retention,
`SyncRecord` past retention

Never deleted:

`AuditEvent`, `Snapshot`

All repository reads filter `deletedAt: null` by default. Access to deleted rows
requires an explicit `includeDeleted` flag, so forgetting the filter is not
possible by accident.

---

## 6. Indexing strategy

Driven by the actual access patterns, not by adding an index per column.

| Query | Index |
| ----- | ----- |
| Load whole chart | `Position(organisationId, deletedAt)` |
| Manager edges | `ReportingRelationship(organisationId, isPrimary, effectiveTo)` |
| Direct reports of a position | `ReportingRelationship(managerPositionId, relationshipType)` |
| Current holder of a position | `Assignment(positionId, endDate)` |
| A person's roles | `Assignment(personId, endDate)` |
| Directory listing/sort | `Person(organisationId, lastName, firstName)` |
| Name search | GIN trigram on `Person.displayName`, `Position.title` |
| Sync upsert | `ExternalIdentity(organisationId, provider, entityType, externalId)` unique |
| Audit feed | `AuditEvent(organisationId, createdAt DESC)` |
| One primary manager | Partial unique on `ReportingRelationship(subordinatePositionId)` where primary + current |

Trigram indexes and the partial unique index are applied via raw SQL in a
Prisma migration, since Prisma's schema language cannot express them.

---

## 7. Invariant enforcement summary

| Invariant | Enforced where |
| --------- | -------------- |
| No self-reporting | DB CHECK + domain guard |
| One primary manager per position | Partial unique index + domain guard |
| No cycles in primary graph | `detectCycle()` inside the write transaction |
| One primary assignment per person | Domain guard + integration test |
| Allocation ≤ 100% | Domain guard |
| `endDate > startDate` | DB CHECK |
| Custom field value matches type | Zod at the boundary |
| Exactly one owner FK on polymorphic rows | DB CHECK |
| Scenario writes never touch live tables | Repository boundary + integration test |

Where a rule is expressible in the database it is expressed there as well as in
the domain layer. Application-only enforcement fails the moment anything writes
to the database that is not this application.
