# DES Playground

An interactive learning environment for **Discrete Event Simulation (DES)** and **Queueing Theory** — built with React 19 + TypeScript + Vite.

> Build visual models, run multi-replication simulations, compare scenarios, explore theory, tackle challenges, and export runnable SimPy / R simmer code.

---

## Features

| Area                 | What you get                                                                                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home**             | Learning overview, challenge progress, current model summary, appearance options and confirmed data reset                                                                               |
| **Lessons**          | 8 accordion lessons (DES fundamentals → code export) with inline visualizations                                                                                                         |
| **Examples**         | 16 pre-built models, including 8 IT case studies across three difficulty levels — open each in its modeler                                                                              |
| **Challenges**       | 13 assessed problems with progressive hints, answer validation, linked models, and IT experiments                                                                                       |
| **M/M/c Visualizer** | Interactive Erlang-C playground with live Lq / Wq / ρ charts                                                                                                                            |
| **Queue Modeler**    | Focused source/server/sink canvas, replications, event playback and scenario comparison                                                                                                 |
| **DES Modeler**      | Saved models and JSON files, undo/redo, attributes and priorities, probability routes, batch/unbatch and correlated joins, shift calendars, parameter experiments, playback and exports |
| **Code Export**      | Generate SimPy (Python) and R simmer scripts from validated models; copy or download                                                                                                    |
| **Colab notebooks**  | 5 worked Jupyter notebooks in `colab/` covering queueing models and experiments                                                                                                         |

---

The sidebar groups Lessons, Examples and Challenges under **Learn**. The
**Workspace** links appear in this order: **M/M/c Visualizer**, **Queue Modeler**,
then **DES Modeler**. **Home** is the default landing page.

DES models autosave in the current browser and support named library copies and
portable JSON files. Queue models and simulation results last for the current
session. Challenge progress and appearance preferences also persist in the
browser. Clearing app data removes saved models, autosave, progress and
preferences, and restores the starter models. Downloaded files and unrelated
browser storage are kept.

## IT examples and challenges

Each fictional workload includes a runnable model, explicit assumptions, expected capacity calculations, a three-step experiment, and a linked assessed challenge. Use the difficulty filters in **Examples** and **Challenges**, then **Open Queue Modeler** to load a model and run it. Challenges also provide **Load in Editor** shortcuts.

| Level        | Scenario                              | Main decision                                      |
| ------------ | ------------------------------------- | -------------------------------------------------- |
| Beginner     | Monday morning help desk              | Where to add an agent in a two-stage service       |
| Beginner     | Build farm traffic jam                | How the bottleneck moves after adding test runners |
| Intermediate | Creator uploads and noisy transcoders | Reduce runtime variability or buy capacity         |
| Intermediate | Security operations alert surge       | Staff multiple overloaded stages                   |
| Intermediate | Dashboard freshness deadline          | Improve a four-stage analytics pipeline            |
| Hard         | GPU capacity under a launch budget    | Meet per-stage headroom limits at minimum cost     |
| Hard         | Disaster recovery retry backlog       | Repair an intentionally unstable pipeline          |
| Hard         | Noisy neighbours in shared ingestion  | Admit new tenant traffic within a capacity ceiling |

These IT examples use minutes, FIFO queues, fixed parallel worker pools, and sequential stages supported by the browser and both exporters. Independent Poisson streams with identical job requirements are aggregated into one source. These example graphs do not include priorities, feedback retries, dynamic autoscaling or fork/join execution; the general DES Modeler supports priorities and correlated branches. Challenge completion records the correct answer; simulation experiments are self-guided.

## Tech stack

- **React 19 / TypeScript / Vite**
- **@xyflow/react** v12 — DES canvas
- **Recharts** — simulation charts
- **Lucide React** — icons
- **React Syntax Highlighter** — code export panels
- Custom DES event-calendar engine (TypeScript, mulberry32 PRNG, t-distribution CI)
- M/M/c Erlang-C analytic benchmark

---

## Quick start

```bash
npm install
npm run dev        # → http://localhost:3000 (or the next available port)
```

```bash
npm run build      # production bundle
npm run preview    # preview the build
```

---

## Using the modelers

**Queue Modeler** is the focused workspace for arrival streams, service stations
and sinks. Queueing examples and Clinic open here. Use it for capacity and
variability experiments, replication results and queueing benchmarks where the
model meets their assumptions.

**DES Modeler** handles process graphs with shared resources, inventory, finite
populations, decisions and cycles. Factory and Inventory open as editable models
here, and both are also available as templates.

1. Open a template or build a graph with the component palette. Select blocks to
   edit their parameters and connect the labeled ports.
2. Set the horizon, warm-up, seed, replications, time unit and stopping rule.
   Recurring cycles require **Stop at horizon**.
3. Click **Run model**. The model is calculated and playback starts automatically.
   Controls above the canvas show the clock, event position and live entity
   counts; the active block is highlighted. Pause, step, scrub the event slider,
   or select **End** to inspect the final state.
4. Read results and confidence intervals below the canvas. Playback displays the
   first replication; result summaries cover all replications. Save a baseline
   for comparison, or open **Parameter experiments** to sweep numeric settings.
5. Use **Save new copy** for a named browser copy, or **Export model JSON** for a
   portable file. Python/R exports contain the executable model and run settings.

Changing model parameters, connections or run settings stops playback and clears
stale results. Moving or selecting blocks does not change simulation behavior.
Undo/redo restores graph edits, settings and model loads. A fixed-horizon run may
end with entities still in the system; that is expected for recurring processes.

## Project structure

```
App.tsx                    # shell: sidebar nav, theme toggle, tab routing
components/
  Home.tsx                 # overview, quick starts, preferences and data reset
  Theory.tsx               # separate Lessons / Examples / Challenges pages
  Editor.tsx               # Queue Modeler (canvas + run + export)
  DESModeler.tsx            # General process canvas, formal view and experiments
  ProcessProperties.tsx    # Structured block, condition and quantity controls
  ModelLibrary.tsx         # Named browser copies and JSON import/export
  ExperimentPanel.tsx      # Parameter sweeps, plots and CSV results
  ModelingGuide.tsx        # In-app notation and modeling guidance
  ProcessFormalView.tsx    # Graph-derived process specification
  Simulator.tsx            # M/M/c Visualizer playground
  CodeExport.tsx           # SimPy code panel
  SimmerCodeExport.tsx     # R simmer code panel
  ComparisonPanel.tsx      # Side-by-side scenario diff
  ReplicationsPanel.tsx    # CI table
  ValidationPanel.tsx      # Model validation errors
  TheoryPanel.tsx          # M/M/c analytic reference (inside Editor)
  EventLog.tsx             # Event trace table
  nodes/CustomNodes.tsx    # Queue Modeler node types
  nodes/ProcessNode.tsx    # DES blocks, ports and playback state
lib/
  model.ts                 # DesModel schema (discriminated union)
  engine.ts                # Run configuration and replication summaries
  processEngine.ts         # Shared DES event calendar for both modelers
  processValidation.ts     # General graph and parameter checks
  processExamples.ts       # Editable Inventory and Factory process graphs
  modelLibrary.ts          # Versioned files, schema migration and browser storage
  modelShape.ts            # Imported model structure checks
  useModelHistory.ts       # Undo/redo across workspace navigation
  experiments.ts           # Parameter combinations, replications and CSV output
  shifts.ts                # Repeating resource capacity calendars
  exportRuntime/           # Standalone SimPy and R simmer process runtimes
  compiler.ts              # nodes+edges → DesModel
  validator.ts             # model validation rules
  theory.ts                # M/M/c Erlang-C, detectMMc()
  theoryContent.ts         # lessons, examples, challenges data
  itLearningContent.ts     # 8 IT models and linked challenges
  simpyGenerator.ts        # SimPy code generator
  simmerGenerator.ts       # R simmer code generator
  prng.ts                  # mulberry32 seeded PRNG
  scenarios.ts             # scenario snapshot helpers
  utils.ts                 # shared utilities
  appStorage.ts            # App preferences, challenge progress and data reset
tests/                     # Engine, export-runtime and DOM interaction checks
docs/                      # Implementation notes and remaining roadmap
colab/                     # Jupyter notebooks for queueing models and experiments
```

---

## Colab notebooks

Five fully worked examples in `colab/` — open in Google Colab or run locally with Jupyter. See the [Colab guide](colab/README.md) for launch links and step-by-step instructions:

| Notebook                          | Topic                                   |
| --------------------------------- | --------------------------------------- |
| `01_mm1_single_server.ipynb`      | M/M/1 baseline, Erlang-C check, CI      |
| `02_mmc_multi_server.ipynb`       | M/M/c staffing analysis                 |
| `03_md1_vs_mm1_variability.ipynb` | Deterministic vs exponential service    |
| `04_production_line.ipynb`        | Two-stage tandem queue                  |
| `05_what_if_analysis.ipynb`       | Scenario sweep, utilisation sensitivity |

All notebooks use the same seed convention (`base + i×1000`) and t-distribution CI table as the browser engine.

---

## Teaching cases and mathematical models

The Examples section includes **Clinic**, **Factory**, and **Inventory**, with explanations,
model assumptions and interactive experiments built directly into the app.

- **Clinic** loads into Queue Modeler: normal interarrivals (mean 5, SD 0.5
  minutes), nurse/doctor/administration service means 15/20/5 minutes (SD 1), and
  baseline capacities 2/3/2. Experiments describe 3/3/2, 3/4/2 and 4/5/2 staffing.
  Browser normal samples are conditioned to be nonnegative. The existing engine
  closes arrivals at the horizon and drains admitted patients, so waiting-time
  outputs include overtime.
- **Factory** opens an editable DES Modeler graph for 50 machine positions, uniform
  failures and repairs, FIFO repair/replacement queues, spare stock and operating
  costs. Its clock counts working hours. Costs include downtime still outstanding
  at the horizon; staff and spare costs use started eight-hour days.
- **Inventory** opens an editable DES Modeler graph with discrete demand, lost sales,
  a guarded `(s,S)` policy, one outstanding order and a two-day lead time. Holding
  cost integrates actual stock over every event interval and through the horizon.
  Initial stock is free; the displayed balance is not full lifecycle profit.

Factory and Inventory load into DES Modeler; queueing examples and Clinic load
into Queue Modeler. The two pages maintain separate model graphs and settings
independently and use the same event-calendar engine. DES Modeler supports editable blocks and connections, fixed-horizon/drain stopping, playback,
charts, replications with confidence intervals, a scenario baseline and exports.
Closed process cycles require a fixed horizon. Model edits invalidate results.

**Formal model** expands an activity-cycle specification for every editor example,
the current queueing graph and the M/M/c Visualizer. DES Modeler also provides
a generated process specification with guards, stock effects and resource rules. It includes
activities, input/output places, durations, initial tokens, state rules and outputs.
Lesson 8 explains the `M = <A,Q,I,O,τ,μ₀>` notation. For inventory,
counted/guarded transitions extend the basic token model. These specifications are
generated from current parameters, so changing the model updates its notation.

Mathematics uses locally bundled MathJax SVG output, loaded on demand, with cached
rendering and accessible formula labels. New authored prose can use `\(...\)` and
`\[...\]` delimiters with `MathText`, or use `MathFormula` for explicit TeX. Existing
queueing prose is handled by `mathProse`; diagram axes and numeric chart ticks stay
compact. Code exports retain executable language syntax.

## DES notation and scope

The main canvas uses process interaction: solid entity-flow arrows and labeled,
dashed resource/store associations. Activities include FIFO or nonpreemptive priority queues and acquire,
delay and release one unit of their resource pool. Decisions select a true/false
path. Signals create an independent entity on the spawn path and retain the
original on the out path. Stock operations take whole quantities with FIFO waiting,
fulfill available quantities with lost demand, or put quantities into a store.
The in-app guide explains ACD and Petri-net concepts; the formal process view is
Petri-inspired and does not claim full CPN interoperability.

Inventory keeps initial stock free and charges purchases when ordering, including
orders still in transit at the horizon. Factory uses working hours; an eight-hour
cost period represents a working day, without simulating calendar shifts. Fixed
costs charge every period overlapping the observation window; holding and waiting
costs integrate over that window. Shift changes precede completions, then process steps, then
external arrivals; sequence order breaks remaining ties.

The general Python export runs on SimPy and uses the browser PRNG. R exports run
on simmer with jsonlite and use R's PRNG: deterministic fixtures match, while
stochastic results should be compared statistically. Both scripts embed the model,
configuration, state rules, metric calculations and replication summaries.

DES model files use envelope version 1 and model schema 3; schema 2 files migrate
on import. Import checks types, expressions, file size and run settings. Incomplete
graphs may be saved as drafts. Undo/redo covers graph, layout, settings, template
loads and imports (100 edits, retained while navigating the app). Autosave and
named copies are stored only in the current browser; JSON files are portable.

Source/Population defaults and Assign blocks provide numeric entity attributes.
Priority queues use larger values first, FIFO ties, and zero for missing priority
attributes. Probability routes choose one true/false output per entity. Batch waits
for a fixed group size, optionally matching an attribute; complete groups can pass
incomplete groups. Its carrier uses the first member's attributes and sums member
quantities. Unbatch restores the original members and shares batch waiting/service
time. Join pairs related Signal branches using their most recent common fork,
retains input a and completes input b. Nested forks must join from the inside out;
unbatch before joining member branches.

Resource calendars repeat a period with nonoverlapping capacity intervals and an
outside-shift capacity. Running work finishes on a capacity decrease; new work
waits. Scheduled cost uses capacity-time × cost/unit/period, with no added overtime
charge. Staffed utilization excludes overtime; overtime capacity-time is reported
separately. Unscheduled resources keep the existing started-period costing rule.

Parameter experiments sweep one or two numeric block properties over all value
combinations (100 scenarios, 1,000 total runs maximum). Replications use a common
seed sequence across scenarios. Results include 95% confidence intervals, a
sensitivity chart, optional mean-target checks and CSV export with seeds. Editing
the model cancels and clears results. Cancellation is checked between replications.
This provides scenario comparison; automatic optimization remains future work.

Future capabilities and priorities are recorded in [the DES roadmap](docs/des-roadmap.md).

## Verification

```bash
npm test
npx tsc --noEmit
npm run build
```

Tests cover conservation and accounting, seeded reproducibility, validation,
attributes and priority queues, batching and correlated joins, shift calendars,
model-file round trips, experiment cancellation and MathJax rendering. DOM tests
cover navigation, saving/loading, autosave, undo/redo and playback of both DES
templates, including Run, pause, stepping, end and replay under React StrictMode.
They verify interactions; they do not verify rendered browser layout.

Generated Python/R scripts are executed only when their interpreters are
configured. Provide a Python interpreter with SimPy and an Rscript with simmer
and jsonlite installed:

```bash
DES_PYTHON=/path/to/python DES_RSCRIPT=/path/to/Rscript npm test
```

Set `R_LIBS` as well if R packages are installed in a custom library. Python uses
the browser's seeded generator; deterministic fixtures are also compared against
R, while R stochastic runs use its native generator.

## License

For educational use.
