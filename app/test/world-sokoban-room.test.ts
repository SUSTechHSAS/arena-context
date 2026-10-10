import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 单元格类型 } from '../src/game/world/constants';
import { generateSokobanRoom, type SokobanRoomPorts } from '../src/game/world/theme-rooms';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['生成推箱子谜题'];
const GLOBALS = ['单元格类型', 'isSifting', '地牢'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(r() * list.length)];
  class 推箱子目标 { constructor(...a) { calls.push(['new-target', a.length]); } }
  class 推箱子箱子 { constructor(...a) { calls.push(['new-box', a.length]); } }
  const level = (w, h, mode) => ({ board: Array.from({ length: mode === 'short' ? h - 1 : h }, () => Array.from({ length: w }, () => pick(['wall', 'floor', 'floor']))),
    targets: Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({ x: Math.floor(r() * w), y: Math.floor(r() * h) })),
    boxes: Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({ x: Math.floor(r() * w), y: Math.floor(r() * h) })) });
  class 推箱子关卡生成器 {
    constructor(...a) { calls.push(['generator', ...a]); if (r() < 0.05) throw new URIError('ctor'); this.w = a[0]; this.h = a[1]; }
    生成关卡(...a) {
      calls.push(['generate', ...a]);
      const outcome = pick(['ok', 'ok', 'ok', 'short', 'null', 'fail', 'nolevel', 'throw', 'reject', 'sync']);
      if (outcome === 'throw') throw new RangeError('solver');
      if (outcome === 'reject') return Promise.reject(new SyntaxError('async solver'));
      const value = outcome === 'null' ? null : outcome === 'fail' ? { 成功: false, 关卡: level(this.w, this.h) }
        : outcome === 'nolevel' ? { 成功: 1 } : { 成功: true, 关卡: level(this.w, this.h, outcome) };
      return outcome === 'sync' ? value : Promise.resolve(value);
    }
  }
  Object.assign(globalThis, { 推箱子目标, 推箱子箱子, 推箱子关卡生成器,
    清空房间内容: room => { calls.push(['clear', room.id]); if (r() < 0.04) throw new TypeError('clear'); },
    生成罐子房间内容: room => calls.push(['jars', room.id, room.类型]),
    添加日志: (...a) => calls.push(['log', ...a]),
    生成墙壁: () => calls.push(['walls', 地牢.flat().filter(cell => cell.背景类型 === 单元格类型.墙壁).length]),
    放置物品到单元格: (item, x, y) => { calls.push(['place', item.constructor.name, x, y]); if (r() < 0.03) throw new EvalError('place'); },
    显示通知: (...a) => calls.push(['notify', ...a]),
    console: { error: (message, error) => calls.push(['error', message, error?.constructor?.name, error?.message]) },
  });
  const size = 14;
  地牢 = Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => ({ x, y, 背景类型: 单元格类型.房间 })));
  globalThis.done = (async () => {
    for (let step = 0; step < 5; step++) {
      isSifting = r() < 0.1 ? pick([1, 'yes']) : false;
      const room = r() < 0.05 ? pick([null, undefined, 0]) : { id: step, 类型: '房间', x: Math.floor(r() * 12) - 2, y: Math.floor(r() * 12) - 2, w: 3 + Math.floor(r() * 7), h: 3 + Math.floor(r() * 7) };
      const args = pick([[room], [room], [room, false], [room, true], [room, 0], [room, '']]);
      const promise = 生成推箱子谜题(...args);
      results.push(['thenable', typeof promise.then]);
      try { results.push(['ok', await promise, room]); } catch (error) { results.push(['rejected', error.constructor.name, error.message, room]); }
    }
    globalThis.final = { results, calls, 地牢 };
  })();
`;

async function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script([...new Set([...GLOBALS, ...FUNCTIONS].map(name => declaration(name)))].join('\n')).runInContext(context);
  new vm.Script(scenario(seed)).runInContext(context);
  await new vm.Script('done').runInContext(context);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

async function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state, 单元格类型 });
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const ports: SokobanRoomPorts = {
    clearRoom: fn('清空房间内容'), isSifting: () => g('isSifting'), generateJarRoom: fn('生成罐子房间内容'), log: fn('添加日志'),
    createGenerator: (...args) => new (g<new (...a: unknown[]) => { 生成关卡(n: number): unknown }>('推箱子关卡生成器'))(...args),
    generateWalls: fn('生成墙壁'), placeItemAt: fn('放置物品到单元格'),
    catalog: { get 推箱子目标() { return g('推箱子目标'); }, get 推箱子箱子() { return g('推箱子箱子'); } } as SokobanRoomPorts['catalog'],
    diagnostic: (message, error) => { g<{ error(...a: unknown[]): void }>('console').error(message, error); },
    notify: fn('显示通知'),
  };
  Object.assign(context, { isSifting: false, 生成推箱子谜题: (...args: [unknown, unknown?]) => generateSokobanRoom(state, ports, ...args) });
  new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  await g<Promise<void>>('done');
  return g<Record<string, unknown>>('final');
}

describe('sokoban room (生成推箱子谜题)', () => {
  it('matches the source over 400 seeded runs', async () => {
    const tally: Record<string, number> = { built: 0, fallbackSmall: 0, failure: 0, rejected: 0, shortBoard: 0, walls: 0 };
    for (let seed = 1; seed <= 400; seed++) {
      const source = await sourceRun(seed); const mine = await rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      const calls = source.calls as unknown[][];
      tally.built! += calls.filter(call => call[0] === 'log' && call[1] === '古老的谜题形成了！').length;
      tally.failure! += calls.filter(call => call[0] === 'notify').length;
      tally.shortBoard! += calls.filter(call => call[0] === 'error' && call[2] === 'TypeError').length;
      tally.walls! += calls.filter(call => call[0] === 'walls').length;
      tally.fallbackSmall! += calls.filter((call, i) => call[0] === 'jars' && calls[i - 1]?.[0] === 'clear').length;
      tally.rejected! += (source.results as unknown[][]).filter(entry => entry[0] === 'rejected').length;
    }
    for (const [key, count] of Object.entries(tally)) expect(count, key).toBeGreaterThan(5);
  });
});
