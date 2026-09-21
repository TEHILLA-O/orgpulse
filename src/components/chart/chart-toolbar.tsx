'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Focus, Printer, Search, Share2, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectItem } from '@/components/ui/select';
import type { ChartFilter } from '@/domain/org/types';
import { activeFilterCount } from '@/domain/chart/filters';
import type { ChartSurface } from '@/components/chart/chart-surface';
import { cn } from '@/lib/utils';

interface SearchHit {
  id: string;
  kind: string;
  title: string;
  subtitle: string;
  positionId: string | null;
}

const SURFACES: Array<{ id: ChartSurface; label: string }> = [
  { id: 'hierarchy', label: 'Hierarchy' },
  { id: 'faces', label: 'Faces' },
  { id: 'directory', label: 'Directory' },
  { id: 'grid', label: 'Grid' },
];

export function ChartToolbar({
  departments,
  locations,
  groups,
  filters,
  onFilters,
  onSearchSelect,
  layout,
  onLayout,
  mode,
  onMode,
  canEdit,
  onFit,
  onAutoLayout,
  surface,
  onSurface,
  spotlight,
  onSpotlight,
  onPrint,
  onExport,
  onShare,
  rosterQuery,
  onRosterQuery,
  scenarios,
  scenarioId,
  onScenario,
  canShare,
  onAddPerson,
}: {
  departments: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string }>;
  filters: ChartFilter;
  onFilters: (filters: ChartFilter) => void;
  onSearchSelect: (positionId: string) => void;
  layout: 'TOP_DOWN' | 'LEFT_RIGHT';
  onLayout: (layout: 'TOP_DOWN' | 'LEFT_RIGHT') => void;
  mode: 'LIVE' | 'PLANNING';
  onMode: (mode: 'LIVE' | 'PLANNING') => void;
  canEdit: boolean;
  onFit: () => void;
  onAutoLayout?: () => void;
  surface: ChartSurface;
  onSurface: (surface: ChartSurface) => void;
  spotlight: boolean;
  onSpotlight: (value: boolean) => void;
  onPrint: () => void;
  onExport: (format: 'csv' | 'xlsx') => void;
  onShare: () => void;
  rosterQuery: string;
  onRosterQuery: (value: string) => void;
  scenarios: Array<{ id: string; name: string; changeCount: number }>;
  scenarioId: string | null;
  onScenario: (id: string | null) => void;
  canShare: boolean;
  onAddPerson?: () => void;
}) {
  const [q, setQ] = useState('');
  const { data } = useQuery({
    queryKey: ['search', q],
    enabled: q.length >= 2,
    queryFn: async () => {
      const response = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`);
      if (!response.ok) throw new Error('Search failed');
      return (await response.json()) as { results: SearchHit[] };
    },
  });

  const count = activeFilterCount(filters);

  return (
    <div className="no-print border-b border-transparent bg-transparent">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <div className="flex rounded-full bg-[var(--muted)] p-1">
          {SURFACES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-[color,background-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
                surface === item.id
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_6px_16px_rgba(76,141,255,0.28)]'
                  : 'text-[var(--muted-foreground)] hover:bg-white/8 hover:text-white',
              )}
              onClick={() => onSurface(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[16rem] flex-1">
          <Search className="absolute top-3 left-3.5 h-4 w-4 text-[var(--muted-foreground)]" />
          <Input
            className="pl-10"
            placeholder={
              surface === 'hierarchy'
                ? 'Find people, groups or enter a query'
                : 'Filter this view…'
            }
            value={surface === 'hierarchy' ? q : rosterQuery}
            onChange={(event) => {
              if (surface === 'hierarchy') setQ(event.target.value);
              else onRosterQuery(event.target.value);
            }}
          />
          {surface === 'hierarchy' && data?.results?.length ? (
            <ul className="motion-pop-in absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-white/15 bg-surface/95 p-1 shadow-[0_16px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl">
              {data.results.map((hit) => (
                <li key={`${hit.kind}-${hit.id}`}>
                  <button
                    className="w-full rounded-xl px-3 py-2 text-left text-sm transition-[background-color,transform] duration-150 hover:translate-x-0.5 hover:bg-[var(--muted)]"
                    onClick={() => {
                      if (hit.positionId) onSearchSelect(hit.positionId);
                      setQ('');
                    }}
                  >
                    <span className="font-medium">{hit.title}</span>
                    <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                      {hit.kind} · {hit.subtitle}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <Button variant="outline" size="sm" onClick={onPrint}>
          <Printer className="h-3.5 w-3.5" />
          Print
        </Button>
        <Button variant="outline" size="sm" onClick={() => onExport('csv')}>
          <Download className="h-3.5 w-3.5" />
          CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => onExport('xlsx')}>
          XLSX
        </Button>
        {canEdit && mode === 'LIVE' && onAddPerson ? (
          <Button size="sm" onClick={onAddPerson}>
            <UserPlus className="h-3.5 w-3.5" />
            Add person
          </Button>
        ) : null}
        {canShare ? (
          <Button variant="outline" size="sm" onClick={onShare}>
            <Share2 className="h-3.5 w-3.5" />
            Share
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <Select
          value={filters.groupIds?.[0] ?? ''}
          onValueChange={(value) =>
            onFilters({
              ...filters,
              groupIds: value ? [value] : undefined,
            })
          }
        >
          <SelectItem value="">All groups</SelectItem>
          {groups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              {group.name}
            </SelectItem>
          ))}
        </Select>
        <Select
          value={filters.departmentIds?.[0] ?? ''}
          onValueChange={(value) =>
            onFilters({
              ...filters,
              departmentIds: value ? [value] : undefined,
            })
          }
        >
          <SelectItem value="">All departments</SelectItem>
          {departments.map((dept) => (
            <SelectItem key={dept.id} value={dept.id}>
              {dept.name}
            </SelectItem>
          ))}
        </Select>
        <Select
          value={filters.locationIds?.[0] ?? ''}
          onValueChange={(value) =>
            onFilters({
              ...filters,
              locationIds: value ? [value] : undefined,
            })
          }
        >
          <SelectItem value="">All locations</SelectItem>
          {locations.map((location) => (
            <SelectItem key={location.id} value={location.id}>
              {location.name}
            </SelectItem>
          ))}
        </Select>
        <Select
          value={filters.positionStatuses?.[0] ?? ''}
          onValueChange={(value) =>
            onFilters({
              ...filters,
              positionStatuses: value
                ? [value as NonNullable<ChartFilter['positionStatuses']>[number]]
                : undefined,
            })
          }
        >
          <SelectItem value="">All positions</SelectItem>
          <SelectItem value="VACANT">Vacancies</SelectItem>
          <SelectItem value="ACTIVE">Active</SelectItem>
        </Select>
        {count > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => onFilters({})}>
            Clear all filters
          </Button>
        ) : null}
        {filters.departmentIds ? <Badge tone="sea">Department</Badge> : null}
        {filters.locationIds ? <Badge tone="sea">Location</Badge> : null}
        {filters.positionStatuses ? <Badge tone="vacant">Status</Badge> : null}
        {filters.groupIds ? <Badge tone="gold">Group</Badge> : null}

        {surface === 'hierarchy' ? (
          <>
            <Button
              variant={layout === 'TOP_DOWN' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onLayout('TOP_DOWN')}
            >
              Top-down
            </Button>
            <Button
              variant={layout === 'LEFT_RIGHT' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onLayout('LEFT_RIGHT')}
            >
              Left-right
            </Button>
            <Button variant="outline" size="sm" onClick={onFit}>
              Zoom to fit
            </Button>
            {onAutoLayout ? (
              <Button variant="outline" size="sm" onClick={onAutoLayout}>
                Auto layout
              </Button>
            ) : null}
            <Button
              variant={spotlight ? 'gold' : 'outline'}
              size="sm"
              onClick={() => onSpotlight(!spotlight)}
            >
              <Focus className="h-3.5 w-3.5" />
              Spotlight
            </Button>
          </>
        ) : null}
        {canEdit ? (
          <>
            <Button
              variant={mode === 'LIVE' ? 'gold' : 'outline'}
              size="sm"
              onClick={() => onMode(mode === 'LIVE' ? 'PLANNING' : 'LIVE')}
            >
              {mode === 'LIVE' ? 'Live mode' : 'Planning mode'}
            </Button>
            {mode === 'PLANNING' ? (
              <Select value={scenarioId ?? ''} onValueChange={(value) => onScenario(value || null)}>
                <SelectItem value="">Choose scenario</SelectItem>
                {scenarios.map((scenario) => (
                  <SelectItem key={scenario.id} value={scenario.id}>
                    {scenario.name}
                    {scenario.changeCount ? ` (${scenario.changeCount})` : ''}
                  </SelectItem>
                ))}
              </Select>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

export function filterQuery(filters: ChartFilter): string {
  const params = new URLSearchParams();
  if (filters.departmentIds?.length) params.set('departmentIds', filters.departmentIds.join(','));
  if (filters.locationIds?.length) params.set('locationIds', filters.locationIds.join(','));
  if (filters.positionStatuses?.length) params.set('positionStatuses', filters.positionStatuses.join(','));
  if (filters.personStatuses?.length) params.set('personStatuses', filters.personStatuses.join(','));
  if (filters.personId) params.set('personId', filters.personId);
  if (filters.managerPositionId) params.set('managerPositionId', filters.managerPositionId);
  if (filters.groupIds?.length) params.set('groupIds', filters.groupIds.join(','));
  return params.toString();
}
