/** TEST ONLY. Differential harness for src/domain/color-math.ts. Never imported by src/ or bundled. */
import type { ColorMath } from '../../src/domain/color-math';
import { createOracle } from './source';

export const COLOR_NAMES = ['hexToRgba', 'hexToRgb', 'blendColors'] as const;

/** A call outcome: the normalised return value, or the thrown error's name and message. */
export type Outcome = { value: unknown } | { error: string; message: string };

/** Adapter shape shared by the original (through the vm oracle) and the candidate. */
export interface ColorApi {
  hexToRgba(hex: unknown, ...alpha: unknown[]): Outcome;
  hexToRgb(hex: unknown): Outcome;
  blendColors(hexArray: unknown): Outcome;
}

/** Copies arrays out of the vm realm so both realms compare by content. */
export function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return Array.from(value, normalize);
  return value;
}

export function outcome(action: () => unknown): Outcome {
  try {
    return { value: normalize(action()) };
  } catch (error) {
    return { error: (error as Error).name, message: (error as Error).message };
  }
}

/** The original functions, evaluated from their exact AST ranges in ChineseDungeon.html. */
export function originalColorApi(): ColorApi {
  const oracle = createOracle([...COLOR_NAMES]);
  return {
    hexToRgba: (hex, ...alpha) => outcome(() => oracle.invoke('hexToRgba', hex, ...alpha)),
    hexToRgb: hex => outcome(() => oracle.invoke('hexToRgb', hex)),
    blendColors: hexArray => outcome(() => oracle.invoke('blendColors', hexArray)),
  };
}

/** Adapts a candidate; arity is forwarded exactly, so a missing alpha stays undefined. */
export function candidateColorApi(impl: ColorMath): ColorApi {
  const hexToRgba = impl.hexToRgba as unknown as (...args: unknown[]) => unknown;
  const hexToRgb = impl.hexToRgb as unknown as (...args: unknown[]) => unknown;
  const blendColors = impl.blendColors as unknown as (...args: unknown[]) => unknown;
  return {
    hexToRgba: (hex, ...alpha) => outcome(() => hexToRgba(hex, ...alpha)),
    hexToRgb: hex => outcome(() => hexToRgb(hex)),
    blendColors: hexArray => outcome(() => blendColors(hexArray)),
  };
}

/** Deterministic test-data generator (LCG). Only for generating fixtures; never used by the candidate. */
export function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export const HEX_DIGITS = '0123456789abcdef';
export const MIXED_CHARS = '0123456789abcdefABCDEFgxz#-+ .\t';

export function pick<T>(next: () => number, items: readonly T[]): T {
  return items[Math.floor(next() * items.length)]!;
}

export function randomText(next: () => number, length: number, alphabet: string): string {
  let text = '';
  for (let index = 0; index < length; index++) text += pick(next, [...alphabet]);
  return text;
}

/** Every observed accepted form, malformed string, non-string and object-shaped input. */
export const HEX_SAMPLES: readonly unknown[] = [
  'ff0000', '00FF00', '0a0B0c', '#ff0000', '#FF8800', '#FFF', 'fff', 'abc', '#abc', '#abcd', 'abcd',
  '', '#', 'f', 'ff', 'fffff', 'fffffff', 'ff00ff00', 'ffffffffffff', 'zzzzzz', '12g456', '-1-2-3',
  '-f0000', '  1234', '\t\t\t\t\t\t', '0x1234', '##ff00', '1e5', '000000', 'ffffff',
  null, undefined, 123, 0, true, ['ab', 'cd', 'ef'], {}, { slice: () => 'ff' }, Object.create(null),
];

/** Alpha values: falsy, truthy, numeric-looking, object and Symbol (coercion throws). */
export const ALPHA_SAMPLES: readonly unknown[] = [
  undefined, null, false, true, 0, -0, NaN, 1, 0.5, 0.25, 1e21, -1, Infinity,
  '', '0', 'x', '0.3', [], [1], {}, Object.create(null), Symbol('alpha'),
];

/** Colour arrays, including the 0-, 1-, and hue-boundary cases plus malformed entries. */
export const FIXED_BLEND_CASES: readonly (readonly unknown[])[] = [
  [], ['#000000'], ['#ffffff'], ['#808080'], ['#ff0000', '#00ff00', '#0000ff'],
  ['#ff0000', '#ff00ff'], ['#ff0000', '#0000ff'], ['#ff0000', '#00ffff'], ['#00ff00', '#ffff00'],
  ['#123456', '#654321'], ['#000000', '#ffffff'], ['#7f7f7f', '#808080', '#818181'],
  ['#fff', '#000'], ['ff0000', 'FF0000'], ['#ff0000', 'zzzzzz'], ['#ff0000', ''], ['-f0000', '#00ff00'],
  ['#ff0000', null], ['#ff0000', undefined], ['#ff0000', 42], [' #ff0000'], ['#ff8800', '#00ff88'],
  ['#8800ff', '#ff0088', '#00ff44', '#222222'], ['abcdef'],
];

export function randomColor(next: () => number): string {
  const length = pick(next, [3, 6, 6, 6, 6]);
  const hex = randomText(next, length, HEX_DIGITS);
  return pick(next, [hex, '#' + hex, hex.toUpperCase(), '#' + hex.toUpperCase()]);
}

/** Label text that never throws (Object.create(null) cannot be String()-ed). */
export function show(value: unknown): string {
  try { return typeof value === 'string' ? JSON.stringify(value) : String(value); } catch { return '<unprintable>'; }
}

/** Labelled suite run by every implementation; labels make any mismatch readable. */
export function runSuite(api: ColorApi): [string, Outcome][] {
  const rows: [string, Outcome][] = [];
  const next = lcg(20261011);
  for (const hex of HEX_SAMPLES) {
    rows.push([`hexToRgba(${show(hex)}) arity1`, api.hexToRgba(hex)]);
    ALPHA_SAMPLES.forEach((alpha, index) => rows.push([`hexToRgba(${show(hex)}, alpha#${index})`, api.hexToRgba(hex, alpha)]));
    rows.push([`hexToRgba(${show(hex)}, undefined explicit)`, api.hexToRgba(hex, undefined)]);
    rows.push([`hexToRgb(${show(hex)})`, api.hexToRgb(hex)]);
  }
  for (let value = 0; value < 4096; value++) {
    const hex = value.toString(16).padStart(3, '0');
    rows.push([`hexToRgb(#${hex})`, api.hexToRgb('#' + hex)]);
    rows.push([`hexToRgb(${hex})`, api.hexToRgb(hex)]);
  }
  for (let index = 0; index < 2000; index++) {
    const text = randomText(next, pick(next, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), MIXED_CHARS);
    rows.push([`hexToRgb(random#${index} ${JSON.stringify(text)})`, api.hexToRgb(text)]);
  }
  FIXED_BLEND_CASES.forEach((colors, index) => rows.push([`blendColors(fixed#${index})`, api.blendColors(colors)]));
  for (let index = 0; index < 1200; index++) {
    const colors = Array.from({ length: pick(next, [1, 2, 3, 4, 5, 6, 7]) }, () => randomColor(next));
    rows.push([`blendColors(random#${index} ${colors.join(',')})`, api.blendColors(colors)]);
  }
  for (const bad of [null, undefined, 'abc', 5, {}]) rows.push([`blendColors(non-array ${show(bad)})`, api.blendColors(bad)]);
  rows.push(['blendColors(sparse hole)', api.blendColors([, '#ff0000'])]);
  return rows;
}
