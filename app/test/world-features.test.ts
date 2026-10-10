import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 颜色表 } from '../src/game/world/constants';
import { createStairs, generatePoisonTrapCluster, generateWaterMonsters, revealPoisonTrapCluster, timeRandomId } from '../src/game/world/features';
import { placeItemAt, placeMonsterAt, type PlacementPorts } from '../src/game/world/placement';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['位置是否可用', '放置怪物到单元格', '放置物品到单元格', '生成时间随机数', '生成水怪', '生成毒气陷阱群', '揭示并激活陷阱群', '创建楼梯实例'];
const GLOBALS = ['单元格类型', '环境类型', '材质', '颜色表', 'prng', '地牢大小', '地牢', '玩家', '当前出战宠物列表', '房间地图', '所有怪物', '所有计时器',
  '所有传送门', '当前层数', '地牢生成方式'];

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  let clock = 1700000000000 + ${seed} * 977; Date.now = () => { calls.push(['now']); return clock++; };
  let serial = 0;
  class Thing { constructor(options) { calls.push(['new', this.constructor.name, options]); this.唯一标识 = Symbol('u' + serial++); this.颜色索引 = null;
    this.颜色表 = ['#000000', '#123456']; this.x = null; this.y = null; this.材质 = '木质'; this.自定义数据 = new Map(Object.entries(options ?? {})); }
    获取名称() { return this.constructor.name; } }
  class 隐形毒气陷阱 extends Thing {} class 毒气 extends Thing {}
  class 水怪 { constructor(options) { calls.push(['new', '水怪', options]); Object.assign(this, options); } }
  const named = name => ({ [name]: class extends Thing {} })[name];
  Object.assign(globalThis, { 隐形毒气陷阱, 毒气, 水怪, 楼梯图标: { 下楼: '▼', 上楼: '▲' } });
  for (const name of ['远射植物', '护卫植物', '刷怪笼', '开关脉冲器', '侦测器', '发生器', '沉浸式传送门']) globalThis[name] = named(name);
  globalThis.显示通知 = (...a) => calls.push(['notify', ...a]);
  globalThis.检查移动可行性 = (...a) => { calls.push(['step', ...a]); return (a[0] * 5 + a[1] * 3 + a[2] * 7 + a[3] * 11) % 13 !== 0; };
  globalThis.切换楼层 = (...a) => calls.push(['floor', ...a]);
  当前层数 = Math.floor(r() * 12); 地牢生成方式 = pick(['default', 'cave']);
  地牢大小 = 8 + Math.floor(r() * 14);
  const lake = r() < 0.5;
  地牢 = Array.from({ length: 地牢大小 }, (_, y) => Array.from({ length: 地牢大小 }, (_, x) => ({ x, y, 背景类型: pick([0, 1, 1, 1, 1, 2, 2]), 类型: null,
    颜色索引: null, 关联物品: r() < 0.05 ? { 阻碍怪物: true } : null, 关联怪物: null, 环境: lake && x < 地牢大小 / 2 ? pick(['水', '血水', '水', null]) : pick([null, null, '水', '冰', '血水']) })));
  玩家 = { x: 0, y: 0 }; 当前出战宠物列表 = []; 所有怪物 = []; 所有计时器 = []; 所有传送门 = [];
  房间地图 = Array.from({ length: 地牢大小 }, () => Array(地牢大小).fill(-1));
  results.push(['id', 生成时间随机数(), 生成时间随机数(15), 生成时间随机数(13), 生成时间随机数(5), 生成时间随机数(20)]);
  for (let step = 0; step < 12; step++) {
    const op = pick([0, 0, 0, 1, 2, 3]);
    try {
      if (op === 0) results.push([op, 生成毒气陷阱群({ id: pick([0, 1, 2, 3]), 类型: pick(['房间', '房间', '房间', '宝藏']), x: Math.floor(r() * 4), y: Math.floor(r() * 4),
        w: 3 + Math.floor(r() * (地牢大小 - 4)), h: 3 + Math.floor(r() * (地牢大小 - 4)) })]);
      if (op === 1) results.push([op, 生成水怪()]);
      if (op === 2) { const traps = 地牢.flat().map(c => c.关联物品).filter(i => i instanceof 隐形毒气陷阱);
        results.push([op, 揭示并激活陷阱群(traps.length && r() < 0.8 ? pick(traps).自定义数据.get('关联陷阱ID') : 42, pick([3, 5]), pick([1, 2]))]); }
      if (op === 3) { const st = 创建楼梯实例(pick(['下楼', '上楼', '其他'])); 当前层数 += 1; st.使用();
        results.push([op, Object.fromEntries(Object.entries(st).filter(([, v]) => typeof v !== 'function')), st.获取名称(), st.颜色表 === 颜色表]); }
    } catch (error) { results.push([op, 'throw', error.constructor.name]); }
  }
  globalThis.final = { results, calls, 地牢, 所有怪物, 所有计时器 };
`;

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${[...new Set([...GLOBALS, ...FUNCTIONS].map(name => declaration(name)))].join('\n')}
    function 绘制() { calls.push(['draw']); }
    function 添加日志(message, type) { calls.push(['log', message, type]); }
    globalThis.__setPrng = f => { prng = f; };`).runInContext(context);
  new vm.Script(scenario(seed).replace('const pick', '__setPrng(rand); const pick')).runInContext(context);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  const calls: unknown[][] = [];
  const context = vm.createContext({ calls, results: [], S: state, 颜色表 });
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = <A extends unknown[], R>(name: string) => (...args: A) => g<(...a: A) => R>(name)(...args);
  const random = () => g<() => number>('__rand')();
  const now = () => g<DateConstructor>('Date').now();
  const is = (item: unknown, names: string[]) => names.some(name => item instanceof g<abstract new () => unknown>(name));
  const placement: PlacementPorts = {
    random, requestDraw: () => { calls.push(['draw']); }, scheduleCellEffect: () => { throw new Error('unused'); },
    log: (message, type) => { calls.push(['log', message, type]); },
    isSelfTimedItem: item => is(item, ['远射植物', '护卫植物', '刷怪笼', '开关脉冲器', '侦测器', '发生器']), isImmersivePortal: item => is(item, ['沉浸式传送门']),
  };
  const placeItem = (item: unknown, x: number, y: number) => placeItemAt(state, placement, item as never, x, y);
  const make = (name: string) => (options: unknown) => new (g<new (o: unknown) => unknown>(name))(options);
  Object.assign(context, {
    生成时间随机数: (length?: number) => timeRandomId(random, now, length),
    生成水怪: () => generateWaterMonsters(state, { random, createWaterMonster: make('水怪'), placeMonsterAt: (m, x, y) => placeMonsterAt(state, placement, m, x, y) }),
    生成毒气陷阱群: (room: unknown) => generatePoisonTrapCluster(state, { random, now, canStep: fn('检查移动可行性'), createHiddenGasTrap: make('隐形毒气陷阱') as never, placeItemAt: placeItem }, room),
    揭示并激活陷阱群: (id: unknown, duration: unknown, strength: unknown) => revealPoisonTrapCluster(state, {
      isHiddenGasTrap: item => is(item, ['隐形毒气陷阱']), createGas: make('毒气') as never, notify: fn('显示通知'), placeItemAt: placeItem,
      requestDraw: () => { calls.push(['draw']); } }, id, duration, strength),
    创建楼梯实例: (kind: unknown) => createStairs(state, { stairIcons: () => g('楼梯图标'), changeFloor: fn('切换楼层') }, kind),
  });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  return g<Record<string, unknown>>('final');
}

describe('world features (生成时间随机数 / 生成水怪 / 生成毒气陷阱群 / 揭示并激活陷阱群 / 创建楼梯实例)', () => {
  it('matches the source over 200 seeded worlds composed with the ported placement functions', () => {
    const tally = { traps: 0, gas: 0, water: 0, stairs: 0, notify: 0, floor: 0 };
    for (let seed = 1; seed <= 200; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(JSON.stringify(graphSnapshot(mine)), `seed ${seed}`).toBe(JSON.stringify(graphSnapshot(source)));
      for (const call of source.calls as unknown[][]) {
        if (call[0] === 'new' && call[1] === '隐形毒气陷阱') tally.traps++;
        if (call[0] === 'new' && call[1] === '毒气') tally.gas++;
        if (call[0] === 'new' && call[1] === '水怪') tally.water++;
        if (call[0] === 'notify') tally.notify++;
        if (call[0] === 'floor') tally.floor++;
      }
      tally.stairs += (source.results as unknown[][]).filter(entry => entry[0] === 3).length;
    }
    for (const [key, count] of Object.entries(tally)) expect(count, key).toBeGreaterThan(5);
  });
});
