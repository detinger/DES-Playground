import React from "react";
export default function ModelingGuide() {
  return (
    <details className="formal-model modeling-guide">
      <summary>
        How to construct a DES model <span>Notation and modeling guide</span>
      </summary>
      <div className="formal-model-body">
        <p>
          <strong>Process view</strong> follows entities through activities.
          Solid arrows move entities. Labeled dashed associations connect
          activities to reusable resources and stock operations to stores. A
          server combines a FIFO or priority queue, acquisition, a timed
          activity and release.
        </p>
        <ol>
          <li>Identify the entities, resources and stored quantities.</li>
          <li>Set initial populations, available resources and stock.</li>
          <li>
            Connect activities and waiting points; choose timing distributions.
          </li>
          <li>
            Add decisions with explicit conditions. A decision chooses one
            route; a signal creates a separate entity.
          </li>
          <li>Specify stock consumption, replenishment, costs and revenue.</li>
          <li>
            Choose a time unit, stopping rule and observation window, then
            validate and run.
          </li>
        </ol>
        <p>
          <strong>Example:</strong> a broken machine waits for a repairer,
          undergoes repair, releases the repairer and returns to the spare
          store. An operating position waits for a spare before starting its
          next operating cycle. These are separate entity roles.
        </p>
        <p>
          <strong>Activity-cycle diagrams</strong> emphasize waiting places and
          activities shared by entity/resource cycles.{" "}
          <strong>Petri nets</strong> use places, tokens and transitions; timed
          and coloured variants add time and entity data. The Formal view below
          gives a Petri-inspired specification of this process model, including
          guards and stock effects. It is not a full CPN interchange format.
        </p>
        <p>
          Two outputs never imply an automatic fork. Decision outputs are{" "}
          <strong>true/false</strong>; Signal outputs are{" "}
          <strong>out/spawn</strong>. Resource and store associations do not
          move entities. Queues inside activities and blocking stock operations
          use FIFO by default. Activity priorities serve higher numeric values
          first, with FIFO ties, and do not interrupt work already in progress.
        </p>
        <p>
          <strong>Entity data and parallel work:</strong> Source and Population
          blocks set an entity type and numeric attributes. Assign blocks update
          attributes using numbers, quantities, stock, resource availability or
          arithmetic. A Probability route draws one true/false choice. Batch
          waits for complete groups and Unbatch releases their original members.
          Join matches the most recent shared Signal fork at inputs a and b,
          retains a and completes b. Join nested forks from the inside out; it
          does not merge unrelated arrivals.
        </p>
        <p>
          <strong>Experiments:</strong> Save a named copy before trying
          variants, or use Undo. Parameter experiments run every combination of
          one or two numeric settings without editing the canvas. Compare means
          and confidence intervals across multiple replications; a target check
          is a comparison against the mean, not an optimization algorithm.
        </p>
        <p>
          At equal times, shift capacity changes run first, then completions,
          then process steps, then external arrivals. Insertion order resolves
          remaining ties. A fixed horizon observes [warm-up, horizon); drain
          mode closes arrivals and finishes remaining work. Recurring cycles
          require a fixed horizon. Costs integrate over the observation window;
          fixed costs charge each period overlapping that window. With a shift
          calendar, resource costs are prorated over scheduled capacity time.
          Existing work may finish after its shift; that overtime is reported
          separately.
        </p>
      </div>
    </details>
  );
}
