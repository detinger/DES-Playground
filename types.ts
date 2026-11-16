import type { AdvancedConfig, Distribution, NodeKind } from "./lib/model";

export type DistributionType =
  "exponential" | "normal" | "uniform" | "constant" | "triangular";

export interface DistributionParams {
  type: DistributionType;
  mean?: number;
  stdDev?: number;
  nonnegativePolicy?: "reject" | "truncate";
  min?: number;
  max?: number;
  mode?: number;
  value?: number;
}

export interface NodeData extends Record<string, unknown> {
  label: string;
  type: NodeKind;
  process?: AdvancedConfig;
  quantityDistribution?: Distribution;
  distribution?: DistributionParams;
  startTime?: number;
  endTime?: number;
  arrivalLimit?: number;
  entityType?: string;
  attributes?: Record<string, number>;
  queueDiscipline?: "fifo" | "priority";
  priorityAttribute?: string;
  capacity?: number; // For servers
  simActive?: boolean;
  simState?: any; // Live simulation state for visualization
}

export interface Entity {
  id: number;
  arrivalTime: number;
  startServiceTime?: number;
  endServiceTime?: number;
}

export interface ServerState {
  id: number;
  currentEntity: Entity | null;
  remainingServiceTime: number;
}

export interface SimulationStats {
  totalArrivals: number;
  totalDepartures: number;
  totalWaitTime: number;
  totalSystemTime: number;
  serverBusyTime: number;
  maxQueueLength: number;
}

export interface SimulationParams {
  arrivalRate: number; // lambda
  serviceRate: number; // mu
  numServers: number; // c (for M/M/c)
  simulationSpeed: number; // 1x, 2x, 5x, etc.
}
