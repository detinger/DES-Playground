// DES model validator — structural, parameter and feasibility checks.
// PLAN.md §2.3

import {
  DesModel, DesNode, Distribution,
  ValidationIssue, ValidationResult, Severity,
} from './model';

type IssueBuilder = Omit<ValidationIssue, 'id'>;

function makeIssues(raw: IssueBuilder[]): ValidationIssue[] {
  return raw.map((r, i) => ({ ...r, id: `v-${Date.now()}-${i}` }));
}

// ─── Distribution checks ───────────────────────────────────────────────────────

function checkDistribution(
  dist: Distribution,
  nodeId: string,
  field: string,
  label: string,
): IssueBuilder[] {
  const issues: IssueBuilder[] = [];

  if (dist.kind === 'exponential') {
    if (!Number.isFinite(dist.mean) || dist.mean <= 0) {
      issues.push({
        severity: 'error', category: 'parameter', nodeId, field,
        title: `${label}: exponential mean must be > 0`,
        explanation: `Got mean = ${dist.mean}. Exponential distributions require a strictly positive mean.`,
        consequence: 'Simulation cannot run — zero or negative inter-arrival/service times are undefined.',
        suggestedFix: 'Set the mean to a positive value (e.g. 5 minutes).',
      });
    }
  }

  if (dist.kind === 'uniform') {
    if (dist.min < 0) {
      issues.push({
        severity: 'error', category: 'parameter', nodeId, field,
        title: `${label}: uniform min must be ≥ 0 for duration parameters`,
        explanation: `min = ${dist.min} is negative.`,
        consequence: 'Negative duration samples are not physically meaningful.',
        suggestedFix: 'Set min ≥ 0.',
      });
    }
    if (!Number.isFinite(dist.min) || !Number.isFinite(dist.max)) {
      issues.push({
        severity: 'error', category: 'parameter', nodeId, field,
        title: `${label}: uniform bounds must be finite`,
        explanation: `Got min = ${dist.min}, max = ${dist.max}.`,
        consequence: 'Non-finite bounds produce undefined samples.',
        suggestedFix: 'Enter finite numeric values for min and max.',
      });
    } else if (dist.min > dist.max) {
      issues.push({
        severity: 'error', category: 'parameter', nodeId, field,
        title: `${label}: uniform min must be ≤ max`,
        explanation: `min (${dist.min}) > max (${dist.max}) — the interval is empty.`,
        consequence: 'No valid sample exists. Simulation will error.',
        suggestedFix: 'Swap min and max, or choose valid bounds.',
      });
    } else if (dist.min === dist.max) {
      issues.push({
        severity: 'warning', category: 'parameter', nodeId, field,
        title: `${label}: uniform min = max — behaves like a constant`,
        explanation: `Both bounds are ${dist.min}. Consider using a Constant distribution instead.`,
        consequence: 'Effectively a deterministic duration, which may not be intended.',
        suggestedFix: 'Use a Constant distribution, or set different min and max.',
      });
    }
  }

  if (dist.kind === 'normal') {
    if (!Number.isFinite(dist.stddev) || dist.stddev <= 0) {
      issues.push({
        severity: 'error', category: 'parameter', nodeId, field,
        title: `${label}: normal std deviation must be > 0`,
        explanation: `Got std deviation = ${dist.stddev}.`,
        consequence: 'Zero or negative std deviation degenerates the distribution.',
        suggestedFix: 'Set std deviation to a positive value.',
      });
    }
    if (Number.isFinite(dist.mean) && Number.isFinite(dist.stddev) && dist.stddev > 0) {
      // If more than 50% of the probability mass is at or below 0, warn
      const zScore = -dist.mean / dist.stddev; // P(X ≤ 0) ≈ Φ(z)
      if (zScore > 0) {
        issues.push({
          severity: 'warning', category: 'parameter', nodeId, field,
          title: `${label}: many samples may be negative (mean < 0 relative to std deviation)`,
          explanation: `Mean = ${dist.mean}, std = ${dist.stddev}. More than 50% of samples would be ≤ 0 before the nonnegative policy is applied.`,
          consequence: 'Excessive rejection sampling may skew the effective distribution or slow the simulation.',
          suggestedFix: 'Use a mean well above zero relative to std deviation, or choose a different distribution.',
        });
      }
    }
  }

  if (dist.kind === 'triangular') {
    if (
      !Number.isFinite(dist.min) ||
      !Number.isFinite(dist.mode) ||
      !Number.isFinite(dist.max)
    ) {
      issues.push({
        severity: 'error', category: 'parameter', nodeId, field,
        title: `${label}: triangular parameters must be finite numbers`,
        explanation: `Got min=${dist.min}, mode=${dist.mode}, max=${dist.max}.`,
        consequence: 'Non-finite values produce undefined samples.',
        suggestedFix: 'Enter finite numeric values for all three parameters.',
      });
    } else if (dist.min > dist.mode || dist.mode > dist.max) {
      issues.push({
        severity: 'error', category: 'parameter', nodeId, field,
        title: `${label}: triangular requires min ≤ mode ≤ max`,
        explanation: `Got min=${dist.min}, mode=${dist.mode}, max=${dist.max}.`,
        consequence: 'Invalid parameter ordering — no valid triangular distribution exists.',
        suggestedFix: 'Ensure min ≤ mode ≤ max.',
      });
    }
    if (dist.min < 0) {
      issues.push({
        severity: 'warning', category: 'parameter', nodeId, field,
        title: `${label}: triangular min < 0 may produce negative durations`,
        explanation: `min = ${dist.min} is negative.`,
        consequence: 'Negative samples will be drawn; nonnegative clamping will distort the distribution.',
        suggestedFix: 'Set min ≥ 0 for duration parameters.',
      });
    }
  }

  if (dist.kind === 'constant') {
    if (!Number.isFinite(dist.value) || dist.value <= 0) {
      issues.push({
        severity: 'error', category: 'parameter', nodeId, field,
        title: `${label}: constant duration must be > 0`,
        explanation: `Got value = ${dist.value}.`,
        consequence: 'Zero or negative duration is not physically meaningful and will cause simulation errors.',
        suggestedFix: 'Set the constant value to a positive number.',
      });
    }
  }

  return issues;
}

// ─── Main validator ────────────────────────────────────────────────────────────

export function validateModel(model: DesModel): ValidationResult {
  const raw: IssueBuilder[] = [];

  const sources = model.nodes.filter(n => n.config.kind === 'source');
  const servers = model.nodes.filter(n => n.config.kind === 'server');
  const sinks   = model.nodes.filter(n => n.config.kind === 'sink');

  // ── Structural ──────────────────────────────────────────────────────────────

  if (sources.length === 0) {
    raw.push({
      severity: 'error', category: 'structure',
      title: 'No Source node',
      explanation: 'The model has no Source node to generate entity arrivals.',
      consequence: 'The simulation has no input — it cannot run.',
      suggestedFix: 'Drag a Source node onto the canvas and connect it.',
    });
  }

  if (sinks.length === 0) {
    raw.push({
      severity: 'error', category: 'structure',
      title: 'No Sink node',
      explanation: 'The model has no Sink node to absorb completed entities.',
      consequence: 'Entities have nowhere to leave the system; queues will grow unboundedly.',
      suggestedFix: 'Add a Sink node and connect the last service station to it.',
    });
  }

  // Source nodes must have at least one outgoing edge
  sources.forEach(node => {
    const out = model.edges.filter(e => e.sourceId === node.id);
    if (out.length === 0) {
      raw.push({
        severity: 'error', category: 'structure', nodeId: node.id,
        title: `Source "${node.name}" has no outgoing connection`,
        explanation: 'A Source must connect to at least one downstream component.',
        consequence: 'All generated entities disappear immediately — no simulation is possible.',
        suggestedFix: 'Draw a connection from this Source to a Server or Sink.',
      });
    }
  });

  // Sink nodes must have at least one incoming edge
  sinks.forEach(node => {
    const inc = model.edges.filter(e => e.targetId === node.id);
    if (inc.length === 0) {
      raw.push({
        severity: 'error', category: 'structure', nodeId: node.id,
        title: `Sink "${node.name}" has no incoming connection`,
        explanation: 'A Sink must receive entities from at least one upstream component.',
        consequence: 'No entities will ever reach this Sink; it will record zero completions.',
        suggestedFix: 'Connect a Server (or Source) to this Sink.',
      });
    }
  });

  // Isolated server nodes (no input AND no output)
  servers.forEach(node => {
    const inc = model.edges.filter(e => e.targetId === node.id);
    const out = model.edges.filter(e => e.sourceId === node.id);
    if (inc.length === 0 && out.length === 0) {
      raw.push({
        severity: 'warning', category: 'structure', nodeId: node.id,
        title: `Server "${node.name}" is disconnected`,
        explanation: 'This node has no incoming or outgoing connections.',
        consequence: 'It will be silently ignored during the simulation run.',
        suggestedFix: 'Connect it to the main entity flow or delete it.',
      });
    } else if (inc.length === 0) {
      raw.push({
        severity: 'warning', category: 'structure', nodeId: node.id,
        title: `Server "${node.name}" has no incoming connection`,
        explanation: 'No entities will flow into this server.',
        consequence: 'The server will remain idle throughout the simulation.',
        suggestedFix: 'Connect a Source or another Server to this node.',
      });
    } else if (out.length === 0) {
      raw.push({
        severity: 'warning', category: 'structure', nodeId: node.id,
        title: `Server "${node.name}" has no outgoing connection`,
        explanation: 'Entities that complete service here have nowhere to go.',
        consequence: 'Completed entities accumulate in an implicit dead-end.',
        suggestedFix: 'Connect this Server to a Sink or another downstream node.',
      });
    }
  });

  // ── Parameter checks ────────────────────────────────────────────────────────

  model.nodes.forEach(node => {
    if (node.config.kind === 'source') {
      raw.push(...checkDistribution(
        node.config.interarrivalDistribution,
        node.id, 'interarrivalDistribution',
        `Source "${node.name}" inter-arrival time`,
      ));
    }

    if (node.config.kind === 'server') {
      const cap = node.config.capacity;
      if (!Number.isInteger(cap) || cap < 1) {
        raw.push({
          severity: 'error', category: 'parameter', nodeId: node.id, field: 'capacity',
          title: `Server "${node.name}": capacity must be a positive integer`,
          explanation: `Got capacity = ${cap}.`,
          consequence: 'Invalid capacity — the simulation cannot initialise service channels.',
          suggestedFix: 'Set capacity to 1 or a larger whole number.',
        });
      }
      raw.push(...checkDistribution(
        node.config.serviceDistribution,
        node.id, 'serviceDistribution',
        `Server "${node.name}" service time`,
      ));
    }
  });

  // ── Feasibility / stability ─────────────────────────────────────────────────

  // Single Source → single Server → Sink topology: estimate ρ for warning
  if (sources.length === 1 && servers.length === 1 && sinks.length >= 1) {
    const src = sources[0];
    const srv = servers[0];

    if (src.config.kind === 'source' && srv.config.kind === 'server') {
      const arriDist = src.config.interarrivalDistribution;
      const svcDist  = srv.config.serviceDistribution;

      // Extract mean for exponential and constant only (we can estimate λ, μ)
      let meanInterarrival: number | null = null;
      let meanService: number | null = null;

      if (arriDist.kind === 'exponential') meanInterarrival = arriDist.mean;
      if (arriDist.kind === 'constant')    meanInterarrival = arriDist.value;
      if (svcDist.kind  === 'exponential') meanService = svcDist.mean;
      if (svcDist.kind  === 'constant')    meanService = svcDist.value;

      if (meanInterarrival !== null && meanService !== null &&
          meanInterarrival > 0 && meanService > 0) {
        const lambda = 1 / meanInterarrival;
        const mu     = 1 / meanService;
        const c      = srv.config.capacity;
        const rho    = lambda / (c * mu);

        if (rho >= 1) {
          raw.push({
            severity: 'warning', category: 'feasibility', nodeId: srv.id,
            title: `Server may be overloaded (ρ = ${rho.toFixed(2)})`,
            explanation:
              `Estimated arrival rate λ = ${lambda.toFixed(3)}/min, ` +
              `service rate μ = ${mu.toFixed(3)}/min, ` +
              `capacity c = ${c}. ` +
              `Under classical M/M/c steady-state assumptions, ρ = λ/(cμ) = ${rho.toFixed(2)} ≥ 1 implies the queue grows without bound.`,
            consequence:
              'No finite steady-state queue length exists under these assumptions. ' +
              'The simulation will run, but results for a long horizon will show unbounded growth.',
            suggestedFix:
              `Reduce the arrival rate, increase service rate, or add parallel servers (current capacity: ${c}).`,
          });
        } else if (rho >= 0.9) {
          raw.push({
            severity: 'info', category: 'feasibility', nodeId: srv.id,
            title: `High utilisation (ρ ≈ ${(rho * 100).toFixed(0)}%)`,
            explanation:
              `ρ = ${rho.toFixed(2)} is near the stability boundary. ` +
              `The system is stable, but queue lengths and waiting times are very sensitive to variability.`,
            consequence:
              'Short simulation runs may not reflect long-run behaviour. Consider warm-up periods and multiple replications.',
            suggestedFix:
              'Run multiple replications with a generous horizon and warm-up period to get reliable estimates.',
          });
        }
      }
    }
  }

  const issues = makeIssues(raw);
  return {
    issues,
    hasErrors:   issues.some(i => i.severity === 'error'),
    hasWarnings: issues.some(i => i.severity === 'warning'),
  };
}
