import { FACTORY_NODES, FACTORY_EDGES, INVENTORY_NODES, INVENTORY_EDGES } from './processExamples';
import type { ExampleModel } from './theoryContent';
import type { FormalRow } from './formalModel';

const clinicNodes = [
  { id: 'clinic-arrivals', type: 'source', position: { x: 0, y: 160 }, data: { label: 'Patients', type: 'source', distribution: { type: 'normal', mean: 5, stdDev: 0.5 } } },
  ...[{ label: 'Nurse', mean: 15, capacity: 2 }, { label: 'Doctor', mean: 20, capacity: 3 }, { label: 'Administration', mean: 5, capacity: 2 }].map((s, i) => ({ id: `clinic-${i}`, type: 'server', position: { x: 240 * (i + 1), y: 160 }, data: { label: s.label, type: 'server', capacity: s.capacity, distribution: { type: 'normal', mean: s.mean, stdDev: 1 } } })),
  { id: 'clinic-done', type: 'sink', position: { x: 960, y: 160 }, data: { label: 'Discharged', type: 'sink' } },
];

export const CASE_STUDIES: ExampleModel[] = [
  {
    id: 'clinic', name: 'Clinic — patient flow and staffing', badge: '3-stage clinic', difficulty: 2,
    description: 'Model a clinic where patients visit a nurse, a doctor and administration. Compare staffing plans over a nine-hour day.',
    objectives: ['Locate the first bottleneck and observe how it moves.', 'Compare 2/3/2, 3/3/2, 3/4/2 and 4/5/2 staff allocations.', 'Evaluate the targets of fewer than two waiting patients and less than five minutes waiting.'],
    parameters: String.raw`Interarrival \(A\sim\mathcal N(5,0.5^2)\) min; service \(S_1\sim\mathcal N(15,1),\ S_2\sim\mathcal N(20,1),\ S_3\sim\mathcal N(5,1)\) min; \(c=(2,3,2)\). All normal samples conditioned on nonnegative time.`,
    expectedKpis: 'Offered loads at baseline: ρ_nurse = 1.5, ρ_doctor ≈ 1.33, ρ_admin = 0.5. Finite-day waiting and throughput reveal the bottleneck; no steady-state M/M/c formula applies.',
    assumptions: 'Service times have a standard deviation of 1 minute. Negative normal samples are rejected here. All queues start empty; capacity stays fixed during the day. The engine stops new arrivals at 540 min and drains admitted patients; output waiting times therefore include overtime.',
    experiment: ['Load and run the baseline; save it as Baseline.', 'Change Nurse capacity to 3 and run again. Inspect the Doctor queue.', 'Compare 3/4/2 with 4/5/2; consider the extra staffing cost and remaining waiting time.'],
    nodes: clinicNodes,
    edges: clinicNodes.slice(0, -1).map((n, i) => ({ id: `clinic-edge-${i}`, source: n.id, target: clinicNodes[i + 1].id, animated: true })),
    config: { horizon: 540, warmup: 0, seed: 42, replications: 1 },
  },
  {
    id: 'factory', name: 'Factory — failures, repairs and spares', badge: 'Finite population', difficulty: 3,
    description: 'Keep 50 machine positions operating using spare machines and a shared repair crew. Explore the cost of staff, spare stock and downtime.',
    objectives: ['Distinguish a repair queue from machines waiting for a spare.', 'Measure availability and integrate downtime cost.', 'Compare repairer and spare-stock decisions using the same seed.'],
    parameters: String.raw`Failure \(F\sim U(132,182)\) operating hours; repair \(R_t\sim U(4,10)\) hours; \(R=3\) repairers, \(S=20\) spares; \(T=2080\) working hours.`,
    expectedKpis: 'Availability, time-average spares, repair queue, total downtime and cost per eight-hour working day.',
    assumptions: 'Time advances in working hours (8 hours/day, 5 days/week); weekends are excluded. All 50 machines start new; spares do not fail while stored. Repairs and replacement requests use FIFO. Staff cost $3.75/hour each, spare capacity $30/day each, and downtime $20/machine-hour.',
    experiment: ['Open DES Modeler and run 3 repairers and 20 spares; save a baseline.', 'Edit the Spare machines store, reduce initial stock, and compare availability and total cost.', 'Increase Repair crew capacity, run replications, and weigh staffing cost against downtime.'],
    nodes: FACTORY_NODES, edges: FACTORY_EDGES, config: { horizon: 2080, warmup: 0, seed: 0, replications: 1, unit: 'hour', stopMode: 'horizon' },
  },
  {
    id: 'inventory', name: 'Inventory — replenishment and lost sales', badge: '(s, S) policy', difficulty: 2,
    description: 'Sell from available stock and place a replenishment order when inventory falls below a reorder point. Customers leave with whatever can be supplied; unmet demand is lost.',
    objectives: ['Balance holding cost against stockouts.', 'Understand replenishment lead time and the one-outstanding-order rule.', 'Compare fill rate and operating balance under different (s, S) policies.'],
    parameters: String.raw`Interarrival \(A\sim\operatorname{Exp}(5)\) days; demand \(D\sim\operatorname{DiscreteUniform}\{1,2,3,4\}\); \(s=10,\ S=30,\ L=2,\ T=35\) days.`,
    expectedKpis: 'Stock over time, unit fill rate, lost demand, revenue, ordering cost, holding cost and operating balance.',
    assumptions: 'Initial stock S is supplied without an initial purchase charge. Sales earn $100/unit, orders cost $50/unit, holding costs $2/unit/day. At most one order is outstanding. Holding cost is integrated at every demand and delivery event through the horizon.',
    experiment: ['Run (10,30), then edit the Reorder needed? condition to increase the reorder point.', 'Edit the Place replenishment order quantity expression to raise its target; compare holding cost.', 'Compare policies over several seeds; one sample path does not establish an optimum.'],
    nodes: INVENTORY_NODES, edges: INVENTORY_EDGES, config: { horizon: 35, warmup: 0, seed: 3, replications: 1, unit: 'day', stopMode: 'horizon' },
  },
];

export function caseFormalRows(kind: 'factory' | 'inventory', p: Record<string, number>): FormalRow[] {
  const common: FormalRow = { label: 'Formal specification', tex: String.raw`M=\langle A,Q,I,O,\tau,\mu_0\rangle`, note: 'Activities consume input tokens and release output tokens after their sampled delay. The following state transitions specify the event rules and numeric accounting.' };
  if (kind === 'inventory') return [common,
    { label: 'Activities, places and initial state', tex: String.raw`A=\{\mathrm{sale},\mathrm{order},\mathrm{delivery}\},\quad Q=\{\mathrm{stock},\mathrm{pending}\}`, note: 'Demand is an external renewal process. Stock is an integer token count; pending records the one outstanding batch and its delivery time.' },
    { label: 'Parameters', tex: String.raw`s=${p.cutoff},\ S=${p.target},\ L=2,\ T=${p.horizon},\quad x(0)=S,\ y(0)=0,\ B(0)=0` },
    { label: 'Random inputs', tex: String.raw`\Delta t\sim\operatorname{Exp}(5),\quad D\sim\operatorname{DiscreteUniform}\{1,2,3,4\}` },
    { label: 'Demand transition', tex: String.raw`v=\min(D,x),\quad x'=x-v,\quad B'=B+100v,\quad \ell'=\ell+(D-v)`, note: 'v is units sold; ℓ accumulates lost demand. Demand is not backlogged.' },
    { label: 'Order guard and batch', tex: String.raw`x<s\ \land\ y=0\ \Longrightarrow\ y'=S-x,\quad B'=B-50y',\quad t_{\rm delivery}=t+2`, note: 'Check after each demand. A batch is fixed at order time; it does not grow with later sales.' },
    { label: 'Delivery transition', tex: String.raw`x'=x+y,\qquad y'=0`, note: 'Delivery precedes demand in a tie. No second order is placed until a subsequent demand triggers the guard.' },
    { label: 'Holding cost and outputs', tex: String.raw`H=2\int_0^T x(t)\,dt,\quad B(T)=100\sum v-50\sum y_{\rm ordered}-H,\quad f=\frac{\sum v}{\sum D}` },
    { label: 'Activity inputs and outputs', tex: String.raw`I(\mathrm{sale})=v\,\mathrm{stock},\ O(\mathrm{sale})=\varnothing;\quad I(\mathrm{delivery})=y\,\mathrm{pending},\ O(\mathrm{delivery})=y\,\mathrm{stock}`, note: 'The guarded order activity has no stock input and outputs y pending tokens, with a scheduled delivery after 2 days. Sales are instantaneous and consume v stock tokens. These are counted, guarded transitions extending the basic ACD notation.' },
  ];
  return [common,
    { label: 'Activities and places', tex: String.raw`A=\{\mathrm{operate},\mathrm{repair},\mathrm{replace}\},\quad Q=\{\mathrm{up},\mathrm{down},\mathrm{broken},\mathrm{spares},\mathrm{repairers}\}` },
    { label: 'Initial tokens and parameters', tex: String.raw`\mu_0(\mathrm{up})=50,\ \mu_0(\mathrm{spares})=${p.spares},\ \mu_0(\mathrm{repairers})=${p.repairers},\ \mu_0(\mathrm{broken})=\mu_0(\mathrm{down})=0,\quad T=${p.horizon}` },
    { label: 'Operating cycle', tex: String.raw`I(\mathrm{operate})=\{\mathrm{up}\},\quad O(\mathrm{operate})=\{\mathrm{down},\mathrm{broken}\},\quad\tau_{\rm operate}\sim U(132,182)` },
    { label: 'Repair cycle', tex: String.raw`I(\mathrm{repair})=\{\mathrm{broken},\mathrm{repairers}\},\quad O(\mathrm{repair})=\{\mathrm{spares},\mathrm{repairers}\},\quad\tau_{\rm repair}\sim U(4,10)` },
    { label: 'Replacement', tex: String.raw`I(\mathrm{replace})=\{\mathrm{down},\mathrm{spares}\},\quad O(\mathrm{replace})=\{\mathrm{up}\},\quad\tau_{\rm replace}=0`, note: 'Failed machines enter the FIFO repair queue. A spare immediately restarts the oldest down machine position. Repaired machines replenish spares; repair completion precedes failure at a tie.' },
    { label: 'Conservation and availability', tex: String.raw`u(t)+d(t)=50,\quad u(t)+s(t)+q_r(t)+b_r(t)=50+S,\quad A_v=1-\frac{\int_0^T d(t)\,dt}{50T}` },
    { label: 'Cost', tex: String.raw`C(T)=\left\lceil\frac{T}{8}\right\rceil(3.75\cdot8R+30S)+20\int_0^T d(t)\,dt`, note: 'Staff and spare costs are charged per started eight-hour day. Downtime cost includes machines still waiting at the end of the horizon.' },
  ];
}
