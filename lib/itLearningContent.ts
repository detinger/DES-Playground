import type { DistributionParams } from '../types';
import type { Challenge, ExampleModel } from './theoryContent';

// Fictional teaching workloads. All durations are minutes, matching the editor.
// Independent Poisson streams are aggregated where every job follows the same
// route and service law. This also keeps both code exporters faithful to the model.
const exp = (mean: number): DistributionParams => ({ type: 'exponential', mean });
const constant = (value: number): DistributionParams => ({ type: 'constant', value });
const uniform = (min: number, max: number): DistributionParams => ({ type: 'uniform', min, max });
const triangular = (min: number, mode: number, max: number): DistributionParams => ({ type: 'triangular', min, mode, max });

type Stage = [label: string, capacity: number, distribution: DistributionParams];

function pipeline(id: string, source: string, arrivals: DistributionParams, stages: Stage[], sink: string) {
  const nodes: ExampleModel['nodes'] = [
    { id: `${id}-src`, type: 'source', position: { x: 60, y: 220 }, data: { label: source, type: 'source', distribution: arrivals } },
    ...stages.map(([label, capacity, distribution], i) => ({
      id: `${id}-s${i + 1}`, type: 'server', position: { x: 310 + i * 250, y: 220 },
      data: { label, type: 'server', capacity, distribution },
    })),
    { id: `${id}-sink`, type: 'sink', position: { x: 310 + stages.length * 250, y: 220 }, data: { label: sink, type: 'sink' } },
  ];
  const edges = nodes.slice(1).map((node, i) => ({
    id: `${id}-e${i + 1}`, source: nodes[i].id, target: node.id,
    animated: true, style: { stroke: '#6366f1', strokeWidth: 2 },
  }));
  return { nodes, edges };
}

const steadyRun = { horizon: 6000, warmup: 600, seed: 42, replications: 8 };

export const IT_EXAMPLES: ExampleModel[] = [
  {
    id: 'it-helpdesk', badge: 'IT · Support', difficulty: 1,
    name: 'Monday morning help desk',
    description: 'Employees locked out of their accounts pass through identity verification and then a shared IT support queue. Decide whether the next hire belongs at the front desk or on the support team.',
    objectives: [
      'Represent a ticket as one entity visiting two resource pools in order',
      'Calculate offered load and utilisation separately for each stage',
      'Distinguish a shared queue with two agents from two separate queues',
    ],
    parameters: 'Arrivals: Exp(6) | Identity check: Exp(2), c=1 | IT support: Exp(8), c=2 | All times: min',
    expectedKpis: 'Steady-state reference: identity ρ=33.3%, support ρ=66.7%; total Wq=7.4 min, W=17.4 min. Finite runs vary.',
    assumptions: 'Every ticket needs both stages. Agents are identical, queues are FIFO and unlimited, and there are no priorities, abandonment, or repeat contacts.',
    experiment: [
      'Run the baseline and save it in Scenario Comparison. Record average total wait and its 95% CI.',
      'Raise IT support capacity from 2 to 3 and save the alternative using the same run settings. Compare total wait.',
      'Reload the baseline and instead raise Identity check capacity to 2. Explain why the two hiring choices have different effects.',
    ],
    ...pipeline('it-helpdesk', 'Employee tickets', exp(6), [['Identity check', 1, exp(2)], ['IT support', 2, exp(8)]], 'Resolved tickets'),
    config: { ...steadyRun },
  },
  {
    id: 'it-cicd', badge: 'IT · DevOps', difficulty: 1,
    name: 'The build farm traffic jam',
    description: 'A small development team pushes commits into a build, test, and deployment pipeline. Fast builds can hide a shortage of test runners; adding capacity in the wrong place barely helps.',
    objectives: [
      'Identify the limiting stage of a three-stage software delivery pipeline',
      'Convert service durations into jobs per minute of capacity',
      'Predict how a bottleneck moves after adding one runner',
    ],
    parameters: 'Commits: Exp(5) | Build: Constant(3), c=1 | Test: Exp(8), c=2 | Deploy: Constant(2), c=1',
    expectedKpis: 'Offered utilisation: build 60%, test 80%, deploy 40%. Adding a third test runner gives test ρ≈53.3%; build becomes the highest-load stage.',
    assumptions: 'Each commit creates one job and always succeeds. The test pool runs two whole jobs concurrently; a job does not split into parallel tests. Deployment slots have no release schedule.',
    experiment: [
      'Run the baseline and inspect the Test queue during event playback. Save the baseline.',
      'Increase Test capacity from 2 to 3, rerun, and compare total queue wait and sojourn time with their CIs.',
      'Keep three test runners and change the commit interarrival mean from 5 to 3. Explain why Build now has no spare capacity even though testing does.',
    ],
    ...pipeline('it-cicd', 'Commits', exp(5), [['Build', 1, constant(3)], ['Test', 2, exp(8)], ['Deploy', 1, constant(2)]], 'Live releases'),
    config: { ...steadyRun },
  },
  {
    id: 'it-media', badge: 'IT · Media cloud', difficulty: 2,
    name: 'Creator uploads and noisy transcoders',
    description: 'A creator platform validates video uploads, transcodes them, and publishes a manifest. Compare unpredictable encoder runtimes with a more consistent encoder at exactly the same mean speed.',
    objectives: [
      'Separate service variability from average service demand',
      'Evaluate a three-stage pipeline with mixed distributions',
      'Use replication CIs to assess an encoder optimisation',
    ],
    parameters: 'Uploads: Exp(4) | Validate: Constant(0.5), c=1 | Transcode: Exp(6), c=2 | Publish: Uniform(0.5,1.5), c=1',
    expectedKpis: 'Offered utilisation: validate 12.5%, transcode 75%, publish 25%. Replacing Exp(6) by Constant(6) keeps encoder load at 75%; test whether waiting falls.',
    assumptions: 'One upload is one encoding job; workers are identical. File sizes and retries are abstracted into service time. There is no fan-out into renditions and no network contention.',
    experiment: [
      'Save the baseline. Replace Transcode service with Constant(6), leaving its two workers and all other settings unchanged.',
      'Compare total wait and sojourn means and CIs. If estimates are inconclusive, increase replications for both scenarios.',
      'Reload the baseline and instead add a third transcoder. Compare buying capacity with reducing variability; do not assume either change halves end-to-end latency.',
    ],
    ...pipeline('it-media', 'Video uploads', exp(4), [['Validate', 1, constant(0.5)], ['Transcode', 2, exp(6)], ['Publish', 1, uniform(0.5, 1.5)]], 'Published videos'),
    config: { ...steadyRun },
  },
  {
    id: 'it-soc', badge: 'IT · Security', difficulty: 2,
    name: 'Security operations alert surge',
    description: 'Actionable security alerts require enrichment, analyst investigation, and containment. A launch doubles alert volume. Determine which teams need extra capacity before running the surge scenario.',
    objectives: [
      'Use the mean of a triangular distribution in a capacity calculation',
      'Find every overloaded stage instead of fixing only the first queue',
      'Compare a steady workload with a separate sustained surge experiment',
    ],
    parameters: 'Alerts: Exp(5) | Enrich: Uniform(1,3), c=1 | Investigate: Triangular(3,6,12), c=2 | Contain: Exp(3), c=1',
    expectedKpis: 'Baseline offered ρ: 40%, 70%, 60%. At Exp(2.5) arrivals: 80%, 140%, 120%. Surge needs at least 3 investigators and 2 containment slots for ρ<1 throughout.',
    assumptions: 'Only actionable alerts enter; every alert needs containment. No severity priorities or false-positive routing. The surge is a separate constant-rate run, not an automatic mid-run rate change.',
    experiment: [
      'Run and save the baseline. Change the source interarrival mean to 2.5 and rerun with warm-up 0 to observe overload from an empty system.',
      'Keep surge arrivals, increase Investigate capacity to 3 and Contain capacity to 2, then restore warm-up to 600.',
      'Investigators now have ρ≈93.3%. Compare 3 versus 4 investigators; explain why minimum stable staffing may still produce poor waiting times.',
    ],
    ...pipeline('it-soc', 'Actionable alerts', exp(5), [['Enrich', 1, uniform(1, 3)], ['Investigate', 2, triangular(3, 6, 12)], ['Contain', 1, exp(3)]], 'Contained alerts'),
    config: { ...steadyRun },
  },
  {
    id: 'it-etl', badge: 'IT · Data engineering', difficulty: 2,
    name: 'The dashboard freshness deadline',
    description: 'Analytics microbatches move through extraction, transformation, quality checks, and warehouse commit. Find the bottleneck before spending the performance budget on faster transformations.',
    objectives: [
      'Calculate stage capacity when stages have different worker counts',
      'Distinguish processing time from end-to-end data freshness',
      'Investigate a downstream serial commit bottleneck',
    ],
    parameters: 'Batches: Exp(4) | Extract: Uniform(1,3), c=1 | Transform: Triangular(2,5,8), c=2 | Quality: Constant(1), c=1 | Commit: Exp(3.5), c=1',
    expectedKpis: 'Offered ρ: extract 50%, transform 62.5%, quality 25%, commit 87.5%. Mean processing demand is 11.5 min before any queueing; doubling commit capacity makes transform the highest-load stage.',
    assumptions: 'A batch is indivisible and visits all four stages. Commit capacity represents independent warehouse writers, with no locks or shared I/O penalty between them. Failed quality checks are excluded.',
    experiment: [
      'Run the baseline and record average sojourn (freshness delay) and queue wait. Save it for comparison.',
      'Raise Commit capacity from 1 to 2 and rerun. Compare the improvement with an alternative that only raises Transform capacity from 2 to 3.',
      'Propose a design targeting average sojourn below 20 min. Use several replications and report the CI; a mean target is not a guarantee that every batch meets the deadline.',
    ],
    ...pipeline('it-etl', 'Analytics batches', exp(4), [['Extract', 1, uniform(1, 3)], ['Transform', 2, triangular(2, 5, 8)], ['Quality', 1, constant(1)], ['Commit', 1, exp(3.5)]], 'Fresh dashboards'),
    config: { ...steadyRun },
  },
  {
    id: 'it-gpu', badge: 'IT · AI infrastructure', difficulty: 3,
    name: 'GPU capacity under a launch budget',
    description: 'An asynchronous AI service validates requests, prepares context, generates on GPUs, and performs safety checks. A product launch increases demand by 50%. Allocate a small hardware budget across the entire route.',
    objectives: [
      'Translate a demand increase into an interarrival-time change',
      'Solve a constrained integer capacity problem with a utilisation ceiling',
      'Check downstream headroom after expanding the GPU pool',
    ],
    parameters: 'Requests: Exp(3) | Validate: Constant(0.3), c=1 | Context: Uniform(1,2), c=1 | GPU: Triangular(2,5,11), c=3 | Safety: Exp(1.8), c=1',
    expectedKpis: 'Baseline offered ρ: 10%, 50%, 66.7%, 60%. Launch Exp(2): 15%, 75%, 100%, 90%. To keep all stages ≤80%, use 4 GPUs and 2 safety slots; other capacities stay unchanged.',
    assumptions: 'Each request occupies one GPU for its whole generation. No batching, token streaming, cache hits, dynamic autoscaling, or job priorities. Added slots have identical independent service times.',
    experiment: [
      'Run the baseline. Change request interarrival mean to 2 for the launch and inspect the growing GPU queue with warm-up 0.',
      'An extra GPU costs 4 credits and an extra safety slot costs 1. Find the cheapest allocation keeping every stage at or below 80% offered utilisation.',
      'Apply that allocation, restore warm-up to 600, and compare it with a GPU-only upgrade. Report total wait and sojourn CIs and explain why a GPU-only purchase misses the headroom target.',
    ],
    ...pipeline('it-gpu', 'AI requests', exp(3), [['Validate', 1, constant(0.3)], ['Context', 1, uniform(1, 2)], ['GPU generation', 3, triangular(2, 5, 11)], ['Safety check', 1, exp(1.8)]], 'Completed responses'),
    config: { ...steadyRun },
  },
  {
    id: 'it-recovery', badge: 'IT · Reliability', difficulty: 3,
    name: 'Disaster recovery: the retry backlog',
    description: 'A recovery region must handle live jobs plus replayed failed jobs. Verification, restore workers, and an index writer share this work. The baseline is deliberately overloaded: find all capacity constraints before declaring recovery healthy.',
    objectives: [
      'Add independent arrival rates before estimating resource demand',
      'Explain why adding workers can expose another saturated stage',
      'Avoid interpreting finite completed-job averages as steady-state evidence',
    ],
    parameters: 'Live rate 1/6 + replay rate 1/3 = 0.5/min → Exp(2) | Verify: Constant(1), c=1 | Restore: Exp(5), c=2 | Index: Constant(2), c=1',
    expectedKpis: 'Baseline offered ρ: 50%, 125%, 100% — no stable steady state. Restore c=3 gives 83.3% but Index still has no headroom; Index c=2 gives 50%.',
    assumptions: 'Live and replay arrivals are independent Poisson streams aggregated into one source because they have identical service needs. Replay continues for the full horizon; this is not a finite backlog or a feedback retry loop. There is no priority for live traffic.',
    experiment: [
      'Use the default warm-up 0 and horizon 1200. Compare queue growth at horizons 600 and 1200; do not treat completed-job waiting time as the delay of jobs still stuck.',
      'Raise Restore capacity to 3 and rerun. Index remains at the stochastic stability boundary; then raise Index capacity to 2.',
      'For the repaired model, use horizon 6000 and warm-up 600 with 8 replications. Assess queue wait and explain why adding only restore workers was insufficient.',
    ],
    ...pipeline('it-recovery', 'Live + replay jobs', exp(2), [['Verify', 1, constant(1)], ['Restore', 2, exp(5)], ['Index', 1, constant(2)]], 'Recovered jobs'),
    config: { horizon: 1200, warmup: 0, seed: 42, replications: 8 },
  },
  {
    id: 'it-tenants', badge: 'IT · SaaS platform', difficulty: 3,
    name: 'Noisy neighbours in a shared ingestion service',
    description: 'Three customers share a SaaS ingestion pipeline. Sales wants to admit a fourth customer. Work out the largest additional traffic rate allowed by a headroom policy, then test the proposed admission in the simulator.',
    objectives: [
      'Aggregate tenant arrival rates without averaging their interarrival means',
      'Find the minimum of per-stage admissible rates under a headroom constraint',
      'Recognise the limits of aggregate metrics for tenant-level fairness',
    ],
    parameters: 'Tenant rates 0.1 + 0.125 + 0.025 = 0.25/min → Exp(4) | Parse: Uniform(1,3), c=1 | Enrich: Triangular(2,4,6), c=2 | Write: Exp(3), c=1 | Audit: Constant(0.5), c=1',
    expectedKpis: 'Baseline offered ρ: 50%, 50%, 75%, 12.5%. An 80% per-stage ceiling limits total rate to 0.8/3≈0.2667/min; new-tenant allowance is 1 job/hour.',
    assumptions: 'Tenant streams are independent Poisson processes with identical job sizes and a shared FIFO queue at each stage. Aggregation preserves total load, but does not retain tenant labels or model fairness, quotas, or correlated bursts.',
    experiment: [
      'Run and save the baseline. Sales proposes 3 extra jobs/hour: total rate becomes 0.3/min, so set the source mean to 10/3 (about 3.333333) min.',
      'Compute offered utilisation at every stage and decide whether the proposal meets the 80% ceiling. Keep stability and headroom as separate requirements.',
      'Compare admitting only 1 extra job/hour (source mean 3.75) with buying a second Write slot and admitting all 3. Report CIs for overall wait, and state why this model cannot certify a per-tenant latency guarantee.',
    ],
    ...pipeline('it-tenants', 'Tenant jobs', exp(4), [['Parse', 1, uniform(1, 3)], ['Enrich', 2, triangular(2, 4, 6)], ['Write', 1, exp(3)], ['Audit', 1, constant(0.5)]], 'Ingested jobs'),
    config: { ...steadyRun },
  },
];

export const IT_CHALLENGES: Challenge[] = [
  {
    id: 'ch-it-helpdesk', title: 'Help desk: where should the next hire go?', difficulty: 1,
    task: 'Tickets arrive every 6 min on average. Identity verification takes 2 min with one agent; IT support takes 8 min with two agents sharing one queue. Which stage has the higher offered utilisation, and what is it?',
    options: [
      { label: 'Identity verification, ρ = 66.7%', correct: false },
      { label: 'IT support, ρ = 133.3%', correct: false },
      { label: 'IT support, ρ = 66.7%', correct: true },
      { label: 'Both stages, ρ = 50%', correct: false },
    ],
    hints: ['Every ticket visits both stages, so both see λ = 1/6 per minute.', 'For a stage with c workers and mean service s, ρ = λs/c.', 'Identity: (1/6)×2/1 = 1/3. Support: (1/6)×8/2 = 2/3.'],
    explanation: 'IT support has the higher load: 66.7% per agent versus 33.3% for identity verification. With three support agents its load drops to 44.4%. Load the model and compare hiring at each stage using total waiting time, not just the number of busy agents.',
    exampleId: 'it-helpdesk',
  },
  {
    id: 'ch-it-cicd', title: 'CI/CD: follow the moving bottleneck', difficulty: 1,
    task: 'Commits arrive at 0.2/min. Build has one worker taking 3 min/job; Test has two workers taking 8 min/job each; Deploy has one worker taking 2 min/job. After adding a third test runner, which stage has the highest offered utilisation?',
    options: [
      { label: 'Build at 60%; Test falls to about 53.3%', correct: true },
      { label: 'Test at 80%; capacity does not change utilisation', correct: false },
      { label: 'Deploy at 100%; all commits eventually deploy', correct: false },
      { label: 'All stages at 20%, matching the arrival rate', correct: false },
    ],
    hints: ['Use ρ = arrival rate × mean service time / worker count.', 'After the upgrade: Build = 0.2×3, Test = 0.2×8/3, Deploy = 0.2×2.', 'Compare 0.6, about 0.533, and 0.4.'],
    explanation: 'Build becomes the highest-load stage at 60%. Test drops from 80% to 53.3%, and Deploy stays at 40%. The highest-load stage is a capacity planning signal; service variability also affects which stage contributes most waiting. Run both models to inspect the effect.',
    exampleId: 'it-cicd',
  },
  {
    id: 'ch-it-media', title: 'Transcoding: less randomness, same speed', difficulty: 2,
    task: 'At 0.25 uploads/min, two transcoders each take Exp(mean=6 min). An optimisation changes service to Constant(6 min), keeping arrivals and capacity unchanged. Which conclusion is justified before simulation?',
    options: [
      { label: 'Utilisation falls from 75% to 37.5%', correct: false },
      { label: 'All queues disappear because service is deterministic', correct: false },
      { label: 'End-to-end mean waiting must be exactly halved', correct: false },
      { label: 'Offered utilisation stays at 75%; reduced variability can improve waiting', correct: true },
    ],
    hints: ['Does replacing a distribution change its mean in this experiment?', 'ρ = 0.25×6/2 = 0.75 in both cases.', 'The exact M/D/1 half-wait result does not apply to a two-worker, multi-stage pipeline.'],
    explanation: 'Mean demand and capacity are unchanged, so offered utilisation stays at 75%. Less service variability can reduce waiting, but the magnitude must be evaluated for this pipeline. Poisson arrivals still create queues, and the single-server half-wait formula is not valid for this network.',
    exampleId: 'it-media',
  },
  {
    id: 'ch-it-soc', title: 'Alert surge: staff every overloaded stage', difficulty: 2,
    task: 'During a sustained surge, alerts arrive every 2.5 min on average. Enrichment averages 2 min; investigation is Triangular(3,6,12) min; containment averages 3 min. What is the minimum worker allocation with strictly less than 100% offered utilisation at every stage?',
    options: [
      { label: 'Enrich 1, Investigate 2, Contain 1', correct: false },
      { label: 'Enrich 1, Investigate 3, Contain 2', correct: true },
      { label: 'Enrich 2, Investigate 2, Contain 2', correct: false },
      { label: 'Enrich 1, Investigate 3, Contain 1', correct: false },
    ],
    hints: ['The triangular mean is (min + mode + max)/3, not the mode.', 'Investigation averages 7 min. At λ=0.4/min, offered work is 0.8, 2.8, and 1.2 worker-minutes/min.', 'Each worker count must strictly exceed its offered work: 1, 3, and 2.'],
    explanation: 'The minimum is 1 enrichment worker, 3 investigators, and 2 containment slots, giving ρ=80%, 93.3%, and 60%. This is a stability result, not a latency guarantee: investigators remain heavily loaded. Compare three and four investigators in the linked experiment.',
    exampleId: 'it-soc',
  },
  {
    id: 'ch-it-etl', title: 'Data freshness: spend at the right stage', difficulty: 2,
    task: 'Batches arrive every 4 min on average. Extract takes mean 2 min with c=1; Transform mean 5 with c=2; Quality mean 1 with c=1; Commit mean 3.5 with c=1. Which stage has the smallest service capacity, and what is the highest offered utilisation after doubling only that stage?',
    options: [
      { label: 'Transform; after doubling it, Commit is at 87.5%', correct: false },
      { label: 'Quality; after doubling it, Extract is at 50%', correct: false },
      { label: 'Commit; after doubling it, Transform is highest at 62.5%', correct: true },
      { label: 'Commit; after doubling it, every stage is below 50%', correct: false },
    ],
    hints: ['A stage can process c / meanService jobs per minute.', 'Capacities are 0.5, 0.4, 1, and about 0.286 jobs/min. Commit is smallest.', 'With Commit c=2, its ρ is 43.75%; the other loads remain 50%, 62.5%, and 25%.'],
    explanation: 'Commit is the capacity bottleneck. Doubling it moves its utilisation from 87.5% to 43.75%, leaving Transform highest at 62.5%. This does not prove a particular freshness deadline is met; run the pipeline and compare the end-to-end sojourn CI with the target.',
    exampleId: 'it-etl',
  },
  {
    id: 'ch-it-gpu', title: 'AI launch: the cheapest headroom plan', difficulty: 3,
    task: 'Launch traffic is 0.5 requests/min. Validate takes 0.3 min (c=1); Context mean 1.5 (c=1); GPU Triangular(2,5,11) (c=3); Safety mean 1.8 (c=1). An extra GPU costs 4 credits and a safety slot costs 1. What is the cheapest addition keeping every stage at or below 80% offered utilisation?',
    options: [
      { label: 'One GPU only: 4 credits', correct: false },
      { label: 'One GPU and one safety slot: 5 credits', correct: true },
      { label: 'Two safety slots only: 2 credits', correct: false },
      { label: 'Two GPUs only: 8 credits', correct: false },
    ],
    hints: ['The GPU mean is (2+5+11)/3 = 6 min. The required capacity is ceil(λs/0.8).', 'GPUs require ceil(0.5×6/0.8)=4 slots. Safety requires ceil(0.5×1.8/0.8)=2.', 'Validate and Context are already at 15% and 75%. Add one GPU and one safety slot.'],
    explanation: 'Five credits buy the minimum feasible additions. GPU utilisation becomes 75% and Safety becomes 45%, while Validate and Context stay at 15% and 75%. A GPU-only purchase leaves Safety at 90%; extra GPUs cannot fix that constraint. The 80% ceiling is a fictional planning rule, not a latency guarantee.',
    exampleId: 'it-gpu',
  },
  {
    id: 'ch-it-recovery', title: 'Recovery: why the queue still grows', difficulty: 3,
    task: 'Live jobs arrive at 1/6 per min and replay jobs at 1/3 per min, independently. Verify takes 1 min (c=1); Restore averages 5 min (c=2); Index takes 2 min (c=1). Which smallest capacity change makes every stage strictly below 100% offered utilisation under sustained replay?',
    options: [
      { label: 'Add one restore worker only', correct: false },
      { label: 'Add one index writer only', correct: false },
      { label: 'Double the horizon; finite waiting proves stability', correct: false },
      { label: 'Add one restore worker and one index writer', correct: true },
    ],
    hints: ['Add arrival rates: 1/6 + 1/3 = 1/2 job/min.', 'Restore offered work is 2.5 workers; Index offered work is exactly 1 worker.', 'Three restore workers give 83.3%; two index writers give 50%. Equality at 100% is insufficient here.'],
    explanation: 'Add both: Restore c=3 and Index c=2. Fixing Restore alone leaves the stochastic Index queue at ρ=1, with no finite steady-state mean wait. A short simulation always produces finite numbers; completed-job averages also omit unfinished jobs. Inspect backlog growth and only use steady-state comparisons after repairing both stages.',
    exampleId: 'it-recovery',
  },
  {
    id: 'ch-it-tenants', title: 'SaaS admission: how much traffic fits?', difficulty: 3,
    task: 'Existing tenants contribute 0.1, 0.125, and 0.025 jobs/min. The shared pipeline has Parse mean 2 min (c=1), Enrich mean 4 (c=2), Write mean 3 (c=1), and Audit mean 0.5 (c=1). With an 80% ceiling at every stage and no upgrades, what is the maximum additional arrival rate in jobs/hour?',
    options: [
      { label: '1 job/hour', correct: true },
      { label: '3 jobs/hour', correct: false },
      { label: '5 jobs/hour', correct: false },
      { label: '16 jobs/hour', correct: false },
    ],
    hints: ['Existing rate is 0.25/min. At each stage the ceiling allows total rate ≤ 0.8c/meanService.', 'The per-stage limits are 0.4, 0.4, 0.8/3, and 1.6 jobs/min. Write is limiting.', 'Additional rate = 0.8/3 − 0.25 = 1/60 job/min. Convert to jobs/hour.'],
    explanation: 'Only 1 additional job/hour fits the headroom rule. The allowed total is 16/hour, of which existing tenants consume 15/hour. Three extra jobs/hour would give Write 90% utilisation: stable, but outside policy. Aggregate waiting metrics cannot demonstrate tenant fairness because this model does not retain tenant identity.',
    exampleId: 'it-tenants',
  },
];
