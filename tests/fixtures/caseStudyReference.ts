import { mulberry32 } from '../../lib/prng';

export interface CasePoint { time: number; stock: number; queue: number; down: number; balance: number; event: string }
export interface CaseResult { points: CasePoint[]; metrics: { label: string; value: number; unit: string }[]; config: Record<string, number> }
const metric = (label: string, value: number, unit = '') => ({ label, value, unit });
function check(p: Record<string, number>, keys: string[]) {
  if (keys.some(k => !Number.isFinite(p[k]))) throw new Error('All parameters must be finite numbers.');
  if (p.horizon <= 0 || p.horizon > 10000) throw new Error('Horizon must be between 0 and 10,000.');
  if (!Number.isInteger(p.seed) || p.seed < 0 || p.seed > 4294967295) throw new Error('Seed must be an integer from 0 to 4,294,967,295.');
}
export function runInventory(p: Record<string, number>): CaseResult {
  check(p, ['horizon', 'seed', 'cutoff', 'target']);
  if (![p.cutoff, p.target].every(Number.isInteger) || p.cutoff < 1 || p.target < p.cutoff || p.target > 1000) throw new Error('Use integer stock levels with 1 ≤ s ≤ S ≤ 1,000.');
  const random = mulberry32(p.seed);
  const gap = () => -Math.log(1 - random()) / 5;
  let time = 0, stock = p.target, pending = 0, delivery = Infinity, demandTime = gap();
  let holding = 0, purchased = 0, sold = 0, demanded = 0, orders = 0;
  const points: CasePoint[] = [];
  const record = (event: string) => points.push({ time, stock, queue: pending, down: demanded - sold, balance: 100 * sold - 50 * purchased - holding, event });
  record('Initial stock');
  while (Math.min(demandTime, delivery) < p.horizon) {
    const next = Math.min(demandTime, delivery);
    holding += 2 * stock * (next - time);
    time = next;
    if (delivery <= demandTime) {
      const quantity = pending;
      stock += pending; pending = 0; delivery = Infinity;
      record(`Delivered ${quantity} units`);
    } else {
      const demand = 1 + Math.floor(random() * 4);
      const sale = Math.min(stock, demand);
      stock -= sale; sold += sale; demanded += demand;
      let event = `Demand ${demand}; sold ${sale}`;
      if (stock < p.cutoff && pending === 0) {
        pending = p.target - stock; purchased += pending; orders++;
        delivery = time + 2;
        event += `; ordered ${pending}`;
      }
      record(event);
      demandTime = time + gap();
    }
  }
  holding += 2 * stock * (p.horizon - time);
  time = p.horizon; record('Horizon reached');
  return { points, config: { ...p }, metrics: [metric('Unit fill rate', demanded ? sold / demanded * 100 : 100, '%'), metric('Lost demand', demanded - sold, 'units'), metric('Revenue', sold * 100, '$'), metric('Ordering cost', purchased * 50, '$'), metric('Holding cost', holding, '$'), metric('Operating balance', sold * 100 - purchased * 50 - holding, '$'), metric('Orders placed', orders), metric('Stock on hand', stock, 'units')] };
}

export function runFactory(p: Record<string, number>): CaseResult {
  check(p, ['horizon', 'seed', 'repairers', 'spares']);
  if (!Number.isInteger(p.repairers) || p.repairers < 1 || p.repairers > 50 || !Number.isInteger(p.spares) || p.spares < 0 || p.spares > 100) throw new Error('Use 1–50 repairers and 0–100 spares, as integers.');
  const random = mulberry32(p.seed);
  let sequence = 0, time = 0, stock = p.spares, busy = 0, repairQueue = 0, failures = 0, downtime = 0, stockArea = 0;
  const waiting: number[] = [];
  type Event = { t: number; kind: 'failure' | 'repair'; machine: number; seq: number };
  const calendar: Event[] = [];
  const schedule = (t: number, kind: Event['kind'], machine = -1) => calendar.push({ t, kind, machine, seq: sequence++ });
  const operate = (machine: number) => schedule(time + 132 + random() * 50, 'failure', machine);
  const repair = () => { busy++; schedule(time + 4 + random() * 6, 'repair'); };
  for (let i = 0; i < 50; i++) operate(i);
  const fixedCost = Math.ceil(p.horizon / 8) * (3.75 * 8 * p.repairers + 30 * p.spares);
  const points: CasePoint[] = [];
  const record = (event: string) => points.push({ time, stock, queue: repairQueue, down: waiting.length, balance: 20 * downtime + Math.min(Math.floor(time / 8) + 1, Math.ceil(p.horizon / 8)) * (3.75 * 8 * p.repairers + 30 * p.spares), event });
  record('50 operating machines; initial spares');
  while (calendar.length) {
    calendar.sort((a, b) => a.t - b.t || (a.kind === b.kind ? 0 : a.kind === 'repair' ? -1 : 1) || a.seq - b.seq);
    const event = calendar.shift()!;
    if (event.t >= p.horizon) break;
    downtime += waiting.length * (event.t - time);
    stockArea += stock * (event.t - time);
    time = event.t;
    if (event.kind === 'failure') {
      failures++;
      if (busy < p.repairers) repair(); else repairQueue++;
      if (stock > 0) { stock--; operate(event.machine); }
      else waiting.push(event.machine);
      record(`Machine ${event.machine + 1} failed`);
    } else {
      busy--;
      if (waiting.length) operate(waiting.shift()!); else stock++;
      if (repairQueue > 0) { repairQueue--; repair(); }
      record('Repair complete; machine returned');
    }
    // Every original machine and spare is either operating, spare, queued or in repair.
    if (50 - waiting.length + stock + repairQueue + busy !== 50 + p.spares) throw new Error('Machine conservation failed.');
  }
  downtime += waiting.length * (p.horizon - time);
  stockArea += stock * (p.horizon - time);
  time = p.horizon; record('Horizon reached');
  return { points, config: { ...p }, metrics: [metric('Availability', (1 - downtime / (50 * p.horizon)) * 100, '%'), metric('Downtime', downtime, 'machine-hours'), metric('Average spare stock', stockArea / p.horizon, 'machines'), metric('Failures', failures), metric('Staff and spares', fixedCost, '$'), metric('Downtime cost', downtime * 20, '$'), metric('Total cost', fixedCost + downtime * 20, '$'), metric('Cost / working day', (fixedCost + downtime * 20) / (p.horizon / 8), '$')] };
}
