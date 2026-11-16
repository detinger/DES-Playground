import { DesModel, Distribution } from './model';

export function distributionTex(d: Distribution): string {
  switch (d.kind) {
    case 'constant': return `\\operatorname{Const}(${d.value})`;
    case 'exponential': return `\\operatorname{Exp}(\\text{rate}=\\frac{1}{${d.mean}})`;
    case 'uniform': return `\\operatorname{U}(${d.min},${d.max})`;
    case 'normal': return d.nonnegativePolicy === 'reject'
      ? `\\mathcal{N}(${d.mean},${d.stddev}^{2})\\mid T\\geq0`
      : `\\max(0,\\mathcal{N}(${d.mean},${d.stddev}^{2}))`;
    case 'triangular': return `\\operatorname{Tri}(${d.min},${d.mode},${d.max})`;
  }
}

export interface FormalRow { label: string; tex: string; note?: string }
export function formalModelRows(model: DesModel): FormalRow[] {
  const index = new Map(model.nodes.map((n, i) => [n.id, i + 1]));
  const sources = model.nodes.filter(n => n.config.kind === 'source');
  const servers = model.nodes.filter(n => n.config.kind === 'server');
  const sinks = model.nodes.filter(n => n.config.kind === 'sink');
  const destinations = (id: string) => model.edges.filter(e => e.sourceId === id).map(e => `q_{${index.get(e.targetId) ?? '?'}}`);
  const rows: FormalRow[] = [
    { label: 'Activity-cycle specification', tex: String.raw`M_{\mathrm{ACD}}=\langle A,Q,I,O,\tau,\mu_0\rangle`, note: 'A: activities; Q: waiting/resource places; I and O: input/output places; τ: activity durations; μ₀: initial token counts. Timed activities consume inputs at start and release outputs at completion.' },
    { label: 'Activities', tex: `A=\\{${model.nodes.map(n => `a_{${index.get(n.id)}}`).join(',')}\\}` },
    { label: 'Places', tex: `Q=\\{${[...model.nodes.filter(n => n.config.kind !== 'source').map(n => `q_{${index.get(n.id)}}`), ...sources.map(n => `g_{${index.get(n.id)}}`), ...servers.map(n => `r_{${index.get(n.id)}}`)].join(',')}\\}`, note: 'q: entity queue (or completed entities at a sink); g: generator token; r: idle resource slots. Source populations and waiting-room capacity are unbounded.' },
  ];
  for (const node of model.nodes) {
    const i = index.get(node.id)!;
    const c = node.config;
    const a = `a_{${i}}`;
    if (c.kind === 'source') {
      rows.push({ label: `${i}. ${node.name} — arrivals`, tex: `I(${a})=\\{g_{${i}}\\},\\quad O(${a})=\\{g_{${i}},${destinations(node.id).join(',')}\\}` });
      rows.push({ label: 'Interarrival time and initial state', tex: `\\tau(${a})\\sim ${distributionTex(c.interarrivalDistribution)},\\quad\\mu_0(g_{${i}})=1` });
    } else if (c.kind === 'server') {
      rows.push({ label: `${i}. ${node.name} — service`, tex: `I(${a})=\\{q_{${i}},r_{${i}}\\},\\quad O(${a})=\\{r_{${i}},${destinations(node.id).join(',')}\\}` });
      rows.push({ label: 'Service time and capacity', tex: `\\tau(${a})\\sim ${distributionTex(c.serviceDistribution)},\\quad\\mu_0(q_{${i}})=0,\\quad\\mu_0(r_{${i}})=${c.capacity}`, note: 'FIFO service, one resource token per entity. Each resource slot has its own independent service duration.' });
    } else {
      rows.push({ label: `${i}. ${node.name} — departures`, tex: `I(${a})=\\{q_{${i}}\\},\\quad O(${a})=\\varnothing,\\quad\\tau(${a})=0,\\quad\\mu_0(q_{${i}})=0` });
    }
  }
  rows.push({ label: 'State and calendar', tex: String.raw`X(t)=\bigl((\mathcal Q_j(t),b_j(t))_j,\mathcal E(t),N_{\rm in}(t),N_{\rm out}(t)\bigr)`, note: 'Ordered queues retain entity identities and timestamps; b counts busy slots. The event calendar E retains scheduled times, entity IDs and slot IDs. Completion events precede arrivals at ties; insertion order breaks remaining ties.' });
  rows.push({ label: 'Resource constraint', tex: String.raw`0\le b_j(t)\le c_j,\qquad r_j(t)+b_j(t)=c_j` });
  rows.push({ label: 'Time-weighted outputs', tex: String.raw`\widehat L_{q,j}=\frac{1}{T-w}\int_w^T |\mathcal Q_j(t)|\,dt,\qquad\widehat\rho_j=\frac{1}{c_j(T-w)}\int_w^T b_j(t)\,dt` });
  if (!sources.length || !servers.length || !sinks.length || model.nodes.some(n => n.config.kind !== 'sink' && destinations(n.id).length !== 1)) {
    rows.unshift({ label: 'Incomplete specification', tex: String.raw`M\;\text{requires validation}`, note: 'This draft lists the current topology. Running requires a valid model with a single successor per source/server; multiple outputs are not interpreted as a fork.' });
  }
  return rows;
}
