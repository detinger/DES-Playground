// Deterministic seeded PRNG — mulberry32.
// Provides reproducible simulation runs independent of Math.random().

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromString(s: string): number {
  let h = 0xDEADBEEF >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h ^ s.charCodeAt(i), 2654435761)) >>> 0;
  }
  return (h ^ (h >>> 16)) >>> 0;
}
