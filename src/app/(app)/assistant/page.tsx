'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface Match {
  personId: string;
  positionId: string;
  displayName: string;
  title: string;
  groups: string[];
  facts: string;
}

interface AssistantAction {
  name: string;
  ok: boolean;
  mutating: boolean;
  summary: string;
}

export default function AssistantPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const { data: status } = useQuery({
    queryKey: ['assistant-status'],
    queryFn: async () => {
      const response = await fetch('/api/v1/assistant');
      if (!response.ok) throw new Error('Failed to load assistant status');
      return (await response.json()) as {
        settings: { privacyReviewComplete: boolean; modelConnected: boolean };
      };
    },
  });

  const lookup = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/v1/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Lookup failed');
      return payload as {
        privacyLocked: boolean;
        message: string;
        matches: Match[];
      };
    },
  });

  const ask = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/v1/assistant/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Ask failed');
      return payload as { answer: string; model: string; actions?: AssistantAction[]; changed?: boolean };
    },
    onSuccess: (payload) => {
      if (payload.changed) {
        queryClient.invalidateQueries({ queryKey: ['people'] });
        queryClient.invalidateQueries({ queryKey: ['chart-graph'] });
        queryClient.invalidateQueries({ queryKey: ['directory'] });
        toast.success('Live organisation updated.');
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const modelOn = status?.settings.modelConnected === true;
  const canAsk = modelOn;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs tracking-[0.25em] text-[var(--muted-foreground)] uppercase">Assistant</p>
        <h1 className="text-2xl font-semibold">Ask or change the organisation</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          The assistant scans live seats, departments, and OKRs. Editors can also ask it to rename people, change
          titles, move reporting lines, or add seats. It never sends emails or HR fields to the model.
        </p>
      </div>

      <Card className="border-signal/35 bg-signal/10">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 text-signal-soft" />
          <div>
            <p className="font-medium">
              {canAsk ? 'The AI agent can look up the org and apply edits you request' : 'Add an AI key to enable Ask'}
            </p>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Try “Who reports to Amelia?” or “Move Sam Imported to report to the CEO”.
            </p>
            <Badge tone="gold" className="mt-2">
              {canAsk ? 'Model connected · live tools on' : 'Model not connected'}
            </Badge>
          </div>
        </div>
      </Card>

      <Card className="space-y-3">
        <p className="text-sm">Ask a question, or tell it what to change. Look up still searches stored seats only.</p>
        <div className="flex flex-wrap gap-2">
          <Input
            className="min-w-[16rem] flex-1"
            placeholder="Who reports to the CEO? Change Ada’s title to Staff engineer"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                if (canAsk && q.trim().length >= 3) ask.mutate();
                else lookup.mutate();
              }
            }}
          />
          <Button onClick={() => lookup.mutate()} disabled={lookup.isPending}>
            {lookup.isPending ? 'Looking up…' : 'Look up'}
          </Button>
          <Button
            variant="outline"
            disabled={!canAsk || ask.isPending || q.trim().length < 3}
            title={canAsk ? 'Ask the AI agent to scan or edit the live organisation' : 'Add an AI key to enable Ask'}
            onClick={() => ask.mutate()}
          >
            {ask.isPending ? 'Working…' : 'Ask assistant'}
          </Button>
        </div>
        {lookup.data ? (
          <p className="text-sm text-[var(--muted-foreground)]">{lookup.data.message}</p>
        ) : null}
        {ask.data?.actions?.length ? (
          <ul className="flex flex-wrap gap-1">
            {ask.data.actions.map((action, index) => (
              <Badge key={`${action.name}-${index}`} tone={action.ok ? (action.mutating ? 'gold' : 'sea') : 'vacant'}>
                {action.summary}
              </Badge>
            ))}
          </ul>
        ) : null}
        {ask.data ? (
          <div className="rounded-2xl bg-white/8 p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {ask.data.answer}
          </div>
        ) : null}
      </Card>

      {(lookup.data?.matches ?? []).map((match) => (
        <Card key={`${match.personId}-${match.positionId}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{match.displayName}</p>
              <p className="text-sm text-[var(--muted-foreground)]">{match.title}</p>
            </div>
            <Link className="text-sm underline" href={`/charts?focus=${match.positionId}`}>
              Open on chart
            </Link>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {match.groups.map((group) => (
              <Badge key={group}>{group}</Badge>
            ))}
          </div>
          <p className="mt-3 text-sm">{match.facts}</p>
        </Card>
      ))}
    </div>
  );
}
