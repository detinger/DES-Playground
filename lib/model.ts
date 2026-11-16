// Canonical DES model types — independent of React Flow representation
// PLAN.md §3.4

export const SCHEMA_VERSION = 1 as const;

export type Id = string;
export type TimeUnit = 'second' | 'minute' | 'hour';

// Source / Server / Sink are the only supported node kinds in Phase 2.
// Router, Delay, ResourcePool are P2/P3 — not yet modelled.
export type NodeKind = 'source' | 'server' | 'sink';

// Canonical distribution union — parameterised by physical meaning, not by number.
export type Distribution =
  | { kind: 'constant';    value: number }
  | { kind: 'exponential'; mean: number }
  | { kind: 'uniform';     min: number; max: number }
  | { kind: 'normal';      mean: number; stddev: number; nonnegativePolicy: 'reject' | 'truncate' }
  | { kind: 'triangular';  min: number; mode: number; max: number };

// Per-kind node configurations
export interface SourceConfig {
  kind: 'source';
  interarrivalDistribution: Distribution;
  startTime?: number;
  endTime?: number;
  arrivalLimit?: number;
}

export interface ServerConfig {
  kind: 'server';
  capacity: number;
  serviceDistribution: Distribution;
  queueDiscipline: 'fifo';
}

export interface SinkConfig {
  kind: 'sink';
  completionCategory?: string;
}

export type NodeConfig = SourceConfig | ServerConfig | SinkConfig;

export interface DesNode {
  id: Id;
  name: string;
  config: NodeConfig;
  position: { x: number; y: number };
}

export interface DesEdge {
  id: Id;
  sourceId: Id;
  targetId: Id;
  kind: 'entityFlow';
  routingWeight?: number;
}

export interface DesModel {
  schemaVersion: typeof SCHEMA_VERSION;
  id: Id;
  name: string;
  unit: TimeUnit;
  nodes: DesNode[];
  edges: DesEdge[];
  metadata?: {
    description?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

// ─── Validation ────────────────────────────────────────────────────────────────

export type Severity = 'error' | 'warning' | 'recommendation' | 'info';
export type ValidationCategory =
  | 'structure'
  | 'semantic'
  | 'parameter'
  | 'units'
  | 'statistics'
  | 'feasibility';

export interface ValidationIssue {
  id: string;
  severity: Severity;
  category: ValidationCategory;
  nodeId?: Id;
  edgeId?: Id;
  field?: string;
  title: string;
  explanation: string;
  consequence: string;
  suggestedFix?: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  hasErrors: boolean;
  hasWarnings: boolean;
}
