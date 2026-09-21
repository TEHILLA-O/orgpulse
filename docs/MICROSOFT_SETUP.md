# Microsoft Entra ID setup for Omni

This guide is for an organisation administrator who will connect Omni
to Microsoft Entra ID / Microsoft Graph. It is **not** required for local
development — the mock connector is the default.

Omni's Microsoft integration is **read-only** in this version. The
application will not create, update or delete users in Entra ID.

---

## 1. What Omni will read

| Graph resource | Permission | Why |
| -------------- | ---------- | --- |
| Users (name, mail, job title, department, office location) | `User.Read.All` | People + positions |
| Manager relationship | `User.Read.All` | Primary reporting line |
| Profile photos | `User.Read.All` | Chart avatars |
| Organisation directory (optional) | `Organization.Read.All` | Tenant display name |

Do **not** grant `User.ReadWrite.All`, `Directory.ReadWrite.All`, or any
mail/files/calendar scope. Omni will not use them.

---

## 2. Register the application

1. Open [Microsoft Entra admin centre](https://entra.microsoft.com) →
   **Identity** → **Applications** → **App registrations** → **New
   registration**.
2. Name: `Omni` (or your chosen internal name).
3. Supported account types: **Accounts in this organisational directory
   only** (single tenant).
4. Redirect URI (Web):
   - Production: `https://<your-omni-host>/api/auth/callback/microsoft-entra-id`
   - Preview: the equivalent preview URL
5. Register.

Record:

- **Application (client) ID**
- **Directory (tenant) ID**

---

## 3. Create a client secret

1. **Certificates & secrets** → **New client secret**.
2. Description: `omni-graph-sync`.
3. Expiry: 12 months (set a calendar reminder; Omni will surface an
   integration-health warning 14 days before known expiry once stored).
4. Copy the **Value** immediately. It is not shown again.

Prefer a certificate in production if your security standard requires it.
Store the PEM in the platform secret store as `MICROSOFT_CLIENT_CERTIFICATE`
and leave `MICROSOFT_CLIENT_SECRET` unset. Never commit either.

---

## 4. Grant Graph permissions

1. **API permissions** → **Add a permission** → **Microsoft Graph** →
   **Application permissions** (daemon sync runs without a signed-in user):
   - `User.Read.All`
   - `Organization.Read.All` (optional)
2. Click **Grant admin consent for &lt;tenant&gt;**.
3. Confirm the status column shows **Granted**.

For interactive sign-in (SSO, Phase 4) also add **Delegated**:

- `openid`
- `profile`
- `email`
- `User.Read` (the signed-in admin, not the directory)

SSO and directory sync are separate concerns: a user can sign in with Entra
without Omni being allowed to read the whole directory, and vice versa.

---

## 5. Configure Omni

Set these environment variables on the Omni host. **Never put them in
git.**

```
AUTH_MICROSOFT_ENTRA_ID_ID=<application-client-id>
AUTH_MICROSOFT_ENTRA_ID_SECRET=<client-secret>
AUTH_MICROSOFT_ENTRA_ID_TENANT_ID=<directory-tenant-id>
MICROSOFT_CONNECTOR_MODE=real
```

Optional:

```
MICROSOFT_GRAPH_BASE_URL=https://graph.microsoft.com/v1.0
MICROSOFT_PHOTO_SYNC=true
```

Then in Omni: **Integrations** → **Add connector** → **Microsoft 365**
→ **Test connection** → **Preview sync** → **Apply**.

The first apply takes a `PRE_SYNC` snapshot. Review deactivations in the
preview; they are not applied until you confirm.

---

## 6. Least-privilege checklist

- [ ] Single-tenant registration
- [ ] Application permissions limited to `User.Read.All` (+ optional
      `Organization.Read.All`)
- [ ] Admin consent granted by a Global Administrator or Privileged Role
      Administrator
- [ ] Client secret stored in a secret manager, not in a ticket or chat
- [ ] No mail, files, Teams or Sites permissions
- [ ] Omni `Connector.isReadOnly = true`
- [ ] Conditional Access: restrict the app to the Omni hosting identity
      if your tenant uses workload identity CA

---

## 7. Local development

Do nothing in Entra. Run:

```
docker compose up
npm run db:migrate
npm run db:seed
npm run dev
```

`MICROSOFT_CONNECTOR_MODE` defaults to `mock`. Seeded people carry
`ExternalIdentity` rows with `provider = MICROSOFT_MOCK` so the UI can
show provenance without a tenant.

To exercise the real adapter against a development tenant, copy
`.env.example` to `.env` and fill the three `AUTH_MICROSOFT_ENTRA_ID_*`
values. Never use production-tenant credentials on a laptop.

---

## 8. Revocation

To disconnect:

1. In Omni, disable or delete the connector (credentials are wiped).
2. In Entra, **App registrations** → the app → **Delete**, or remove admin
   consent.
3. Rotate the client secret even if the app is kept.

Existing Omni people/positions remain; only the live link is cut.
`ExternalIdentity` rows are retained for audit unless an OWNER explicitly
purges them.
