'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card } from '@/components/ui/card';

interface Health {
  vacantPositions: number;
  vacancyRate: number;
  spanThreshold: number;
  medianSpan: number;
  maxSpan: number;
  managerCount: number;
  overloadedManagers: Array<{
    positionId: string;
    title: string;
    personName: string;
    directReportCount: number;
  }>;
}

interface Metrics {
  organisationName?: string;
  people: number;
  positions: number;
  vacantPositions: number;
  departments: number;
  locations: number;
  changesThisMonth: number;
  lastSuccessfulSync: { finishedAt: string | null; status: string } | null;
  connector: { name: string; status: string; provider: string } | null;
  health?: Health;
  recentAudit: Array<{
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
    actor: { name: string | null; email: string } | null;
  }>;
}

export function DashboardView() {
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const response = await fetch('/api/v1/dashboard');
      if (!response.ok) throw new Error('Failed to load dashboard');
      return (await response.json()) as Metrics;
    },
  });

  const vacancyPct = data?.health
    ? `${Math.round(data.health.vacancyRate * 100)}%`
    : '—';

  const tiles = [
    { label: 'People', value: data?.people ?? '—' },
    { label: 'Positions', value: data?.positions ?? '—' },
    { label: 'Vacant positions', value: data?.vacantPositions ?? '—' },
    { label: 'Vacancy rate', value: vacancyPct },
    { label: 'Median span of control', value: data?.health?.medianSpan ?? '—' },
    { label: 'Wide-span managers', value: data?.health?.overloadedManagers.length ?? '—' },
    { label: 'Departments', value: data?.departments ?? '—' },
    { label: 'Locations', value: data?.locations ?? '—' },
    { label: 'Changes this month', value: data?.changesThisMonth ?? '—' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-[var(--muted-foreground)]">{data?.organisationName ?? 'Omni'}</p>
        <h1 className="text-3xl font-semibold tracking-tight">Organisation pulse</h1>
      </div>
      <div className="stagger-in grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <p className="text-xs tracking-wide text-[var(--muted-foreground)] uppercase">{tile.label}</p>
            <p className={`mt-2 text-3xl font-semibold ${data == null ? 'motion-pulse' : ''}`}>{tile.value}</p>
          </Card>
        ))}
      </div>
      <div className="stagger-in grid gap-3 lg:grid-cols-2">
        <Card>
          <p className="text-xs tracking-wide text-[var(--muted-foreground)] uppercase">Integration health</p>
          <p className="mt-2 font-medium">{data?.connector?.name ?? 'No connector'}</p>
          <p className="text-sm text-[var(--muted-foreground)]">
            {data?.connector?.provider} · {data?.connector?.status}
          </p>
          <p className="mt-2 text-sm">
            Last successful sync:{' '}
            {data?.lastSuccessfulSync?.finishedAt
              ? new Date(data.lastSuccessfulSync.finishedAt).toLocaleString()
              : 'Never'}
          </p>
          <Link className="mt-3 inline-block text-sm underline decoration-transparent underline-offset-4 transition-[color,text-decoration-color] duration-200 hover:text-brand-hi hover:decoration-brand-hi" href="/integrations">
            Open integrations
          </Link>
        </Card>
        <Card>
          <p className="text-xs tracking-wide text-[var(--muted-foreground)] uppercase">Recent audit activity</p>
          <ul className="mt-3 space-y-2 text-sm">
            {(data?.recentAudit ?? []).map((event) => (
              <li key={event.id} className="flex justify-between gap-3">
                <span>
                  {event.action} · {event.entityType}
                  <span className="block text-xs text-[var(--muted-foreground)]">
                    {event.actor?.name ?? event.actor?.email ?? 'System'}
                  </span>
                </span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {new Date(event.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
