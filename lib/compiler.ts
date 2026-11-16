// Compiles from the React Flow editor representation into the canonical DesModel.
// This is the single translation point — editor and generator both consume DesModel.

import { Node, Edge } from '@xyflow/react';
import { NodeData, DistributionParams } from '../types';
import {
  DesModel, DesNode, DesEdge, Distribution, NodeConfig,
  SourceConfig, ServerConfig, SinkConfig, SCHEMA_VERSION,
} from './model';

function compileDistribution(d: DistributionParams): Distribution {
  switch (d.type) {
    case 'exponential':
      return { kind: 'exponential', mean: d.mean ?? 1 };
    case 'uniform':
      return { kind: 'uniform', min: d.min ?? 0, max: d.max ?? 1 };
    case 'normal':
      return { kind: 'normal', mean: d.mean ?? 1, stddev: d.stdDev ?? 0.5, nonnegativePolicy: 'reject' };
    case 'triangular':
      return { kind: 'triangular', min: d.min ?? 0, mode: d.mode ?? 1, max: d.max ?? 2 };
    case 'constant':
      return { kind: 'constant', value: d.value ?? 1 };
    default:
      return { kind: 'exponential', mean: 1 };
  }
}

function compileNodeConfig(data: NodeData): NodeConfig {
  if (data.type === 'source') {
    const cfg: SourceConfig = {
      kind: 'source',
      interarrivalDistribution: compileDistribution(
        data.distribution ?? { type: 'exponential', mean: 1 }
      ),
    };
    return cfg;
  }
  if (data.type === 'server') {
    const cfg: ServerConfig = {
      kind: 'server',
      capacity: data.capacity ?? 1,
      serviceDistribution: compileDistribution(
        data.distribution ?? { type: 'exponential', mean: 1 }
      ),
      queueDiscipline: 'fifo',
    };
    return cfg;
  }
  const cfg: SinkConfig = { kind: 'sink' };
  return cfg;
}

export interface CompileOptions {
  name?: string;
  unit?: 'second' | 'minute' | 'hour';
  modelId?: string;
}

export function compileModel(
  rfNodes: Node<NodeData>[],
  rfEdges: Edge[],
  options: CompileOptions = {}
): DesModel {
  const nodes: DesNode[] = rfNodes.map(n => ({
    id: n.id,
    name: n.data.label,
    config: compileNodeConfig(n.data),
    position: n.position,
  }));

  const edges: DesEdge[] = rfEdges.map(e => ({
    id: e.id,
    sourceId: e.source,
    targetId: e.target,
    kind: 'entityFlow' as const,
  }));

  const now = new Date().toISOString();

  return {
    schemaVersion: SCHEMA_VERSION,
    id: options.modelId ?? `model-${Date.now()}`,
    name: options.name ?? 'Untitled Model',
    unit: options.unit ?? 'minute',
    nodes,
    edges,
    metadata: { createdAt: now, updatedAt: now },
  };
}
