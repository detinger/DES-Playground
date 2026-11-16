# DES modeler extension

The process canvas is the editable model. Solid arrows move entities; labeled dashed connections reference stores and shared resources. Server blocks include a FIFO queue and acquire–delay–release behavior. Population blocks initialize a finite set of entities. Signal blocks create a separate entity on their spawn output while retaining the original on their main output.

Implementation sequence:
1. Extend the versioned canonical model, compiler, validation, units and stopping rules.
2. Execute all process blocks through one event calendar with reproducible sampling, FIFO resource/store waits, explicit event ordering and accounting.
3. Add palette, properties, notation guidance, process/formal views and playback.
4. Replace Factory and Inventory labs with editable graphs.
5. Integrate measurements, replications, scenario comparisons and Python/R exports.
6. Verify conservation, deterministic fixtures, regression examples, generated programs and browser interaction.

Notation: the default is process interaction. The formal view exposes places, activity requirements and state changes; it is a documented Petri-inspired interpretation, not a claim of full Coloured Petri Net interchange compatibility. Time advances only on scheduled events. Conditions and quantities use structured expressions, never user-supplied executable code.

Delivered: separate Queue Modeler and DES Modeler workspaces, shared graph engine,
editable example graphs, structured properties, notation guide, formal specification,
playback, observation-window accounting, replications, baseline comparison and both
language exports. Current type checking, production build, engine/accounting tests,
DOM interaction tests, and generated Python/R execution checks pass.

Visual browser QA remains unavailable in this session: the browser host could not
connect and native Safari access was not approved. DOM tests cover navigation and
editing behavior, not rendered layout. No production deployment was performed.

The approved follow-up is also implemented: browser library and autosave, JSON
round trips with schema migration, undo/redo, numeric attributes and assignment
expressions, priority queues, probability routing, grouped batches/unbatching,
correlated joins, parameter experiments and resource shift calendars. Browser,
SimPy and simmer runtimes share the same state rules. Tests now cover grouped
waiting, nested and out-of-order joins, nonpreemptive shifts, costs, persistence,
experiment cancellation and UI control interactions.

Run/playback regression corrected: Run now starts playback automatically, with
controls, event position and live entity counts above the canvas. Active blocks
are highlighted and source/sink counters update during playback. A StrictMode
interaction test runs both default templates and checks pause, step, end, replay
and invalidation after model edits. It previously failed because Run left the
trace paused at event zero.
