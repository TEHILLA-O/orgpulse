# Omni — Security

Omni stores employee names, contact details, reporting lines and
(eventually) custom HR fields. Treat it as a **business-sensitive internal
system**, not as a public website with a login page.

This document is the threat model, the data classification, the permission
model, and the deployment baseline. Implementation lives in
`src/domain/permissions/`, `src/server/`, and `src/lib/`.

---

## 1. Threat model

### Assets

| Asset | Sensitivity | Notes |
| ----- | ----------- | ----- |
| Person records | INTERNAL (phone, dates: higher) | Directory data |
| Position + reporting graph | INTERNAL | Reveals structure and vacancies |
| Custom fields marked private | ADMIN_ONLY | Must never hit share/embed/export |
| Connector credentials / OAuth tokens | SECRET | Encrypted at rest, never logged |
| Share-link tokens | SECRET | Stored hashed; equivalent to a capability |
| Audit log | INTERNAL | Tamper-evident by append-only design |
| Snapshots | INTERNAL | Full historical org state |

### Actors

- Authenticated staff (`OWNER` / `ADMIN` / `EDITOR` / `VIEWER`)
- Unauthenticated internet (login page, share-link, embed)
- Connector daemons (system actor)
- Insiders with database access (operators)
- Malicious insiders with a VIEWER account probing APIs

### Abuses we design against

1. **IDOR** — reading or mutating another organisation's rows by guessing UUIDs.
2. **Client-only authorisation** — hidden buttons as the only control.
3. **Privilege escalation** — a VIEWER calling `POST /positions`.
4. **Private-field leakage** — share links, embeds, exports, search, logs.
5. **Token theft** — session cookie, Graph refresh token, share-link token.
6. **Sync spoofing** — a crafted connector payload overwriting local data.
7. **CSV/XLSX attacks** — formula injection on export, zip/XML bombs on import.
8. **SSRF** via connector URLs (Phase 5 generic REST).
9. **Clickjacking** of the chart, or unexpected iframe embedding.
10. **Audit gaps** — a structural change with no `AuditEvent`.

Out of scope for v1 (recorded, not ignored):

- Full zero-trust device posture
- Field-level ACLs beyond three visibility tiers (TODO D5)
- Formal pentest / SOC2 evidence pack

---

## 2. Data categories

| Category | Examples | Default visibility | Rules |
| -------- | -------- | ------------------ | ----- |
| PUBLIC / SHARED | display name, title, department, photo | Visible on authenticated charts and on share links whose allow-list includes them | Still requires a valid session or share token |
| INTERNAL | email, phone, employment dates, secondary assignments | Authenticated members only | Stripped from share/embed unless explicitly allow-listed **and** not private |
| ADMIN_ONLY | compensation-like custom fields, connector errors containing payloads | `ADMIN`/`OWNER` | Never exported, never shared |
| SECRET | passwords, OAuth tokens, share tokens, encryption keys | Nobody via API | Encrypted or hashed; redacted from logs |

Classification is enforced in `src/server/dto/` — the only serialisation
path. A React component that “doesn't render” a field is not a control.

---

## 3. Permissions (RBAC)

Roles, scoped by `OrganisationMembership`. Absence of a membership row is
a **deny**, not a default VIEWER.

| Capability | OWNER | ADMIN | EDITOR | VIEWER |
| ---------- | :---: | :---: | :----: | :----: |
| View chart, people, positions | ✓ | ✓ | ✓ | ✓ |
| Search / filter | ✓ | ✓ | ✓ | ✓ |
| Export (non-private fields) | ✓ | ✓ | ✓ | |
| Edit people / positions / relationships | ✓ | ✓ | ✓ | |
| Drag/reparent (live) | ✓ | ✓ | ✓ | |
| Create scenarios | ✓ | ✓ | ✓ | |
| Manage charts | ✓ | ✓ | ✓ | |
| Manage integrations / sync | ✓ | ✓ | | |
| Manage members / roles | ✓ | ✓ | | |
| Manage organisation settings | ✓ | ✓ | | |
| Transfer ownership / delete org | ✓ | | | |
| View ADMIN_ONLY fields | ✓ | ✓ | | |
| View audit log | ✓ | ✓ | ✓* | |

\* EDITOR may view audit events for entities they can edit; they cannot
view login-failure or credential events.

All decisions are made by `authorize(actor, action, resource)` in
`src/domain/permissions/`. Route handlers call it; they do not inline role
checks. The same function is unit-tested.

Granular field-level privacy is prepared via `FieldVisibility` on
`CustomFieldDefinition` and `FieldProvenance`. Extending to per-role field
ACLs is TODO D5 and must slot into the same redactor.

---

## 4. Authentication

- **Local / demo:** Auth.js credentials provider, bcrypt password hashes.
  Demo passwords exist only in seed data for `*.example` addresses.
- **Production:** Microsoft Entra ID / OIDC. Architecture is in place in
  Phase 0 (`AUTH_PROVIDERS` includes `entra`); the provider is enabled when
  `AUTH_MICROSOFT_ENTRA_ID_ID` and related env vars are set.
- Sessions are HTTP-only, `Secure` in production, `SameSite=Lax` (strict
  on embed routes).
- CSRF: Auth.js built-in for cookie sessions; mutating `/api/v1` routes
  require a same-origin session and reject cross-site form posts.
- Rate limits on `/api/auth/*` and `/api/v1/imports` (in-memory v1;
  reverse-proxy recommended in production).

Passwords, access tokens and refresh tokens are **never** logged.

---

## 5. Integration credential handling

| Rule | Mechanism |
| ---- | --------- |
| Secrets live in env / secret manager, never in git | `.gitignore` on `.env`; `.env.example` has empty placeholders |
| Connector credentials encrypted at rest | AES-256-GCM, key = `ENCRYPTION_KEY` (32-byte hex) |
| Decryption only inside the adapter factory | Services receive a `ConnectorAdapter`, never the plaintext |
| Tokens never serialised to any client DTO | `encryptedCredentials` omitted by Prisma `select` in every list query |
| Real Graph adapter refuses to boot without credentials | Fail-closed, no silent mock fallback in production |
| Least privilege Graph scopes | See `docs/MICROSOFT_SETUP.md` |

Rotation: re-consent + rewrite `encryptedCredentials`. Old tokens are
overwritten, not left in metadata.

---

## 6. Sharing and embedding risks

Share links are **capabilities**. Anyone holding a valid token can read
whatever the link allows, without being a member.

Mitigations:

- Token is 32 bytes from CSPRNG, stored as a SHA-256 hash; the raw value is
  shown once.
- Optional password (bcrypt).
- Expiry (`expiresAt`) and immediate revocation (`revokedAt`).
- `allowedFields` is an **allow-list**. Adding a sensitive column later
  cannot widen existing links.
- Private / `ADMIN_ONLY` fields are stripped even if an administrator
  accidentally allow-lists them.
- Embed: `Content-Security-Policy: frame-ancestors <allow-list>`; default
  deny. `X-Frame-Options` is not sufficient for per-link ancestors.
- Share-link access is audited (`actorType = SHARE_LINK`).

Internal authenticated sharing (Phase 4 first) is preferred. Public links
are opt-in per organisation setting.

---

## 7. Input validation and injection

- All request bodies and query strings validated with Zod at the HTTP
  boundary. Domain functions accept already-parsed types.
- Prisma parameterised access only. No string-built SQL. Raw SQL
  migrations are static files.
- HTML is never interpolated from employee fields; React's default
  escaping plus a ban on `dangerouslySetInnerHTML` for user data.
- File uploads: extension + MIME allow-list (`text/csv`,
  `application/vnd.ms-excel`,
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`),
  size cap (`IMPORT_MAX_BYTES`), ZIP-bomb / row-count guards on XLSX.
- CSV/XLSX **export** prefixes formula-like cells (`=`, `+`, `-`, `@`,
  tab, CR) to prevent spreadsheet command execution when a colleague opens
  the file.

---

## 8. HTTP hardening

Set in Next.js headers / middleware:

| Header | Value |
| ------ | ----- |
| `Content-Security-Policy` | Strict default-src 'self'; img-src self + data + configured photo CDN; frame-ancestors 'none' on app routes |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | camera/mic/geo disabled |
| `Strict-Transport-Security` | production only, preload |

CORS is not opened. The API is same-origin. Embeds load a dedicated
`(embed)` route group, not `/api/v1`.

---

## 9. Auditability

Every structurally meaningful write emits an `AuditEvent` **in the same
database transaction** as the change:

- actor, actor type, timestamp
- action, entity type, entity id
- previous state, new state (secrets redacted before write)
- source (`LOCAL`, `CSV_IMPORT`, `MICROSOFT_365`, …)
- correlation id, IP, user agent

`AuditEvent` rows are append-only. Operators with database access can
still `DELETE` them — that is an infrastructure control (restricted DB
role, PITR) not an application one.

---

## 10. Logging

Pino JSON. Redaction paths:

`*.password`, `*.passwordHash`, `*.token`, `*.accessToken`,
`*.refreshToken`, `*.idToken`, `*.secret`, `*.authorization`,
`*.encryptedCredentials`, `*.cookie`.

Employee phone numbers and private custom fields are not written to
info-level logs. Debug logging of full entities is disabled in production.

---

## 11. Deployment recommendations

1. Run behind TLS terminated at a reverse proxy. Never expose Postgres.
2. Inject secrets via the platform secret store, not a committed `.env`.
3. `ENCRYPTION_KEY` and `AUTH_SECRET` are independent 32-byte values;
   rotating one must not require rotating the other without a plan.
4. Postgres: least-privilege app role (no `CREATE`/`DROP`), automated
   backups, point-in-time recovery.
5. Single app replica may run the in-process scheduler. Multiple replicas
   must disable it on all but one, or move to BullMQ (TODO D1).
6. Network-restrict the Graph tenant (conditional access) independently of
   Omni.
7. Do not put Omni on the public internet without SSO, rate limiting
   at the edge, and an IP allow-list or ZTNA in front.
8. Container image runs as a non-root user; read-only root filesystem
   except for `/tmp` and the Next.js cache.
9. Dependabot / equivalent for Next, Auth.js, Prisma, `pg`.
10. After go-live: threat-model review when Phase 4 share-links are
    enabled, and again before any outbound HRIS write (D2).

---

## 12. Incident notes

If a share-link token leaks: revoke (`revokedAt = now()`). Tokens are
hashed, so the database copy is not reusable even if the DB is dumped —
unless the attacker also has the raw token from a browser or chat.

If `ENCRYPTION_KEY` leaks: rotate, re-encrypt `encryptedCredentials` with
the new key, revoke Graph secrets in Entra, force-sign-out (delete
`Session` rows).

If an OWNER account is compromised: another OWNER (or platform admin)
demotes it; rotate `AUTH_SECRET` only if session-forging is suspected
(this invalidates every session).
