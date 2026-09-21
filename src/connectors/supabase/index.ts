import { config } from '@/lib/config';
import type { ConnectorAdapter, ConnectorConfig, ConnectorMetadata, ExternalPerson } from '../types';

export const SUPABASE_METADATA: ConnectorMetadata = {
  provider: 'SUPABASE',
  displayName: 'Supabase directory',
  authScheme: 'API_KEY',
  readOnly: true,
  supportsIncremental: false,
  entities: ['people'],
};

const MOCK_PEOPLE: ExternalPerson[] = [
  {
    externalId: 'sb-pat',
    displayName: 'Pat Newhire',
    firstName: 'Pat',
    lastName: 'Newhire',
    email: 'pat.directory@northstar.example',
    jobTitle: 'Analyst',
    department: 'Finance',
    officeLocation: 'London',
  },
  {
    externalId: 'sb-renee',
    displayName: 'Renee Cole',
    firstName: 'Renee',
    lastName: 'Cole',
    email: 'renee.directory@northstar.example',
    jobTitle: 'People partner',
    department: 'People',
    officeLocation: 'London',
  },
];

function settings(cfg: ConnectorConfig) {
  return (cfg.settings ?? {}) as {
    url?: string;
    table?: string;
    anonKey?: string;
    serviceKey?: string;
  };
}

function supabaseApiUrl(raw?: string) {
  if (!raw) return undefined;
  const trimmed = raw.trim().replace(/\/$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const fromDbHost = trimmed.match(/@db\.([a-z0-9]+)\.supabase\.co/i);
  if (fromDbHost?.[1]) return `https://${fromDbHost[1]}.supabase.co`;
  const fromProjectHost = trimmed.match(/@([a-z0-9]+)\.supabase\.co/i);
  if (fromProjectHost?.[1]) return `https://${fromProjectHost[1]}.supabase.co`;
  return undefined;
}

function supabaseHeaders(key: string): Record<string, string> {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    Accept: 'application/json',
    'User-Agent': 'Omni-ochart/1.0',
  };
}

function resolveCredentials(cfg: ConnectorConfig, options?: { url?: string; apiKey?: string }) {
  const stored = settings(cfg);
  const env = config();
  return {
    url: supabaseApiUrl(stored.url || options?.url || env.SUPABASE_URL),
    key:
      stored.serviceKey ||
      stored.anonKey ||
      options?.apiKey ||
      env.SUPABASE_SERVICE_KEY ||
      env.SUPABASE_PUBLISHABLE_KEY,
    table: stored.table || 'people',
  };
}

export function createSupabaseConnector(options?: { url?: string; apiKey?: string }): ConnectorAdapter {
  return {
    getMetadata: () => SUPABASE_METADATA,
    testConnection: async (cfg) => {
      const { url, key, table } = resolveCredentials(cfg, options);
      if (!url || !key) {
        return {
          ok: true,
          message: 'No Supabase credentials yet — mock directory rows are used until you add a project URL and key.',
        };
      }
      try {
        const headers = supabaseHeaders(key);
        const auth = await fetch(`${url}/rest/v1/`, { headers });
        if (auth.status === 401 || auth.status === 403) {
          return { ok: false, message: `Supabase rejected the API key (${auth.status}).` };
        }
        if (!auth.ok) {
          return { ok: false, message: `Supabase responded ${auth.status} while checking the API.` };
        }
        const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, { headers });
        if (response.status === 404) {
          return {
            ok: false,
            message: `API key works, but there is no "${table}" table in public. Add that table, then pull again.`,
          };
        }
        if (!response.ok) {
          return { ok: false, message: `Supabase responded ${response.status}. Check the table name and key.` };
        }
        const rows = (await response.json()) as unknown[];
        return {
          ok: true,
          message: `Supabase directory is reachable (${Array.isArray(rows) ? rows.length : 0} row${Array.isArray(rows) && rows.length === 1 ? '' : 's'} in this sample).`,
        };
      } catch {
        return { ok: false, message: 'Could not reach that Supabase URL.' };
      }
    },
    authenticate: async () => ({ ok: true }),
    async *pullPeople(ctx) {
      const people = await pullSupabasePeople({
        organisationId: ctx.organisationId,
        settings: (ctx as { settings?: Record<string, unknown> }).settings,
      });
      for (const person of people) {
        yield person;
      }
    },
    async *pullPositions() {},
    async *pullDepartments() {},
    async *pullLocations() {},
    async *pullRelationships() {},
    async *pullPhotos() {},
    async *getChanges() {},
  };
}

export async function pullSupabasePeople(cfg: ConnectorConfig): Promise<ExternalPerson[]> {
  const { url, key, table } = resolveCredentials(cfg);
  if (!url || !key) {
    return MOCK_PEOPLE;
  }
  const response = await fetch(`${url}/rest/v1/${table}?select=*`, {
    headers: supabaseHeaders(key),
  });
  if (response.status === 404) {
    throw new Error(`Supabase has no "${table}" table in the public schema.`);
  }
  if (!response.ok) {
    throw new Error(`Supabase read failed (${response.status}).`);
  }
  const rows = (await response.json()) as Array<Record<string, unknown>>;
  return rows.map((row, index) => ({
    externalId: String(row.id ?? row.email ?? `row-${index}`),
    displayName: String(row.display_name ?? row.name ?? row.full_name ?? 'Unknown'),
    firstName: String(row.first_name ?? ''),
    lastName: String(row.last_name ?? ''),
    email: typeof row.email === 'string' ? row.email : undefined,
    jobTitle: typeof row.title === 'string' ? row.title : typeof row.job_title === 'string' ? row.job_title : undefined,
    department: typeof row.department === 'string' ? row.department : undefined,
    officeLocation: typeof row.location === 'string' ? row.location : undefined,
    skills: Array.isArray(row.skills)
      ? row.skills.map(String)
      : typeof row.skills === 'string'
        ? row.skills.split(',').map((value) => value.trim()).filter(Boolean)
        : undefined,
  }));
}
