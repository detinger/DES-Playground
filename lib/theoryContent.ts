// Static content for the Theory learning hub — lessons, example models, challenges.
import { CASE_STUDIES } from './caseStudies';
import { IT_EXAMPLES, IT_CHALLENGES } from './itLearningContent';

// ── Lessons ───────────────────────────────────────────────────────────────────

export interface Lesson {
  level: number;
  title: string;
  paragraphs: string[];
  keyFact: string;
  misconception: { label: string; fix: string };
  exampleId?: string;   // links to an ExampleModel id
}

export const LESSONS: Lesson[] = [
  {
    level: 1,
    title: 'DES Foundations — Clock, Events, State',
    paragraphs: [
      'A Discrete Event Simulation (DES) models a system as a sequence of instantaneous state changes called events. Between consecutive events, nothing changes — so the simulation clock jumps directly to the next scheduled event rather than ticking forward in real time. This makes DES fast even for long time horizons.',
      'The core machinery is a future-event calendar (a priority queue ordered by simulated time). At each step the engine pops the earliest event, advances the clock to that event\'s time, and applies the state transition it describes. Any new events spawned during the transition are inserted back into the calendar.',
      'The key state variables are: entities (objects flowing through the system), resources (servers with finite capacity), queues (entities waiting), and counters (arrivals, departures, etc.). Every event either changes one of these variables or schedules a future change.',
    ],
    keyFact: 'The simulation clock is dimensionless — it only advances when an event fires. A 1 000-minute run with 50 events touches 50 moments, not 60 000 seconds.',
    misconception: {
      label: '"DES animates real time — the entities move in continuous motion."',
      fix: 'No. Between events, time is frozen. The visualiser replays a pre-computed trace; it does not compute new physics every frame.',
    },
    exampleId: 'det-single',
  },
  {
    level: 2,
    title: 'Arrivals and Distributions',
    paragraphs: [
      'An arrival process describes when new entities enter the system. The most common model is a Poisson process, where the gaps between successive arrivals (interarrival times) follow an Exponential distribution. The mean interarrival time and the arrival rate are reciprocals: if the mean gap is 5 minutes then the rate is 1/5 = 0.2 arrivals per minute. Confusing the two is one of the most frequent modelling errors.',
      'Service times can follow any non-negative distribution. Exponential service (memoryless, Markovian) is the standard for M/M/c theory. Constant (deterministic) service eliminates variability. Normal and Triangular distributions model real-world processes that cluster around a mean but have bounded or asymmetric spread. All duration distributions must produce non-negative samples — the simulator applies rejection or truncation for Normal.',
      'Random seeds make runs reproducible. The same seed always produces the same sequence of samples. Different seeds produce statistically equivalent but numerically distinct runs — this is the basis of independent replications.',
    ],
    keyFact: 'Exponential(mean=5) ⟹ λ = 0.2/min. Exponential(mean=4) service ⟹ μ = 0.25/min. Never use the mean as a rate directly in formulas.',
    misconception: {
      label: '"Mean interarrival 5 min means arrival rate 5/min."',
      fix: 'Rate = 1/mean. Mean 5 min → rate 0.2/min. The mean and rate are reciprocals and have different units.',
    },
    exampleId: 'mm1',
  },
  {
    level: 3,
    title: 'Kendall Notation, Queues and Stability',
    paragraphs: [
      'Kendall notation summarises a queue as A/S/c: A is the interarrival-time distribution, S is the service-time distribution, and c is the number of parallel servers sharing the queue. M means memoryless (exponential times; Poisson arrivals), D means deterministic (constant times), and G means a general distribution. GI is often used to specify general independent interarrival times.',
      'Read M/M/1 as exponential interarrival times, exponential service times, and one server. M/M/3 has three parallel servers, each with service rate μ. M/D/1 has exponential interarrival times and constant service times. M/G/1 allows a general service-time distribution. The letters describe distributions, not numerical rates.',
      'The extended form A/S/c/K/N/Disc also specifies total system capacity K (waiting plus in service), source population N, and queue discipline Disc. When omitted, the usual assumptions are unlimited capacity, an infinite source population, and first-come, first-served (FCFS, also called FIFO). For example, M/M/2/5/∞/FCFS has two servers and room for only three waiting entities; an arrival finding all five places occupied is blocked. The M/M/c Modeler uses unlimited capacity and FIFO; it does not model this finite-capacity example.',

      'A queue holds entities waiting for a server. When all c server slots are busy, arriving entities join the queue in FIFO order. When a slot frees up, the first entity in the queue begins service immediately. Queue length Lq counts only waiting entities; in-service entities are counted separately.',
      'Server utilisation ρ = λ/(c·μ) measures the fraction of server capacity in use at steady state. When ρ ≥ 1 the system is unstable: the queue grows without bound. The relationship between ρ and queue length is highly non-linear — at ρ = 0.5 waiting is minimal, but at ρ = 0.9 the M/M/1 average queue length is 16.2× its value at ρ = 0.5.',
      'Kendall\'s notation M/M/c describes a queue with Markovian (Poisson) arrivals, Markovian (exponential) service, and c parallel servers. M/M/1 is the simplest case. M/D/1 uses deterministic service and has exactly half the queue length of M/M/1 at the same ρ — a direct demonstration of variability\'s impact.',
    ],
    keyFact: 'For M/M/1: Lq = ρ²/(1−ρ). At ρ=0.9: Lq=8.1. At ρ=0.5: Lq=0.5. Near-saturation causes disproportionate queue growth.',
    misconception: {
      label: '"100% utilisation means the server is working perfectly."',
      fix: 'ρ = 1 means infinite steady-state queue length under M/M/c assumptions. Aim for ρ ≤ 0.8 in real systems to maintain manageable queues.',
    },
    exampleId: 'mm2',
  },
  {
    level: 4,
    title: 'Event Mechanics and Tie Policy',
    paragraphs: [
      'The event calendar is ordered by (simulated time, priority, insertion sequence). Priority matters when two events are scheduled for exactly the same time. In this simulator, service completions (priority 0) fire before new arrivals (priority 1) at the same time — this ensures that a slot freed at time t is available to a new arrival at time t, which is physically correct.',
      'Five event kinds trace an entity\'s lifecycle: arrival → queueEnter → serviceStart → serviceEnd → departure. Each event fires atomically and updates all relevant state: queue length, busy server count, entity records and the future-event calendar.',
      'You can inspect every event in the Event Log panel after a run. Use the step buttons to move through the trace one event at a time. Every event embeds a complete snapshot of system state — the playback viewer does not re-simulate, it just replays the stored snapshots.',
    ],
    keyFact: 'Deterministic tie policy + seeded PRNG ⟹ identical event sequences for identical seeds. Changing the seed changes all sample values but preserves statistical properties.',
    misconception: {
      label: '"Simultaneous events can be processed in any order without affecting results."',
      fix: 'Order matters. If a service completion and a new arrival fire at the same time and ties break incorrectly, the freed slot may be missed, inflating queue lengths and wait times.',
    },
    exampleId: 'det-single',
  },
  {
    level: 5,
    title: 'Output Analysis — KPIs and Little\'s Law',
    paragraphs: [
      'Two fundamentally different averaging methods produce two families of metrics. Entity-weighted metrics (Wq, W) average over completed entities: Wq = sum of individual wait times / number of departures. Time-weighted metrics (Lq, ρ̂) integrate the continuous state curve over the observation window: Lq = area under queue-length(t) / observation duration.',
      'Little\'s Law connects them: L = λ·W and Lq = λ·Wq, where λ is the effective throughput. These equalities hold for any stable queue regardless of distributions — they are conservation laws, not M/M/c-specific. Use them as a consistency check: if your simulation values violate Little\'s Law by more than sampling error, there is a metric definition mismatch.',
      'The observation window matters. Metrics should only count entities that arrived after the warm-up period. Time-weighted integrals should only accumulate area after the warm-up boundary. This simulator applies both rules: the entity cohort is filtered by arrival time ≥ warmup, and the time integral starts at max(lastEventTime, warmup).',
    ],
    keyFact: 'L = λW is always true in steady state. Example: throughput 0.18/min, W = 8.5 min ⟹ L = 1.53 entities in system on average.',
    misconception: {
      label: '"Average queue length = number of entities in the queue at the end of the run."',
      fix: 'Lq is a time-weighted average over the entire observation window. The end-of-run snapshot is a single sample. The two values differ substantially for non-stationary traces.',
    },
    exampleId: 'mm1',
  },
  {
    level: 6,
    title: 'Experimentation — Warm-up, Replications, CI',
    paragraphs: [
      'A simulation that starts empty will underestimate steady-state waiting times because early entities see an artificially short queue. The warm-up period (also called initialisation bias removal) discards observations made before the system reaches a statistical equilibrium. A common rule of thumb: warm-up = 10–20% of the total horizon for moderately loaded systems.',
      'One replication gives one sample from a distribution of possible outcomes. To quantify uncertainty, run multiple independent replications with different seeds (this simulator uses seed + rep×1000). Compute the sample mean and a 95% confidence interval from the t-distribution. The CI tells you: if the true mean is θ, 95% of such intervals will contain θ.',
      'The Metrics panel shows confidence-interval bounds for each KPI. If an interval is wide relative to the mean, your estimates are imprecise — run more replications or extend the horizon. M/M/c reference values are deterministic steady-state limits; a well-run simulation will converge toward them as horizon and replications increase.',
    ],
    keyFact: '95% CI half-width ∝ t·σ/√n. Doubling precision (halving half-width) requires 4× more replications. It is cheaper to extend the horizon than to replicate.',
    misconception: {
      label: '"Running the same seed multiple times gives independent replications."',
      fix: 'Identical seeds produce identical traces. Independent replications require different seeds. This simulator automatically increments by 1000 per replication.',
    },
    exampleId: 'mm1',
  },
  {
    level: 7,
    title: 'Code Generation and Reproducibility',
    paragraphs: [
      'The SimPy and R simmer scripts generated from your model compile from the same canonical DesModel schema used by the browser engine — not from the React Flow diagram. This ensures that distribution parameters, server capacities and topology are faithfully represented in both runtimes.',
      'Python\'s random module and the browser\'s mulberry32 PRNG are different implementations. For the same seed they will produce different numerical sequences, so event-by-event trace parity is not expected. Statistical equivalence means that large-N results from both runtimes should converge to the same population means within sampling error.',
      'Generated scripts are designed for readability and reproducibility: they include a provenance header, explicit distribution functions, a Station class mirroring the browser engine\'s time-weighted logic, and the same t-distribution table for CI computation. After downloading, the script is independent of this app — share it alongside the exported model JSON for full reproducibility.',
    ],
    keyFact: 'Semantic equivalence ≠ trace parity. Same distributions + same metric definitions = statistically equivalent results with high probability over many replications.',
    misconception: {
      label: '"If the Python script produces the same number, the two engines are verified correct."',
      fix: 'One matching number is coincidence. Verification requires running many seeds and checking that means fall within each other\'s CIs, plus deterministic golden fixtures for edge cases.',
    },
  },
  {
    level: 8,
    title: 'Formal Models — Activities, Queues and Tokens',
    paragraphs: [
      'An activity-cycle model is a tuple of activities A, places Q, input mapping I, output mapping O, duration function τ and initial token counts μ₀. Entity tokens represent patients, jobs or products; resource tokens represent available workers or machines.',
      'An activity starts when its required input tokens are available. It consumes those tokens, schedules completion after its sampled duration, and releases output tokens when it completes. For service, one waiting entity and one idle resource token are consumed; completion returns the resource token and sends the entity to the next queue. FIFO determines which waiting entity is selected.',
      'Expand Formal model on any example, in the Queue Modeler, or in the M/M/c Modeler to inspect the instantiated activities, distributions, resource counts and state rules. Editing a distribution or capacity updates the specification. Factory and Inventory open in Process Modeler, where stores, shared resources, conditions and cycles specify their state transitions.',
      'A complete event-driven state also includes the ordered entity queues and the future-event calendar. Counts alone are not sufficient for general service distributions: scheduled completion times retain the information needed to advance the simulation.',
    ],
    keyFact: 'A service completion returns the resource token and moves the entity forward. It does not put that entity back into the same waiting queue unless the model explicitly contains that loop.',
    misconception: { label: '"The flowchart alone specifies the entire model."', fix: 'Topology must be accompanied by timing distributions, capacities, initial conditions, queue discipline and event rules.' },
    exampleId: 'clinic',
  },
];

// ── Example models ────────────────────────────────────────────────────────────

export interface ExampleModel {
  id: string;
  badge: string;
  name: string;
  description: string;
  objectives: string[];
  parameters: string;
  expectedKpis: string;
  difficulty?: 1 | 2 | 3;
  assumptions?: string;
  experiment?: string[];
  nodes: any[];
  edges: any[];
  config: { horizon: number; warmup: number; seed: number; replications: number; unit?: import('./model').TimeUnit; stopMode?: 'horizon' | 'drain' };
}

const edgeStyle = { stroke: '#6366f1', strokeWidth: 2 };

export const EXAMPLES: ExampleModel[] = [
  {
    id: 'det-single',
    difficulty: 1,
    badge: 'D/D/1',
    name: 'Deterministic single server',
    description: 'Constant interarrival and service times with one server. Arrivals at a fixed interval — no randomness, fully predictable event trace. Use this to verify event ordering by hand.',
    objectives: [
      'Understand the event calendar and FIFO service',
      'Trace arrival → queueEnter → serviceStart → serviceEnd → departure manually',
      'Confirm that Wq = 0 when service time < interarrival time',
    ],
    parameters: 'Interarrival: Constant 3 min | Service: Constant 2 min | c = 1 | ρ = 2/3 ≈ 0.667',
    expectedKpis: 'Wq ≈ 0 min (no waiting — server free before next arrival) | ρ̂ ≈ 0.67',
    nodes: [
      { id: 'det-src', type: 'source', position: { x: 80, y: 240 }, data: { label: 'Arrivals', type: 'source', distribution: { type: 'constant', value: 3 } } },
      { id: 'det-srv', type: 'server', position: { x: 350, y: 240 }, data: { label: 'Server', type: 'server', capacity: 1, distribution: { type: 'constant', value: 2 } } },
      { id: 'det-snk', type: 'sink',   position: { x: 620, y: 240 }, data: { label: 'Departures', type: 'sink' } },
    ],
    edges: [
      { id: 'det-e1', source: 'det-src', target: 'det-srv', type: 'smoothstep', animated: true, style: edgeStyle },
      { id: 'det-e2', source: 'det-srv', target: 'det-snk', type: 'smoothstep', animated: true, style: edgeStyle },
    ],
    config: { horizon: 60, warmup: 0, seed: 42, replications: 1 },
  },
  {
    id: 'mm1',
    difficulty: 1,
    badge: 'M/M/1',
    name: 'M/M/1 queue',
    description: 'The canonical single-server queue with Poisson arrivals and exponential service. The simplest system with analytical steady-state formulas. Run it and compare the simulation output with the M/M/c Theory panel.',
    objectives: [
      'Observe exponential service-time variability and its effect on waiting',
      'Compare simulation Wq and W with M/M/1 theory (Wq = ρ/(μ−λ))',
      'See how warm-up removes cold-start bias',
    ],
    parameters: 'Interarrival: Exp(mean=5 min) | Service: Exp(mean=4 min) | c = 1 | ρ = 0.8',
    expectedKpis: 'Theory: Wq = 16 min · W = 20 min · Lq = 3.2 · ρ = 80%',
    nodes: [
      { id: 'mm1-src', type: 'source', position: { x: 80, y: 240 }, data: { label: 'Arrivals', type: 'source', distribution: { type: 'exponential', mean: 5 } } },
      { id: 'mm1-srv', type: 'server', position: { x: 350, y: 240 }, data: { label: 'Server', type: 'server', capacity: 1, distribution: { type: 'exponential', mean: 4 } } },
      { id: 'mm1-snk', type: 'sink',   position: { x: 620, y: 240 }, data: { label: 'Departures', type: 'sink' } },
    ],
    edges: [
      { id: 'mm1-e1', source: 'mm1-src', target: 'mm1-srv', type: 'smoothstep', animated: true, style: edgeStyle },
      { id: 'mm1-e2', source: 'mm1-srv', target: 'mm1-snk', type: 'smoothstep', animated: true, style: edgeStyle },
    ],
    config: { horizon: 2000, warmup: 200, seed: 42, replications: 5 },
  },
  {
    id: 'mm2',
    difficulty: 1,
    badge: 'M/M/2',
    name: 'M/M/2 queue — adding a second server',
    description: 'Same arrival and service rates as the M/M/1 example, but with two parallel servers. ρ per server halves from 0.8 to 0.4. Waiting times drop dramatically — a direct demonstration of capacity\'s nonlinear effect.',
    objectives: [
      'Compare M/M/1 vs M/M/2 waiting times side-by-side using Scenario Comparison',
      'See how doubling servers reduces ρ from 0.8 to 0.4',
      'Understand the Erlang-C formula for multi-server queues',
    ],
    parameters: 'Interarrival: Exp(mean=5 min) | Service: Exp(mean=4 min) | c = 2 | ρ = 0.4',
    expectedKpis: 'Theory: Wq ≈ 0.15 min · ρ̂ ≈ 40% (compare with M/M/1: Wq = 16 min)',
    nodes: [
      { id: 'mm2-src', type: 'source', position: { x: 80, y: 240 }, data: { label: 'Arrivals', type: 'source', distribution: { type: 'exponential', mean: 5 } } },
      { id: 'mm2-srv', type: 'server', position: { x: 350, y: 240 }, data: { label: 'Dual Server', type: 'server', capacity: 2, distribution: { type: 'exponential', mean: 4 } } },
      { id: 'mm2-snk', type: 'sink',   position: { x: 620, y: 240 }, data: { label: 'Departures', type: 'sink' } },
    ],
    edges: [
      { id: 'mm2-e1', source: 'mm2-src', target: 'mm2-srv', type: 'smoothstep', animated: true, style: edgeStyle },
      { id: 'mm2-e2', source: 'mm2-srv', target: 'mm2-snk', type: 'smoothstep', animated: true, style: edgeStyle },
    ],
    config: { horizon: 2000, warmup: 200, seed: 42, replications: 5 },
  },
  {
    id: 'md1',
    difficulty: 2,
    badge: 'M/D/1',
    name: 'M/D/1 queue — deterministic service',
    description: 'Poisson arrivals but constant (deterministic) service time. Same ρ = 0.8 as the M/M/1 example. Deterministic service has zero variability — theory predicts Wq is exactly half of the M/M/1 value.',
    objectives: [
      'See the effect of service-time variability on queue length',
      'Compare M/D/1 vs M/M/1 at equal ρ: M/D/1 Wq = M/M/1 Wq / 2',
      'Understand the Pollaczek–Khinchine formula for M/G/1 queues',
    ],
    parameters: 'Interarrival: Exp(mean=5 min) | Service: Constant(4 min) | c = 1 | ρ = 0.8',
    expectedKpis: 'P–K formula: Wq = ρ²/(2μ(1−ρ)) = 8 min  (M/M/1 gives 16 min — half the wait)',
    nodes: [
      { id: 'md1-src', type: 'source', position: { x: 80, y: 240 }, data: { label: 'Arrivals', type: 'source', distribution: { type: 'exponential', mean: 5 } } },
      { id: 'md1-srv', type: 'server', position: { x: 350, y: 240 }, data: { label: 'Server (constant)', type: 'server', capacity: 1, distribution: { type: 'constant', value: 4 } } },
      { id: 'md1-snk', type: 'sink',   position: { x: 620, y: 240 }, data: { label: 'Departures', type: 'sink' } },
    ],
    edges: [
      { id: 'md1-e1', source: 'md1-src', target: 'md1-srv', type: 'smoothstep', animated: true, style: edgeStyle },
      { id: 'md1-e2', source: 'md1-srv', target: 'md1-snk', type: 'smoothstep', animated: true, style: edgeStyle },
    ],
    config: { horizon: 2000, warmup: 200, seed: 42, replications: 5 },
  },
  {
    id: 'prod-line',
    difficulty: 2,
    badge: 'Sequential',
    name: 'Production line — two stations',
    description: 'Two service stations in series. Each entity visits Station 1 then Station 2 before departing. Station 2 is the bottleneck (higher ρ). Use this to practise bottleneck identification from utilisation metrics.',
    objectives: [
      'Model sequential service stages (entity visits both servers)',
      'Identify the bottleneck from per-station utilisation in the Station State panel',
      'Observe how upstream variability propagates to downstream queues',
    ],
    parameters: 'Arrivals: Exp(3 min) | Station 1: Exp(2 min) c=1 ρ≈0.67 | Station 2: Exp(2.5 min) c=1 ρ≈0.83',
    expectedKpis: 'Station 2 busier (ρ≈0.83) · overall Wq dominated by Station 2 queue',
    nodes: [
      { id: 'pl-src', type: 'source', position: { x: 60,  y: 240 }, data: { label: 'Jobs',      type: 'source', distribution: { type: 'exponential', mean: 3 } } },
      { id: 'pl-s1',  type: 'server', position: { x: 290, y: 240 }, data: { label: 'Station 1', type: 'server', capacity: 1, distribution: { type: 'exponential', mean: 2 } } },
      { id: 'pl-s2',  type: 'server', position: { x: 520, y: 240 }, data: { label: 'Station 2', type: 'server', capacity: 1, distribution: { type: 'exponential', mean: 2.5 } } },
      { id: 'pl-snk', type: 'sink',   position: { x: 750, y: 240 }, data: { label: 'Done',      type: 'sink'   } },
    ],
    edges: [
      { id: 'pl-e1', source: 'pl-src', target: 'pl-s1',  type: 'smoothstep', animated: true, style: edgeStyle },
      { id: 'pl-e2', source: 'pl-s1',  target: 'pl-s2',  type: 'smoothstep', animated: true, style: edgeStyle },
      { id: 'pl-e3', source: 'pl-s2',  target: 'pl-snk', type: 'smoothstep', animated: true, style: edgeStyle },
    ],
    config: { horizon: 1000, warmup: 100, seed: 42, replications: 3 },
  },
  ...CASE_STUDIES,
  ...IT_EXAMPLES,
];

// ── Challenges ────────────────────────────────────────────────────────────────

export interface ChallengeOption { label: string; correct: boolean }

export interface Challenge {
  id: string;
  title: string;
  difficulty: 1 | 2 | 3;
  task: string;
  options: ChallengeOption[];
  hints: string[];
  explanation: string;
  exampleId?: string;   // related ExampleModel id
}

export const CHALLENGES: Challenge[] = [
  {
    id: 'ch1',
    title: 'M/M/1 utilisation',
    difficulty: 1,
    task: 'A single-server queue has mean interarrival time 5 min and mean service time 4 min. What is the server utilisation ρ?',
    options: [
      { label: 'ρ = 0.6', correct: false },
      { label: 'ρ = 0.8', correct: true  },
      { label: 'ρ = 1.25', correct: false },
      { label: 'ρ = 0.4', correct: false },
    ],
    hints: [
      'ρ = λ/μ. First, convert the mean interarrival time to an arrival rate λ.',
      'λ = 1 / 5 = 0.2 arrivals/min. Now convert mean service time 4 min to service rate μ.',
      'μ = 1 / 4 = 0.25 services/min. ρ = λ/μ = 0.2 / 0.25 = ?',
    ],
    explanation: 'ρ = λ/μ = 0.2 / 0.25 = 0.8. At 80% utilisation this M/M/1 queue has theory Wq = ρ / (μ − λ) = 0.8 / 0.05 = 16 min. Load the M/M/1 example below and verify this in the Queue Modeler.',
    exampleId: 'mm1',
  },
  {
    id: 'ch2',
    title: 'Stability check',
    difficulty: 1,
    task: 'A help desk receives 20 customers per hour. Each agent handles a customer in 4 min on average. The desk has 1 agent. Is the system stable?',
    options: [
      { label: 'Yes — ρ = 0.75, stable', correct: false },
      { label: 'No — ρ = 1.33, unstable queue grows without bound', correct: true  },
      { label: 'Yes — ρ = 0.5, stable', correct: false },
      { label: 'Cannot be determined without the distribution', correct: false },
    ],
    hints: [
      'Convert to consistent units. λ = 20 customers/hour = 20/60 = 1/3 per minute.',
      'μ = 1 / 4 min = 0.25 per minute. For stability: λ < c · μ. With c = 1: is 1/3 < 0.25?',
      '1/3 ≈ 0.333 > 0.25. ρ = λ/(c·μ) = 0.333/0.25 = 1.33 ≥ 1 — unstable. Queue grows indefinitely.',
    ],
    explanation: 'ρ = 1.33 ≥ 1: no finite steady-state queue length. Adding a second agent gives ρ = 0.333 / (2 × 0.25) = 0.667 — stable and much shorter waits. Load the M/M/1 example below, raise the arrival rate above the service rate, and watch the queue grow without bound.',
    exampleId: 'mm1',
  },
  {
    id: 'ch3',
    title: "Little's Law",
    difficulty: 2,
    task: "A simulation reports throughput λ_eff = 0.18/min and average sojourn time W = 8.5 min. What does Little's Law predict for L (average entities in system)?",
    options: [
      { label: 'L = 0.021', correct: false },
      { label: 'L = 1.53', correct: true  },
      { label: 'L = 8.3',  correct: false },
      { label: 'L = 47.2', correct: false },
    ],
    hints: [
      "Little's Law: L = λ · W. What are the values of λ and W here?",
      'λ_eff = 0.18/min, W = 8.5 min. Multiply them.',
      'L = 0.18 × 8.5 = 1.53. This means on average 1.53 entities are present in the system at any instant.',
    ],
    explanation: "L = λW = 0.18 × 8.5 = 1.53. Little's Law is universal — it holds for any stable queue regardless of arrival process, service distribution or number of servers. Load the M/M/1 example and check that Lq ≈ λ × Wq in the simulation output.",
    exampleId: 'mm1',
  },
  {
    id: 'ch4',
    title: 'Second server effect',
    difficulty: 2,
    task: 'An M/M/1 queue has λ = 0.4/min, μ = 0.5/min (ρ = 0.8). A second identical server is added (M/M/2). How does ρ change?',
    options: [
      { label: 'ρ halves from 0.8 to 0.4', correct: true  },
      { label: 'ρ is unchanged at 0.8',    correct: false },
      { label: 'ρ drops to 0.16',          correct: false },
      { label: 'ρ doubles to 1.6',         correct: false },
    ],
    hints: [
      'For M/M/c: ρ = λ / (c · μ). The denominator now has c = 2.',
      'M/M/1: ρ = 0.4 / (1 × 0.5) = 0.8. M/M/2: ρ = 0.4 / (2 × 0.5) = 0.4.',
      'ρ halves. But the reduction in Wq is dramatic: M/M/1 Wq ≈ 6.4 min vs M/M/2 Wq ≈ 0.3 min — a 20× improvement.',
    ],
    explanation: 'ρ = λ/(c·μ) = 0.4/(2×0.5) = 0.4. Utilisation per server halves. Due to the nonlinear queue-length formula, Wq drops far more than proportionally. Load the M/M/2 example below and compare it with M/M/1 using the Scenario Comparison tool.',
    exampleId: 'mm2',
  },
  {
    id: 'ch5',
    title: 'Warm-up bias',
    difficulty: 3,
    task: 'Why should you apply a warm-up period before collecting steady-state statistics?',
    options: [
      { label: 'To exclude cold-start transient bias from initial empty-system conditions', correct: true  },
      { label: 'To speed up the simulation by discarding early events',                     correct: false },
      { label: 'To increase the sample size for confidence intervals',                      correct: false },
      { label: 'To synchronise random streams across replications',                         correct: false },
    ],
    hints: [
      'At t = 0 the system is empty. How does that affect the first few entities?',
      'Early entities see no queue at all — they are served immediately. Does that reflect steady-state behaviour?',
      'Excluding the first W minutes means the metrics only average over observations from a system already operating at near-steady state.',
    ],
    explanation: 'At t = 0, the queue is empty regardless of the true steady-state load. Early entities experience artificially short waits, biasing Wq and W downward. Excluding a warm-up period (typically 10–20% of the horizon) removes this cold-start effect. Load the M/M/1 example and try setting warm-up to 0 vs 200 — compare the resulting Wq values.',
    exampleId: 'mm1',
  },
  ...IT_CHALLENGES,
];
