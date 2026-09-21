import ELK from 'elkjs/lib/elk.bundled.js';
import type { Edge, Node } from '@xyflow/react';
import type { ChartEdgeModel, ChartNodeModel } from '@/domain/chart/project';

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 188;

export type LayoutDirection = 'TOP_DOWN' | 'LEFT_RIGHT';
export type ChartPoint = { x: number; y: number };

export function snapshotNodePositions(nodes: Node[]): Record<string, ChartPoint> {
  return Object.fromEntries(nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }]));
}

export function applyPinnedPositions(nodes: Node[], pinned?: Record<string, ChartPoint>): Node[] {
  if (!pinned) return nodes;
  return nodes.map((node) => {
    const pin = pinned[node.id];
    return pin ? { ...node, position: { x: pin.x, y: pin.y } } : node;
  });
}

function toFlowNodes(
  models: ChartNodeModel[],
  direction: LayoutDirection,
  positions: Map<string, ChartPoint>,
): Node[] {
  return models.map((model) => ({
    id: model.id,
    type: 'position',
    position: positions.get(model.id) ?? { x: 0, y: 0 },
    data: { ...model, layoutDirection: direction },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    draggable: true,
  }));
}

function toFlowEdges(edgeModels: ChartEdgeModel[]): Edge[] {
  return edgeModels.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    animated: edge.kind !== 'PRIMARY',
    style:
      edge.kind === 'PRIMARY'
        ? { stroke: 'var(--color-brand)', strokeWidth: 1.6 }
        : { stroke: 'var(--color-signal)', strokeWidth: 1.4, strokeDasharray: '5 4' },
  }));
}

export async function layoutChart(
  models: ChartNodeModel[],
  edgeModels: ChartEdgeModel[],
  direction: LayoutDirection,
  pinned?: Record<string, ChartPoint>,
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const edges = toFlowEdges(edgeModels);
  const allPinned = Boolean(pinned && models.length > 0 && models.every((model) => pinned[model.id]));
  if (allPinned && pinned) {
    const positions = new Map(models.map((model) => [model.id, pinned[model.id]!]));
    return { nodes: toFlowNodes(models, direction, positions), edges };
  }

  const elk = new ELK();
  const primary = edgeModels.filter((edge) => edge.kind === 'PRIMARY');
  const horizontal = direction === 'LEFT_RIGHT';

  const laid = await elk.layout({
    id: 'org',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': horizontal ? 'RIGHT' : 'DOWN',
      'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': '104',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: models.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: primary.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  });

  const positions = new Map(
    (laid.children ?? []).map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]),
  );

  return {
    nodes: applyPinnedPositions(toFlowNodes(models, direction, positions), pinned),
    edges,
  };
}
