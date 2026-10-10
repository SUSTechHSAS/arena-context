import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { checkQEasterEgg, triggerQEasterEgg } from '../src/game/world/easter-eggs';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['检查Q字形彩蛋', '触发Q字形彩蛋'];
const GLOBALS = ['Q字形图案'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(r() * list.length)];
  const timers = [];
  class 时空罗盘 { constructor(o) { this.o = o; calls.push(['compass', o]); } }
  const stub = name => (...a) => { calls.push([name, ...a.map(v => v instanceof 时空罗盘 ? 'compass' : v)]); };
  Object.assign(globalThis, { 时空罗盘, setTimeout: (f, ms) => { calls.push(['timeout', ms]); timers.push(f); },
    尝试收集物品: (...a) => { const out = pick([true, false, 1, 0]); calls.push(['collect', a[1], out]); return out; },
    计划显示格子特效: stub('计划显示格子特效'), 显示通知: stub('显示通知') });
  const Q = [' XXXX ', 'X    X', 'X    X', 'X    X', 'X  XX ', ' XXX X'];
  const item = () => ({ 能否拾起: pick([true, true, undefined, false]) });
  for (let session = 0; session < 4; session++) {
    地牢大小 = pick([9, 9, 7]); 彩蛋1触发 = pick([undefined, false, false, true]);
    地牢 = Array.from({ length: 9 }, (_, y) => r() < 0.02 ? undefined : Array.from({ length: 9 }, (_, x) => r() < 0.02 ? null : ({ x, y,
      关联物品: r() < 0.25 ? item() : r() < 0.01 ? undefined : null })));
    const ox = pick([0, 1, 2, 3]); const oy = pick([0, 1, 2, 3]);
    if (r() < 0.7) for (let rr = 0; rr < 6; rr++) for (let c = 0; c < 6; c++) { const cell = 地牢[oy + rr]?.[ox + c]; if (cell) cell.关联物品 = Q[rr][c] === 'X' ? { 能否拾起: r() < 0.97 ? true : false } : r() < 0.03 ? item() : null; }
    for (let step = 0; step < 4; step++) {
      const xs = []; for (let rr = 0; rr < 6; rr++) for (let c = 0; c < 6; c++) if (Q[rr][c] === 'X') xs.push([ox + c, oy + rr]);
      const [dx, dy] = r() < 0.7 ? pick(xs) : [pick([-1, 0, 4, 8, 9]), pick([0, 3, 8])];
      try { results.push(['check', 检查Q字形彩蛋(dx, dy), 彩蛋1触发]); } catch (error) { results.push(['throw', error.constructor.name]); }
      while (timers.length) timers.shift()();
    }
  }
`;

const final = 'globalThis.final = { results, calls }';

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${[...new Set([...GLOBALS, ...FUNCTIONS].map(name => declaration(name)))].join('\n')}`).runInContext(context);
  new vm.Script(scenario(seed)).runInContext(context);
  return new vm.Script(`${final}; final`).runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  Object.assign(context, {
    检查Q字形彩蛋: (x: number, y: number) => checkQEasterEgg(state, { trigger: fn('触发Q字形彩蛋') }, x, y),
    触发Q字形彩蛋: (cells: { x: number; y: number }[]) => triggerQEasterEgg(state, {
      schedule: fn('setTimeout'), createCompass: (o) => new (g<new (o: unknown) => unknown>('时空罗盘'))(o), tryCollect: fn('尝试收集物品'),
      scheduleCellEffect: fn('计划显示格子特效'), notify: fn('显示通知'),
    }, cells),
  });
  new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  return g<Record<string, unknown>>(`with (S) { ${final} }; final`);
}

describe('Q easter egg (检查Q字形彩蛋, 触发Q字形彩蛋)', () => {
  it('matches the source over 1000 seeded sessions', () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 1000; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) bump(String(call[0]));
      for (const entry of source.results as unknown[][]) bump(`${String(entry[0])}:${String(entry[2] ?? entry[1])}`);
    }
    for (const key of ['timeout', 'compass', 'collect', '计划显示格子特效', '显示通知', 'check:true', 'check:false', 'throw:TypeError']) expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
