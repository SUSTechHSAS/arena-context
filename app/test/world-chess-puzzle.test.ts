import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 单元格类型 } from '../src/game/world/constants';
import { checkChessPuzzle, completeChessPuzzle, type ChessPuzzlePorts } from '../src/game/world/chess-puzzle';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['检查解谜是否成功', '解谜成功'];
const GLOBALS = ['单元格类型'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(r() * list.length)];
  let uid = 0;
  class 棋子 {
    constructor() { this.id = ++uid; this.堆叠数量 = pick([1, 1, 1, 2]); }
    可攻击位置(x, y, board) {
      const out = [1, 2, 3].filter(() => r() < 0.4).map(() => ({ x: pick([0, 1, 2, x]), y: pick([0, 1, 2, y]) }));
      calls.push(['attacks', this.id, x, y, board.length, board[0] && board[0].length, board.flat().filter(v => v !== 0).map(v => v.id), out]);
      return out;
    }
  }
  class RewardA { constructor(o) { this.o = o; calls.push(['reward-new', o]); } }
  const stub = name => (...a) => { calls.push([name, ...a.map(v => v && typeof v === 'object' ? (v.id ?? v.constructor.name) : v)]); };
  Object.assign(globalThis, { 棋子, RewardA, window: globalThis, ...Object.fromEntries(['显示通知', '生成奖励', '绘制', '放置物品到房间'].map(name => [name, stub(name)])) });
  for (let session = 0; session < 4; session++) {
    地牢 = Array.from({ length: 6 }, (_, y) => Array.from({ length: 6 }, (_, x) => ({ x, y, 类型: r() < 0.5 ? 单元格类型.物品 : pick([null, 单元格类型.怪物]),
      关联物品: r() < 0.35 ? new 棋子() : r() < 0.2 ? { id: 'other' } : null })));
    const ids = pick([[0, 1, 2], [2, 0, 1], [1, 2, 0]]);
    房间列表 = [0, 1, 2].map(i => ({ id: ids[i], 类型: pick(['隐藏解谜棋盘', '隐藏解谜棋盘', '房间']), x: pick([0, 1, 2]), y: pick([0, 1]), w: pick([2, 3, 4]), h: pick([2, 3, 4]),
      自定义奖励: pick([undefined, [], [{ 类名: 'RewardA', 配置: { n: 1 } }, { 类名: 'Missing' }, { 类名: 'RewardA' }]]) }));
    房间地图 = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => pick([-1, 0, 1, 2, 2, 5])));
    玩家 = { x: pick([0, 2, 4]), y: pick([0, 3, 5, 7]) };
    for (let step = 0; step < 3; step++) {
      try { results.push(['check', 检查解谜是否成功(pick([0, 1, 2, 3, undefined]))]); } catch (error) { results.push(['throw', error.constructor.name]); }
      if (r() < 0.2) try { results.push(['solve', 解谜成功(pick(房间列表))]); } catch (error) { results.push(['throw-solve', error.constructor.name]); }
    }
    results.push(地牢);
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
  const context = vm.createContext({ calls: [], results: [], S: state, 单元格类型 }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const ports: ChessPuzzlePorts = {
    isChessPiece: (item) => item instanceof g<abstract new () => unknown>('棋子'),
    lookupClass: (name) => g<Record<string, new (o: unknown) => unknown>>('window')[name as string], placeItemInRoom: fn('放置物品到房间'),
    generateReward: fn('生成奖励'), notify: fn('显示通知'), draw: fn('绘制'),
  };
  Object.assign(context, {
    检查解谜是否成功: (count: unknown) => checkChessPuzzle(state, { ...ports, onSolved: fn('解谜成功') }, count),
    解谜成功: (room: unknown) => completeChessPuzzle(state, ports, room),
  });
  new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  return g<Record<string, unknown>>(`with (S) { ${final} }; final`);
}

describe('chess puzzle completion (检查解谜是否成功, 解谜成功)', () => {
  it('matches the source over 800 seeded sessions', () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 800; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) bump(String(call[0]));
      for (const entry of source.results as unknown[][]) if (typeof entry[0] === 'string') bump(`${entry[0]}:${String(entry[1])}`);
    }
    for (const key of ['check:true', 'check:false', 'throw:TypeError', 'solve:undefined', 'attacks', 'reward-new', '生成奖励', '显示通知', '绘制', '放置物品到房间'])
      expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
