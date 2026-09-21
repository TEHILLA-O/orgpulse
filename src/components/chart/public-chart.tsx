'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useQuery } from '@tanstack/react-query';
import { PositionNode } from '@/components/chart/position-node';
import { layoutChart } from '@/components/chart/layout';
import type { ChartEdgeModel, ChartNodeModel } from '@/domain/chart/project';

const nodeTypes = { position: PositionNode };

interface PublicGraphResponse {
  nodes: ChartNodeModel[];
  edges: ChartEdgeModel[];
  chart: { name: string } | null;
  totals: { positions: number; rendered: number; vacant: number };
  share?: { allowEmbed: boolean };
}

function PublicChartInner({ token, embed }: { token: string; embed?: boolean }) {
  const flow = useReactFlow();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['public-chart', token, embed],
    queryFn: async () => {
      const params = embed ? '?embed=1' : '';
      const response = await fetch(`/api/v1/public/shares/${token}/graph${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'This chart is not available.');
      return payload as PublicGraphResponse;
    },
  });

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    layoutChart(data.nodes, data.edges, 'TOP_DOWN').then((laid) => {
      if (cancelled) return;
      setNodes(laid.nodes.map((node) => ({ ...node, draggable: false })));
      setEdges(laid.edges);
      requestAnimationFrame(() => flow.fitView({ padding: 0.12, duration: 250 }));
    });
    return () => {
      cancelled = true;
    };
  }, [data, flow]);

  const selected = useMemo(
    () => data?.nodes.find((node) => node.id === selectedId) ?? null,
    [data, selectedId],
  );

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-[var(--muted-foreground)]">
        {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-transparent">
      {embed ? null : (
        <header className="flex items-center justify-between border-b border-white/10 bg-canvas/55 px-5 py-3 backdrop-blur-xl">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.22em] text-brand uppercase">Omni org chart</p>
            <p className="text-sm font-semibold">{data?.chart?.name ?? 'Shared chart'}</p>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            {data
              ? `${data.totals.positions} seats · ${data.totals.vacant} open · view only`
              : 'Opening…'}
          </p>
        </header>
      )}
      <div className="relative min-h-0 flex-1">
        {isLoading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-[var(--muted-foreground)]">
            Laying out organisation…
          </div>
        ) : null}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          minZoom={0.15}
          maxZoom={1.4}
          proOptions={{ hideAttribution: true }}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.15} color="rgba(255, 255, 255, 0.14)" />
          <MiniMap pannable zoomable maskColor="rgba(10, 13, 19, 0.72)" />
          <Controls showInteractive={false} />
        </ReactFlow>
        {selected ? (
          <aside className="absolute top-4 right-4 w-64 rounded-2xl border border-white/15 bg-raised/85 p-4 text-white shadow-[0_16px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl">
            <p className="text-sm font-semibold">{selected.occupants[0]?.displayName ?? 'Open role'}</p>
            <p className="text-xs text-[var(--muted-foreground)]">{selected.title}</p>
            <p className="mt-2 text-xs">{selected.departmentName ?? 'Unassigned'}</p>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export function PublicChart({ token, embed }: { token: string; embed?: boolean }) {
  return (
    <ReactFlowProvider>
      <PublicChartInner token={token} embed={embed} />
    </ReactFlowProvider>
  );
}
