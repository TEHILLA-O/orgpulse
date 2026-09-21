'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectItem } from '@/components/ui/select';
import { initials } from '@/lib/utils';

interface DirectoryPerson {
  id: string;
  displayName: string;
  email: string | null;
  title: string | null;
  department: string | null;
  location: string | null;
  skills: Array<{ name: string; source: string }>;
  sources: string[];
}

interface DirectorySource {
  id: string;
  provider: string;
  name: string;
  status: string;
  lastSyncAt: string | null;
}

interface PreviewPerson {
  externalId: string;
  displayName: string;
  email?: string;
  jobTitle?: string;
  department?: string;
  skills?: string[];
}

export default function DirectoryPage() {
  const queryClient = useQueryClient();
  const [connectorId, setConnectorId] = useState('');
  const [preview, setPreview] = useState<PreviewPerson[] | null>(null);

  const { data } = useQuery({
    queryKey: ['directory'],
    queryFn: async () => {
      const response = await fetch('/api/v1/directory');
      if (!response.ok) throw new Error('Failed to load directory');
      return (await response.json()) as { people: DirectoryPerson[]; sources: DirectorySource[] };
    },
  });

  const pullSources = (data?.sources ?? []).filter(
    (source) => source.provider === 'SUPABASE' || source.provider === 'RIPPLING',
  );
  const selected = connectorId || pullSources[0]?.id || '';

  const pull = useMutation({
    mutationFn: async (apply: boolean) => {
      const response = await fetch('/api/v1/directory', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ connectorId: selected, apply }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Directory pull failed');
      return payload as {
        preview: PreviewPerson[];
        applied?: { created: number; updated: number; total: number };
      };
    },
    onSuccess: (payload, apply) => {
      setPreview(payload.preview);
      if (apply && payload.applied) {
        toast.success(
          `Applied ${payload.applied.total} rows · ${payload.applied.created} created · ${payload.applied.updated} updated`,
        );
        queryClient.invalidateQueries({ queryKey: ['directory'] });
        queryClient.invalidateQueries({ queryKey: ['people'] });
        queryClient.invalidateQueries({ queryKey: ['chart-graph'] });
      } else {
        toast.success(`Previewed ${payload.preview.length} people from the source`);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs tracking-[0.25em] text-[var(--muted-foreground)] uppercase">Live directory</p>
        <h1 className="text-2xl font-semibold">People from every connected source</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Postgres remains the system of record. Supabase, Microsoft, Rippling, and CSV feeds can preview and merge
          people here. LinkedIn is paste-in only — we do not scrape it.
        </p>
      </div>

      <Card className="space-y-3">
        <h2 className="font-semibold">Pull from a source</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Preview and merge people from Supabase or Rippling. Postgres remains the system of record.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Select
            className="min-w-[16rem]"
            value={selected}
            onValueChange={setConnectorId}
          >
            {pullSources.length === 0 ? <SelectItem value="">No directory connector</SelectItem> : null}
            {pullSources.map((source) => (
              <SelectItem key={source.id} value={source.id}>
                {source.name} · {source.status}
              </SelectItem>
            ))}
          </Select>
          <Button
            variant="outline"
            disabled={!selected || pull.isPending}
            onClick={() => pull.mutate(false)}
          >
            Preview
          </Button>
          <Button disabled={!selected || pull.isPending} onClick={() => pull.mutate(true)}>
            Apply into directory
          </Button>
        </div>
        {preview ? (
          <ul className="space-y-1 text-sm">
            {preview.map((person) => (
              <li key={person.externalId}>
                {person.displayName}
                {person.jobTitle ? ` · ${person.jobTitle}` : ''}
                {person.department ? ` · ${person.department}` : ''}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--muted)] text-xs tracking-wide uppercase">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Skills</th>
              <th className="px-4 py-2">Sources</th>
            </tr>
          </thead>
          <tbody>
            {(data?.people ?? []).map((person) => (
              <tr key={person.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-ink-invert">
                      {initials(person.displayName)}
                    </span>
                    <div>
                      <p className="font-medium">{person.displayName}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{person.department ?? person.location}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2">{person.title ?? '—'}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {person.skills.map((skill) => (
                      <Badge key={`${person.id}-${skill.name}`} tone="sea">
                        {skill.name}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {person.sources.length === 0 ? <Badge>Local</Badge> : null}
                    {person.sources.map((source) => (
                      <Badge key={source} tone="gold">
                        {source}
                      </Badge>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-sm text-[var(--muted-foreground)]">
        Arrange the chart from the live seats on{' '}
        <Link className="underline" href="/charts">
          Org chart
        </Link>{' '}
        or open source diagrams on{' '}
        <Link className="underline" href="/diagrams">
          Diagrams
        </Link>
        .
      </p>
    </div>
  );
}
