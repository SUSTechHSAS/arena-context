/** GPL-3.0. Derived from Chinese-Dungeon @ 8d80b5a4 (lines 47656, 66553).
 * JS number arithmetic and UTF-16 hashing deliberately preserved.
 */
export function hashSeed(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
/** One-shot fusion random function, distinct from the stateful dungeon LCG. */
export function fusionRandom(seed: number): number {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export class DungeonRandom {
  state: number;
  calls = 0;
  constructor(seed: string | number) { this.state = hashSeed(seed.toString()); }
  next = (): number => {
    this.state = (this.state * 9301 + 49297) % 233280;
    this.calls++;
    return this.state / 233280;
  };
  snapshot() { return { state: this.state, calls: this.calls }; }
}
