'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PositionNode } from '@/components/chart/position-node';
import { layoutChart, snapshotNodePositions, type ChartPoint } from '@/components/chart/layout';
import { ChartToolbar, filterQuery } from '@/components/chart/chart-toolbar';
import { ChartLegend } from '@/components/chart/chart-legend';
import { DetailsDrawer } from '@/components/chart/details-drawer';
import { FacesView } from '@/components/chart/faces-view';
import { DirectoryView, GridView } from '@/components/chart/roster-views';
import { parseChartSurface, type ChartSurface } from '@/components/chart/chart-surface';
import { ShareDialog } from '@/components/chart/share-dialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectItem } from '@/components/ui/select';
import type { ChartFilter } from '@/domain/org/types';
import type { ChartEdgeModel, ChartNodeModel } from '@/domain/chart/project';
import { reportingLineageIds } from '@/domain/chart/spotlight';

const nodeTypes = { position: PositionNode };

function positionsStorageKey(chartId: string) {
  return `omni:chart-positions:${chartId}`;
}

function readPinnedPositions(chartId: string): Record<string, ChartPoint> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(positionsStorageKey(chartId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ChartPoint>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePinnedPositions(chartId: string, pinned: Record<string, ChartPoint>) {
  if (typeof window === 'undefined') return;
  try {
    if (Object.keys(pinned).length === 0) {
      window.localStorage.removeItem(positionsStorageKey(chartId));
      return;
    }
    window.localStorage.setItem(positionsStorageKey(chartId), JSON.stringify(pinned));
  } catch {
    /* ignore quota / private mode */
  }
}

interface GraphResponse {
  nodes: ChartNodeModel[];
  edges: ChartEdgeModel[];
  departments: Array<{ id: string; name: string; colour: string | null }>;
  locations: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string; kind: string; colour: string | null }>;
  totals: { positions: number; rendered: number; vacant: number };
  chart: { id?: string; name: string } | null;
  scenario: { id: string; name: string } | null;
}

interface ScenarioRow {
  id: string;
  name: string;
  changeCount: number;
}

function ChartInner({ role }: { role: string }) {
  const queryClient = useQueryClient();
  const flow = useReactFlow();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<ChartFilter>(() => {
    const groupIds = searchParams.get('groupIds')?.split(',').filter(Boolean);
    const departmentIds = searchParams.get('departmentIds')?.split(',').filter(Boolean);
    return {
      ...(groupIds?.length ? { groupIds } : {}),
      ...(departmentIds?.length ? { departmentIds } : {}),
    };
  });
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [layout, setLayout] = useState<'TOP_DOWN' | 'LEFT_RIGHT'>('TOP_DOWN');
  const [mode, setMode] = useState<'LIVE' | 'PLANNING'>(
    searchParams.get('scenario') ? 'PLANNING' : 'LIVE',
  );
  const [scenarioId, setScenarioId] = useState<string | null>(searchParams.get('scenario'));
  const [shareOpen, setShareOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('focus'));
  const [focus, setFocus] = useState<string | null>(searchParams.get('focus'));
  const [surface, setSurface] = useState<ChartSurface>(parseChartSurface(searchParams.get('view')));
  const [spotlight, setSpotlight] = useState(false);
  const [rosterQuery, setRosterQuery] = useState('');
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [pendingMove, setPendingMove] = useState<{ from: string; to: string } | null>(null);
  const [vacancyFor, setVacancyFor] = useState<string | null>(null);
  const [vacancyTitle, setVacancyTitle] = useState('New role');
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addTitle, setAddTitle] = useState('');
  const [addManager, setAddManager] = useState('');
  const canEdit = role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR';
  const canShare = role === 'OWNER' || role === 'ADMIN';
  const fitOnce = useRef(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const lastRevision = useRef<string | null>(null);
  const [pinned, setPinned] = useState<Record<string, ChartPoint>>({});
  const [layoutNonce, setLayoutNonce] = useState(0);
  const pinnedRef = useRef(pinned);
  const dragOrigin = useRef<{ id: string; position: ChartPoint } | null>(null);
  pinnedRef.current = pinned;

  useEffect(() => {
    setCanvasReady(true);
  }, []);

  const query = filterQuery(filters);
  const { data: scenarioData } = useQuery({
    queryKey: ['scenarios'],
    queryFn: async () => {
      const response = await fetch('/api/v1/scenarios');
      if (!response.ok) throw new Error('Failed to load scenarios');
      return (await response.json()) as { scenarios: ScenarioRow[] };
    },
  });
  const scenarios = scenarioData?.scenarios ?? [];

  const persistScenario = (nextMode: 'LIVE' | 'PLANNING', nextScenarioId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextMode === 'PLANNING' && nextScenarioId) params.set('scenario', nextScenarioId);
    else params.delete('scenario');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (mode !== 'PLANNING' || scenarioId || scenarios.length === 0) return;
    const id = scenarios[0]!.id;
    setScenarioId(id);
    persistScenario('PLANNING', id);
  }, [mode, scenarioId, scenarios]);

  const { data, isLoading } = useQuery({
    queryKey: ['chart-graph', query, collapsed.join(','), focus, mode === 'PLANNING' ? scenarioId : null],
    queryFn: async () => {
      const params = new URLSearchParams(query);
      if (collapsed.length) params.set('collapsed', collapsed.join(','));
      if (focus) params.set('focus', focus);
      if (mode === 'PLANNING' && scenarioId) params.set('scenarioId', scenarioId);
      const response = await fetch(`/api/v1/charts/current/graph?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to load chart');
      return (await response.json()) as GraphResponse;
    },
    enabled: mode !== 'PLANNING' || Boolean(scenarioId),
  });

  const { data: presence } = useQuery({
    queryKey: ['chart-presence', selectedId],
    queryFn: async () => {
      const response = await fetch('/api/v1/charts/presence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ focusPositionId: selectedId }),
      });
      if (!response.ok) throw new Error('Failed to update presence');
      return (await response.json()) as {
        viewers: Array<{ userId: string; name: string; focusPositionId: string | null }>;
        revision: string | null;
      };
    },
    refetchInterval: 8000,
  });

  useEffect(() => {
    if (!presence?.revision) return;
    if (lastRevision.current && lastRevision.current !== presence.revision) {
      queryClient.invalidateQueries({ queryKey: ['chart-graph'] });
      toast.message('Someone else changed the organisation. Reloaded the latest seats.');
    }
    lastRevision.current = presence.revision;
  }, [presence?.revision, queryClient]);

  const chartId = data?.chart?.id ?? 'default';

  const persistPinned = useCallback(
    (next: Record<string, ChartPoint>) => {
      pinnedRef.current = next;
      setPinned(next);
      writePinnedPositions(chartId, next);
    },
    [chartId],
  );

  useEffect(() => {
    persistPinned(readPinnedPositions(chartId));
  }, [chartId, persistPinned]);

  useEffect(() => {
    if (!data || surface !== 'hierarchy') return;
    let cancelled = false;
    layoutChart(data.nodes, data.edges, layout, pinnedRef.current).then((laid) => {
      if (cancelled) return;
      setNodes(laid.nodes);
      setEdges(laid.edges);
      if (focus) {
        requestAnimationFrame(() => {
          flow.setCenter(
            (laid.nodes.find((node) => node.id === focus)?.position.x ?? 0) + 134,
            (laid.nodes.find((node) => node.id === focus)?.position.y ?? 0) + 66,
            { zoom: 1.1, duration: 400 },
          );
        });
      } else if (!fitOnce.current) {
        fitOnce.current = true;
        requestAnimationFrame(() => flow.fitView({ padding: 0.12, duration: 420 }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [data, layout, flow, focus, surface, layoutNonce]);

  const lineage = useMemo(() => {
    if (!spotlight || !selectedId || !data) return null;
    return reportingLineageIds(data.edges, selectedId);
  }, [data, selectedId, spotlight]);

  const reparent = useMutation({
    mutationFn: async (body: { subordinatePositionId: string; managerPositionId: string }) => {
      const response = await fetch('/api/v1/relationships/reparent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...body,
          mode,
          scenarioId: mode === 'PLANNING' ? scenarioId ?? undefined : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Reparent failed');
      return payload;
    },
    onSuccess: () => {
      toast.success(mode === 'LIVE' ? 'Reporting line updated' : 'Recorded on the scenario');
      queryClient.invalidateQueries({ queryKey: ['chart-graph'] });
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createVacancy = useMutation({
    mutationFn: async (body: { title: string; managerPositionId: string }) => {
      const response = await fetch('/api/v1/positions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...body,
          mode,
          scenarioId: mode === 'PLANNING' ? scenarioId ?? undefined : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Could not create vacancy');
      return payload;
    },
    onSuccess: () => {
      toast.success(mode === 'PLANNING' ? 'Planned vacancy added' : 'Vacancy created');
      setVacancyFor(null);
      queryClient.invalidateQueries({ queryKey: ['chart-graph'] });
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addSeat = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/v1/charts/seats', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: addName.trim(),
          title: addTitle.trim(),
          managerPositionId: addManager || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Could not add person');
      return payload as { positionId: string | null };
    },
    onSuccess: (payload) => {
      toast.success('Saved to the organisation');
      setAddOpen(false);
      setAddName('');
      setAddTitle('');
      if (payload.positionId) {
        setSelectedId(payload.positionId);
        setFocus(payload.positionId);
      }
      queryClient.invalidateQueries({ queryKey: ['chart-graph'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedId(node.id);
  }, []);

  const onNodeDoubleClick = useCallback((_: unknown, node: Node) => {
    setCollapsed((current) =>
      current.includes(node.id) ? current.filter((id) => id !== node.id) : [...current, node.id],
    );
  }, []);

  const onNodeDragStart = useCallback((_: unknown, node: Node) => {
    dragOrigin.current = { id: node.id, position: { x: node.position.x, y: node.position.y } };
  }, []);

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (!canEdit) return;
      const intersecting = flow.getIntersectingNodes(node).filter((item) => item.id !== node.id);
      const target = intersecting[0];
      if (target) {
        setPendingMove({ from: node.id, to: target.id });
        return;
      }
      persistPinned(snapshotNodePositions(flow.getNodes()));
    },
    [canEdit, flow, persistPinned],
  );

  const restoreDragOrigin = useCallback(() => {
    const origin = dragOrigin.current;
    if (!origin) return;
    setNodes((current) =>
      current.map((item) =>
        item.id === origin.id ? { ...item, position: { x: origin.position.x, y: origin.position.y } } : item,
      ),
    );
  }, []);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!selectedId || !data) return;
      if (!event.key.startsWith('Arrow')) return;
      const parentEdge = data.edges.find(
        (edge) => edge.target === selectedId && edge.kind === 'PRIMARY',
      );
      const childEdge = data.edges.find(
        (edge) => edge.source === selectedId && edge.kind === 'PRIMARY',
      );
      if (event.key === 'ArrowUp' && parentEdge) {
        setSelectedId(parentEdge.source);
        setFocus(parentEdge.source);
      }
      if (event.key === 'ArrowDown' && childEdge) {
        setSelectedId(childEdge.target);
        setFocus(childEdge.target);
      }
    },
    [data, selectedId],
  );

  const persistView = (next: ChartSurface) => {
    setSurface(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'hierarchy') params.delete('view');
    else params.set('view', next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const displayedNodes = nodes.map((node) => ({
    ...node,
    selected: node.id === selectedId,
    style: {
      ...node.style,
      opacity: lineage && !lineage.has(node.id) ? 0.22 : 1,
    },
  }));

  return (
    <div className="flex h-full flex-col bg-transparent print-chart" onKeyDown={onKeyDown}>
      <div className="page-enter flex items-end justify-between px-4 pt-4 pb-1">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[var(--muted-foreground)] uppercase">
            {data?.chart?.name ?? 'Organisation chart'}
          </p>
          <p className="mt-0.5 text-sm text-[var(--foreground)]">
            {data
              ? `${data.totals.positions} seats · ${data.totals.positions - data.totals.vacant} filled · ${data.totals.vacant} open`
              : 'Opening chart…'}
            {mode === 'PLANNING' ? ` · Planning overlay${data?.scenario?.name ? ` · ${data.scenario.name}` : ''}` : ''}
            {spotlight && selectedId ? ' · Spotlight on' : ''}
            {presence?.viewers.length
              ? ` · ${presence.viewers.map((viewer) => viewer.name).join(', ')} also viewing`
              : ''}
          </p>
          {canEdit ? (
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {mode === 'LIVE'
                ? 'Live edit is on. Drag cards to organise the chart — they stay where you put them. Drop a card onto a manager to change reporting. Auto layout rebuilds the tree.'
                : 'Planning mode records a scenario overlay only. Switch to Live mode to edit the organisation database.'}
            </p>
          ) : (
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">You can view this chart. Editors can change seats on the canvas.</p>
          )}
        </div>
      </div>
      <ChartToolbar
        departments={data?.departments ?? []}
        locations={data?.locations ?? []}
        groups={data?.groups ?? []}
        filters={filters}
        onFilters={setFilters}
        onSearchSelect={(id) => {
          setFocus(id);
          setSelectedId(id);
          persistView('hierarchy');
        }}
        layout={layout}
        onLayout={(next) => {
          if (next !== layout) persistPinned({});
          setLayout(next);
        }}
        mode={mode}
        onMode={(next) => {
          setMode(next);
          persistScenario(next, next === 'PLANNING' ? scenarioId : null);
        }}
        canEdit={canEdit}
        onFit={() => flow.fitView({ padding: 0.12, duration: 420 })}
        onAutoLayout={() => {
          persistPinned({});
          setLayoutNonce((value) => value + 1);
        }}
        surface={surface}
        onSurface={persistView}
        spotlight={spotlight}
        onSpotlight={setSpotlight}
        onPrint={() => {
          if (surface === 'hierarchy') {
            flow.fitView({ padding: 0.08, duration: 320 });
            window.setTimeout(() => window.print(), 350);
          } else {
            window.print();
          }
        }}
        onExport={(format) => {
          window.location.href = `/api/v1/exports/directory?format=${format}`;
        }}
        onShare={() => setShareOpen(true)}
        rosterQuery={rosterQuery}
        onRosterQuery={setRosterQuery}
        scenarios={scenarios}
        scenarioId={scenarioId}
        onScenario={(id) => {
          setScenarioId(id);
          persistScenario('PLANNING', id);
        }}
        canShare={canShare}
        onAddPerson={() => {
          setAddManager(selectedId ?? '');
          setAddOpen(true);
        }}
      />
      <div className="canvas-grid relative min-h-0 flex-1">
        {isLoading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-[var(--muted-foreground)]">
            <span className="motion-pulse">Laying out organisation…</span>
          </div>
        ) : null}
        {surface === 'hierarchy' && canvasReady ? (
          <>
            <ReactFlow
              nodes={displayedNodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onNodeDragStart={onNodeDragStart}
              onNodeDragStop={onNodeDragStop}
              nodesDraggable={canEdit}
              nodesConnectable={false}
              nodeDragThreshold={8}
              minZoom={0.15}
              maxZoom={1.6}
              onlyRenderVisibleElements
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.15} color="rgba(255, 255, 255, 0.14)" />
              <MiniMap pannable zoomable maskColor="rgba(10, 13, 19, 0.72)" />
              <Controls showInteractive={false} />
            </ReactFlow>
            {data && data.totals.positions === 0 && canEdit && mode === 'LIVE' ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <div className="pointer-events-auto rounded-3xl border border-white/15 bg-surface/90 p-6 text-center shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                  <p className="text-lg font-semibold">Start this organisation chart</p>
                  <p className="mt-1 max-w-sm text-sm text-[var(--muted-foreground)]">
                    Add a first person at the top of the tree. You can drag cards onto managers afterwards — each change writes to Postgres.
                  </p>
                  <Button className="mt-4" onClick={() => setAddOpen(true)}>
                    Add first person
                  </Button>
                </div>
              </div>
            ) : null}
            <ChartLegend />
          </>
        ) : null}
        {surface === 'faces' && data ? (
          <FacesView
            nodes={data.nodes}
            selectedId={selectedId}
            onSelect={setSelectedId}
            query={rosterQuery}
          />
        ) : null}
        {surface === 'directory' && data ? (
          <DirectoryView
            nodes={data.nodes}
            selectedId={selectedId}
            onSelect={setSelectedId}
            query={rosterQuery}
          />
        ) : null}
        {surface === 'grid' && data ? (
          <GridView
            nodes={data.nodes}
            selectedId={selectedId}
            onSelect={setSelectedId}
            query={rosterQuery}
          />
        ) : null}
      </div>

      <DetailsDrawer
        positionId={selectedId}
        scenarioId={mode === 'PLANNING' ? scenarioId : null}
        onClose={() => setSelectedId(null)}
        onFocus={(id) => {
          setFocus(id);
          setSelectedId(id);
        }}
        canEdit={canEdit}
        liveEdit={canEdit && mode === 'LIVE'}
        onCreateVacancy={setVacancyFor}
      />

      <Dialog
        open={Boolean(pendingMove)}
        onOpenChange={(open) => {
          if (open) return;
          setPendingMove(null);
          restoreDragOrigin();
        }}
      >
        <DialogContent>
          <DialogTitle>Move position?</DialogTitle>
          <DialogDescription>
            {mode === 'LIVE'
              ? 'This updates the live reporting line in the database.'
              : 'This records a scenario change only. Live organisation data is not modified.'}
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => {
              restoreDragOrigin();
              setPendingMove(null);
            }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!pendingMove) return;
                reparent.mutate({
                  subordinatePositionId: pendingMove.from,
                  managerPositionId: pendingMove.to,
                });
                setPendingMove(null);
              }}
            >
              Confirm move
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(vacancyFor)} onOpenChange={(open) => !open && setVacancyFor(null)}>
        <DialogContent>
          <DialogTitle>Create vacancy</DialogTitle>
          <DialogDescription>
            {mode === 'PLANNING'
              ? 'Adds a planned open role on this scenario. Live seats are not created.'
              : 'Adds an unoccupied position reporting to the selected seat.'}
          </DialogDescription>
          <Input className="mt-3" value={vacancyTitle} onChange={(event) => setVacancyTitle(event.target.value)} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setVacancyFor(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!vacancyFor) return;
                createVacancy.mutate({ title: vacancyTitle, managerPositionId: vacancyFor });
              }}
            >
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (open) setAddManager(selectedId ?? addManager);
        }}
      >
        <DialogContent>
          <DialogTitle>Add a person</DialogTitle>
          <DialogDescription>
            Creates a person and a seat in the organisation database. Leave reports-to empty to place them at the top of the chart.
          </DialogDescription>
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-name">Name</Label>
              <Input id="add-name" value={addName} onChange={(event) => setAddName(event.target.value)} placeholder="Ada Lovelace" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-title">Job title</Label>
              <Input id="add-title" value={addTitle} onChange={(event) => setAddTitle(event.target.value)} placeholder="Chief Executive Officer" />
            </div>
            <div className="space-y-1.5">
              <Label>Reports to</Label>
              <Select value={addManager} onValueChange={setAddManager} className="w-full min-w-0">
                <SelectItem value="">Top of the chart</SelectItem>
                {(data?.nodes ?? []).map((node) => (
                  <SelectItem key={node.id} value={node.id}>
                    {(node.occupants[0]?.displayName ?? 'Open role') + ' · ' + node.title}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={addSeat.isPending || addName.trim().length < 1 || addTitle.trim().length < 2}
              onClick={() => addSeat.mutate()}
            >
              Save to database
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}

export function OrgChart({ role }: { role: string }) {
  return (
    <ReactFlowProvider>
      <ChartInner role={role} />
    </ReactFlowProvider>
  );
}
