# DES Playground

An interactive learning environment for **Discrete Event Simulation (DES)** and **Queueing Theory** — built with React 19 + TypeScript + Vite.

> Build visual models, run multi-replication simulations, compare scenarios, explore theory, tackle challenges, and export production-ready SimPy / R simmer code.

---

## Features

| Area | What you get |
|---|---|
| **Home** | Learning overview, challenge progress, current model summary, appearance options and confirmed data reset |
| **Lessons** | 7 accordion lessons (DES fundamentals → code export) with inline visualizations |
| **Examples** | 5 pre-built models (M/M/1, M/M/2, M/D/1, production line, two-stage) — load any into the editor |
| **Challenges** | 5 assessed problems with progressive hints, answer validation, and linked examples |
| **M/M/c Visualizer** | Interactive Erlang-C playground with live Lq / Wq / ρ charts |
| **Model Explorer** | Drag-and-drop DES canvas; run replications with CI; event-step playback; scenario comparison |
| **Code Export** | Auto-generate SimPy (Python) and R simmer scripts from any model; copy or download |
| **Colab notebooks** | 5 fully worked Jupyter notebooks in `colab/` matching the browser simulation engine |

---

The sidebar groups Lessons, Examples and Challenges under **Learn**, with the visualizer and model editor under **Workspace**. **Home** is the default landing page. Challenge progress and appearance preferences are stored in this browser; models and simulation results are held in memory. Clearing app data resets progress and preferences and restores the starter model, without affecting downloaded files or unrelated browser storage.

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
