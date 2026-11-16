# DES Playground

DES Playground is an interactive environment for learning discrete-event simulation and queueing theory. It combines guided lessons with three browser-based modelers, a reproducible simulation engine, parameter experiments, and executable Python and R exports.

## What is included

| Area | Purpose |
| --- | --- |
| Home | Quick links, workspace navigation, and a safe reset for browser data |
| Lessons | Eight guided lessons covering events, queues, experiments, formal models, and export |
| Examples | Sixteen ready-to-run models, including Clinic, Factory, Inventory, and eight IT case studies |
| Challenges | Thirteen assessed problems with hints, explanations, and linked examples |
| M/M/c Modeler | Interactive Erlang-C model with live simulation charts and analytic reference values |
| Queue Modeler | Visual Source → Server → Sink networks with validation, playback, metrics, and export |
| Process Modeler | General process graphs with resources, stores, decisions, cycles, experiments, playback, and export |

The modelers use smooth-step entity-flow connections. Resource and store associations in Process Modeler are dashed and labeled so they remain distinct from entity flow.

## Quick start

Requirements: a current Node.js release and npm.

```bash
npm install
npm run dev
```

Vite prints the local development URL. The other standard commands are:

```bash
npm test
npx tsc --noEmit
npm run build
npm run preview
```

## Using the modelers

### M/M/c Modeler

Adjust the arrival rate, service rate, and number of servers to see utilization, queue length, and waiting time change. The formal model and exported programs are generated from the current parameters.

### Queue Modeler

Queue Modeler is the focused workspace for arrival streams, service stations, and sinks.

1. Drag Source, Server, and Sink blocks onto the canvas and connect them.
2. Select a block to edit its distribution or capacity.
3. Set horizon, warm-up, seed, and replication count, then run the model.
4. Use the right panel for properties, metrics, events, the formal model, and Python/R export.
5. Pause, step, scrub, or replay the first replication. Metrics summarize every requested replication.

Clinic and the queueing/IT examples open here. Model edits clear stale results; moving or selecting a block does not change simulation behavior.

### Process Modeler

Process Modeler supports sources and finite populations, servers and delays, shared resources, stores and stock operations, decisions and routers, signals, batching, joins, assignments, and repeating resource calendars.

1. Load Inventory or Factory from the template menu, or build a graph from the palette.
2. Select blocks to edit distributions, conditions, quantities, attributes, capacities, schedules, and costs.
3. Choose a fixed-horizon or drain run. Recurring cycles require a fixed horizon.
4. Run the model and inspect Results, Events, Formal, Experiments, and Export in the right panel.
5. Use Experiments to sweep one or two numeric parameters, plot sensitivity, check a target mean, and download CSV results.
6. Export a versioned JSON snapshot before trying variants. The current process workspace also autosaves in browser storage, and undo/redo retains up to 100 edits.

JSON import validates file size, schema, model shape, and run settings. Schema 2 model files migrate to the current schema. Downloaded JSON and CSV files are not removed by the in-app data reset.

## Simulation behavior

- Runs are seeded with the mulberry32 generator and use a common seed sequence across scenario sweeps.
- Replication summaries use Student-t 95% confidence intervals.
- A fixed-horizon run may finish with entities still in the system; a drain run closes arrivals and processes admitted entities.
- Process experiments allow at most 100 scenarios and 1,000 total runs.
- Parameter or connection changes invalidate results and cancel experiment output.
- Playback displays the primary replication while summary metrics cover all replications.

The Process Modeler supports FIFO and nonpreemptive priority queues, probability routing, grouped batch/unbatch, correlated signal joins, and repeating resource capacities. See [the roadmap](docs/des-roadmap.md) for intentionally unsupported features.

## Examples and teaching cases

- Clinic uses normal interarrivals and service durations across nurse, doctor, and administration stages. It opens in Queue Modeler.
- Factory models machine failures, repair and replacement queues, spare inventory, staffing, downtime, and operating costs. It opens in Process Modeler.
- Inventory models discrete demand, lost sales, a guarded `(s,S)` policy, replenishment lead time, and holding cost. It opens in Process Modeler.
- The eight IT cases cover help desks, build farms, media processing, security operations, analytics pipelines, GPU capacity, disaster recovery, and multi-tenant ingestion.

Formal specifications are generated from the live model. Math is rendered locally with MathJax; the application does not require a CDN at runtime.

## Code export

Queue and Process models can generate:

- Python programs using SimPy
- R programs using simmer and jsonlite

The generated scripts embed the canonical model, run settings, state rules, measurements, and replication summaries. Python uses the browser-compatible seeded generator. R uses its native random-number generator, so stochastic outputs should be compared statistically rather than event-for-event.

## Project structure

```text
App.tsx                       Application shell, navigation, model state, autosave
components/
  Home.tsx                    Landing page and browser-data reset
  Theory.tsx                  Lessons, examples, and challenges
  Simulator.tsx               M/M/c Modeler
  Editor.tsx                  Queue Modeler
  DESModeler.tsx              Process Modeler
  ProcessProperties.tsx       Process-block property editors
  ExperimentPanel.tsx         Parameter sweeps, chart, targets, and CSV
  FormalModel.tsx             Queue and process formal views
  ProcessFormalView.tsx       Process activity/state specification
  EventLog.tsx                Simulation event trace
  ReplicationsPanel.tsx       Metrics and confidence intervals
  ValidationPanel.tsx         Structural and parameter diagnostics
  CodeExport.tsx              Python export
  SimmerCodeExport.tsx        R export
  nodes/                      React Flow node renderers
lib/
  model.ts                    Canonical DES schema
  compiler.ts                 React Flow graph to canonical model
  engine.ts                   Run configuration and replication summaries
  processEngine.ts            Shared event-calendar runtime
  processValidation.ts        Process validation
  validator.ts                Queue-model validation
  processExamples.ts          Factory and Inventory graphs
  experiments.ts              Scenario sweeps and CSV output
  modelLibrary.ts             JSON documents, migration, and autosave
  useModelHistory.ts          Process workspace undo/redo
  processExport.ts            Shared export serialization
  exportRuntime/              Standalone Python and R process runtimes
  theory.ts                   Erlang-C calculations
  theoryContent.ts            Lessons, examples, and challenges
  itLearningContent.ts        IT case studies and linked challenges
tests/                        Engine, export, persistence, and DOM checks
colab/                        Five queueing notebooks
docs/                         Capability roadmap
```

## Colab notebooks

The [Colab guide](colab/README.md) links five worked notebooks:

| Notebook | Topic |
| --- | --- |
| `01_mm1_single_server.ipynb` | M/M/1 baseline and confidence intervals |
| `02_mmc_multi_server.ipynb` | M/M/c staffing |
| `03_md1_vs_mm1_variability.ipynb` | Service-time variability |
| `04_production_line.ipynb` | Two-stage tandem queue |
| `05_what_if_analysis.ipynb` | Scenario and utilization sweep |

## Verification

```bash
npm test
npx tsc --noEmit
npm run build
```

The test suite covers seeded reproducibility, conservation and accounting, validation, persistence and schema migration, attributes, priorities, batching, correlated joins, resource calendars, experiment cancellation, code generation, and DOM interactions for navigation and playback.

Generated programs are executed when suitable interpreters are configured:

```bash
DES_PYTHON=/path/to/python DES_RSCRIPT=/path/to/Rscript npm test
```

The Python environment needs SimPy. The R environment needs simmer and jsonlite; set `R_LIBS` when those packages are installed in a custom library.

## License

For educational use.
