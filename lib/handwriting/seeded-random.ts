export interface SeededRandom {
  next(): number;
  signed(): number;
  integer(min: number, max: number): number;
}

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return hash >>> 0;
}

export function createSeededRandom(seed: string): SeededRandom {
  let state = hashString(seed) || 0x6d2b79f5;
  const next = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    signed: () => next() * 2 - 1,
    integer: (min, max) => Math.floor(next() * (max - min + 1)) + min,
  };
}

export function nextSeed(seed: string): string {
  const first = hashString(`${seed}:next`).toString(16).padStart(8, "0");
  const second = hashString(`${first}:${seed.length}`).toString(16).padStart(8, "0");
  return `HW-${first.slice(0, 4).toUpperCase()}-${second.slice(0, 4).toUpperCase()}`;
}
