import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 单元格类型, 环境类型 } from '../src/game/world/constants';
import { generateEnvironment, growEnvironmentCluster } from '../src/game/world/environment';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['全局生成环境', '生成环境簇'];
const GLOBALS = ['prng', '单元格类型', '环境类型'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  class 灌木丛 { constructor(o) { this.o = o; } }
  class 火焰物品 { constructor(o) { this.o = o; } }
  Object.assign(globalThis, { 灌木丛, 火焰物品, 放置物品到单元格: (item, x, y) => {
    calls.push(['place', item.constructor.name, item.o, x, y]); const cell = 地牢[y]?.[x]; if (cell && r() < 0.8) { cell.关联物品 = item; return true; } return false; } });
  const env = () => pick([null, null, null, null, undefined, 环境类型.水, 环境类型.血水, 环境类型.草地, 环境类型.草地, 环境类型.岩浆, 环境类型.冰, false, 0]);
  for (let session = 0; session < 3; session++) {
    地牢大小 = pick([6, 7, 8]); 当前层数 = pick([0, 2, 3, 4]);
    地牢 = Array.from({ length: 地牢大小 }, (_, y) => r() < 0.04 ? undefined : Array.from({ length: 地牢大小 }, (_, x) => r() < 0.03 ? null : ({ x, y,
      背景类型: pick([单元格类型.走廊, 单元格类型.房间, 单元格类型.房间, 单元格类型.墙壁]), 环境: env(),
      关联物品: r() < 0.08 ? { id: 'item' } : null, 关联怪物: r() < 0.06 ? { id: 'monster' } : null })));
    房间列表 = [0, 1, 2, 3].filter(() => r() < 0.85).map(id => ({ id: r() < 0.3 ? String(id) : id, 类型: pick(['房间', '房间', '隐藏推箱子房间']) }));
    房间地图 = Array.from({ length: 地牢大小 }, () => Array.from({ length: 地牢大小 }, () => pick([-1, -1, 0, 1, 2, 3, '0', '1', null])));
    for (let step = 0; step < 3; step++) {
      try {
        if (r() < 0.7) results.push(['global', 全局生成环境()]);
        else results.push(['cluster', 生成环境簇(pick([0, 3, 5, -1, 地牢大小]), pick([0, 2, 4, 9]), env())]);
      } catch (error) { results.push(['throw', error.constructor.name]); }
    }
    results.push(地牢);
  }
`;

const final = 'globalThis.final = { results, calls }';

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${[...new Set([...GLOBALS, ...FUNCTIONS].map(name => declaration(name)))].join('\n')}
    globalThis.__setPrng = f => { prng = f; };`).runInContext(context);
  new vm.Script(scenario(seed).replace('const pick', '__setPrng(rand); const pick')).runInContext(context);
  return new vm.Script(`${final}; final`).runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state, 单元格类型, 环境类型 }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const random = () => g<() => number>('__rand')();
  Object.assign(context, {
    全局生成环境: () => generateEnvironment(state, {
      random, growCluster: fn('生成环境簇'), placeItemAt: fn('放置物品到单元格'),
      createShrub: (o) => new (g<new (o: unknown) => unknown>('灌木丛'))(o), createFire: (o) => new (g<new (o: unknown) => unknown>('火焰物品'))(o),
    }),
    生成环境簇: (x: number, y: number, type: unknown) => growEnvironmentCluster(state, random, x, y, type),
  });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  return g<Record<string, unknown>>(`with (S) { ${final} }; final`);
}

describe('environment generation (全局生成环境, 生成环境簇)', () => {
  it('matches the source over 600 seeded sessions', () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 600; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) bump(call[0] === 'place' ? `place:${String(call[1])}` : String(call[0]));
      for (const entry of source.results as unknown[][]) bump(String(entry[0]));
    }
    for (const key of ['place:灌木丛', 'place:火焰物品', 'global', 'cluster', 'prng']) expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
