// M/M/c queueing theory — Erlang-C formula and steady-state metrics.
// PLAN.md §2.5 M/M/1 and M/M/c reference benchmarks.

import { DesModel } from './model';

export interface MMcParams {
  lambda: number;   // arrival rate (1/meanInterarrival)
  mu: number;       // service rate per server (1/meanService)
  c: number;        // number of parallel servers
  rho: number;      // traffic intensity λ/(c·μ)
}

export interface MMcResult {
  rho: number;
  erlangC: number;  // P(wait > 0)
  Wq: number;       // mean wait time in queue
  W: number;        // mean sojourn (system) time
  Lq: number;       // mean number waiting in queue
  L: number;        // mean number in system
  stable: boolean;
}

/** Erlang-C: probability that an arriving entity must wait (P(wait > 0)).
 *  Returns 1 for unstable systems (rho >= 1). */
export function computeErlangC(lambda: number, mu: number, c: number): number {
  const a   = lambda / mu;  // offered load (Erlangs)
  const rho = a / c;
  if (rho >= 1) return 1;

  // Compute sum_{k=0}^{c-1} a^k / k!
  let sum = 0;
  let fact = 1;
  let power = 1;
  for (let k = 0; k < c; k++) {
    if (k > 0) { fact *= k; power *= a; }
    sum += power / fact;
  }

  // The k=c term with (1-rho) denominator
  let cfact = 1;
  for (let k = 1; k <= c; k++) cfact *= k;
  const lastTerm = (power * a) / (cfact * (1 - rho)); // a^c / (c! (1-ρ))

  const P0 = 1 / (sum + lastTerm);
  return lastTerm * P0;
}

/** Steady-state metrics for M/M/c queue (Poisson arrivals, exponential service).
 *  Assumes stable system (ρ < 1); returns stable=false and ∞ metrics if ρ ≥ 1. */
export function mmcAnalysis(params: MMcParams): MMcResult {
  const { lambda, mu, c, rho } = params;

  if (rho >= 1) {
    return { rho, erlangC: 1, Wq: Infinity, W: Infinity, Lq: Infinity, L: Infinity, stable: false };
  }

  const C  = computeErlangC(lambda, mu, c);
  const Wq = C / (c * mu - lambda);  // = C / (c·μ·(1-ρ))
  const W  = Wq + 1 / mu;
  const Lq = lambda * Wq;
  const L  = lambda * W;

  return { rho, erlangC: C, Wq, W, Lq, L, stable: true };
}

/** Classify a model as M/M/c if it has exactly one Source (exponential interarrival),
 *  one Server (exponential service), and one Sink. Returns null for other topologies. */
export function detectMMc(model: DesModel): MMcParams | null {
  const sources = model.nodes.filter(n => n.config.kind === 'source');
  const servers = model.nodes.filter(n => n.config.kind === 'server');
  const sinks   = model.nodes.filter(n => n.config.kind === 'sink');

  if (sources.length !== 1 || servers.length !== 1 || sinks.length < 1) return null;

  const src = sources[0];
  const srv = servers[0];

  if (src.config.kind !== 'source' || srv.config.kind !== 'server') return null;

  const arriDist = src.config.interarrivalDistribution;
  const svcDist  = srv.config.serviceDistribution;

  // Only classify as M/M/c when both distributions are exponential
  if (arriDist.kind !== 'exponential') return null;
  if (svcDist.kind  !== 'exponential') return null;

  const lambda = 1 / arriDist.mean;
  const mu     = 1 / svcDist.mean;
  const c      = srv.config.capacity;
  const rho    = lambda / (c * mu);

  return { lambda, mu, c, rho };
}
