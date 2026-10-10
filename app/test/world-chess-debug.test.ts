import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 单元格类型 } from '../src/game/world/constants';
import { collectInventoryPieceClasses, collectRoomPieces, debugPrintPuzzleAnswer, findPlayerChessRoom, grantDebugTool, printChessSolution } from '../src/game/world/chess-debug';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['调试_输出当前谜题答案', '获取当前玩家棋盘房间', '收集房间内棋子', '收集背包棋子类', '_打印棋盘方案到控制台', 'db'];
const GLOBALS = ['单元格类型'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

// _棋子难度值 and _求解棋盘布局 belong to packet t10-chess-solver: both realms use the same logged stubs.
const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(r() * list.length)];
  class 棋子 { constructor(o) { this.堆叠数量 = pick([1, 1, 1, 2, 3, 0, -2, 2.7, '2', undefined]); this.图标 = pick(['♜', '', undefined]); } }
  class 国际象棋车 extends 棋子 {} class 中国象棋炮 extends 棋子 {} class 国际象棋马 extends 棋子 {} class 皇后 extends 棋子 {}
  const kinds = [国际象棋车, 中国象棋炮, 国际象棋马, 皇后];
  class 调试工具 { constructor(o) { this.o = o; calls.push(['debug-tool', o]); } }
  const strip = v => JSON.parse(JSON.stringify(v, (k, x) => typeof x === 'function' ? 'fn:' + x.name : x === undefined ? 'undef' : x));
  const name = v => typeof v === 'function' ? v.name : v?.constructor?.name;
  Object.assign(globalThis, { 棋子, 调试工具,
    _棋子难度值: v => { const out = { 国际象棋车: 4, 中国象棋炮: 3.6, 国际象棋马: 2.2 }[name(v)] ?? 1; calls.push(['difficulty', name(v), out]); return out; },
    _求解棋盘布局: (w, h, classes, timeout) => { calls.push(['solve', w, h, classes.map(name), timeout]);
      return { 成功: r() < 0.7, 放置: classes.map(c => ({ 类: c, x: Math.floor(r() * w), y: Math.floor(r() * h), 图标: pick(['♜', '', undefined]), 名称: c.name })), 宽: w, 高: h }; },
    尝试收集物品: (item, silent) => { calls.push(['collect', name(item), silent]); return true; },
    console: { warn: m => calls.push(['warn', m]), table: rows => calls.push(['table', rows]), log: m => calls.push(['log', m]) } });
  for (const fname of ['获取当前玩家棋盘房间', '收集房间内棋子', '收集背包棋子类']) { const orig = globalThis[fname]; globalThis[fname] = (...a) => { calls.push(['call', fname, ...a.map(v => v && typeof v === 'object' ? v.id : v)]); return orig(...a); }; }
  for (let session = 0; session < 4; session++) {
    地牢 = Array.from({ length: 7 }, (_, y) => r() < 0.04 ? undefined : Array.from({ length: 7 }, (_, x) => r() < 0.04 ? null : ({ x, y,
      类型: pick([单元格类型.物品, 单元格类型.物品, null]), 关联物品: r() < 0.4 ? new (pick(kinds))() : r() < 0.1 ? { 堆叠数量: 1 } : null })));
    const ids = pick([[0, 1, 2], [2, 0, 1], ['1', 0, 5]]);
    房间列表 = [0, 1, 2].map(i => ({ id: ids[i], 类型: pick(['隐藏解谜棋盘', '隐藏解谜棋盘', '房间', '隐藏推箱子房间']), x: pick([0, 1, 2]), y: pick([0, 1]), w: pick([2, 3, 4]), h: pick([2, 3, 4]),
      棋子数量: pick([undefined, 0, 2, 4, 9]) }));
    房间地图 = r() < 0.05 ? undefined : Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => pick([-1, 0, 1, 2, 2, 5, null, undefined])));
    玩家 = r() < 0.05 ? undefined : { x: pick([0, 2, 4, 9]), y: pick([0, 3, 5, 9]) };
    const k = r();
    const items = [0, 1, 2, 3, 4].map(() => r() < 0.6 ? new (pick(kinds))() : { id: 'misc', 堆叠数量: 3 });
    玩家背包 = k < 0.5 ? new Map(items.map((it, i) => [i, it])) : k < 0.7 ? Object.fromEntries(items.map((it, i) => ['k' + i, r() < 0.5 ? { value: it } : it])) : k < 0.8 ? null : new Map();
    开发者模式 = false;
    for (let step = 0; step < 4; step++) {
      const op = pick(['answer', 'answer', 'answer', 'room', 'inventory', 'print', 'db']);
      try {
        if (op === 'answer') results.push([op, strip(调试_输出当前谜题答案(pick([undefined, {}, { 打印网格: false }, { 打印明细: false, 超时毫秒: 50 }, null])))]);
        else if (op === 'room') { const info = 获取当前玩家棋盘房间(); results.push([op, info, info.房间 ? 收集房间内棋子(info.房间).length : -1]); }
        else if (op === 'inventory') results.push([op, 收集背包棋子类(pick([undefined, Infinity, 0, 1, 2.9, -1, 5, NaN])).map(name)]);
        else if (op === 'print') results.push([op, _打印棋盘方案到控制台(null, { 宽: pick([1, 3]), 高: pick([1, 2]), 放置: [{ x: 0, y: 0, 图标: pick(['♜', '']) }] })]);
        else results.push([op, db(), 开发者模式]);
      } catch (error) { results.push(['throw', op, error.constructor.name]); }
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
  const context = vm.createContext({ calls: [], results: [], S: state, 单元格类型 }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const isChessPiece = (item: unknown) => item instanceof g<abstract new () => unknown>('棋子');
  const konsole = () => g<{ warn(m: string): void; table(r: unknown): void; log(m: string): void }>('console');
  Object.assign(context, {
    获取当前玩家棋盘房间: () => findPlayerChessRoom(state),
    收集房间内棋子: (room: unknown) => collectRoomPieces(state, isChessPiece, room),
    收集背包棋子类: (...args: [number?]) => collectInventoryPieceClasses(state, { isChessPiece, difficulty: fn('_棋子难度值') }, ...args),
    _打印棋盘方案到控制台: (room: unknown, solution: never) => printChessSolution((line) => konsole().log(line), room, solution),
    调试_输出当前谜题答案: (...args: unknown[]) => debugPrintPuzzleAnswer({
      findRoom: fn('获取当前玩家棋盘房间'), collectRoomPieces: fn('收集房间内棋子'), collectInventoryClasses: fn('收集背包棋子类'), difficulty: fn('_棋子难度值'),
      solve: fn('_求解棋盘布局'), printSolution: fn('_打印棋盘方案到控制台'), warn: (m) => konsole().warn(m), table: (rows) => konsole().table(rows),
    }, ...args),
    db: () => grantDebugTool(state, { createDebugTool: (o) => new (g<new (o: unknown) => unknown>('调试工具'))(o), tryCollect: fn('尝试收集物品') }),
  });
  new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  return g<Record<string, unknown>>(`with (S) { ${final} }; final`);
}

describe('chess puzzle debug helpers (调试_输出当前谜题答案 and helpers)', () => {
  it('matches the source over 1000 seeded sessions', () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 1000; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) bump(call[0] === 'warn' ? `warn:${String(call[1]).slice(0, 4)}` : String(call[0]));
      for (const entry of source.results as unknown[][]) bump(entry[0] === 'answer' ? `answer:${String((entry[1] as { 成功?: boolean })?.成功)}` : String(entry[0]) + (entry[0] === 'throw' ? String(entry[1]) : ''));
    }
    for (const key of ['answer:true', 'answer:false', 'solve', 'difficulty', 'table', 'log', 'debug-tool', 'collect', 'warn:可用棋子', 'warn:未在时限', 'warn:玩家不在', 'warn:当前房间', 'warn:房间不存', 'warn:缺少全局',
      'room', 'inventory', 'print', 'throwanswer']) expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
