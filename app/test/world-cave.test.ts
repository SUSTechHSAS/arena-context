import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { generateBarricades, placeByScoreMap, placeCaveRecipeScrolls, type CaveCatalog, type CavePorts } from '../src/game/world/cave';
import { placeItemAt, placeMonsterAt, type PlacementPorts } from '../src/game/world/placement';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['位置是否可用', '放置怪物到单元格', '放置物品到单元格', '使用评分图放置物品', '生成路障', '生成并放置洞穴配方卷轴'];
const GLOBALS = ['单元格类型', '怪物状态', '环境类型', '材质', 'prng', '地牢大小', '地牢', '玩家', '当前出战宠物列表', '房间地图', '房间列表',
  '所有怪物', '所有计时器', '所有传送门', '当前层数', '自定义游戏设置', '怪物引入计划', '物品池', '地牢生成方式', '是否为教程层'];
const CLASS_NAMES = ['物品祭坛', '耐久祭坛', '背包扩容祭坛', '神龛', '洗身砚', '神秘商人', '探险家', '隐形落石陷阱', '隐形地刺陷阱', '召唤怪物陷阱',
  '隐形失明陷阱', '烈焰触发陷阱', '隐形虫洞陷阱', '巡逻怪物', '木栅栏', '石栅栏', '铁栅栏', '配方卷轴'];

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  let serial = 0;
  class Thing { constructor(options) { calls.push(['new', this.constructor.name, options]); this.选项 = options; this.唯一标识 = Symbol('u' + serial++);
    this.颜色索引 = null; this.颜色表 = ['#000000', '#123456']; this.x = null; this.y = null; this.材质 = '木质'; this.自定义数据 = new Map();
    this.是否正常物品 = true; this.类型 = '杂物'; this.阻碍怪物 = this.constructor.name.includes('栅栏'); }
    获取名称() { return this.constructor.name; } }
  class Mon { constructor(options) { calls.push(['new', this.constructor.name, options]); Object.assign(this, options); this.永久增益 = []; this.状态 = 0; } }
  const named = (Base, name) => ({ [name]: class extends Base {} })[name];
  for (const name of ${JSON.stringify(CLASS_NAMES)}) globalThis[name] = named(name === '巡逻怪物' ? Mon : Thing, name);
  for (const name of ['远射植物', '护卫植物', '刷怪笼', '开关脉冲器', '侦测器', '发生器', '沉浸式传送门']) globalThis[name] = named(Thing, name);
  globalThis.图标映射 = { 飞毛腿: '🏃', 永久抗火: '🔥', 永久力量: '💪', 永久抗毒: '🧪', 永久解冻: '❄', 炸弹: '💣', 隐身: '👻', 矿工: '⛏' };
  globalThis.快速检查相邻移动 = (...a) => { calls.push(['adj', ...a]); return (a[0] * 3 + a[1] * 5 + a[2] * 7 + a[3]) % 6 !== 0; };
  globalThis.生成单个随机融合配方 = floor => { calls.push(['recipe', floor]); return r() < 0.8 ? { 配方: floor } : null; };
  const monsterKinds = ['史莱姆', '蝙蝠', '大魔法师', '米诺陶', '骷髅'].map(name => named(Mon, name));
  const itemKinds = Array.from({ length: 6 }, (_, i) => { const K = named(Thing, '物品' + i); const kind = pick(['杂物', '工具', 'NPC', '祭坛', '武器']); const normal = r() < 0.8;
    return class extends K { constructor(o) { super(o); this.类型 = kind; this.是否正常物品 = normal; } }; });
  当前层数 = Math.floor(r() * 15);
  地牢大小 = r() < 0.2 ? 60 + Math.floor(r() * 51) : 14 + Math.floor(r() * 16);
  自定义游戏设置 = { 开启巡逻怪物: r() < 0.5, 开启怪物等级: r() < 0.7, 开启药水增益怪物: r() < 0.7, 物品掉落率: pick([0, 1, 1.5]) };
  怪物引入计划 = new Map(); for (let f = 0; f < 16; f++) if (r() < 0.5) 怪物引入计划.set(f, [{ 类: pick(monsterKinds), 权重: 1 }, { 类: pick(monsterKinds) }]);
  物品池 = { 甲: itemKinds.slice(0, 3).map(类 => ({ 类, 最小层: pick([0, 3, 9]) })), 乙: itemKinds.slice(3).map(类 => ({ 类, 最小层: pick([0, 5]) })) };
  地牢生成方式 = pick(['cave', 'default']); 是否为教程层 = r() < 0.1;
  房间列表 = Array.from({ length: Math.floor(r() * 12) }, (_, id) => ({ id }));
  const wallRate = pick([0.15, 0.4]);
  地牢 = Array.from({ length: 地牢大小 }, (_, y) => Array.from({ length: 地牢大小 }, (_, x) => ({ x, y,
    背景类型: r() < wallRate ? 0 : pick([1, 1, 2]), 类型: null, 颜色索引: null, 关联物品: null, 关联怪物: null, 环境: pick([null, null, '水']) })));
  玩家 = { x: 1, y: 1 }; 当前出战宠物列表 = []; 所有怪物 = []; 所有计时器 = []; 所有传送门 = [];
  房间地图 = Array.from({ length: 地牢大小 }, () => Array(地牢大小).fill(-1));
  const area = []; for (let y = 0; y < 地牢大小; y++) for (let x = 0; x < 地牢大小; x++) if (地牢[y][x].背景类型 !== 0 && r() < 0.9) area.push({ x, y });
  const maps = [];
  for (let step = 0; step < 4; step++) {
    const map = Array.from({ length: 地牢大小 }, () => Array.from({ length: 地牢大小 }, () => pick([0, 1, 2, 4, 4, 6])));
    maps.push(map); const kind = pick(['特殊物品', '怪物', '怪物', '陷阱', '普通物品', '其他']);
    results.push(['score', kind, 使用评分图放置物品(map, area, kind)]);
  }
  results.push(['fence', 生成路障()]);
  results.push(['scroll', 生成并放置洞穴配方卷轴(地牢, pick([null, -1, 0, 当前层数, 当前层数, 3]))]);
  globalThis.final = { results, calls, maps, 地牢, 所有怪物, 所有计时器 };
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
  const context = vm.createContext({ calls, results: [], S: state });
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const random = () => g<() => number>('__rand')();
  const instance = (item: unknown, names: string[]) => names.some(name => item instanceof g<abstract new () => unknown>(name));
  const placementPorts: PlacementPorts = {
    random, requestDraw: () => { calls.push(['draw']); }, scheduleCellEffect: () => { throw new Error('unused'); },
    log: (message, type) => { calls.push(['log', message, type]); },
    isSelfTimedItem: item => instance(item, ['远射植物', '护卫植物', '刷怪笼', '开关脉冲器', '侦测器', '发生器']),
    isImmersivePortal: item => instance(item, ['沉浸式传送门']),
  };
  const catalog = {} as CaveCatalog;
  for (const name of [...CLASS_NAMES, '图标映射']) Object.defineProperty(catalog, name, { get: () => g(name) });
  Object.defineProperty(catalog, '特殊物品池', { get: () => CLASS_NAMES.slice(0, 7).map(name => g(name)) });
  Object.defineProperty(catalog, '陷阱池', { get: () => CLASS_NAMES.slice(7, 13).map(name => g(name)) });
  const ports: CavePorts = {
    random, catalog,
    placeMonsterAt: (monster, x, y) => placeMonsterAt(state, placementPorts, monster, x, y),
    placeItemAt: (item, x, y) => placeItemAt(state, placementPorts, item, x, y),
    quickAdjacentMove: (...args) => g<(...a: number[]) => boolean>('快速检查相邻移动')(...args),
    generateFusionRecipe: floor => g<(f: number) => unknown>('生成单个随机融合配方')(floor),
  };
  Object.assign(context, {
    使用评分图放置物品: (map: number[][], area: { x: number; y: number }[], kind: unknown) => placeByScoreMap(state, ports, map, area, kind),
    生成路障: () => generateBarricades(state, ports),
    生成并放置洞穴配方卷轴: (area: unknown, floor: number | null) => placeCaveRecipeScrolls(state, ports, area, floor),
  });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  return g<Record<string, unknown>>('final');
}

describe('cave placement cluster (使用评分图放置物品 / 生成路障 / 生成并放置洞穴配方卷轴)', () => {
  it('matches the source over 150 seeded worlds composed with the ported placement functions', () => {
    const tally = { monsters: 0, potions: 0, special: 0, traps: 0, normal: 0, fencesCave: 0, fencesCorridor: 0, iron: 0, scrolls: 0, patrol: 0 };
    for (let seed = 1; seed <= 150; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(JSON.stringify(graphSnapshot(mine)), `seed ${seed}`).toBe(JSON.stringify(graphSnapshot(source)));
      for (const call of source.calls as unknown[][]) {
        if (call[0] !== 'new') continue;
        const name = call[1] as string;
        if (['史莱姆', '蝙蝠', '骷髅'].includes(name)) tally.monsters++;
        if (name === '巡逻怪物') tally.patrol++;
        if (CLASS_NAMES.slice(0, 7).includes(name)) tally.special++;
        if (CLASS_NAMES.slice(7, 13).includes(name)) tally.traps++;
        if (name.startsWith('物品')) tally.normal++;
        if (name === '铁栅栏') tally.iron++;
        if (name.includes('栅栏')) { if ((source.calls as unknown[][]).some(c => c[0] === 'adj')) tally.fencesCorridor++; else tally.fencesCave++; }
        if (name === '配方卷轴') tally.scrolls++;
      }
      tally.potions += (source.所有怪物 as { 携带药水?: unknown }[]).filter(monster => monster.携带药水).length;
    }
    for (const [key, count] of Object.entries(tally)) expect(count, key).toBeGreaterThan(5);
  });
});
