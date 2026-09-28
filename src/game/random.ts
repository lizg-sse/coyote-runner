/**
 * Small seeded random generator (mulberry32). A seeded generator keeps every
 * simulation reproducible, which is what lets the fairness tests replay
 * thousands of seconds of gameplay deterministically.
 */
export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    pick: (items) => {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) {
        throw new Error("pick() called with an empty list");
      }
      return item;
    },
  };
}
