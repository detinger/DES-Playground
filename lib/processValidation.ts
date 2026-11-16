import { validAttributeName } from "./modelShape";
import type {
  DesModel,
  Distribution,
  Value,
  ValidationIssue,
  ValidationResult,
} from "./model";
export function validateProcessModel(model: DesModel): ValidationResult {
  const issues: ValidationIssue[] = [];
  const nodes = new Map(model.nodes.map((n) => [n.id, n]));
  const issue = (
    nodeId: string | undefined,
    title: string,
    explanation: string,
    severity: ValidationIssue["severity"] = "error",
  ) =>
    issues.push({
      id: `process-${issues.length}`,
      nodeId,
      title,
      explanation,
      severity,
      category: "semantic",
      consequence:
        severity === "error"
          ? "Correct this before running or exporting."
          : "Check that this matches your intended model.",
    });
  const nonnegative = (x: number) => Number.isFinite(x) && x >= 0;
  const dist = (d: Distribution, id: string, quantity = false) => {
    let valid = !!d;
    if (!d) {
      issue(
        id,
        "Missing distribution",
        "Choose a timing or quantity distribution.",
      );
      return;
    }
    switch (d.kind) {
      case "constant":
        valid = nonnegative(d.value);
        break;
      case "exponential":
        valid = Number.isFinite(d.mean) && d.mean > 0;
        break;
      case "normal":
        valid = nonnegative(d.mean) && nonnegative(d.stddev);
        break;
      case "uniform":
      case "discreteUniform":
        valid =
          nonnegative(d.min) &&
          Number.isFinite(d.max) &&
          d.max >= d.min &&
          (d.kind !== "discreteUniform" ||
            (Number.isInteger(d.min) && Number.isInteger(d.max)));
        break;
      case "triangular":
        valid =
          nonnegative(d.min) &&
          Number.isFinite(d.max) &&
          d.max > d.min &&
          Number.isFinite(d.mode) &&
          d.min <= d.mode &&
          d.mode <= d.max;
        break;
      default:
        valid = false;
    }
    if (!valid)
      issue(
        id,
        "Invalid distribution",
        "Use finite parameters, nonnegative bounds, and a valid mean or range.",
      );
    if (!quantity && d.kind === "discreteUniform")
      issue(
        id,
        "Quantity distribution used for time",
        "Use a duration distribution for this block.",
      );
  };
  const expression = (v: Value, id: string, depth = 0): void => {
    if (!v || depth > 12) {
      issue(
        id,
        "Invalid expression",
        "Use a finite structured value expression.",
      );
      return;
    }
    if (v.kind === "constant" && !Number.isFinite(v.value))
      issue(id, "Invalid value", "Enter a finite number.");
    else if (v.kind === "stock" || v.kind === "available") {
      if (
        nodes.get(v.nodeId)?.config.kind !==
        (v.kind === "stock" ? "store" : "resource")
      )
        issue(
          id,
          "Missing condition reference",
          "Select an existing store or resource pool.",
        );
    } else if (v.kind === "attribute") {
      if (!validAttributeName(v.name))
        issue(
          id,
          "Invalid attribute name",
          "Use a letter or underscore followed by letters, digits or underscores.",
        );
    } else if (
      v.kind === "subtract" ||
      v.kind === "add" ||
      v.kind === "multiply"
    ) {
      expression(v.left, id, depth + 1);
      expression(v.right, id, depth + 1);
    } else if (!["constant", "quantity"].includes(v.kind))
      issue(id, "Unknown expression", "Choose a supported value.");
  };
  if (nodes.size !== model.nodes.length)
    issue(
      undefined,
      "Duplicate block identifiers",
      "Every block must have a unique identifier.",
    );
  if (
    !model.nodes.some((n) => ["source", "population"].includes(n.config.kind))
  )
    issue(
      undefined,
      "No entities can enter",
      "Add a Source or Initial Population block.",
    );
  for (const e of model.edges) {
    const a = nodes.get(e.sourceId),
      b = nodes.get(e.targetId);
    if (!a || !b) {
      issue(
        a?.id,
        "Dangling connection",
        "Reconnect or remove an edge referencing a deleted block.",
      );
      continue;
    }
    if (
      e.kind === "entityFlow" &&
      (["store", "resource", "sink"].includes(a.config.kind) ||
        ["store", "resource", "source", "population"].includes(b.config.kind))
    )
      issue(
        a.id,
        "Invalid flow connection",
        "Entity arrows connect process blocks; use dashed associations for stores and resources.",
      );
    if (
      e.kind === "entityFlow" &&
      (b.config.kind === "join"
        ? !["a", "b"].includes(e.targetPort ?? "")
        : ![undefined, "in"].includes(e.targetPort))
    )
      issue(
        b.id,
        "Invalid input port",
        "Join uses a and b; other process blocks use in.",
      );
    if (
      e.kind === "resource" &&
      (a.config.kind !== "server" || b.config.kind !== "resource")
    )
      issue(
        a.id,
        "Invalid resource association",
        "Connect an Activity resource port to a Resource pool.",
      );
    if (
      e.kind === "store" &&
      (a.config.kind !== "stock" || b.config.kind !== "store")
    )
      issue(
        a.id,
        "Invalid store association",
        "Connect a Stock operation store port to a Store.",
      );
  }
  for (const n of model.nodes) {
    if (["__proto__", "constructor", "prototype"].includes(n.id))
      issue(
        n.id,
        "Invalid block identifier",
        "Use a unique nonreserved identifier.",
      );
    const c = n.config,
      edges = model.edges.filter(
        (e) => e.sourceId === n.id && e.kind === "entityFlow",
      );
    const ports =
      c.kind === "decision" || c.kind === "router"
        ? ["true", "false"]
        : c.kind === "signal"
          ? ["out", "spawn"]
          : ["sink", "resource", "store"].includes(c.kind)
            ? []
            : ["out"];
    for (const port of ports)
      if (edges.filter((e) => (e.port ?? "out") === port).length !== 1)
        issue(
          n.id,
          `Connect exactly one ${port} output`,
          "Use a Decision to choose a path or a Signal to create an additional entity.",
        );
    for (const e of edges)
      if (!ports.includes(e.port ?? "out"))
        issue(
          n.id,
          "Unexpected output port",
          "Reconnect this edge using a supported output.",
        );
    for (const kind of ["resource", "store"])
      if (
        model.edges.filter((e) => e.sourceId === n.id && e.kind === kind)
          .length > 1
      )
        issue(
          n.id,
          "Ambiguous association",
          "Each activity uses one resource pool and each stock operation uses one store.",
        );
    if (
      ![
        "source",
        "population",
        "server",
        "delay",
        "resource",
        "store",
        "stock",
        "decision",
        "signal",
        "sink",
        "assign",
        "router",
        "batch",
        "unbatch",
        "join",
      ].includes(c.kind)
    )
      issue(n.id, "Unknown block", "Choose a supported block type.");
    if (c.kind === "source" || c.kind === "population") {
      if (
        c.attributes &&
        Object.entries(c.attributes).some(
          ([k, v]) => !validAttributeName(k) || !Number.isFinite(v),
        )
      )
        issue(
          n.id,
          "Invalid attributes",
          "Use unique names and finite numeric values.",
        );
    }
    if (c.kind === "assign") {
      if (!c.assignments.length)
        issue(n.id, "Missing assignments", "Add an attribute assignment.");
      for (const a of c.assignments) {
        if (!validAttributeName(a.name))
          issue(
            n.id,
            "Invalid attribute name",
            "Use letters, digits and underscores, starting with a letter or underscore.",
          );
        expression(a.value, n.id);
      }
    }
    if (
      c.kind === "router" &&
      (!Number.isFinite(c.probability) ||
        c.probability < 0 ||
        c.probability > 1)
    )
      issue(
        n.id,
        "Invalid routing probability",
        "Use a probability between 0 and 1.",
      );
    if (
      c.kind === "batch" &&
      (!Number.isInteger(c.size) ||
        c.size < 1 ||
        c.size > 10000 ||
        (c.matchAttribute !== undefined &&
          !validAttributeName(c.matchAttribute)))
    )
      issue(
        n.id,
        "Invalid batch settings",
        "Use 1–10,000 members and an optional valid match attribute.",
      );
    if (c.kind === "join")
      for (const port of ["a", "b"])
        if (
          !model.edges.some(
            (e) =>
              e.kind === "entityFlow" &&
              e.targetId === n.id &&
              e.targetPort === port,
          )
        )
          issue(
            n.id,
            `Connect Join input ${port}`,
            "Connect related Signal branches to a and b. The entity on a continues.",
          );
    if (c.kind === "resource" && c.schedule) {
      const s = c.schedule;
      const intervals = [...s.intervals].sort((a, b) => a.start - b.start);
      if (
        !Number.isFinite(s.period) ||
        s.period <= 0 ||
        !Number.isInteger(s.outsideCapacity) ||
        s.outsideCapacity < 0 ||
        intervals.some(
          (x, i) =>
            !Number.isFinite(x.start) ||
            !Number.isFinite(x.end) ||
            x.start < 0 ||
            x.end > x.start + s.period ||
            x.end > s.period ||
            x.end <= x.start ||
            !Number.isInteger(x.capacity) ||
            x.capacity < 0 ||
            (i > 0 && x.start < intervals[i - 1].end),
        )
      )
        issue(
          n.id,
          "Invalid shift calendar",
          "Use a positive repeating period, nonoverlapping intervals within it, and nonnegative integer capacities.",
        );
      if (s.outsideCapacity === 0 && intervals.every((x) => x.capacity === 0))
        issue(
          n.id,
          "Resource never available",
          "Provide positive capacity during at least one shift.",
        );
    }
    if (c.kind === "source") {
      if (
        (c.startTime !== undefined && !nonnegative(c.startTime)) ||
        (c.endTime !== undefined &&
          (!nonnegative(c.endTime) || c.endTime < (c.startTime ?? 0))) ||
        (c.arrivalLimit !== undefined &&
          (!Number.isInteger(c.arrivalLimit) || c.arrivalLimit < 0))
      )
        issue(
          n.id,
          "Invalid arrival window",
          "Use nonnegative start/end times and an integer arrival limit.",
        );
      dist(c.interarrivalDistribution, n.id);
      if (c.quantityDistribution) dist(c.quantityDistribution, n.id, true);
    }
    if (c.kind === "server") {
      dist(c.serviceDistribution, n.id);
      if (
        !["fifo", "priority"].includes(c.queueDiscipline) ||
        (c.queueDiscipline === "priority" &&
          !validAttributeName(c.priorityAttribute ?? "priority"))
      )
        issue(
          n.id,
          "Invalid queue discipline",
          "Select FIFO or a numeric priority attribute.",
        );
      if (!Number.isInteger(c.capacity) || c.capacity < 1)
        issue(n.id, "Invalid activity capacity", "Use a positive integer.");
      if (c.resourceId && nodes.get(c.resourceId)?.config.kind !== "resource")
        issue(
          n.id,
          "Missing resource pool",
          "Connect the resource port to an existing pool.",
        );
    }
    if (c.kind === "delay") {
      dist(c.distribution, n.id);
      if (
        c.populationId &&
        nodes.get(c.populationId)?.config.kind !== "population"
      )
        issue(
          n.id,
          "Missing population reference",
          "Select an initial population for the availability denominator.",
        );
    }
    if (
      c.kind === "population" &&
      (!Number.isInteger(c.count) ||
        c.count < 1 ||
        c.count > 10000 ||
        !nonnegative(c.quantity))
    )
      issue(
        n.id,
        "Invalid initial population",
        "Use 1–10,000 entities and a nonnegative quantity.",
      );
    if (
      c.kind === "resource" &&
      (!Number.isInteger(c.capacity) ||
        c.capacity < 1 ||
        !nonnegative(c.costPerUnit) ||
        !Number.isFinite(c.costPeriod) ||
        c.costPeriod <= 0)
    )
      issue(
        n.id,
        "Invalid resource settings",
        "Use positive integer capacity, nonnegative cost, and a positive cost period.",
      );
    if (
      c.kind === "store" &&
      (![c.initial, c.holdingCost, c.fixedCost].every(nonnegative) ||
        !Number.isFinite(c.costPeriod) ||
        c.costPeriod <= 0)
    )
      issue(
        n.id,
        "Invalid store settings",
        "Use nonnegative initial stock and costs, and a positive cost period.",
      );
    if (c.kind === "stock") {
      if (nodes.get(c.storeId)?.config.kind !== "store")
        issue(
          n.id,
          "Missing store",
          "Connect the store port to an existing Store.",
        );
      expression(c.amount, n.id);
      if (![c.unitCost, c.unitRevenue, c.waitingCost].every(nonnegative))
        issue(
          n.id,
          "Invalid operation cost",
          "Costs and revenue per unit must be finite and nonnegative.",
        );
    }
    if (c.kind === "signal") expression(c.quantity, n.id);
    if (c.kind === "decision") {
      if (!c.conditions.length)
        issue(
          n.id,
          "Missing decision condition",
          "Add at least one condition. All conditions must hold for the true output.",
        );
      for (const x of c.conditions) {
        expression(x.left, n.id);
        expression(x.right, n.id);
        if (!["<", "<=", "==", ">", ">="].includes(x.operator))
          issue(n.id, "Invalid comparison", "Choose a supported comparison.");
      }
    }
  }
  // Reject cycles composed entirely of instantaneous operations. Timed cycles are bounded by the run event limit as a final safeguard.
  const zero = (d: Distribution) =>
    d?.kind === "constant"
      ? d.value === 0
      : d.kind === "uniform"
        ? d.max === 0
        : d.kind === "normal"
          ? d.mean === 0 && d.stddev === 0
          : false;
  const instant = new Set(
    model.nodes
      .filter((n) =>
        n.config.kind === "server"
          ? zero(n.config.serviceDistribution)
          : n.config.kind === "delay"
            ? zero(n.config.distribution)
            : !["source", "population", "sink", "store", "resource"].includes(
                n.config.kind,
              ),
      )
      .map((n) => n.id),
  );
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const e of model.edges.filter(
      (e) =>
        e.sourceId === id && e.kind === "entityFlow" && instant.has(e.targetId),
    ))
      if (visit(e.targetId)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const id of instant)
    if (visit(id)) {
      issue(
        id,
        "Instantaneous cycle",
        "Insert a positive Delay or Activity into this loop.",
      );
      break;
    }
  return {
    issues,
    hasErrors: issues.some((i) => i.severity === "error"),
    hasWarnings: issues.some((i) => i.severity === "warning"),
  };
}
