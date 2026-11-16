import type { ResourceConfig } from "./model";
function cycleBase(period: number, time: number) {
  const quotient = time / period,
    rounded = Math.round(quotient);
  // Stabilize exact cycle boundaries without rounding away short intervals.
  const cycle =
    Math.abs(quotient - rounded) <=
    Number.EPSILON * Math.max(1, Math.abs(quotient)) * 4
      ? rounded
      : Math.floor(quotient);
  return cycle * period;
}
export function shiftCapacity(c: ResourceConfig, time: number): number {
  if (!c.schedule) return c.capacity;
  const base = cycleBase(c.schedule.period, time);
  return (
    c.schedule.intervals.find(
      (x) => time >= base + x.start && time < base + x.end,
    )?.capacity ?? c.schedule.outsideCapacity
  );
}
export function nextShift(c: ResourceConfig, time: number): number {
  if (!c.schedule) return Infinity;
  const p = c.schedule.period,
    base = cycleBase(p, time);
  const boundaries = [
    0,
    p,
    ...c.schedule.intervals.flatMap((x) => [x.start, x.end]),
  ];
  return Math.min(
    ...boundaries.map((x) => base + x).filter((x) => x > time),
    base + p + Math.min(...boundaries.filter((x) => x > 0)),
  );
}
