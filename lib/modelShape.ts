// File imports may contain incomplete graphs, but never unknown or malformed blocks.
export const validAttributeName = (name: unknown): name is string =>
  typeof name === "string" &&
  /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name) &&
  !["__proto__", "constructor", "prototype"].includes(name);
export function assertModelShape(model: any): void {
  const fail = () => {
    throw new Error(
      "A block configuration is malformed or uses an unsupported type.",
    );
  };
  const obj = (x: any) => x && typeof x === "object" && !Array.isArray(x);
  const num = (x: any) => {
    if (typeof x !== "number" || !Number.isFinite(x)) fail();
  };
  const str = (x: any) => {
    if (typeof x !== "string") fail();
  };
  const dist = (d: any) => {
    if (!obj(d)) fail();
    const fields: Record<string, string[]> = {
      constant: ["value"],
      exponential: ["mean"],
      normal: ["mean", "stddev"],
      uniform: ["min", "max"],
      discreteUniform: ["min", "max"],
      triangular: ["min", "max", "mode"],
    };
    if (!Object.hasOwn(fields, d.kind)) fail();
    for (const f of fields[d.kind]) num(d[f]);
    if (
      d.kind === "normal" &&
      !["reject", "truncate"].includes(d.nonnegativePolicy)
    )
      fail();
  };
  const expr = (v: any, depth = 0): void => {
    if (!obj(v) || depth > 12) fail();
    switch (v.kind) {
      case "constant":
        num(v.value);
        break;
      case "quantity":
        break;
      case "attribute":
        if (!validAttributeName(v.name)) fail();
        break;
      case "stock":
      case "available":
        str(v.nodeId);
        break;
      case "subtract":
      case "add":
      case "multiply":
        expr(v.left, depth + 1);
        expr(v.right, depth + 1);
        break;
      default:
        fail();
    }
  };
  for (const n of model.nodes) {
    const c = n.config;
    if (!obj(c)) fail();
    if (["__proto__", "constructor", "prototype"].includes(n.id)) fail();
    for (const f of ["resourceId", "populationId", "storeId"])
      if (c[f] !== undefined) str(c[f]);
    if (c.attributes !== undefined) {
      if (!obj(c.attributes)) fail();
      for (const [k, v] of Object.entries(c.attributes)) {
        if (!validAttributeName(k)) fail();
        num(v);
      }
    }
    if (c.entityType !== undefined) str(c.entityType);
    switch (c.kind) {
      case "source":
        dist(c.interarrivalDistribution);
        if (c.interarrivalDistribution.kind === "discreteUniform") fail();
        if (c.quantityDistribution) dist(c.quantityDistribution);
        for (const f of ["startTime", "endTime", "arrivalLimit"])
          if (c[f] !== undefined) num(c[f]);
        break;
      case "population":
        num(c.count);
        num(c.quantity);
        break;
      case "server":
        num(c.capacity);
        dist(c.serviceDistribution);
        if (c.serviceDistribution.kind === "discreteUniform") fail();
        if (!["fifo", "priority"].includes(c.queueDiscipline)) fail();
        if (
          c.priorityAttribute !== undefined &&
          !validAttributeName(c.priorityAttribute)
        )
          fail();
        break;
      case "delay":
        dist(c.distribution);
        break;
      case "resource":
        for (const f of ["capacity", "costPerUnit", "costPeriod"]) num(c[f]);
        if (c.schedule !== undefined) {
          const s = c.schedule;
          if (
            !obj(s) ||
            !Array.isArray(s.intervals) ||
            s.intervals.length > 200
          )
            fail();
          num(s.period);
          num(s.outsideCapacity);
          for (const i of s.intervals) {
            if (!obj(i)) fail();
            for (const f of ["start", "end", "capacity"]) num(i[f]);
          }
        }
        break;
      case "store":
        for (const f of ["initial", "holdingCost", "fixedCost", "costPeriod"])
          num(c[f]);
        break;
      case "stock":
        str(c.storeId);
        expr(c.amount);
        if (!["take", "put", "fulfill"].includes(c.operation)) fail();
        for (const f of ["unitCost", "unitRevenue", "waitingCost"]) num(c[f]);
        break;
      case "signal":
        expr(c.quantity);
        break;
      case "decision":
        if (!Array.isArray(c.conditions)) fail();
        for (const x of c.conditions) {
          if (!obj(x) || !["<", "<=", "==", ">", ">="].includes(x.operator))
            fail();
          expr(x.left);
          expr(x.right);
        }
        break;
      case "assign":
        if (!Array.isArray(c.assignments)) fail();
        for (const x of c.assignments) {
          if (!obj(x) || !validAttributeName(x.name)) fail();
          expr(x.value);
        }
        break;
      case "router":
        num(c.probability);
        break;
      case "batch":
        num(c.size);
        if (
          c.matchAttribute !== undefined &&
          !validAttributeName(c.matchAttribute)
        )
          fail();
        break;
      case "sink":
      case "unbatch":
      case "join":
        break;
      default:
        fail();
    }
  }
}
