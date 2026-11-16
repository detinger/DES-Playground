# DES Playground

An interactive learning environment for **Discrete Event Simulation (DES)** and **Queueing Theory** — built with React 19 + TypeScript + Vite.

> Build visual models, run multi-replication simulations, compare scenarios, explore theory, tackle challenges, and export production-ready SimPy / R simmer code.

---

## Features

| Area | What you get |
|---|---|
| **Home** | Learning overview, challenge progress, current model summary, appearance options and confirmed data reset |
| **Lessons** | 7 accordion lessons (DES fundamentals → code export) with inline visualizations |
| **Examples** | 13 pre-built models, including 8 IT case studies across three difficulty levels — load any into the editor |
| **Challenges** | 13 assessed problems with progressive hints, answer validation, linked models, and IT experiments |
| **M/M/c Visualizer** | Interactive Erlang-C playground with live Lq / Wq / ρ charts |
| **Model Explorer** | Drag-and-drop DES canvas; run replications with CI; event-step playback; scenario comparison |
| **Code Export** | Auto-generate SimPy (Python) and R simmer scripts from any model; copy or download |
| **Colab notebooks** | 5 fully worked Jupyter notebooks in `colab/` matching the browser simulation engine |

---

The sidebar groups Lessons, Examples and Challenges under **Learn**, with the visualizer and model editor under **Workspace**. **Home** is the default landing page. Challenge progress and appearance preferences are stored in this browser; models and simulation results are held in memory. Clearing app data resets progress and preferences and restores the starter model, without affecting downloaded files or unrelated browser storage.

## IT examples and challenges

Each fictional workload includes a runnable model, explicit assumptions, expected capacity calculations, a three-step experiment, and a linked assessed challenge. Use the difficulty filters in **Examples** and **Challenges**, then **Load in Editor** to run a model.

| Level | Scenario | Main decision |
|---|---|---|
| Beginner | Monday morning help desk | Where to add an agent in a two-stage service |
| Beginner | Build farm traffic jam | How the bottleneck moves after adding test runners |
| Intermediate | Creator uploads and noisy transcoders | Reduce runtime variability or buy capacity |
| Intermediate | Security operations alert surge | Staff multiple overloaded stages |
| Intermediate | Dashboard freshness deadline | Improve a four-stage analytics pipeline |
| Hard | GPU capacity under a launch budget | Meet per-stage headroom limits at minimum cost |
| Hard | Disaster recovery retry backlog | Repair an intentionally unstable pipeline |
| Hard | Noisy neighbours in shared ingestion | Admit new tenant traffic within a capacity ceiling |

All durations are in minutes. Models use FIFO queues, fixed parallel worker pools, and sequential stages supported by the browser and both exporters. Independent Poisson streams with identical job requirements are aggregated into one source. They do not simulate priorities, feedback retries, dynamic autoscaling, or fork/join execution. Challenge completion records the correct answer; simulation experiments are self-guided.

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
npm run dev        # → http://localhost:5173
```

```bash
npm run build      # production bundle
npm run preview    # preview the build
```

---

## Project structure

```
App.tsx                    # shell: sidebar nav, theme toggle, tab routing
components/
  Home.tsx                 # overview, quick starts, preferences and data reset
  Theory.tsx               # separate Lessons / Examples / Challenges pages
  Editor.tsx               # Model Explorer (canvas + run + export)
  Simulator.tsx            # M/M/c Visualizer playground
  CodeExport.tsx           # SimPy code panel
  SimmerCodeExport.tsx     # R simmer code panel
  ComparisonPanel.tsx      # Side-by-side scenario diff
  ReplicationsPanel.tsx    # CI table
  ValidationPanel.tsx      # Model validation errors
  TheoryPanel.tsx          # M/M/c analytic reference (inside Editor)
  EventLog.tsx             # Event trace table
  nodes/CustomNodes.tsx    # React Flow node types
lib/
  model.ts                 # DesModel schema (discriminated union)
  engine.ts                # DES event-calendar, runReplications()
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
  appStorage.ts            # app-scoped preferences and challenge progress
colab/                     # Jupyter notebooks (SimPy, same metrics as browser)
```

---

## Colab notebooks

Five fully worked examples in `colab/` — open in Google Colab or run locally with Jupyter. See the [Colab guide](colab/README.md) for launch links and step-by-step instructions:

| Notebook | Topic |
|---|---|
| `01_mm1_single_server.ipynb` | M/M/1 baseline, Erlang-C check, CI |
| `02_mmc_multi_server.ipynb` | M/M/c staffing analysis |
| `03_md1_vs_mm1_variability.ipynb` | Deterministic vs exponential service |
| `04_production_line.ipynb` | Two-stage tandem queue |
| `05_what_if_analysis.ipynb` | Scenario sweep, utilisation sensitivity |

All notebooks use the same seed convention (`base + i×1000`) and t-distribution CI table as the browser engine.

---

## License

For educational use.

### Supplied teaching cases and mathematical models

Examples now includes **Clinic**, **Factory**, and **Inventory**, adapted from the
notebooks supplied in `TEMP`. Original notebooks and the two lecture PDFs are
available through source links in Examples and Lessons (`public/references`).

- **Clinic** loads into Model Explorer: normal interarrivals (mean 5, SD 0.5
  minutes), nurse/doctor/administration service means 15/20/5 minutes (SD 1), and
  baseline capacities 2/3/2. Experiments describe 3/3/2, 3/4/2 and 4/5/2 staffing.
  Browser normal samples are conditioned to be nonnegative. The existing engine
  closes arrivals at the horizon and drains patients, unlike the source notebook's
  hard stop; the example explains this difference.
- **Factory** opens a dedicated seeded lab for 50 machine positions, uniform
  failures and repairs, FIFO repair/replacement queues, spare stock and operating
  costs. Its clock counts working hours. Costs include downtime still outstanding
  at the horizon; staff and spare costs use started eight-hour days.
- **Inventory** opens a dedicated seeded lab with discrete demand, lost sales,
  a guarded `(s,S)` policy, one outstanding order and a two-day lead time. Holding
  cost integrates actual stock over every event interval and through the horizon,
  correcting the notebook's accounting across deliveries. Initial stock is free,
  matching the notebook; the displayed balance is not full lifecycle profit.

Factory and Inventory are stateful labs, not approximations loaded into the
open queue-network editor. Each supports editable parameters, same-seed reruns,
charts, event logs and a saved baseline. Their source notebooks remain available.

**Formal model** expands an activity-cycle specification for every editor example,
the current editable graph, the M/M/c Visualizer and both stateful labs. It includes
activities, input/output places, durations, initial tokens, state rules and outputs.
Lesson 8 explains the supplied lecture's `M = <A,Q,I,O,τ,μ₀>` notation. For inventory,
counted/guarded transitions extend the basic token model. These specifications are
generated from current parameters, so changing the model updates its notation.

Mathematics uses locally bundled MathJax SVG output, loaded on demand, with cached
rendering and accessible formula labels. New authored prose can use `\(...\)` and
`\[...\]` delimiters with `MathText`, or use `MathFormula` for explicit TeX. Existing
queueing prose is handled by `mathProse`; diagram axes and numeric chart ticks stay
compact. Code exports retain executable language syntax.

Run `npm test` for case-study conservation, exact cost integrals, seeded
reproducibility, invalid-parameter checks, clinic validation, MathJax formula
rendering, and React learning-view smoke tests.
