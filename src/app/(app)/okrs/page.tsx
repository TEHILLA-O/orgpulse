'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectItem } from '@/components/ui/select';

interface KeyResult {
  id: string;
  title: string;
  unit: string;
  currentValue: number;
  targetValue: number;
}

interface Objective {
  id: string;
  title: string;
  description: string;
  cycleLabel: string;
  status: string;
  ownerPerson: { id: string; displayName: string } | null;
  keyResults: KeyResult[];
}

interface PersonOption {
  id: string;
  displayName: string;
}

export default function OkrsPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [cycleLabel, setCycleLabel] = useState('H2 2026');
  const [ownerPersonId, setOwnerPersonId] = useState('');
  const [krTitle, setKrTitle] = useState('');
  const [krTarget, setKrTarget] = useState('100');

  const { data } = useQuery({
    queryKey: ['objectives'],
    queryFn: async () => {
      const response = await fetch('/api/v1/objectives');
      if (!response.ok) throw new Error('Failed to load OKRs');
      return (await response.json()) as { objectives: Objective[] };
    },
  });

  const { data: peopleData } = useQuery({
    queryKey: ['people-lite'],
    queryFn: async () => {
      const response = await fetch('/api/v1/people?take=250');
      if (!response.ok) throw new Error('Failed to load people');
      return (await response.json()) as { people: PersonOption[] };
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const keyResults = krTitle.trim()
        ? [{ title: krTitle.trim(), unit: '%', targetValue: Number(krTarget) || 100 }]
        : [];
      const response = await fetch('/api/v1/objectives', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          cycleLabel,
          ownerPersonId: ownerPersonId || null,
          keyResults,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Could not create objective');
      return payload;
    },
    onSuccess: () => {
      toast.success('Objective added');
      setTitle('');
      setKrTitle('');
      queryClient.invalidateQueries({ queryKey: ['objectives'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateKr = useMutation({
    mutationFn: async (input: { id: string; currentValue: number }) => {
      const response = await fetch(`/api/v1/key-results/${input.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentValue: input.currentValue }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Could not update key result');
      return payload;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['objectives'] }),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs tracking-[0.25em] text-[var(--muted-foreground)] uppercase">Performance</p>
        <h1 className="text-2xl font-semibold">OKRs</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Objectives and key results live in the same workspace as the chart. Owners are people, not seats.
        </p>
      </div>

      <Card className="space-y-3">
        <h2 className="font-semibold">New objective</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Title</Label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Raise delivery predictability" />
          </div>
          <div>
            <Label>Cycle</Label>
            <Input value={cycleLabel} onChange={(event) => setCycleLabel(event.target.value)} />
          </div>
          <div>
            <Label>Owner</Label>
            <Select
              className="w-full"
              value={ownerPersonId}
              onValueChange={setOwnerPersonId}
            >
              <SelectItem value="">Unassigned</SelectItem>
              {(peopleData?.people ?? []).map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.displayName}
                </SelectItem>
              ))}
            </Select>
          </div>
          <div>
            <Label>First key result</Label>
            <Input value={krTitle} onChange={(event) => setKrTitle(event.target.value)} placeholder="Optional" />
          </div>
          <div>
            <Label>Target</Label>
            <Input value={krTarget} onChange={(event) => setKrTarget(event.target.value)} />
          </div>
        </div>
        <Button disabled={title.trim().length < 3 || create.isPending} onClick={() => create.mutate()}>
          Create
        </Button>
      </Card>

      {(data?.objectives ?? []).map((objective) => (
        <Card key={objective.id} className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{objective.title}</p>
              <p className="text-sm text-[var(--muted-foreground)]">
                {objective.cycleLabel || 'No cycle'}
                {objective.ownerPerson ? ` · ${objective.ownerPerson.displayName}` : ''}
              </p>
            </div>
            <Badge tone="sea">{objective.status}</Badge>
          </div>
          {objective.description ? <p className="text-sm">{objective.description}</p> : null}
          <ul className="space-y-3">
            {objective.keyResults.map((kr) => {
              const pct =
                kr.targetValue === 0 ? 0 : Math.min(100, Math.max(0, (kr.currentValue / kr.targetValue) * 100));
              return (
                <li key={kr.id}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm">{kr.title}</p>
                    <div className="flex items-center gap-2">
                      <Input
                        className="h-8 w-20"
                        defaultValue={String(kr.currentValue)}
                        onBlur={(event) => {
                          const next = Number(event.target.value);
                          if (Number.isFinite(next) && next !== kr.currentValue) {
                            updateKr.mutate({ id: kr.id, currentValue: next });
                          }
                        }}
                      />
                      <span className="text-xs text-[var(--muted-foreground)]">
                        / {kr.targetValue} {kr.unit}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
