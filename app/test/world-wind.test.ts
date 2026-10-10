import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 单元格类型, 大风吹动概率, 怪物状态, 颜色表 } from '../src/game/world/constants';
import { processWind, tryBlow, type BlowPlan } from '../src/game/world/wind';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['处理大风效果', '尝试执行吹动'];
const GLOBALS = ['prng', '单元格类型', '大风吹动概率', '怪物状态', '颜色表'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  let uid = 0; let clock = 1000;
  Date.now = () => ++clock;
  class 物品 { constructor() { this.名称 = '物' + ++uid; this.类型 = pick(['武器', '武器', '药水', '楼梯', '祭坛']); this.颜色索引 = pick([0, 2]); this.能否拾起 = r() < 0.85; } }
  class 火焰物品 extends 物品 { constructor() { super(); this.类型 = pick(['地形', '火焰']); } }
  class 隐形毒气陷阱 extends 物品 { constructor() { super(); this.自定义数据 = new Map([['已触发', r() < 0.5]]); } }
  class 怪物 {
    constructor(x, y) { this.id = 'm' + ++uid; this.x = x; this.y = y; this.类型 = pick(['史莱姆', '骷髅', '骷髅', '楼梯']); this.状态 = pick([怪物状态.活跃, 怪物状态.活跃, 怪物状态.休眠]); }
    恢复背景类型() { calls.push(['restore', this.id, this.x, this.y]); const cell = 地牢[this.y]?.[this.x]; if (cell && cell.关联怪物 === this) { cell.关联怪物 = null; cell.类型 = null; } }
    保存新位置类型(x, y) { calls.push(['save', this.id, x, y]); if (r() < 0.05) throw new RangeError('save'); }
    处理地形效果() { calls.push(['terrain', this.id]); }
    绘制血条() { calls.push(['bar', this.id]); }
  }
  const stub = name => (...a) => { calls.push([name, ...a]); };
  Object.assign(globalThis, { 物品, 火焰物品, 隐形毒气陷阱, 怪物, 玩家动画状态: null, 怪物动画状态: new Map(),
    document: { getElementById: id => { calls.push(['canvas', id]); return { getBoundingClientRect: () => ({ width: pick([96, 130, 300]), height: pick([64, 100, 300]) }) }; } },
    检查直线移动可行性: (...a) => { const out = r() < 0.85; calls.push(['line', ...a, out]); return out; },
    console: { error: (m, e) => calls.push(['error', m, e?.constructor?.name]) },
    ...Object.fromEntries(['处理玩家着陆效果', '添加日志', '更新物体指示器'].map(name => [name, stub(name)])) });
  for (let session = 0; session < 3; session++) {
    地牢大小 = pick([7, 7, 6]);
    地牢 = Array.from({ length: 7 }, (_, y) => r() < 0.03 ? undefined : Array.from({ length: 7 }, (_, x) => r() < 0.04 ? null : ({ x, y, 颜色索引: 1,
      背景类型: pick([单元格类型.房间, 单元格类型.走廊, 单元格类型.房间, 单元格类型.墙壁, 单元格类型.上锁的门]), 类型: null, 关联物品: null, 关联怪物: null })));
    for (const cell of 地牢.flat().filter(Boolean)) {
      const k = r();
      if (k < 0.25) { cell.关联物品 = new 物品(); cell.类型 = r() < 0.8 ? 单元格类型.物品 : null; }
      else if (k < 0.3) { cell.关联物品 = new 火焰物品(); cell.类型 = 单元格类型.物品; }
      else if (k < 0.34) { cell.关联物品 = new 隐形毒气陷阱(); cell.类型 = 单元格类型.物品; }
      else if (k < 0.37) cell.关联物品 = { 名称: '石碑', 类型: pick(['楼梯', '告示']), 能否拾起: pick([false, undefined]) };
    }
    所有怪物 = Array.from({ length: 4 }, () => new 怪物(pick([0, 1, 2, 3, 4, 5, 6]), pick([0, 1, 2, 3, 4, 5, 6])));
    for (const m of 所有怪物) if (地牢[m.y]?.[m.x] && r() < 0.8) { 地牢[m.y][m.x].关联怪物 = m; 地牢[m.y][m.x].类型 = 单元格类型.怪物; }
    房间地图 = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => pick([-1, 0, 1, 2])));
    已访问房间 = new Set([0, 1, 2].filter(() => r() < 0.6));
    当前相机X = pick([0, 0.5, 1.7, 3]); 当前相机Y = pick([0, 1.2, 2]); 单元格大小 = pick([32, 40]);
    玩家 = { x: pick([1, 2, 3, 4, 5]), y: pick([1, 2, 3, 4, 5]) };
    for (let step = 0; step < 4; step++) {
      try { results.push(['wind', 处理大风效果()]); } catch (error) { results.push(['throw', error.constructor.name]); }
      results.push([玩家.x, 玩家.y]);
      const things = [...所有怪物, ...地牢.flat().map(c => c?.关联物品).filter(Boolean), 玩家];
      const plan = new Map(things.filter(() => r() < 0.4).map(t => [t, { 新X: pick([0, 2, 3, 5, 6, 7, -1]), 新Y: pick([0, 1, 3, 4, 6, 7]), 旧X: t.x ?? 0, 旧Y: t.y ?? 0,
        类型: t instanceof 怪物 ? '怪物' : t === 玩家 ? '玩家' : '物品' }]));
      const done = new Set(things.filter(() => r() < 0.15));
      try { results.push(['direct', 尝试执行吹动(pick(things), plan, done, pick([0, 1, -1]), pick([0, 1])), done.size]); } catch (error) { results.push(['throw', error.constructor.name]); }
    }
    results.push(地牢, 所有怪物, 玩家动画状态, [...怪物动画状态]);
    怪物动画状态.clear();
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
  const context = vm.createContext({ calls: [], results: [], S: state, 单元格类型, 大风吹动概率, 怪物状态, 颜色表 }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const is = (name: string) => (item: unknown) => item instanceof g<abstract new () => unknown>(name);
  const now = () => g<{ now(): number }>('Date').now();
  Object.assign(context, {
    尝试执行吹动: (instance: unknown, plan: Map<unknown, BlowPlan>, done: Set<unknown>, dx: number, dy: number) => tryBlow(state, {
      canMoveStraight: fn('检查直线移动可行性'), isItem: is('物品'), isFireItem: is('火焰物品'), log: fn('添加日志'), now,
      setMonsterAnimation: (monster, animation) => g<Map<unknown, unknown>>('怪物动画状态').set(monster, animation),
      error: (message, error) => g<{ error(m: string, e: unknown): void }>('console').error(message, error),
    }, instance, plan, done, dx, dy),
    处理大风效果: () => processWind(state, {
      random: () => g<() => number>('__rand')(),
      canvasRect: () => g<{ getElementById(id: string): { getBoundingClientRect(): { width: number; height: number } } }>('document').getElementById('dungeonCanvas').getBoundingClientRect(),
      camera: () => ({ x: g<number>('当前相机X'), y: g<number>('当前相机Y') }), cellSize: () => g<number>('单元格大小'),
      canMoveStraight: fn('检查直线移动可行性'), isPoisonGasTrap: is('隐形毒气陷阱'), isItem: is('物品'), isMonster: is('怪物'), tryBlow: fn('尝试执行吹动'), now,
      setPlayerAnimation: (animation) => { context.玩家动画状态 = animation; }, landPlayer: fn('处理玩家着陆效果'), log: fn('添加日志'), updateIndicators: fn('更新物体指示器'),
    }),
  });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  return g<Record<string, unknown>>(`with (S) { ${final} }; final`);
}

describe('wind (处理大风效果, 尝试执行吹动)', () => {
  it('matches the source over 800 seeded sessions', () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 800; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) bump(call[0] === '添加日志' ? `log:${String(call[1]).replace(/^.*?(被大风吹到|被吹向火焰|你被大风|你试图).*$/, '$1')}` : String(call[0]));
      for (const entry of source.results as unknown[][]) if (entry?.[0] === 'throw') bump('throw');
    }
    for (const key of ['log:被大风吹到', 'log:被吹向火焰', 'log:你被大风', 'log:你试图', 'restore', 'save', 'terrain', 'bar', 'error', '处理玩家着陆效果', '更新物体指示器', 'line', 'throw'])
      expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
