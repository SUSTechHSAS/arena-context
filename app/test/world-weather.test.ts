import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 环境类型 } from '../src/game/world/constants';
import { generateWeather, isNearFire, processCold, processWeather, thawPotions } from '../src/game/world/weather';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['处理天气效果', '生成天气效果', '是否靠近火源', '解冻药水', '处理严寒效果'];
const GLOBALS = ['prng', '环境类型', '所有天气列表'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  let uid = 0;
  class 火把 { constructor() { this.id = ++uid; this.是否被丢弃 = r() < 0.5; if (r() < 0.9) this.自定义数据 = new Map([['耐久', pick([0, 3])]]); } }
  class 火焰物品 { constructor() { this.id = ++uid; this.自定义数据 = new Map([['倒计时', pick([0, 2])]]); } }
  class 药水类 { constructor() { this.id = ++uid; this.自定义数据 = new Map([['是否冻结', r() < 0.4]]); } 获取名称() { return '药水' + this.id; } }
  class 状态效果 { constructor(...a) { calls.push(['status', ...a]); 玩家状态.push({ 类型: a[0] }); } }
  const stub = name => (...a) => { calls.push([name, ...a]); };
  Object.assign(globalThis, { 火把, 火焰物品, 药水类, 状态效果, 图标映射: { 冰冻怪物: '❄' },
    ...Object.fromEntries(['处理雷暴效果', '处理大风效果', '添加日志', '更新背包显示', '显示通知'].map(name => [name, stub(name)])) });
  for (let session = 0; session < 3; session++) {
    地牢大小 = pick([5, 5, 4]);
    怪物状态表 = new WeakMap();
    地牢 = Array.from({ length: 5 }, (_, y) => r() < 0.05 ? undefined : Array.from({ length: 5 }, (_, x) => r() < 0.03 ? null : ({ x, y,
      环境: pick([null, 环境类型.水, 环境类型.水, 环境类型.冰, 环境类型.草地]),
      关联物品: (k => k < 0.06 ? new 火焰物品() : k < 0.12 ? new 火把() : null)(r()),
      关联怪物: r() < 0.1 ? (m => { if (r() < 0.6) 怪物状态表.set(m, { 类型: pick(['火焰', '中毒']) }); return m; })({ id: ++uid }) : null })));
    玩家 = { x: pick([0, 2, 4]), y: pick([0, 2, 4]) };
    玩家状态 = ['火焰', '冻结', '中毒'].filter(() => r() < 0.15).map(类型 => ({ 类型 }));
    当前装备页 = pick([0, 1]); 装备栏每页装备数 = pick([2, 3]);
    玩家装备 = new Map([1, 2, 3, 4, 5].map(slot => [slot, r() < 0.2 ? new 火把() : r() < 0.3 ? { id: 'gear' } : null]));
    玩家背包 = new Map([1, 2, 3].map(id => [id, r() < 0.7 ? new 药水类() : { id: 'misc', 自定义数据: new Map() }]));
    当前天气效果 = ['雷暴', '大风', '严寒', '深夜'].filter(() => r() < 0.4);
    自定义游戏设置 = { 天气系统: pick(['三层一次', '三层一次', '关闭']) };
    for (let step = 0; step < 5; step++) {
      const op = pick(['dispatch', 'dispatch', 'generate', 'thaw', 'cold', 'cold', 'fire']);
      try {
        if (op === 'dispatch') results.push([op, 处理天气效果()]);
        else if (op === 'generate') results.push([op, 生成天气效果()]);
        else if (op === 'thaw') results.push([op, 解冻药水()]);
        else if (op === 'cold') results.push([op, 处理严寒效果()]);
        else results.push([op, 是否靠近火源(pick([玩家.x, 0, 1, 3, 4, -1]), pick([玩家.y, 0, 2, 4, 5]))]);
      } catch (error) { results.push(['throw', op, error.constructor.name]); }
      results.push([当前天气效果.slice(), 玩家状态.length]);
    }
    results.push(地牢, 玩家背包);
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
  const context = vm.createContext({ calls: [], results: [], S: state, 环境类型 }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const is = (name: string) => (item: unknown) => item instanceof g<abstract new () => unknown>(name);
  const random = () => g<() => number>('__rand')();
  const fire = { isTorch: is('火把'), isFireItem: is('火焰物品') };
  const thawPorts = { isPotion: is('药水类'), log: fn('添加日志'), refreshInventory: fn('更新背包显示') };
  Object.assign(context, {
    处理天气效果: () => processWeather(state, { thunderstorm: fn('处理雷暴效果'), wind: fn('处理大风效果'), cold: fn('处理严寒效果'), thaw: fn('解冻药水') }),
    生成天气效果: () => generateWeather(state, { random, notify: fn('显示通知') }),
    是否靠近火源: (x: number, y: number) => isNearFire(state, fire, x, y),
    解冻药水: () => thawPotions(state, thawPorts),
    处理严寒效果: () => processCold(state, {
      ...thawPorts, random, nearFire: fn('是否靠近火源'), thaw: fn('解冻药水'), icon: (name) => g<Record<string, unknown>>('图标映射')[name],
      createStatusEffect: (...args) => new (g<new (...a: unknown[]) => unknown>('状态效果'))(...args),
    }),
  });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  return g<Record<string, unknown>>(`with (S) { ${final} }; final`);
}

describe('weather core (处理天气效果, 生成天气效果, 是否靠近火源, 解冻药水, 处理严寒效果)', () => {
  it('matches the source over 800 seeded sessions', () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 800; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) bump(String(call[0]) + (call[0] === '显示通知' || call[0] === '添加日志' ? String(call[1]).slice(0, 3) : ''));
      for (const entry of source.results as unknown[][]) if (entry[0] === 'fire') bump(`fire:${String(entry[1])}`);
    }
    for (const key of ['处理雷暴效果', '处理大风效果', 'status', '添加日志你被严', '添加日志背包里', '更新背包显示', '显示通知夜幕降', '显示通知乌云密', '显示通知狂风呼', '显示通知严冬将',
      '显示通知空气中', 'fire:true', 'fire:false', 'prng']) expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
