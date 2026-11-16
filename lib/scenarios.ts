import { DesModel, DesNode, Distribution } from './model';
import { RunConfig, RunOutput, RunMetrics, CIResult } from './engine';

export interface Scenario {
  id: 'baseline' | 'alternative';
  name: string;
  nodes: any[];
  edges: any[];
  config: RunConfig;
  output: RunOutput;
  model: DesModel;
  savedAt: number;
}

export interface ComparisonKpi {
  key: keyof RunMetrics;
  label: string;
  fmt: (v: number) => string;
  unit: string;
  lowerIsBetter: boolean | null;
  baselineValue: number;
  altValue: number;
  baselineCI?: CIResult;
  altCI?: CIResult;
  absDiff: number;
  pctDiff: number;
}

export interface ModelParamDiff {
  nodeId: string;
  nodeName: string;
  field: string;
  baseline: string;
  alternative: string;
}

export interface ScenarioComparison {
  kpis: ComparisonKpi[];
  modelDiffs: ModelParamDiff[];
}

const KPI_DEFS: Array<{
  key: keyof RunMetrics;
  label: string;
  fmt: (v: number) => string;
  unit: string;
  lowerIsBetter: boolean | null;
}> = [
  { key: 'avgWaitTime',     label: 'Avg wait (Wq)',   fmt: v => v.toFixed(2),          unit: 'min',  lowerIsBetter: true  },
  { key: 'avgSojournTime',  label: 'Avg sojourn (W)', fmt: v => v.toFixed(2),          unit: 'min',  lowerIsBetter: true  },
  { key: 'avgUtilization',  label: 'Utilisation (ρ̂)', fmt: v => (v*100).toFixed(1),   unit: '%',    lowerIsBetter: null  },
  { key: 'avgQueueLength',  label: 'Avg queue (Lq)',  fmt: v => v.toFixed(2),          unit: '',     lowerIsBetter: true  },
  { key: 'throughput',      label: 'Throughput',      fmt: v => v.toFixed(3),          unit: '/min', lowerIsBetter: false },
  { key: 'totalDepartures', label: 'Departures',      fmt: v => String(Math.round(v)), unit: '',     lowerIsBetter: false },
];

function getMetricMean(output: RunOutput, key: keyof RunMetrics): { value: number; ci?: CIResult } {
  const ci = output.ci[key];
  return ci ? { value: ci.mean, ci } : { value: output.primary.metrics[key] };
}

function distLabel(d: Distribution): string {
  switch (d.kind) {
    case 'exponential': return `Exp(mean=${d.mean})`;
    case 'constant':    return `Const(${d.value})`;
    case 'uniform':     return `U(${d.min}, ${d.max})`;
    case 'normal':      return `N(${d.mean}, σ=${d.stddev})`;
    case 'triangular':  return `Tri(${d.min}, ${d.mode}, ${d.max})`;
  }
}

export function compareScenarios(baseline: Scenario, alt: Scenario): ScenarioComparison {
  const kpis: ComparisonKpi[] = KPI_DEFS.map(def => {
    const b = getMetricMean(baseline.output, def.key);
    const a = getMetricMean(alt.output, def.key);
    const absDiff = a.value - b.value;
    const pctDiff = b.value !== 0 ? (absDiff / b.value) * 100 : 0;
    return { ...def, baselineValue: b.value, altValue: a.value, baselineCI: b.ci, altCI: a.ci, absDiff, pctDiff };
  });

  const modelDiffs: ModelParamDiff[] = [];
  const bMap = new Map<string, DesNode>(baseline.model.nodes.map(n => [n.id, n]));
  const aMap = new Map<string, DesNode>(alt.model.nodes.map(n => [n.id, n]));

  for (const [id, bNode] of bMap) {
    const aNode = aMap.get(id);
    if (!aNode) {
      modelDiffs.push({ nodeId: id, nodeName: bNode.name, field: 'node', baseline: 'present', alternative: 'removed' });
      continue;
    }
    const bc = bNode.config;
    const ac = aNode.config;
    if (bc.kind === 'server' && ac.kind === 'server') {
      if (bc.capacity !== ac.capacity)
        modelDiffs.push({ nodeId: id, nodeName: bNode.name, field: 'capacity (c)', baseline: String(bc.capacity), alternative: String(ac.capacity) });
      const bd = distLabel(bc.serviceDistribution);
      const ad = distLabel(ac.serviceDistribution);
      if (bd !== ad)
        modelDiffs.push({ nodeId: id, nodeName: bNode.name, field: 'service distribution', baseline: bd, alternative: ad });
    }
    if (bc.kind === 'source' && ac.kind === 'source') {
      const bd = distLabel(bc.interarrivalDistribution);
      const ad = distLabel(ac.interarrivalDistribution);
      if (bd !== ad)
        modelDiffs.push({ nodeId: id, nodeName: bNode.name, field: 'interarrival distribution', baseline: bd, alternative: ad });
    }
  }
  for (const [id, aNode] of aMap) {
    if (!bMap.has(id))
      modelDiffs.push({ nodeId: id, nodeName: aNode.name, field: 'node', baseline: 'absent', alternative: 'added' });
  }

  for (const [field, bVal, aVal] of [
    ['horizon',      baseline.config.horizon,      alt.config.horizon],
    ['warmup',       baseline.config.warmup,       alt.config.warmup],
    ['replications', baseline.config.replications, alt.config.replications],
  ] as [string, number, number][]) {
    if (bVal !== aVal)
      modelDiffs.push({ nodeId: '', nodeName: 'Run config', field, baseline: String(bVal), alternative: String(aVal) });
  }

  return { kpis, modelDiffs };
}
