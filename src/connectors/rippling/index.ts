import type { ConnectorAdapter, ConnectorMetadata, ExternalPerson } from '../types';
import { mapRipplingWorker, type RipplingWorker } from './map-worker';

export const RIPPLING_METADATA: ConnectorMetadata = {
  provider: 'RIPPLING',
  displayName: 'Rippling',
  authScheme: 'API_KEY',
  readOnly: true,
  supportsIncremental: true,
  entities: ['people', 'departments', 'locations'],
};

/**
 * Read-only Rippling REST adapter (https://rest.ripplingapis.com).
 * Instantiation is refused without an API token so local dev never talks to Rippling by accident.
 */
export function createRipplingConnector(credentials?: {
  apiToken?: string;
  baseUrl?: string;
}): ConnectorAdapter {
  const token = credentials?.apiToken?.trim();
  const baseUrl = (credentials?.baseUrl ?? 'https://rest.ripplingapis.com').replace(/\/$/, '');
  if (!token) {
    throw new Error(
      'REAL_RIPPLING_CONNECTOR requires RIPPLING_API_TOKEN. Leave RIPPLING_CONNECTOR_MODE=mock for local development.',
    );
  }

  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
    'user-agent': 'Omni-ochart/1.0',
  };

  function workersUrl() {
    const params = new URLSearchParams({
      limit: '100',
      expand: 'user,manager,department',
      filter: 'status eq "ACTIVE"',
    });
    return `${baseUrl}/workers/?${params.toString()}`;
  }

  async function ripplingGet(url: string): Promise<Response> {
    return fetch(url, { headers });
  }

  return {
    getMetadata: () => RIPPLING_METADATA,
    testConnection: async () => {
      const response = await ripplingGet(workersUrl().replace('limit=100', 'limit=1'));
      if (!response.ok) {
        return {
          ok: false,
          message: `Rippling returned ${response.status}. Check the API token and workers.read scope.`,
        };
      }
      return { ok: true, message: 'Rippling REST API accepted the token.' };
    },
    authenticate: async () => ({ ok: true }),
    async *pullPeople() {
      let next: string | null = workersUrl();
      while (next) {
        const response = await ripplingGet(next);
        if (!response.ok) {
          throw new Error(`Rippling workers pull failed (${response.status}).`);
        }
        const body = (await response.json()) as {
          results?: RipplingWorker[];
          data?: RipplingWorker[];
          next_link?: string | null;
        };
        const rows = body.results ?? body.data ?? [];
        for (const worker of rows) {
          const person: ExternalPerson | null = mapRipplingWorker(worker);
          if (person) yield person;
        }
        next = body.next_link ?? null;
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
