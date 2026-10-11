import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { createColorMath, type ColorMath } from '../src/domain/color-math';
import {
  candidateColorApi, originalColorApi, runSuite, type ColorApi, type Outcome,
} from './oracle/color-math-fixture';

/** Object.is per element, so -0 and 0 or NaN payloads are not conflated. */
function same(first: unknown, second: unknown): boolean {
  if (Array.isArray(first) && Array.isArray(second)) {
    return first.length === second.length && first.every((value, index) => same(value, second[index]));
  }
  return Object.is(first, second);
}

function describeOutcome(value: Outcome): string {
  return 'value' in value ? JSON.stringify(value.value) ?? String(value.value) : `${value.error}: ${value.message}`;
}

/** Labels of every suite row (optionally a subset by label) whose outcome differs from the original. */
function mismatches(expected: [string, Outcome][], api: ColorApi, include: (label: string) => boolean = () => true): string[] {
  const actual = runSuite(api);
  expect(actual.length).toBe(expected.length);
  return expected.flatMap(([label, want], index) => {
    if (!include(label)) return [];
    const got = actual[index]![1];
    const equal = 'value' in want
      ? 'value' in got && same(want.value, got.value)
      : 'error' in got && got.error === want.error && got.message === want.message;
    return equal ? [] : [`${label}: original ${describeOutcome(want)} != candidate ${describeOutcome(got)}`];
  });
}

/** Builds a deliberately mutated copy of the candidate; the tracked source is never edited. */
function mutantApi(search: string, replace: string): ColorApi {
  const source = readFileSync(new URL('../src/domain/color-math.ts', import.meta.url), 'utf8');
  expect(source.split(search).length - 1, search).toBe(1);
  const { outputText } = ts.transpileModule(source.replace(search, replace), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const context = vm.createContext({ exports: {} });
  new vm.Script(outputText).runInContext(context);
  return candidateColorApi((context.exports as { createColorMath: () => ColorMath }).createColorMath());
}

let cachedExpected: [string, Outcome][] | undefined;
function expectedRows(): [string, Outcome][] {
  cachedExpected ??= runSuite(originalColorApi());
  return cachedExpected;
}

describe('exact-source colour helpers (ChineseDungeon.html hexToRgba, hexToRgb, blendColors)', () => {
  const candidate = candidateColorApi(createColorMath());

  it('hexToRgba matches the original for every input form, alpha value and call arity', () => {
    expect(mismatches(expectedRows(), candidate, label => label.startsWith('hexToRgba('))).toEqual([]);
  });

  it('hexToRgb matches the original for all 4096 three-digit colours (with and without #), random and malformed strings, and non-strings', () => {
    expect(mismatches(expectedRows(), candidate, label => label.startsWith('hexToRgb('))).toEqual([]);
  });

  it('blendColors matches the original for empty, fixed hue-boundary, seeded random, and malformed inputs', () => {
    expect(mismatches(expectedRows(), candidate, label => label.startsWith('blendColors('))).toEqual([]);
  });

  it('the complete suite (every helper) has zero mismatches', () => {
    expect(mismatches(expectedRows(), candidate)).toEqual([]);
  });

  it('records the observed source quirks as explicit expectations (not repaired)', () => {
    const original = originalColorApi();
    const quirks: [Outcome, Outcome][] = [
      [candidate.hexToRgba('#ff0000'), { value: 'rgb(NaN, 240, 0)' }],
      [candidate.hexToRgba('ff0000', 0), { value: 'rgb(255, 0, 0)' }],
      [candidate.hexToRgba('ff0000', 0.3), { value: 'rgba(255, 0, 0, 0.3)' }],
      [candidate.hexToRgb('abc'), { value: [170, 187, 204] }],
      [candidate.hexToRgb('ab'), { value: [0, 0, 171] }],
      [candidate.blendColors([]), { value: '#000000' }],
      [candidate.blendColors(['#ff0000']), { value: '#ff0000' }],
    ];
    for (const [got, want] of quirks) expect(got).toEqual(want);
    for (const [got, want] of [
      [candidate.hexToRgba('#ff0000'), original.hexToRgba('#ff0000')],
      [candidate.hexToRgba('ff0000', 0), original.hexToRgba('ff0000', 0)],
      [candidate.hexToRgb('-f0000'), original.hexToRgb('-f0000')],
    ] as const) expect(got).toEqual(want);
  });

  it('blendColors rejects the same non-array and malformed inputs as the original (error name and message)', () => {
    for (const bad of [null, undefined, 'ff0000', 5, {}]) {
      const got = candidate.blendColors(bad);
      expect(got).toEqual(originalColorApi().blendColors(bad));
      expect('error' in got).toBe(true);
    }
    expect(candidate.blendColors([null])).toEqual(originalColorApi().blendColors([null]));
  });
});

describe('the differential suite detects meaningful boundary and ordering mutants', () => {
  const mutants: [string, string, string][] = [
    ['hexToRgb length boundary', 'if (hex.length === 3) {', 'if (hex.length <= 3) {'],
    ['hexToRgba alpha truthiness', 'if (alpha) {', 'if (alpha !== undefined) {'],
    ['hslToRgb rounding', 'return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];',
      'return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];'],
    ['rgbToHsl hue-wrap ordering', '(g < b ? 6 : 0)', '(g > b ? 6 : 0)'],
  ];

  it.each(mutants)('%s is killed', (_name, search, replace) => {
    const killed = mismatches(expectedRows(), mutantApi(search, replace));
    expect(killed.length).toBeGreaterThan(0);
  });
});
