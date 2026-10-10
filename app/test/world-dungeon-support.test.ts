import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 单元格类型 } from '../src/game/world/constants';
import { checkSokobanSolved, completeSokobanRoom, computeDistanceMap, lockRooms, placeRandomRecipeScrolls, type SokobanSolvedPorts } from '../src/game/world/dungeon-support';
import { declaration, originalDeclaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['计算距离图', '处理上锁的门', '生成并放置随机配方卷轴', '检查推箱子解谜完成', '解谜成功_推箱子'];
const GLOBALS = ['prng', '单元格类型', '颜色表'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  let recipeId = 0;
  class 推箱子箱子 { constructor(x, y) { this.x = x; this.y = y; } }
  class 推箱子目标 { constructor(x, y) { this.x = x; this.y = y; } }
  class 配方卷轴 { constructor(o) { this.o = o; calls.push(['scroll', o.层数, o.recipeData.说明]); } }
  class RewardA { constructor(o) { this.o = o; calls.push(['reward-new', o]); } }
  const stub = name => (...a) => { calls.push([name, ...a.map(v => v && typeof v === 'object' ? (v.id ?? v.constructor.name) : v)]); };
  Object.assign(globalThis, { 推箱子箱子, 推箱子目标, 配方卷轴, RewardA, window: globalThis,
    ...Object.fromEntries(['显示通知', '生成奖励', '绘制'].map(name => [name, stub(name)])),
    console: { log: m => calls.push(['log', m]), warn: m => calls.push(['warn', m]) },
    生成单个随机融合配方: floor => { calls.push(['recipe', floor]); return r() < 0.7 ? { 说明: 'r' + (++recipeId) } : null; },
    放置物品到房间: (item, room, ...rest) => { const ok = r() < 0.7; calls.push(['place', item.constructor.name, room && room.id, ...rest, ok]); return ok; },
  });
  const setup = () => {
    地牢大小 = pick([6, 6, 5]);
    地牢 = Array.from({ length: 6 }, (_, y) => r() < 0.04 ? undefined : Array.from({ length: 6 }, (_, x) => r() < 0.03 ? null : ({ x, y,
      背景类型: pick([单元格类型.房间, 单元格类型.房间, 单元格类型.走廊, 单元格类型.门, 单元格类型.门, 单元格类型.墙壁, 单元格类型.上锁的门]),
      墙壁: { 上: r() < 0.15, 下: r() < 0.15, 左: r() < 0.15, 右: r() < 0.15 }, 标识: pick([null, null, 'A', 'B', 'C']), 钥匙ID: null, 颜色索引: 6, 类型: pick([null, 单元格类型.物品]),
      关联物品: (k => k < 0.08 ? { 类型: '开关砖' } : k < 0.2 ? new 推箱子箱子(pick([x, x, 0]), y) : k < 0.32 ? new 推箱子目标(x, pick([y, y, 1])) : null)(r()) })));
    房间列表 = Array.from({ length: pick([1, 2, 3, 4, 5, 6, 30, 80]) }, (_, id) => ({ id, 类型: pick(['房间', '房间', '隐藏推箱子房间', '挑战房间']), x: pick([0, 1, 2]), y: pick([0, 1]), w: pick([2, 4]), h: pick([2, 4]),
      门: [[], [{ x: 1, y: 1 }], [{ x: 2, y: 3 }, { x: 4, y: 0 }], [{ x: 9, y: 9 }], [{ x: 3, y: 2 }]][Math.floor(r() * 5)], 解谜已完成: r() < 0.2,
      自定义奖励: pick([undefined, [], [{ 类名: 'RewardA', 配置: { 数量: 2 } }, { 类名: 'Missing' }, { 类名: 'RewardA' }]]) }));
    if (r() < 0.1) 房间列表.splice(1, 0, null);
    上锁房间列表 = r() < 0.3 ? [{ id: 1 }] : [];
    门实例列表 = new Map(['A', 'B'].filter(() => r() < 0.7).map(id => [id, { id, 类型: '门' }]));
  };
  for (let session = 0; session < 3; session++) {
    setup();
    for (let step = 0; step < 4; step++) {
      const op = pick(['dist', 'dist', 'lock', 'recipes', 'check', 'check', 'solve']);
      try {
        if (op === 'dist') results.push(['dist', 计算距离图(pick([0, 2, 3, 5, -1, 6]), pick([0, 2, 4, 5, 6]))]);
        else if (op === 'lock') results.push(['lock', 处理上锁的门()]);
        else if (op === 'recipes') results.push(['recipes', 生成并放置随机配方卷轴(pick([null, -1, 0, 1, 3, '2', undefined]))]);
        else if (op === 'check') results.push(['check', 检查推箱子解谜完成(pick([0, 1, 2, 3, 9, '1']))]);
        else results.push(['solve', 解谜成功_推箱子(pick(房间列表.filter(Boolean)))]);
      } catch (error) { results.push(['throw', op, error.constructor.name]); }
    }
    results.push(地牢, 房间列表, 上锁房间列表, 门实例列表);
  }
`;

const final = 'globalThis.final = { results, calls }';

function sourceRun(seed: number, read: (name: string) => string = declaration) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${[...new Set([...GLOBALS, ...FUNCTIONS].map(name => read(name)))].join('\n')}
    globalThis.__setPrng = f => { prng = f; };`).runInContext(context);
  new vm.Script(scenario(seed).replace('const pick', '__setPrng(rand); const pick')).runInContext(context);
  return new vm.Script(`${final}; final`).runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state, 单元格类型 }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const is = (name: string) => (item: unknown) => item instanceof g<abstract new () => unknown>(name);
  const random = () => g<() => number>('__rand')();
  const sokoban: SokobanSolvedPorts = {
    isSokobanBox: is('推箱子箱子'), isSokobanTarget: is('推箱子目标'), notify: fn('显示通知'),
    lookupClass: (name) => g<Record<string, new (o: unknown) => unknown>>('window')[name as string], placeItemInRoom: fn('放置物品到房间'),
    generateReward: fn('生成奖励'), draw: fn('绘制'),
  };
  Object.assign(context, {
    计算距离图: (x: number, y: number) => computeDistanceMap(state, x, y),
    处理上锁的门: () => lockRooms(state, { random }),
    生成并放置随机配方卷轴: (floor: unknown) => placeRandomRecipeScrolls(state, {
      random, generateRecipe: fn('生成单个随机融合配方'), createRecipeScroll: (options) => new (g<new (o: unknown) => unknown>('配方卷轴'))(options),
      placeItemInRoom: fn('放置物品到房间'), log: (m) => g<{ log(m: string): void }>('console').log(m), warn: (m) => g<{ warn(m: string): void }>('console').warn(m),
    }, floor),
    检查推箱子解谜完成: (id: unknown) => checkSokobanSolved(state, { ...sokoban, onSolved: fn('解谜成功_推箱子') }, id),
    解谜成功_推箱子: (room: unknown) => completeSokobanRoom(state, sokoban, room),
  });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  return g<Record<string, unknown>>(`with (S) { ${final} }; final`);
}

describe('dungeon support (计算距离图, 处理上锁的门, 生成并放置随机配方卷轴, 检查推箱子解谜完成, 解谜成功_推箱子)', () => {
  it('matches the source over 500 seeded sessions', () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    let fixedSeeds = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      if (snap(sourceRun(seed, originalDeclaration)) !== snap(source)) fixedSeeds++; // SRC-18: unpatched source differs
      for (const call of source.calls as unknown[][]) bump(String(call[0]));
      for (const entry of source.results as unknown[][]) if (Array.isArray(entry) && typeof entry[0] === 'string') bump(entry[0] === 'throw' ? `throw:${String(entry[1])}` : String(entry[0]));
    }
    expect(fixedSeeds, 'unpatched SRC-18 differs').toBeGreaterThan(5);
    for (const key of ['dist', 'lock', 'recipes', 'check', 'solve', 'throw:dist', 'recipe', 'scroll', 'place', 'log', 'warn', '显示通知', 'reward-new', '生成奖励', '绘制', 'prng'])
      expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
