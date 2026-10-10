import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { processThunderstorm } from '../src/game/world/weather';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['处理雷暴效果'];
const GLOBALS = ['prng', '材质'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  let uid = 0;
  class 挑战石碑 { constructor() { this.名称 = '石碑'; this.唯一标识 = 'id' + ++uid; } }
  class 火焰物品 { constructor(o) { this.o = o; calls.push(['fire-new', o]); } }
  class 状态效果 { constructor(...a) { calls.push(['status', ...a.map(v => v && typeof v === 'object' ? v.类型 : v)]); } }
  const stub = name => (...a) => { calls.push([name, ...a.map(v => v instanceof 火焰物品 ? 'fire' : v)]); };
  const answer = name => (...a) => { const out = r() < 0.6; calls.push([name, ...a.map(v => v instanceof 火焰物品 ? 'fire' : v), out]); return out; };
  class 怪物 { constructor() { this.类型 = pick(['史莱姆', '骷髅']); this.强化 = r() < 0.5; } 受伤(n, why) { calls.push(['hurt', this.类型, n, why]); } 绘制血条() { calls.push(['bar', this.类型]); } }
  const monster = () => new 怪物();
  Object.assign(globalThis, { 挑战石碑, 火焰物品, 状态效果, 图标映射: { 火焰: '🔥' }, 效果颜色编号映射: { 7: '#f40' }, 效果名称编号映射: { 火焰: 7 },
    console: { warn: stub('warn') }, 位置是否可用: answer('位置是否可用'), 放置物品到单元格: answer('放置物品到单元格'),
    ...Object.fromEntries(['计划显示格子特效', '添加日志', '处理销毁物品', '显示通知', '绘制', '伤害玩家'].map(name => [name, stub(name)])) });
  for (let session = 0; session < 3; session++) {
    地牢大小 = pick([8, 8, 6]); 当前层数 = pick([0, 1]);
    地牢 = Array.from({ length: 8 }, (_, y) => r() < 0.05 ? undefined : Array.from({ length: 8 }, (_, x) => r() < 0.04 ? null : ({ x, y, 类型: pick([null, 2]),
      关联物品: (k => k < 0.15 ? { 名称: '剑', 唯一标识: 'id' + ++uid } : k < 0.2 ? { 类型: '楼梯', 名称: '楼梯', 唯一标识: 'st' } : k < 0.25 ? new 挑战石碑() : null)(r()),
      关联怪物: r() < 0.15 ? monster() : null })));
    所有计时器 = 地牢.flat().filter(c => c?.关联物品 && r() < 0.4).map(c => ({ 唯一标识: c.关联物品.唯一标识 }));
    玩家背包 = new Map(地牢.flat().filter(c => c?.关联物品 && r() < 0.3).map(c => [c.关联物品.唯一标识, c.关联物品]));
    房间列表 = [0, 1, 2].map(i => r() < 0.1 ? undefined : ({ x: pick([0, 1, 2]), y: pick([0, 2]), w: pick([1, 2, 3, 5]), h: pick([1, 2, 4, 5]) }));
    房间地图 = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => pick([-1, 0, 1, 2, 2, 4])));
    当前装备页 = pick([0, 1]); 装备栏每页装备数 = 2;
    玩家装备 = new Map([1, 2, 3, 4].map(slot => [slot, r() < 0.35 ? { 材质: pick(['铜质', '铁质']) } : null]));
    当前出战宠物列表 = [0, 1, 2].map(() => r() < 0.2 ? null : { 名称: '宠' + ++uid, 是否已放置: r() < 0.8, x: pick([0, 1, 2, 3]), y: pick([0, 1, 2, 3]),
      层数: pick([0, '0', 1]), 自定义数据: new Map([['休眠中', r() < 0.2]]), 受伤(n, why) { calls.push(['pet-hurt', this.名称, n, why]); } });
    for (let step = 0; step < 8; step++) {
      玩家 = { x: pick([0, 1, 2, 3, 4]), y: pick([0, 1, 2, 3, 9]) };
      try { results.push(['strike', 处理雷暴效果()]); } catch (error) { results.push(['throw', error.constructor.name]); }
    }
    results.push(地牢, 所有计时器);
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
  const context = vm.createContext({ calls: [], results: [], S: state }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  Object.assign(context, {
    处理雷暴效果: () => processThunderstorm(state, {
      random: () => g<() => number>('__rand')(), scheduleCellEffect: fn('计划显示格子特效'),
      isChallengeStele: (item) => item instanceof g<abstract new () => unknown>('挑战石碑'),
      log: fn('添加日志'), destroyItem: fn('处理销毁物品'), notify: fn('显示通知'), draw: fn('绘制'),
      fireColor: () => g<Record<string, unknown>>('效果颜色编号映射')[g<Record<string, string>>('效果名称编号映射').火焰!],
      icon: (name) => g<Record<string, unknown>>('图标映射')[name], createStatusEffect: (...args) => new (g<new (...a: unknown[]) => unknown>('状态效果'))(...args),
      damagePlayer: fn('伤害玩家'), isPositionFree: fn('位置是否可用'), createFire: (options) => new (g<new (o: unknown) => unknown>('火焰物品'))(options),
      placeItemAt: fn('放置物品到单元格'), warn: (message) => g<{ warn(m: string): void }>('console').warn(message),
    }),
  });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  return g<Record<string, unknown>>(`with (S) { ${final} }; final`);
}

describe('thunderstorm (处理雷暴效果)', () => {
  it('matches the source over 800 seeded sessions', () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 800; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) bump(String(call[0]));
      for (const entry of source.results as unknown[][]) if (entry[0] === 'throw') bump('throw');
    }
    for (const key of ['计划显示格子特效', '添加日志', '处理销毁物品', '显示通知', 'hurt', 'bar', 'status', '伤害玩家', 'pet-hurt', 'fire-new', 'warn', 'throw'])
      expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
