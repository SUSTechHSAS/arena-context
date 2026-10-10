import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createGrid, deepClone, getWallGlyph, isObject } from '../src/game/world/helpers';
import { createOracle, readSource } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const snap = (value: unknown, names: Record<string, string> = {}) => JSON.stringify(graphSnapshot(value, names));

/** Tricky inputs; evaluated in this realm for the rewrite and in the oracle realm for the source. */
const BUILD_CASES = `(() => {
  class Thing { constructor() { this.a = 1; this.self = this; } get g() { return 5; } }
  const shared = { s: 1 };
  const cyc = { name: 'c' }; cyc.me = cyc; cyc.list = [cyc, shared, shared];
  const arr = [1, , 3]; arr.extra = 'x';
  const tail = [1, 2, , ];
  const sparse = []; sparse[5] = 'five';
  const keyObj = { k: 1 };
  const m = new Map([[keyObj, { v: shared }], ['s', [1, 2]], [NaN, -0]]);
  const st = new Set([shared, { z: 1 }, 3, shared]);
  const nullProto = Object.create(null); nullProto.q = [1];
  const withGetter = {}; Object.defineProperty(withGetter, 'own', { get() { return [9]; }, enumerable: true });
  Object.defineProperty(withGetter, 'hidden', { value: 1, enumerable: false }); withGetter[Symbol('s')] = 1;
  const inherited = Object.create({ inheritedKey: 1 }); inherited.own = 2;
  const numericKeys = { 2: 'b', 1: 'a', z: 0, [-1]: 'neg' };
  return [cyc, arr, tail, sparse, m, st, nullProto, withGetter, inherited, new Thing(), numericKeys,
    { m, st, keyObj }, { shared, again: shared }, [m, m], 0, -0, NaN, Infinity, 'str', null, undefined, Symbol.for('x'), 10n];
})()`;

describe('deepClone and isObject', () => {
  const oracle = createOracle(['isObject', 'deepClone']);
  it('per-case and whole-graph clones match the source (aliases, cycles, holes, keys, prototypes)', () => {
    const mineCases = vm.runInThisContext(BUILD_CASES) as unknown[];
    oracle.context.__cases = oracle.evaluate(BUILD_CASES);
    const sourceCases = oracle.evaluate<unknown[]>('__cases');
    expect(mineCases.length).toBe(sourceCases.length);
    mineCases.forEach((value, index) => {
      expect(snap(deepClone(value)), `case ${index}`).toBe(snap(oracle.evaluate(`deepClone(__cases[${index}])`)));
      expect(isObject(value)).toBe(oracle.evaluate(`isObject(__cases[${index}])`));
    });
    expect(snap(deepClone(mineCases))).toBe(snap(oracle.evaluate('deepClone(__cases)')));
    // Trailing hole really shortens the clone in both implementations.
    expect((deepClone(mineCases[2]) as unknown[]).length).toBe(2);
    expect(oracle.evaluate('deepClone(__cases[2]).length')).toBe(2);
  });
  it('Map keys stay shared, clones are fresh, functions pass through, Dates copy by time', () => {
    const mineCases = vm.runInThisContext(BUILD_CASES) as unknown[];
    const mineMap = mineCases[4] as Map<unknown, unknown>; const cloned = deepClone(mineMap);
    expect(cloned).not.toBe(mineMap); expect([...cloned.keys()][0]).toBe([...mineMap.keys()][0]);
    expect(cloned.get([...mineMap.keys()][0])).not.toBe(mineMap.get([...mineMap.keys()][0]));
    expect(oracle.evaluate('(() => { const c = deepClone(__cases[4]); const k = [...__cases[4].keys()][0]; return [c !== __cases[4], [...c.keys()][0] === k, c.get(k) !== __cases[4].get(k)]; })()')).toEqual([true, true, true]);
    const fn = () => 1; const holder = { fn };
    expect(deepClone(fn)).toBe(fn); expect(deepClone(holder).fn).toBe(fn);
    expect(oracle.evaluate('(() => { const f = () => 1; return [deepClone(f) === f, deepClone({ f }).f === f, isObject(f)]; })()')).toEqual([true, true, false]);
    const date = new Date(123456); const copy = deepClone({ date }).date;
    expect(copy).not.toBe(date); expect(copy.getTime()).toBe(123456);
    expect(oracle.evaluate('(() => { const d = new Date(123456); const c = deepClone({ d }).d; return [c !== d, c.getTime()]; })()')).toEqual([true, 123456]);
  });
});

describe('获取墙壁字符 and grid creation', () => {
  it('wall glyphs match for every cell of 300 seeded grids, explicit and default grid argument', () => {
    const oracle = createOracle(['单元格类型', '地牢大小', '地牢', '获取墙壁字符']);
    let seed = 7; const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    let checks = 0; const glyphs = new Set<string>();
    for (let round = 0; round < 300; round++) {
      const size = 1 + Math.floor(next() * 8);
      const grid = Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => ({ x, y, 背景类型: next() < 0.55 ? 0 : 1 + Math.floor(next() * 3) })));
      oracle.context.__grid = grid; oracle.evaluate(`地牢大小 = ${size}; 地牢 = __grid;`);
      for (const row of grid) for (const cell of row) {
        const mine = getWallGlyph(cell, grid, size);
        expect(mine).toBe(oracle.evaluate(`获取墙壁字符(__grid[${cell.y}][${cell.x}], __grid)`));
        expect(mine).toBe(oracle.evaluate(`获取墙壁字符(__grid[${cell.y}][${cell.x}])`));
        glyphs.add(mine); checks++;
      }
    }
    expect(checks).toBeGreaterThan(4000);
    expect(glyphs.size).toBe(12); // '#', 3 straight, 4 corners, 4 tees and the cross all occur ('─'/'│' shared)
  });
  it('createGrid equals the source grid idiom (exact statement text from the page)', () => {
    const { text } = readSource();
    const statement = '地牢 = Array(地牢大小).fill().map((_, y) => Array(地牢大小).fill().map((_, x) => new 单元格(x, y)));';
    expect(text.includes(statement)).toBe(true);
    for (const size of [0, 1, 3, 10]) {
      const oracle = createOracle(['单元格类型', '颜色表', '单元格', '地牢大小', '地牢']);
      oracle.evaluate(`地牢大小 = ${size}; ${statement}`);
      expect(snap(createGrid(size), { GameCell: '单元格' })).toBe(snap(oracle.evaluate('地牢')));
    }
  });
});
