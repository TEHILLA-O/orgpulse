'use client';

import { Badge } from '@/components/ui/badge';
import { initials, portraitUrl } from '@/lib/utils';
import type { ChartNodeModel } from '@/domain/chart/project';
import { cn } from '@/lib/utils';

export function FacesView({
  nodes,
  selectedId,
  onSelect,
  query,
}: {
  nodes: ChartNodeModel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
}) {
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? nodes.filter((node) => {
        const haystack = [
          node.title,
          node.departmentName,
          node.locationName,
          node.managerName,
          ...node.occupants.map((occupant) => `${occupant.displayName} ${occupant.email ?? ''}`),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(needle);
      })
    : nodes;
  const groups = groupByDepartment(filtered);

  return (
    <div className="h-full overflow-auto p-4">
      {groups.map((group) => (
        <section key={group.name} className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-sm"
              style={{ background: group.colour ?? 'var(--color-brand)' }}
            />
            <h2 className="text-sm font-semibold">{group.name}</h2>
            <span className="text-xs text-[var(--muted-foreground)]">{group.nodes.length}</span>
          </div>
          <div className="stagger-in grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
            {group.nodes.map((node) => {
              const occupant = node.occupants[0];
              const name = occupant?.displayName ?? 'Vacant';
              const photo = occupant ? portraitUrl(occupant.personId, occupant.profilePhotoUrl) : null;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => onSelect(node.id)}
                  className={cn(
                    'overflow-hidden rounded-2xl border bg-raised/70 text-left text-white shadow-[0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-[transform,box-shadow,border-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(0,0,0,0.38)] active:scale-[0.98]',
                    selectedId === node.id
                      ? 'border-brand ring-4 ring-brand/20'
                      : 'border-white/12',
                    node.isVacant && 'border-dashed border-caution/45 bg-raised/40',
                  )}
                >
                  <div className="flex flex-col items-center p-4 text-center">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo}
                        alt=""
                        className="h-16 w-16 rounded-full object-cover ring-2 ring-white/25"
                      />
                    ) : (
                      <div
                        className={cn(
                          'flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold',
                          node.isVacant ? 'bg-white/10 text-brand-hi' : 'bg-brand text-ink-invert',
                        )}
                      >
                        {node.isVacant ? 'V' : initials(name)}
                      </div>
                    )}
                    <p className="mt-3 w-full truncate text-sm font-semibold">{name}</p>
                    <p className="w-full truncate text-xs text-[var(--muted-foreground)]">{node.title}</p>
                    <p className="mt-1 w-full truncate text-[11px] text-[var(--muted-foreground)]">
                      {node.locationName ?? '—'}
                    </p>
                    <div className="mt-2 flex flex-wrap justify-center gap-1">
                      {node.isVacant ? <Badge tone="vacant">Open</Badge> : null}
                      {node.occupants.length > 1 ? <Badge tone="sea">Shared</Badge> : null}
                    </div>
                  </div>
                  <div
                    className="h-7 w-full px-2 text-center text-[11px] leading-7 font-medium text-white"
                    style={{ background: node.isVacant ? 'var(--color-caution)' : (node.departmentColour ?? 'var(--color-brand)') }}
                  >
                    <span className="block truncate">{node.departmentName ?? 'Unassigned'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function groupByDepartment(nodes: ChartNodeModel[]) {
  const map = new Map<string, { name: string; colour: string | null; nodes: ChartNodeModel[] }>();
  for (const node of nodes) {
    const name = node.departmentName ?? 'Unassigned';
    const existing = map.get(name);
    if (existing) {
      existing.nodes.push(node);
    } else {
      map.set(name, { name, colour: node.departmentColour, nodes: [node] });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
