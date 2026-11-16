import { validateProcessModel } from "./processValidation";
import { shiftCapacity, nextShift } from "./shifts";
import type {
  DesModel,
  Distribution,
  Value,
  Condition,
  NodeConfig,
} from "./model";
import type {
  EngineResult,
  RunConfig,
  NodeSnapshot,
  EntityRecord,
  EventKind,
  Measurement,
} from "./engine";
import { mulberry32 } from "./prng";

export function sampleDistribution(
  d: Distribution,
  random: () => number,
): number {
  const u = () =>
    Math.max(Number.EPSILON, Math.min(1 - Number.EPSILON, random()));
  switch (d.kind) {
    case "constant":
      return d.value;
    case "exponential":
      return -Math.log(1 - u()) * d.mean;
    case "uniform":
      return d.min + u() * (d.max - d.min);
    case "discreteUniform":
      return d.min + Math.floor(u() * (d.max - d.min + 1));
    case "triangular": {
      const x = u(),
        f = (d.mode - d.min) / (d.max - d.min);
      return x < f
        ? d.min + Math.sqrt(x * (d.max - d.min) * (d.mode - d.min))
        : d.max - Math.sqrt((1 - x) * (d.max - d.min) * (d.max - d.mode));
    }
    case "normal": {
      for (let i = 0; i < 10000; i++) {
        const x =
          d.mean +
          d.stddev *
            Math.sqrt(-2 * Math.log(u())) *
            Math.cos(2 * Math.PI * u());
        if (d.nonnegativePolicy === "truncate") return Math.max(0, x);
        if (x >= 0) return x;
      }
      throw new Error(
        "Normal sampling could not produce a nonnegative duration. Adjust the distribution.",
      );
    }
  }
}

class Calendar<T> {
  items: T[] = [];
  constructor(private compare: (a: T, b: T) => number) {}
  push(x: T) {
    const a = this.items;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.compare(a[p], a[i]) <= 0) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): T | undefined {
    const a = this.items;
    if (!a.length) return;
    const x = a[0],
      last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        let j = i,
          l = i * 2 + 1,
          r = l + 1;
        if (l < a.length && this.compare(a[l], a[j]) < 0) j = l;
        if (r < a.length && this.compare(a[r], a[j]) < 0) j = r;
        if (i === j) break;
        [a[i], a[j]] = [a[j], a[i]];
        i = j;
      }
    }
    return x;
  }
}

type Job = EntityRecord & {
  attributes: Record<string, number>;
  entityType: string;
  frames: { id: string; branch: string }[];
  members?: Job[];
  synthetic?: boolean;
  retired?: boolean;
  quantity: number;
  started: number;
  observed: boolean;
};
type Waiting = { job: Job; at: number; seq: number; port?: string };
type State = {
  capacity: number;
  areaCapacity: number;
  areaUsed: number;
  areaOvertime: number;
  queue: Waiting[];
  busy: number;
  stock: number;
  generated: number;
  completed: number;
  areaQ: number;
  areaBusy: number;
  areaStock: number;
  maxQ: number;
  demand: number;
  fulfilled: number;
  cost: number;
  revenue: number;
};
type Event = {
  t: number;
  priority: number;
  seq: number;
  kind: "source" | "initial" | "enter" | "end" | "shift";
  port?: string;
  node: string;
  job?: Job;
};

export function runProcessModel(
  model: DesModel,
  config: RunConfig,
): EngineResult {
  if (
    !Number.isFinite(config.horizon) ||
    config.horizon <= 0 ||
    !Number.isFinite(config.warmup) ||
    config.warmup < 0 ||
    config.warmup >= config.horizon
  )
    throw new Error(
      "Use a positive horizon and a warm-up between zero and the horizon.",
    );
  if (
    !Number.isInteger(config.seed) ||
    config.seed < 0 ||
    config.seed > 4294967295 ||
    !Number.isInteger(config.replications) ||
    config.replications < 1 ||
    config.replications > 100 ||
    !Number.isInteger(config.maxEvents) ||
    config.maxEvents < 1
  )
    throw new Error(
      "Use a valid integer seed, 1–100 replications and a positive event limit.",
    );
  const validation = validateProcessModel(model);
  if (validation.hasErrors)
    throw new Error(
      validation.issues
        .filter((i) => i.severity === "error")
        .map((i) => `${i.title}: ${i.explanation}`)
        .join("\n"),
    );
  const started = performance.now(),
    random = mulberry32(config.seed);
  const nodes = new Map(model.nodes.map((n) => [n.id, n]));
  const states: Record<string, State> = Object.create(null);
  const jobs = new Map<string, Job>();
  const trace: EngineResult["trace"] = [];
  const output = new Map<string, { id: string; port?: string }>();
  for (const edge of model.edges)
    if (edge.kind === "entityFlow")
      output.set(`${edge.sourceId}:${edge.port ?? "out"}`, {
        id: edge.targetId,
        port: edge.targetPort,
      });
  for (const n of model.nodes)
    states[n.id] = {
      capacity:
        n.config.kind === "resource"
          ? shiftCapacity(n.config, 0)
          : n.config.kind === "server"
            ? n.config.capacity
            : 0,
      areaCapacity: 0,
      areaUsed: 0,
      areaOvertime: 0,
      queue: [],
      busy: 0,
      stock: n.config.kind === "store" ? n.config.initial : 0,
      generated: 0,
      completed: 0,
      areaQ: 0,
      areaBusy: 0,
      areaStock: 0,
      maxQ: 0,
      demand: 0,
      fulfilled: 0,
      cost: 0,
      revenue: 0,
    };
  let time = 0,
    sequence = 0,
    entity = 0,
    arrivals = 0,
    departures = 0,
    processed = 0;
  const cal = new Calendar<Event>(
    (a, b) => a.t - b.t || a.priority - b.priority || a.seq - b.seq,
  );
  const fixed = config.stopMode === "horizon";
  if (!fixed && hasProcessCycle(model))
    throw new Error("Recurring process cycles require Stop at horizon.");
  const schedule = (
    kind: Event["kind"],
    node: string,
    t: number,
    job?: Job,
    port?: string,
  ) => {
    if (!Number.isFinite(t) || t < time)
      throw new Error(
        "An event has an invalid time. Check timing distributions.",
      );
    cal.push({
      kind,
      node,
      t,
      job,
      port,
      priority:
        kind === "shift" ? -1 : kind === "end" ? 0 : kind === "source" ? 2 : 1,
      seq: sequence++,
    });
  };
  const makeJob = (
    quantity: number,
    attributes: Record<string, number> = {},
    entityType = "Entity",
    synthetic = false,
  ) => {
    if (!Number.isFinite(quantity) || quantity < 0)
      throw new Error("Entity quantity must be finite and nonnegative.");
    const job: Job = {
      id: `e-${++entity}`,
      quantity,
      attributes: { ...attributes },
      entityType,
      synthetic,
      frames: [],
      arrivalTime: time,
      waitTime: 0,
      serviceTime: 0,
      started: time,
      observed: time >= config.warmup,
    };
    jobs.set(job.id, job);
    if (!synthetic) arrivals++;
    return job;
  };
  const value = (v: Value, job: Job): number => {
    switch (v.kind) {
      case "constant":
        return v.value;
      case "quantity":
        return job.quantity;
      case "attribute": {
        const result = job.attributes[v.name];
        if (!Number.isFinite(result))
          throw new Error(
            `Entity ${job.id} has no numeric attribute ${v.name}.`,
          );
        return result;
      }
      case "stock":
        return states[v.nodeId]?.stock ?? 0;
      case "available": {
        const c = nodes.get(v.nodeId)?.config;
        return c?.kind === "resource"
          ? Math.max(0, states[v.nodeId].capacity - states[v.nodeId].busy)
          : 0;
      }
      case "subtract":
        return value(v.left, job) - value(v.right, job);
      case "add":
        return value(v.left, job) + value(v.right, job);
      case "multiply":
        return value(v.left, job) * value(v.right, job);
    }
  };
  const condition = (c: Condition, job: Job) => {
    const l = value(c.left, job),
      r = value(c.right, job);
    return c.operator === "<"
      ? l < r
      : c.operator === "<="
        ? l <= r
        : c.operator === "=="
          ? l === r
          : c.operator === ">"
            ? l > r
            : l >= r;
  };
  const emit = (
    kind: EventKind,
    nodeId: string,
    job?: Job,
    detail?: string,
  ) => {
    if (trace.length >= config.maxEvents) return;
    const nodeStates: Record<string, NodeSnapshot> = {};
    for (const n of model.nodes) {
      const s = states[n.id],
        c = n.config;
      nodeStates[n.id] = {
        queueLength: s.queue.length,
        busyServers: s.busy,
        generated: s.generated,
        completed: s.completed,
        ...(c.kind === "store" ? { stock: s.stock } : {}),
        ...(c.kind === "resource"
          ? {
              available: Math.max(0, s.capacity - s.busy),
              capacity: s.capacity,
            }
          : {}),
      };
    }
    trace.push({
      id: `te-${trace.length}`,
      t: time,
      seq: sequence,
      kind,
      nodeId,
      entityId: job?.id ?? "",
      detail,
      entityAttributes: job ? { ...job.attributes } : undefined,
      entityType: job?.entityType,
      correlation: job?.frames.at(-1)?.id,
      state: {
        nodeStates,
        inSystem: arrivals - departures,
        totalArrivals: arrivals,
        totalDepartures: departures,
      },
    });
  };
  const route = (node: string, job: Job, port = "out") => {
    const target = output.get(`${node}:${port}`);
    if (!target)
      throw new Error(
        `Missing ${port} connection on ${nodes.get(node)?.name}.`,
      );
    schedule("enter", target.id, time, job, target.port);
  };
  const integrate = (next: number) => {
    const dt = Math.max(
      0,
      Math.min(next, config.horizon) - Math.max(time, config.warmup),
    );
    for (const [id, s] of Object.entries(states)) {
      const c = nodes.get(id)!.config;
      const pool =
        c.kind === "server" && c.resourceId ? states[c.resourceId] : s;
      s.areaCapacity += pool.capacity * dt;
      s.areaUsed +=
        s.busy *
        (pool.busy > pool.capacity && pool.busy > 0
          ? pool.capacity / pool.busy
          : 1) *
        dt;
      s.areaOvertime += Math.max(0, s.busy - pool.capacity) * dt;
      s.areaQ += s.queue.length * dt;
      s.areaBusy += s.busy * dt;
      s.areaStock += s.stock * dt;
    }
    time = next;
  };
  const enqueue = (id: string, job: Job, port?: string) => {
    const s = states[id];
    s.queue.push({ job, at: time, seq: sequence++, port });
    const c = nodes.get(id)!.config;
    if (c.kind === "server" && c.queueDiscipline === "priority")
      s.queue.sort(
        (a, b) =>
          (b.job.attributes[c.priorityAttribute ?? "priority"] ?? 0) -
            (a.job.attributes[c.priorityAttribute ?? "priority"] ?? 0) ||
          a.seq - b.seq,
      );
    emit("queueEnter", id, job);
  };
  const finish = (job: Job): void => {
    if (job.retired) return;
    job.retired = true;
    if (job.synthetic) {
      for (const member of job.members ?? []) {
        member.waitTime += job.waitTime;
        member.serviceTime = (member.serviceTime ?? 0) + (job.serviceTime ?? 0);
        finish(member);
      }
    } else {
      job.departureTime = time;
      job.sojournTime = time - job.arrivalTime;
      departures++;
    }
  };
  const rank = (id: string) => {
    const c = nodes.get(id)!.config;
    return c.kind === "server" && c.queueDiscipline === "priority"
      ? (states[id].queue[0].job.attributes[
          c.priorityAttribute ?? "priority"
        ] ?? 0)
      : 0;
  };
  // Priorities are nonpreemptive; FIFO breaks ties across shared-pool requests.
  const pump = () => {
    const heads = model.nodes
      .filter((n) => states[n.id].queue.length)
      .sort(
        (a, b) =>
          rank(b.id) - rank(a.id) ||
          states[a.id].queue[0].seq - states[b.id].queue[0].seq,
      );
    const blocked = new Set<string>();
    let changed = false;
    for (const n of heads) {
      const c = n.config,
        s = states[n.id],
        w = s.queue[0],
        job = w.job;
      if (c.kind === "batch") {
        const groups = new Map<number, Waiting[]>();
        for (const w of s.queue) {
          const key = c.matchAttribute ? w.job.attributes[c.matchAttribute] : 0;
          const group = groups.get(key) ?? [];
          group.push(w);
          groups.set(key, group);
        }
        const group = [...groups.values()].find((g) => g.length >= c.size);
        if (!group) continue;
        const chosen = group.slice(0, c.size);
        s.queue = s.queue.filter((x) => !chosen.includes(x));
        for (const x of chosen) x.job.waitTime += time - x.at;
        const carrier = makeJob(
          chosen.reduce((sum, x) => sum + x.job.quantity, 0),
          chosen[0].job.attributes,
          "Batch",
          true,
        );
        carrier.members = chosen.map((x) => x.job);
        s.completed++;
        emit("batch", n.id, carrier, `Grouped ${chosen.length} entities`);
        route(n.id, carrier);
        return true;
      }
      if (c.kind === "join") {
        const groups = new Map<string, { a?: Waiting; b?: Waiting }>();
        for (const w of s.queue) {
          const key = w.job.frames.at(-1)!.id;
          const pair = groups.get(key) ?? {};
          pair[w.port as "a" | "b"] = w;
          groups.set(key, pair);
        }
        const pair = [...groups.values()].find((g) => g.a && g.b);
        if (!pair) continue;
        const a = pair.a!,
          b = pair.b!;
        s.queue = s.queue.filter((x) => x !== a && x !== b);
        a.job.waitTime += time - a.at;
        b.job.waitTime += time - b.at;
        finish(b.job);
        a.job.frames.pop();
        s.completed++;
        emit("join", n.id, a.job, `Joined ${b.job.id}`);
        route(n.id, a.job);
        return true;
      }
      if (c.kind === "server") {
        const pool = c.resourceId ? states[c.resourceId] : s;
        const capacity = c.resourceId
          ? states[c.resourceId].capacity
          : c.capacity;
        const key = c.resourceId ?? n.id;
        if (blocked.has(key) || pool.busy >= capacity) {
          blocked.add(key);
          continue;
        }
        s.queue.shift();
        s.busy++;
        if (pool !== s) pool.busy++;
        job.waitTime += time - w.at;
        job.started = time;
        job.serviceStartTime = time;
        schedule(
          "end",
          n.id,
          time + sampleDistribution(c.serviceDistribution, random),
          job,
        );
        emit("serviceStart", n.id, job);
        return true;
      } else if (c.kind === "stock") {
        const store = states[c.storeId],
          amount = value(c.amount, job);
        if (!store || !Number.isFinite(amount) || amount < 0)
          throw new Error(`Invalid stock operation on ${n.name}.`);
        if (
          c.operation === "take" &&
          (blocked.has(c.storeId) || store.stock < amount)
        ) {
          blocked.add(c.storeId);
          continue;
        }
        s.queue.shift();
        job.waitTime += time - w.at;
        const actual =
          c.operation === "fulfill" ? Math.min(store.stock, amount) : amount;
        store.stock += c.operation === "put" ? actual : -actual;
        if (time >= config.warmup && time <= config.horizon) {
          s.demand += amount;
          s.fulfilled += actual;
          s.cost += actual * c.unitCost;
          s.revenue += actual * c.unitRevenue;
        }
        s.completed++;
        emit("stockChange", n.id, job, `${c.operation}: ${actual} / ${amount}`);
        route(n.id, job);
        return true;
      }
    }
    return changed;
  };
  for (const n of model.nodes) {
    const c = n.config;
    if (c.kind === "source") {
      const t =
        (c.startTime ?? 0) +
        sampleDistribution(c.interarrivalDistribution, random);
      if (
        t < config.horizon &&
        t <= (c.endTime ?? Infinity) &&
        (c.arrivalLimit ?? Infinity) > 0
      )
        schedule("source", n.id, t);
    } else if (c.kind === "population") schedule("initial", n.id, 0);
    else if (c.kind === "resource" && c.schedule)
      schedule("shift", n.id, nextShift(c, 0));
  }
  emit("initial", model.nodes[0]?.id ?? "", undefined, "Initial state");
  while (
    cal.items.length &&
    trace.length < config.maxEvents &&
    processed < config.maxEvents
  ) {
    const ev = cal.pop()!;
    if (fixed && ev.t >= config.horizon) break;
    if (
      !fixed &&
      ev.kind === "shift" &&
      ev.t >= config.horizon &&
      !cal.items.some((e) => e.kind !== "shift") &&
      !model.nodes.some(
        (n) =>
          n.config.kind === "server" &&
          n.config.resourceId &&
          states[n.id].queue.length,
      )
    )
      continue;
    integrate(ev.t);
    processed++;
    const n = nodes.get(ev.node)!,
      c = n.config,
      s = states[n.id];
    if (ev.kind === "shift" && c.kind === "resource") {
      s.capacity = shiftCapacity(c, time);
      emit(
        "shift",
        n.id,
        undefined,
        `Capacity ${s.capacity}; existing work finishes`,
      );
      if (
        time < config.horizon ||
        cal.items.some((e) => e.kind !== "shift") ||
        model.nodes.some(
          (x) =>
            x.config.kind === "server" &&
            x.config.resourceId === n.id &&
            states[x.id].queue.length,
        )
      )
        schedule("shift", n.id, nextShift(c, time));
    } else if (ev.kind === "initial" && c.kind === "population") {
      for (let i = 0; i < c.count; i++) {
        const job = makeJob(c.quantity, c.attributes, c.entityType);
        s.generated++;
        route(n.id, job);
      }
      emit("arrival", n.id, undefined, `Initialized ${c.count} entities`);
    } else if (ev.kind === "source" && c.kind === "source") {
      const next =
        time + sampleDistribution(c.interarrivalDistribution, random);
      if (
        next < config.horizon &&
        next <= (c.endTime ?? Infinity) &&
        s.generated + 1 < (c.arrivalLimit ?? Infinity)
      )
        schedule("source", n.id, next);
      const job = makeJob(
        c.quantityDistribution
          ? sampleDistribution(c.quantityDistribution, random)
          : 1,
        c.attributes,
        c.entityType,
      );
      s.generated++;
      emit("arrival", n.id, job);
      route(n.id, job);
    } else if (ev.kind === "end") {
      const job = ev.job!;
      s.busy--;
      s.completed++;
      job.serviceTime! += time - job.started;
      if (c.kind === "server" && c.resourceId) states[c.resourceId].busy--;
      emit("serviceEnd", n.id, job);
      route(n.id, job);
    } else if (ev.kind === "enter") {
      const job = ev.job!;
      switch (c.kind) {
        case "batch":
          if (
            c.matchAttribute &&
            !Number.isFinite(job.attributes[c.matchAttribute])
          )
            throw new Error(
              `Missing batch match attribute ${c.matchAttribute}.`,
            );
          enqueue(n.id, job);
          break;
        case "join":
          if (!job.frames.length || !["a", "b"].includes(ev.port ?? ""))
            throw new Error(
              "Join requires related Signal branches connected to inputs a and b.",
            );
          if (
            s.queue.some(
              (x) =>
                x.port === ev.port &&
                x.job.frames.at(-1)?.id === job.frames.at(-1)?.id,
            )
          )
            throw new Error("Duplicate branch at Join.");
          enqueue(n.id, job, ev.port);
          break;
        case "unbatch":
          if (!job.members)
            throw new Error("Unbatch received an entity that is not a batch.");
          for (const member of job.members) {
            member.waitTime += job.waitTime;
            member.serviceTime =
              (member.serviceTime ?? 0) + (job.serviceTime ?? 0);
            route(n.id, member);
          }
          job.retired = true;
          s.completed++;
          emit("unbatch", n.id, job, `Released ${job.members.length} members`);
          break;
        case "assign":
          for (const a of c.assignments) {
            const v = value(a.value, job);
            if (!Number.isFinite(v))
              throw new Error("An attribute assignment is not finite.");
            job.attributes[a.name] = v;
          }
          emit("assign", n.id, job);
          route(n.id, job);
          break;
        case "router": {
          const pass = random() < c.probability;
          s.completed++;
          emit("decision", n.id, job, pass ? "true" : "false");
          route(n.id, job, pass ? "true" : "false");
          break;
        }
        case "server":
        case "stock":
          enqueue(n.id, job);
          break;
        case "delay":
          s.busy++;
          job.started = time;
          schedule(
            "end",
            n.id,
            time + sampleDistribution(c.distribution, random),
            job,
          );
          emit("serviceStart", n.id, job);
          break;
        case "sink":
          finish(job);
          s.completed++;
          emit("departure", n.id, job);
          break;
        case "decision": {
          const pass = c.conditions.every((x) => condition(x, job));
          s.completed++;
          emit("decision", n.id, job, pass ? "true" : "false");
          route(n.id, job, pass ? "true" : "false");
          break;
        }
        case "signal": {
          const child = makeJob(
            value(c.quantity, job),
            job.attributes,
            job.entityType,
          );
          const correlation = `${job.id}:fork-${sequence++}`;
          child.frames = [...job.frames, { id: correlation, branch: "spawn" }];
          job.frames.push({ id: correlation, branch: "out" });
          s.generated++;
          emit("signal", n.id, child, `Created from ${job.id}`);
          route(n.id, child, "spawn");
          route(n.id, job);
          break;
        }
        default:
          throw new Error(`Entities cannot enter ${c.kind} blocks.`);
      }
    }
    while (pump() && trace.length < config.maxEvents) {
      /* release all currently eligible FIFO requests */
    }
    for (const s of Object.values(states))
      s.maxQ = Math.max(s.maxQ, s.queue.length);
  }
  const truncated =
    trace.length >= config.maxEvents || processed >= config.maxEvents;
  if (!truncated && time < config.horizon) integrate(config.horizon);
  if (!truncated)
    emit(
      "horizon",
      model.nodes[0]?.id ?? "",
      undefined,
      fixed
        ? "Horizon reached"
        : "Arrival window closed; remaining work finished where possible",
    );
  const duration = Math.max(
    Number.EPSILON,
    Math.min(time, config.horizon) - config.warmup,
  );
  const servers = model.nodes.filter((n) => n.config.kind === "server");
  const completed = [...jobs.values()].filter(
    (j) => !j.synthetic && j.departureTime !== undefined && j.observed,
  );
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const measurements: Record<string, Measurement> = {};
  const measure = (
    key: string,
    label: string,
    val: number,
    unit = "",
    lower: boolean | null = null,
  ) => {
    measurements[key] = { label, value: val, unit, lowerIsBetter: lower };
  };
  let totalCost = 0,
    revenue = 0;
  for (const n of model.nodes) {
    const c = n.config,
      s = states[n.id],
      key = n.id;
    if (c.kind === "store") {
      measure(`${key}:stock`, `${n.name} · on hand`, s.stock, "units");
      measure(
        `${key}:average`,
        `${n.name} · average stock`,
        s.areaStock / duration,
        "units",
      );
      const cost =
        s.areaStock * c.holdingCost +
        c.initial *
          c.fixedCost *
          Math.max(
            0,
            Math.ceil(Math.min(time, config.horizon) / c.costPeriod) -
              Math.floor(config.warmup / c.costPeriod),
          );
      totalCost += cost;
      measure(
        `${key}:cost`,
        `${n.name} · holding / capacity cost`,
        cost,
        "$",
        true,
      );
    }
    if (c.kind === "resource") {
      measure(
        `${key}:utilization`,
        `${n.name} · utilization`,
        s.areaCapacity ? (100 * s.areaUsed) / s.areaCapacity : 0,
        "%",
      );
      if (c.schedule) {
        measure(
          `${key}:staffed`,
          `${n.name} · staffed capacity time`,
          s.areaCapacity,
          `resource-${model.unit}s`,
        );
        measure(
          `${key}:overtime`,
          `${n.name} · overtime`,
          s.areaOvertime,
          `resource-${model.unit}s`,
          true,
        );
      }
      const cost = c.schedule
        ? (s.areaCapacity * c.costPerUnit) / c.costPeriod
        : c.capacity *
          c.costPerUnit *
          Math.max(
            0,
            Math.ceil(Math.min(time, config.horizon) / c.costPeriod) -
              Math.floor(config.warmup / c.costPeriod),
          );
      totalCost += cost;
      measure(`${key}:cost`, `${n.name} · capacity cost`, cost, "$", true);
    }
    if (c.kind === "server") {
      const capacity = c.resourceId
        ? (nodes.get(c.resourceId)!.config as { capacity: number }).capacity
        : c.capacity;
      measure(
        `${key}:utilization`,
        `${n.name} · utilization`,
        s.areaCapacity ? (100 * s.areaUsed) / s.areaCapacity : 0,
        "%",
      );
    }
    if (["server", "stock", "batch", "join"].includes(c.kind)) {
      measure(
        `${key}:queue`,
        `${n.name} · average waiting`,
        s.areaQ / duration,
        "entities",
        true,
      );
      measure(
        `${key}:waiting`,
        `${n.name} · waiting time integral`,
        s.areaQ,
        `entity-${model.unit}s`,
        true,
      );
    }
    if (c.kind === "delay") {
      measure(
        `${key}:active`,
        `${n.name} · average active`,
        s.areaBusy / duration,
        "entities",
        false,
      );
      const population = c.populationId
        ? nodes.get(c.populationId)?.config
        : undefined;
      if (population?.kind === "population")
        measure(
          `${key}:availability`,
          `${n.name} · availability`,
          (100 * s.areaBusy) / duration / population.count,
          "%",
          false,
        );
    }
    if (["batch", "join", "unbatch"].includes(c.kind))
      measure(
        `${key}:completed`,
        `${n.name} · groups completed`,
        s.completed,
        "groups",
        false,
      );
    if (c.kind === "signal")
      measure(`${key}:count`, `${n.name} · signals`, s.generated, "events");
    if (c.kind === "stock") {
      totalCost += s.cost + s.areaQ * c.waitingCost;
      revenue += s.revenue;
      measure(`${key}:units`, `${n.name} · transferred`, s.fulfilled, "units");
      measure(
        `${key}:cost`,
        `${n.name} · operation / waiting cost`,
        s.cost + s.areaQ * c.waitingCost,
        "$",
        true,
      );
      if (c.operation === "fulfill") {
        measure(
          `${key}:fill`,
          `${n.name} · fill rate`,
          s.demand ? (s.fulfilled / s.demand) * 100 : 100,
          "%",
          false,
        );
        measure(
          `${key}:lost`,
          `${n.name} · lost demand`,
          s.demand - s.fulfilled,
          "units",
          true,
        );
      }
    }
  }
  measure("cost", "Total cost", totalCost, "$", true);
  measure("revenue", "Revenue", revenue, "$", false);
  measure("balance", "Operating balance", revenue - totalCost, "$", false);
  const metrics = {
    totalArrivals: [...jobs.values()].filter((j) => !j.synthetic && j.observed)
      .length,
    totalDepartures: completed.length,
    avgWaitTime:
      sum(completed.map((j) => j.waitTime)) / (completed.length || 1),
    avgServiceTime:
      sum(completed.map((j) => j.serviceTime ?? 0)) / (completed.length || 1),
    avgSojournTime:
      sum(completed.map((j) => j.sojournTime ?? 0)) / (completed.length || 1),
    avgQueueLength: sum(servers.map((n) => states[n.id].areaQ)) / duration,
    avgUtilization:
      sum(servers.map((n) => states[n.id].areaUsed)) /
      (sum(
        [
          ...new Set(
            servers.map((n) =>
              n.config.kind === "server" ? (n.config.resourceId ?? n.id) : n.id,
            ),
          ),
        ].map((id) => states[id].areaCapacity),
      ) || 1),
    maxQueueLength: Math.max(0, ...servers.map((n) => states[n.id].maxQ)),
    throughput: completed.length / duration,
  };
  {
    measure("totalArrivals", "Arrivals", metrics.totalArrivals, "entities");
    measure(
      "totalDepartures",
      "Departures",
      metrics.totalDepartures,
      "entities",
      false,
    );
    measure(
      "avgWaitTime",
      "Mean waiting time",
      metrics.avgWaitTime,
      model.unit,
      true,
    );
    measure(
      "avgServiceTime",
      "Mean service time",
      metrics.avgServiceTime,
      model.unit,
    );
    measure(
      "avgSojournTime",
      "Mean sojourn time",
      metrics.avgSojournTime,
      model.unit,
      true,
    );
    measure(
      "avgQueueLength",
      "Average queue length",
      metrics.avgQueueLength,
      "entities",
      true,
    );
    measure(
      "avgUtilization",
      "Overall utilization",
      metrics.avgUtilization,
      "fraction",
    );
    measure(
      "maxQueueLength",
      "Peak queue length",
      metrics.maxQueueLength,
      "entities",
      true,
    );
    measure(
      "throughput",
      "Throughput",
      metrics.throughput,
      `entities/${model.unit}`,
      false,
    );
  }
  return {
    trace,
    entities: [...jobs.values()],
    metrics,
    measurements,
    unit: model.unit,
    horizon: config.horizon,
    seed: config.seed,
    runDurationMs: performance.now() - started,
    truncatedAt: truncated ? "maxEvents" : undefined,
    stoppedWithPending: arrivals > departures,
  };
}

export function hasProcessCycle(model: DesModel): boolean {
  const active = new Set<string>(),
    done = new Set<string>();
  const visit = (id: string): boolean => {
    if (active.has(id)) return true;
    if (done.has(id)) return false;
    active.add(id);
    for (const e of model.edges)
      if (e.kind === "entityFlow" && e.sourceId === id && visit(e.targetId))
        return true;
    active.delete(id);
    done.add(id);
    return false;
  };
  return model.nodes.some((n) => visit(n.id));
}
