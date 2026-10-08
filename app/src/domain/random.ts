/** Source-compatible UTF-16 hash. No code-point normalization or implicit String(). */
export function hashString(input: unknown): number {
  const text = input as string | null | undefined;
  let hash = 0;
  if (!text || text.length === 0) return hash;
  for (let index = 0; index < text.length; index++) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export interface RandomStream {
  next(): number;
  readonly state: number;
}

/** Main-game/viewer LCG. Preserve JS floating-point multiply and source draw order. */
export class DungeonRandom implements RandomStream {
  private currentState: number;

  constructor(seed: unknown) {
    // null/undefined fail in the original; do not silently replace with a default seed.
    this.currentState = hashString((seed as { toString(): string }).toString());
  }

  get state(): number { return this.currentState; }

  next(): number {
    this.currentState = (this.currentState * 9301 + 49297) % 233280;
    return this.currentState / 233280;
  }

  /** Exact save-state restoration, without clamping/reseeding/drawing. */
  restore(state: number): void { this.currentState = state; }
}

/** Fusion uses a separate stateless one-step algorithm, not the dungeon stream. */
export function fusionRandom(seed: number): number {
  let value = seed + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}
