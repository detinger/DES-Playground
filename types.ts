
export type DistributionType = 'exponential' | 'normal' | 'uniform' | 'constant' | 'triangular';

export interface DistributionParams {
  type: DistributionType;
  mean?: number;
  stdDev?: number;
  min?: number;
  max?: number;
  mode?: number;
  value?: number;
}

export interface NodeData {
  label: string;
  type: 'source' | 'server' | 'sink';
  distribution?: DistributionParams;
  capacity?: number; // For servers
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
