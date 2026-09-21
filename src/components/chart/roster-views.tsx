'use client';

import { useMemo, useState } from 'react';
import type { ChartNodeModel } from '@/domain/chart/project';
import { cn } from '@/lib/utils';

type SortKey = 'person' | 'title' | 'department' | 'location' | 'manager' | 'directReports';

interface Row {
  id: string;
  person: string;
  title: string;
  department: string;
  location: string;
  manager: string;
  email: string;
  directReports: number;
  status: string;
}

function rowsFromNodes(nodes: ChartNodeModel[]): Row[] {
  const rows: Row[] = [];
  for (const node of nodes) {
    if (node.occupants.length === 0) {
      rows.push({
        id: node.id,
        person: 'Vacant',
        title: node.title,
        department: node.departmentName ?? '—',
        location: node.locationName ?? '—',
        manager: node.managerName ?? '—',
        email: '—',
        directReports: node.directReportCount,
        status: 'Vacant',
      });
      continue;
    }
    for (const occupant of node.occupants) {
      rows.push({
        id: node.id,
        person: occupant.displayName,
        title: node.title,
        department: node.departmentName ?? '—',
        location: node.locationName ?? '—',
        manager: node.managerName ?? '—',
        email: occupant.email ?? '—',
        directReports: node.directReportCount,
        status: 'Occupied',
      });
    }
  }
  return rows;
}

export function DirectoryView({
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
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'person',
    dir: 'asc',
  });

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rowsFromNodes(nodes).filter((row) => {
      if (!needle) return true;
      return [row.person, row.title, row.department, row.location, row.manager, row.email]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
    const factor = sort.dir === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => {
      const left = a[sort.key];
      const right = b[sort.key];
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
      return String(left).localeCompare(String(right)) * factor;
    });
  }, [nodes, query, sort]);

  const toggle = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    );
  };

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-[var(--muted)] text-xs tracking-wide uppercase">
          <tr>
            {(
              [
                ['person', 'Name'],
                ['title', 'Title'],
                ['department', 'Department'],
                ['location', 'Location'],
                ['manager', 'Reports to'],
              ] as const
            ).map(([key, label]) => (
              <th key={key} className="px-4 py-2">
                <button type="button" className="font-semibold" onClick={() => toggle(key)}>
                  {label}
                  {sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              </th>
            ))}
            <th className="px-4 py-2">Email</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.id}-${row.person}`}
              className={cn(
                'cursor-pointer border-t border-[var(--border)] transition-colors duration-150 hover:bg-white/8',
                selectedId === row.id && 'bg-brand/12',
              )}
              onClick={() => onSelect(row.id)}
            >
              <td className="px-4 py-2 font-medium">{row.person}</td>
              <td className="px-4 py-2">{row.title}</td>
              <td className="px-4 py-2">{row.department}</td>
              <td className="px-4 py-2">{row.location}</td>
              <td className="px-4 py-2">{row.manager}</td>
              <td className="px-4 py-2">{row.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GridView({
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
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'title',
    dir: 'asc',
  });

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rowsFromNodes(nodes).filter((row) => {
      if (!needle) return true;
      return [row.person, row.title, row.department, row.location, row.manager, row.status]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
    const factor = sort.dir === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => {
      const left = a[sort.key];
      const right = b[sort.key];
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
      return String(left).localeCompare(String(right)) * factor;
    });
  }, [nodes, query, sort]);

  const toggle = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    );
  };

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-[var(--muted)] text-xs tracking-wide uppercase">
          <tr>
            {(
              [
                ['title', 'Position'],
                ['person', 'Person'],
                ['department', 'Department'],
                ['location', 'Location'],
                ['manager', 'Manager'],
                ['directReports', 'Direct reports'],
              ] as const
            ).map(([key, label]) => (
              <th key={key} className="px-4 py-2">
                <button type="button" className="font-semibold" onClick={() => toggle(key)}>
                  {label}
                  {sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              </th>
            ))}
            <th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.id}-${row.person}`}
              className={cn(
                'cursor-pointer border-t border-[var(--border)] transition-colors duration-150 hover:bg-white/8',
                selectedId === row.id && 'bg-brand/12',
                row.status === 'Vacant' && 'text-brand-hi',
              )}
              onClick={() => onSelect(row.id)}
            >
              <td className="px-4 py-2 font-medium">{row.title}</td>
              <td className="px-4 py-2">{row.person}</td>
              <td className="px-4 py-2">{row.department}</td>
              <td className="px-4 py-2">{row.location}</td>
              <td className="px-4 py-2">{row.manager}</td>
              <td className="px-4 py-2">{row.directReports}</td>
              <td className="px-4 py-2">{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
