import React from "react";
import type { Node, Edge } from "@xyflow/react";
import type { NodeData } from "../types";
import type {
  AdvancedConfig,
  Distribution,
  Value,
  Condition,
} from "../lib/model";
import { BLOCK_LABELS } from "../lib/processNotation";
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  step = "any",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: string;
}) {
  return (
    <label className="des-field">
      {label}
      <input
        type="number"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        step={step}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
    </label>
  );
}
export function DistributionField({
  value,
  onChange,
  quantity = false,
}: {
  value: Distribution;
  onChange: (d: Distribution) => void;
  quantity?: boolean;
}) {
  const defaults: Record<string, Distribution> = {
    constant: { kind: "constant", value: 1 },
    exponential: { kind: "exponential", mean: 1 },
    uniform: { kind: "uniform", min: 1, max: 2 },
    normal: {
      kind: "normal",
      mean: 1,
      stddev: 0.2,
      nonnegativePolicy: "reject",
    },
    triangular: { kind: "triangular", min: 0, mode: 1, max: 2 },
    discreteUniform: { kind: "discreteUniform", min: 1, max: 4 },
  };
  return (
    <fieldset className="des-fields">
      <legend>{quantity ? "Entity quantity" : "Duration distribution"}</legend>
      <label className="des-field">
        Distribution
        <select
          value={value.kind}
          onChange={(e) => onChange(defaults[e.target.value])}
        >
          {Object.keys(defaults)
            .filter((x) => quantity || x !== "discreteUniform")
            .map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
        </select>
      </label>
      {Object.entries(value)
        .filter(([k]) => !["kind", "nonnegativePolicy"].includes(k))
        .map(([k, v]) => (
          <NumberField
            key={k}
            label={
              k === "stddev"
                ? "Standard deviation"
                : k === "mean"
                  ? "Mean (not rate)"
                  : k
            }
            value={v as number}
            onChange={(x) => onChange({ ...value, [k]: x } as Distribution)}
          />
        ))}
    </fieldset>
  );
}
function ValueField({
  value,
  onChange,
  nodes,
  label = "Value",
  depth = 0,
}: {
  value: Value;
  onChange: (v: Value) => void;
  nodes: Node<NodeData>[];
  label?: string;
  depth?: number;
}) {
  const defaults: Record<string, Value> = {
    constant: { kind: "constant", value: 1 },
    quantity: { kind: "quantity" },
    attribute: { kind: "attribute", name: "priority" },
    add: {
      kind: "add",
      left: { kind: "constant", value: 1 },
      right: { kind: "constant", value: 1 },
    },
    multiply: {
      kind: "multiply",
      left: { kind: "constant", value: 1 },
      right: { kind: "constant", value: 1 },
    },
    stock: {
      kind: "stock",
      nodeId: nodes.find((n) => n.data.type === "store")?.id ?? "",
    },
    available: {
      kind: "available",
      nodeId: nodes.find((n) => n.data.type === "resource")?.id ?? "",
    },
    subtract: {
      kind: "subtract",
      left: { kind: "constant", value: 30 },
      right: {
        kind: "stock",
        nodeId: nodes.find((n) => n.data.type === "store")?.id ?? "",
      },
    },
  };
  return (
    <fieldset className="des-fields">
      <legend>{label}</legend>
      <label className="des-field">
        Read from
        <select
          value={value.kind}
          onChange={(e) => onChange(defaults[e.target.value])}
        >
          <option value="constant">Number</option>
          <option value="quantity">Entity quantity</option>
          <option value="attribute">Entity attribute</option>
          {depth < 3 && (
            <>
              <option value="add">Add two values</option>
              <option value="multiply">Multiply two values</option>
            </>
          )}
          <option value="stock">Store stock</option>
          <option value="available">Available resources</option>
          {depth < 3 && <option value="subtract">Subtract two values</option>}
        </select>
      </label>
      {value.kind === "attribute" && (
        <label className="des-field">
          Attribute name
          <input
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
        </label>
      )}
      {value.kind === "constant" && (
        <NumberField
          label="Number"
          min={-1e9}
          value={value.value}
          onChange={(v) => onChange({ ...value, value: v })}
        />
      )}
      {(value.kind === "stock" || value.kind === "available") && (
        <label className="des-field">
          Reference
          <select
            value={value.nodeId}
            onChange={(e) => onChange({ ...value, nodeId: e.target.value })}
          >
            <option value="">Select a block</option>
            {nodes
              .filter(
                (n) =>
                  n.data.type ===
                  (value.kind === "stock" ? "store" : "resource"),
              )
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.data.label}
                </option>
              ))}
          </select>
        </label>
      )}
      {(value.kind === "subtract" ||
        value.kind === "add" ||
        value.kind === "multiply") && (
        <>
          <ValueField
            label="Left"
            depth={depth + 1}
            nodes={nodes}
            value={value.left}
            onChange={(v) => onChange({ ...value, left: v })}
          />
          <ValueField
            label="Right"
            depth={depth + 1}
            nodes={nodes}
            value={value.right}
            onChange={(v) => onChange({ ...value, right: v })}
          />
        </>
      )}
    </fieldset>
  );
}
function EntityFields({
  entityType,
  attributes = {},
  change,
}: {
  entityType?: string;
  attributes?: Record<string, number>;
  change: (v: {
    entityType?: string;
    attributes?: Record<string, number>;
  }) => void;
}) {
  const entries = Object.entries(attributes);
  return (
    <fieldset className="des-fields">
      <legend>Entity defaults</legend>
      <label className="des-field">
        Entity type
        <input
          value={entityType ?? "Entity"}
          onChange={(e) => change({ entityType: e.target.value })}
        />
      </label>
      {entries.map(([name, value], i) => (
        <div key={i} className="des-fields">
          <label className="des-field">
            Attribute {i + 1} name
            <input
              value={name}
              onChange={(e) =>
                change({
                  attributes: Object.fromEntries(
                    entries.map((x, j) =>
                      j === i ? [e.target.value, x[1]] : x,
                    ),
                  ),
                })
              }
            />
          </label>
          <NumberField
            label={`Attribute ${i + 1} value`}
            value={value}
            min={-1e12}
            onChange={(v) =>
              change({ attributes: { ...attributes, [name]: v } })
            }
          />
          <button
            className="ui-btn"
            onClick={() =>
              change({
                attributes: Object.fromEntries(
                  entries.filter((_, j) => j !== i),
                ),
              })
            }
          >
            Remove attribute
          </button>
        </div>
      ))}
      <button
        className="ui-btn"
        onClick={() => {
          let name = "priority";
          let i = 1;
          while (name in attributes) name = `attribute${i++}`;
          change({ attributes: { ...attributes, [name]: 0 } });
        }}
      >
        Add attribute
      </button>
      <p>
        Numeric attributes travel with the entity. Assign blocks can change
        them; decisions, quantities and priorities can read them.
      </p>
    </fieldset>
  );
}
export default function ProcessProperties({
  node,
  nodes,
  edges,
  update,
  associate,
  remove,
}: {
  node: Node<NodeData>;
  nodes: Node<NodeData>[];
  edges: Edge[];
  update: (data: Partial<NodeData>) => void;
  associate: (kind: "store" | "resource", id: string) => void;
  remove: () => void;
}) {
  const c = node.data.process;
  const patch = (p: Partial<AdvancedConfig>) =>
    update({ process: { ...c, ...p } as AdvancedConfig });
  const reference = (kind: "store" | "resource") => (
    <label className="des-field">
      {kind === "store" ? "Store association" : "Shared resource pool"}
      <select
        value={
          edges.find((e) => e.source === node.id && e.sourceHandle === kind)
            ?.target ?? ""
        }
        onChange={(e) => associate(kind, e.target.value)}
      >
        <option value="">
          {kind === "resource" ? "Use internal capacity" : "Select a store"}
        </option>
        {nodes
          .filter((n) => n.data.type === kind)
          .map((n) => (
            <option value={n.id} key={n.id}>
              {n.data.label}
            </option>
          ))}
      </select>
    </label>
  );
  const d = node.data.distribution;
  const canonical: Distribution = d
    ? d.type === "normal"
      ? {
          kind: "normal",
          mean: d.mean ?? 1,
          stddev: d.stdDev ?? 0.2,
          nonnegativePolicy: d.nonnegativePolicy ?? "reject",
        }
      : d.type === "constant"
        ? { kind: "constant", value: d.value ?? 1 }
        : d.type === "uniform"
          ? { kind: "uniform", min: d.min ?? 0, max: d.max ?? 1 }
          : d.type === "triangular"
            ? {
                kind: "triangular",
                min: d.min ?? 0,
                mode: d.mode ?? 1,
                max: d.max ?? 2,
              }
            : { kind: "exponential", mean: d.mean ?? 1 }
    : { kind: "constant", value: 1 };
  const setDistribution = (v: Distribution) => {
    if (v.kind === "discreteUniform") return;
    const { kind, ...rest } = v;
    update({
      distribution: {
        type: kind,
        ...rest,
        ...(v.kind === "normal" ? { stdDev: v.stddev } : {}),
      },
    });
  };
  return (
    <aside className="des-properties">
      <h3>{BLOCK_LABELS[node.data.type]}</h3>
      <label className="des-field">
        Name
        <input
          value={node.data.label}
          onChange={(e) => update({ label: e.target.value })}
        />
      </label>
      {(node.data.type === "source" || node.data.type === "server") && (
        <DistributionField value={canonical} onChange={setDistribution} />
      )}
      {node.data.type === "source" && (
        <DistributionField
          quantity
          value={
            node.data.quantityDistribution ?? { kind: "constant", value: 1 }
          }
          onChange={(v) => update({ quantityDistribution: v })}
        />
      )}
      {node.data.type === "source" && (
        <>
          <EntityFields
            entityType={node.data.entityType}
            attributes={node.data.attributes}
            change={update}
          />
          <NumberField
            label="Arrival start time"
            value={node.data.startTime ?? 0}
            onChange={(v) => update({ startTime: v })}
          />
          <label className="des-field">
            Arrival limit (blank for unlimited)
            <input
              type="number"
              min={0}
              step={1}
              value={node.data.arrivalLimit ?? ""}
              onChange={(e) =>
                update({
                  arrivalLimit:
                    e.target.value === "" ? undefined : e.target.valueAsNumber,
                })
              }
            />
          </label>
          <label className="des-field">
            Arrival end time (blank for horizon)
            <input
              type="number"
              min={0}
              value={node.data.endTime ?? ""}
              onChange={(e) =>
                update({
                  endTime:
                    e.target.value === "" ? undefined : e.target.valueAsNumber,
                })
              }
            />
          </label>
        </>
      )}
      {node.data.type === "server" && (
        <>
          {reference("resource")}
          <NumberField
            label="Internal capacity (when no pool is linked)"
            value={node.data.capacity ?? 1}
            min={1}
            step="1"
            onChange={(v) => update({ capacity: v })}
          />
          <label className="des-field">
            Queue discipline
            <select
              value={node.data.queueDiscipline ?? "fifo"}
              onChange={(e) =>
                update({
                  queueDiscipline: e.target.value as "fifo" | "priority",
                })
              }
            >
              <option value="fifo">FIFO</option>
              <option value="priority">Priority (higher value first)</option>
            </select>
          </label>
          {node.data.queueDiscipline === "priority" && (
            <label className="des-field">
              Priority attribute
              <input
                value={node.data.priorityAttribute ?? "priority"}
                onChange={(e) => update({ priorityAttribute: e.target.value })}
              />
            </label>
          )}
          <p>
            Acquire one unit → delay → release. Priority is nonpreemptive; ties
            are FIFO. Missing priorities count as zero.
          </p>
        </>
      )}
      {c?.kind === "population" && (
        <>
          <EntityFields
            entityType={c.entityType}
            attributes={c.attributes}
            change={patch}
          />
          <NumberField
            label="Initial entity count"
            value={c.count}
            min={1}
            step="1"
            onChange={(v) => patch({ count: v })}
          />
          <NumberField
            label="Quantity per entity"
            value={c.quantity}
            onChange={(v) => patch({ quantity: v })}
          />
        </>
      )}
      {c?.kind === "delay" && (
        <>
          <DistributionField
            value={c.distribution}
            onChange={(v) => patch({ distribution: v })}
          />
          <label className="des-field">
            Availability relative to population
            <select
              value={c.populationId ?? ""}
              onChange={(e) =>
                patch({ populationId: e.target.value || undefined })
              }
            >
              <option value="">Do not calculate availability</option>
              {nodes
                .filter((n) => n.data.type === "population")
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.data.label}
                  </option>
                ))}
            </select>
          </label>
        </>
      )}
      {c?.kind === "resource" && (
        <>
          <NumberField
            label="Capacity"
            value={c.capacity}
            min={1}
            step="1"
            onChange={(v) => patch({ capacity: v })}
          />
          <NumberField
            label="Cost per unit per period ($)"
            value={c.costPerUnit}
            onChange={(v) => patch({ costPerUnit: v })}
          />
          <NumberField
            label="Cost period (model time units)"
            value={c.costPeriod}
            min={0.001}
            onChange={(v) => patch({ costPeriod: v })}
          />
        </>
      )}
      {c?.kind === "resource" && (
        <fieldset className="des-fields">
          <legend>Shift calendar</legend>
          <label>
            <input
              type="checkbox"
              checked={!!c.schedule}
              onChange={(e) =>
                patch({
                  schedule: e.target.checked
                    ? {
                        period: 24,
                        outsideCapacity: 0,
                        intervals: [
                          { start: 8, end: 16, capacity: c.capacity },
                        ],
                      }
                    : undefined,
                })
              }
            />{" "}
            Use repeating shifts
          </label>
          {c.schedule && (
            <>
              <NumberField
                label="Repeat every (model time units)"
                min={0.001}
                value={c.schedule.period}
                onChange={(v) =>
                  patch({ schedule: { ...c.schedule!, period: v } })
                }
              />
              <NumberField
                label="Capacity outside shifts"
                step="1"
                value={c.schedule.outsideCapacity}
                onChange={(v) =>
                  patch({ schedule: { ...c.schedule!, outsideCapacity: v } })
                }
              />
              {c.schedule.intervals.map((x, i) => (
                <fieldset className="des-fields" key={i}>
                  <legend>Shift {i + 1}</legend>
                  {(["start", "end", "capacity"] as const).map((k) => (
                    <NumberField
                      key={k}
                      label={`Shift ${i + 1} ${k}`}
                      value={x[k]}
                      step={k === "capacity" ? "1" : "any"}
                      onChange={(v) =>
                        patch({
                          schedule: {
                            ...c.schedule!,
                            intervals: c.schedule!.intervals.map((a, j) =>
                              i === j ? { ...a, [k]: v } : a,
                            ),
                          },
                        })
                      }
                    />
                  ))}
                  <button
                    className="ui-btn"
                    onClick={() =>
                      patch({
                        schedule: {
                          ...c.schedule!,
                          intervals: c.schedule!.intervals.filter(
                            (_, j) => j !== i,
                          ),
                        },
                      })
                    }
                  >
                    Remove shift
                  </button>
                </fieldset>
              ))}
              <button
                className="ui-btn"
                onClick={() =>
                  patch({
                    schedule: {
                      ...c.schedule!,
                      intervals: [
                        ...c.schedule!.intervals,
                        {
                          start: 0,
                          end: c.schedule!.period,
                          capacity: c.capacity,
                        },
                      ],
                    },
                  })
                }
              >
                Add shift
              </button>
              <p>
                Intervals must not overlap. A drop in capacity lets existing
                work finish and blocks new starts until a unit is free. Cost is
                prorated over scheduled capacity time; overtime is reported
                separately.
              </p>
            </>
          )}
        </fieldset>
      )}
      {c?.kind === "assign" && (
        <>
          <p>
            Assignments run in order. Later values can read earlier assignments.
          </p>
          {c.assignments.map((a, i) => (
            <fieldset className="des-fields" key={i}>
              <legend>Assignment {i + 1}</legend>
              <label className="des-field">
                Attribute name
                <input
                  value={a.name}
                  onChange={(e) =>
                    patch({
                      assignments: c.assignments.map((x, j) =>
                        i === j ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <ValueField
                value={a.value}
                nodes={nodes}
                onChange={(v) =>
                  patch({
                    assignments: c.assignments.map((x, j) =>
                      i === j ? { ...x, value: v } : x,
                    ),
                  })
                }
              />
              <button
                className="ui-btn"
                onClick={() =>
                  patch({
                    assignments: c.assignments.filter((_, j) => i !== j),
                  })
                }
              >
                Remove assignment
              </button>
            </fieldset>
          ))}
          <button
            className="ui-btn"
            onClick={() =>
              patch({
                assignments: [
                  ...c.assignments,
                  { name: "priority", value: { kind: "constant", value: 1 } },
                ],
              })
            }
          >
            Add assignment
          </button>
        </>
      )}
      {c?.kind === "router" && (
        <>
          <NumberField
            label="Probability of true route (0–1)"
            value={c.probability}
            onChange={(v) => patch({ probability: v })}
          />
          <p>
            Each entity takes true with this probability, otherwise false. Both
            outputs must be connected.
          </p>
        </>
      )}
      {c?.kind === "batch" && (
        <>
          <NumberField
            label="Batch size"
            value={c.size}
            min={1}
            step="1"
            onChange={(v) => patch({ size: v })}
          />
          <label className="des-field">
            Match attribute (optional)
            <input
              value={c.matchAttribute ?? ""}
              onChange={(e) =>
                patch({ matchAttribute: e.target.value || undefined })
              }
            />
          </label>
          <p>
            Groups require equal match values. Complete groups proceed FIFO;
            incomplete groups wait. The batch carries the first member’s
            attributes and the sum of member quantities.
          </p>
        </>
      )}
      {c?.kind === "unbatch" && (
        <p>
          Release the original members from a Batch. Each retains its identity
          and attributes and shares the batch’s elapsed waiting and service
          time.
        </p>
      )}
      {c?.kind === "join" && (
        <p>
          Connect related Signal branches to a and b. Join waits for both
          branches from the same fork, keeps a and completes b. Nested forks
          must rejoin from the inside out.
        </p>
      )}
      {c?.kind === "store" && (
        <>
          <NumberField
            label="Initial stock"
            value={c.initial}
            onChange={(v) => patch({ initial: v })}
          />
          <NumberField
            label="Holding cost / unit / time ($)"
            value={c.holdingCost}
            onChange={(v) => patch({ holdingCost: v })}
          />
          <NumberField
            label="Capacity cost / initial unit / period ($)"
            value={c.fixedCost}
            onChange={(v) => patch({ fixedCost: v })}
          />
          <NumberField
            label="Cost period (model time units)"
            min={0.001}
            value={c.costPeriod}
            onChange={(v) => patch({ costPeriod: v })}
          />
        </>
      )}
      {c?.kind === "stock" && (
        <>
          {reference("store")}
          <label className="des-field">
            Operation
            <select
              value={c.operation}
              onChange={(e) =>
                patch({
                  operation: e.target.value as "take" | "put" | "fulfill",
                })
              }
            >
              <option value="take">
                Take all requested units · wait if needed
              </option>
              <option value="fulfill">
                Fulfill available units · lose unmet demand
              </option>
              <option value="put">Put units into store</option>
            </select>
          </label>
          <ValueField
            label="Requested quantity"
            value={c.amount}
            onChange={(v) => patch({ amount: v })}
            nodes={nodes}
          />
          <NumberField
            label="Cost / transferred unit ($)"
            value={c.unitCost}
            onChange={(v) => patch({ unitCost: v })}
          />
          <NumberField
            label="Revenue / transferred unit ($)"
            value={c.unitRevenue}
            onChange={(v) => patch({ unitRevenue: v })}
          />
          <NumberField
            label="Waiting cost / entity / time ($)"
            value={c.waitingCost}
            onChange={(v) => patch({ waitingCost: v })}
          />
        </>
      )}
      {c?.kind === "signal" && (
        <>
          <ValueField
            label="Quantity of new entity"
            value={c.quantity}
            onChange={(v) => patch({ quantity: v })}
            nodes={nodes}
          />
          <p>The original follows out. A new entity follows spawn.</p>
        </>
      )}
      {c?.kind === "decision" && (
        <>
          <p>All conditions must be true to take the true route.</p>
          {c.conditions.map((x, i) => {
            const set = (v: Partial<Condition>) =>
              patch({
                conditions: c.conditions.map((a, j) =>
                  j === i ? { ...a, ...v } : a,
                ),
              });
            return (
              <fieldset className="des-fields" key={i}>
                <legend>Condition {i + 1}</legend>
                <ValueField
                  label="Left operand"
                  value={x.left}
                  nodes={nodes}
                  onChange={(v) => set({ left: v })}
                />
                <label className="des-field">
                  Compare
                  <select
                    value={x.operator}
                    onChange={(e) =>
                      set({ operator: e.target.value as Condition["operator"] })
                    }
                  >
                    {["<", "<=", "==", ">", ">="].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <ValueField
                  label="Right operand"
                  value={x.right}
                  nodes={nodes}
                  onChange={(v) => set({ right: v })}
                />
                <button
                  className="ui-btn"
                  onClick={() =>
                    patch({
                      conditions: c.conditions.filter((_, j) => i !== j),
                    })
                  }
                >
                  Remove condition
                </button>
              </fieldset>
            );
          })}
          <button
            className="ui-btn"
            onClick={() =>
              patch({
                conditions: [
                  ...c.conditions,
                  {
                    left: { kind: "quantity" },
                    operator: ">",
                    right: { kind: "constant", value: 0 },
                  },
                ],
              })
            }
          >
            Add condition
          </button>
        </>
      )}
      <button className="ui-btn" onClick={remove}>
        Delete block
      </button>
    </aside>
  );
}
