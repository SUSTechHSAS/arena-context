import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 单元格类型 } from '../src/game/world/constants';
import { generateRedBluePuzzle, type RedBluePuzzlePorts } from '../src/game/world/red-blue-puzzle';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['生成红蓝开关谜题'];
const GLOBALS = ['prng', '单元格类型'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  const N = 12;
  class 红蓝开关 { constructor(o) { calls.push(['switch-new', o]); } }
  class 蓝砖块 { constructor(o) { calls.push(['blue', o]); } }
  class 红砖块 { constructor(o) { calls.push(['red', o]); } }
  Object.assign(globalThis, { 红蓝开关, 蓝砖块, 红砖块,
    console: { log: m => calls.push(['log', m]) },
    回溯路径: (x, y, map) => {
      calls.push(['trace', x, y, map === 距离图]);
      const length = pick([0, 8, 19, 20, 26, 34]);
      const path = []; let cx = pick([0, 3, 6]), cy = pick([0, 5, 11]), dir = pick([[1, 0], [0, 1], [-1, 0], [0, -1]]);
      for (let i = 0; i < length; i++) {
        path.push({ x: cx, y: cy });
        if (r() < 0.3) dir = pick([[1, 0], [0, 1], [-1, 0], [0, -1]]);
        cx = Math.max(0, Math.min(N - 1, cx + dir[0])); cy = Math.max(0, Math.min(N - 1, cy + dir[1]));
      }
      return path;
    },
    放置物品到房间: (item, room) => calls.push(['place-room', item.constructor.name, room.id]),
    放置物品到单元格: (item, x, y) => { const ok = r() < 0.8; calls.push(['place-cell', item.constructor.name, x, y, ok]); return ok ? pick([true, 1]) : pick([false, 0]); },
  });
  let 距离图;
  for (let session = 0; session < 3; session++) {
    地牢大小 = N;
    地牢 = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => r() < 0.02 ? null : ({ x, y,
      背景类型: r() < 0.6 ? 单元格类型.走廊 : pick([单元格类型.房间, 单元格类型.墙壁]), 关联物品: r() < 0.03 ? new 红蓝开关({ pre: 1 }) : null })));
    房间地图 = Array.from({ length: N }, () => Array.from({ length: N }, () => pick([-1, -1, 0, 1, 2, 3, 4, 5])));
    房间列表 = Array.from({ length: pick([2, 4, 6]) }, (_, id) => r() < 0.08 ? null : ({ id, 类型: pick(['房间', '房间', '房间', '挑战房间']),
      x: pick([0, 2, 5, 8]), y: pick([0, 3, 6, 8]), w: pick([1, 3, 4]), h: pick([1, 3, 4]) }));
    距离图 = Array.from({ length: N }, (_, y) => r() < 0.02 ? undefined : Array.from({ length: N }, (_, x) => r() < 0.1 ? Infinity : Math.floor(r() * 30)));
    for (let step = 0; step < 3; step++) {
      try { results.push(['ok', 生成红蓝开关谜题(距离图)]); } catch (error) { results.push(['throw', error.constructor.name]); }
    }
    results.push(地牢, 房间列表);
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
  const context = vm.createContext({ calls: [], results: [], S: state, 单元格类型 }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  type Ctor = new (o: object) => unknown;
  const ports: RedBluePuzzlePorts = {
    random: () => g<() => number>('__rand')(), tracePath: fn('回溯路径'), createSwitch: () => new (g<Ctor>('红蓝开关'))({}),
    isSwitch: (item) => item instanceof g<Ctor>('红蓝开关'), brickClasses: () => ({ blue: g<Ctor>('蓝砖块'), red: g<Ctor>('红砖块') }),
    placeItemInRoom: fn('放置物品到房间'), placeItemAt: fn('放置物品到单元格'), log: (m) => g<{ log(m: string): void }>('console').log(m),
  };
  Object.assign(context, { 生成红蓝开关谜题: (map: unknown) => generateRedBluePuzzle(state, ports, map) });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  return g<Record<string, unknown>>(`with (S) { ${final} }; final`);
}

describe('red-blue switch puzzle (生成红蓝开关谜题)', () => {
  it('matches the source over 600 seeded sessions', () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 600; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) bump(String(call[0]) + (call[0] === 'log' ? String(call[1]).slice(0, 6) : ''));
      for (const entry of source.results as unknown[][]) if (entry[0] === 'throw') bump(`throw:${String(entry[1])}`);
    }
    for (const key of ['trace', 'switch-new', 'blue', 'red', 'place-room', 'place-cell', 'log已在房间 u', 'log已在房间 0', 'log已在关键路径', 'throw:TypeError', 'prng'])
      expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
