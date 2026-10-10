import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 融合配方列表 } from '../src/game/world/constants';
import { executeFusion, type FusionExecPorts } from '../src/game/world/fusion-exec';
import { isFusionMaterial, isFusionWeapon, type FusionClassPorts } from '../src/game/world/fusion-recipes';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['执行融合', '是否为有效融合武器', '是否为有效融合材料'];
const GLOBALS = ['材质', '融合Buff类型', '融合配方列表'];
const NOTICES = ['能量不足！需要', '融合失败：无法将产物', '没有有效的融合结果', '成功融合出', '附魔成功！', '附魔失败！', '持续时间已延长！', '成功转化为铁质！',
  ' 转化成功！', '遇水生锈了！', '已被岩浆淬火！', '已被稀释！', '锈迹斑斑', '被成功打磨！', ' 融合成功！', '强化成功！', '没有获得强化效果。', '空桶掉在了地上',
  '找不到血水桶或药水', '找不到炸弹或药水', '找不到卷轴或目标物品', '找不到药水！', '找不到所需材料', '只有武器、装备或桶类', '原始武器无效'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 5; i++) r();
  const pick = list => list[Math.floor(r() * list.length)];
  let uid = 0;
  Date.now = () => 7000 + uid;
  const typeOf = { 武器类: '武器', 防御装备类: '防御装备', 药水类: '药水' };
  class 物品 {
    constructor(o = {}) {
      this.唯一标识 = 'id' + ++uid; this.名称 = o.名称 ?? (r() < 0.8 ? new.target.name : pick(['甲', '乙']));
      this.材质 = o.材质 ?? pick(['木质', '铁质', '铁质', '玻璃', '普通']); this.品质 = pick([1, 2, 3]); this.强化 = r() < 0.3;
      this.类型 = typeOf[new.target.name] ?? typeOf[Object.getPrototypeOf(new.target).name] ?? '杂物';
      this.自定义数据 = new Map([['耐久', pick([1, 2, 10])], ['原耐久', pick([undefined, 20])], ['已解锁', r() < 0.85],
        ['fusedBuffs', r() < 0.4 ? [{ type: pick(['SHARPEN_ATTACK_BONUS', 'SHARPEN_COOLDOWN_REDUCTION', 'ATTACK_BONUS']), value: 1, usesLeft: pick([undefined, 3]) }] : undefined]]);
      if (r() < 0.4) this.自定义数据.set('锈蚀度', pick([0, 2]));
      if (o.config) calls.push(['new', new.target.name, o.config]);
    }
    获取名称() { return 'N:' + String(this.名称); }
  }
  class 武器类 extends 物品 {} class 防御装备类 extends 物品 {} class 磨刀石 extends 物品 {}
  class 空桶 extends 物品 { constructor(config) { super({ config }); } }
  class 水桶 extends 物品 {} class 岩浆桶 extends 物品 {} class 冰桶 extends 物品 {} class 血水桶 extends 物品 {}
  class 药水类 extends 物品 {} class 治疗药水 extends 药水类 {} class 炸弹 extends 物品 {} class 药水弹 extends 炸弹 {}
  class 卷轴类 extends 物品 {} class 附魔卷轴 extends 卷轴类 {
    constructor(o) { super(o); if (r() < 0.6) this.可用次数 = pick([1, 2, 0, null]); }
    附魔效果(target) { calls.push(['enchant', this === globalThis.lastScroll, target.唯一标识]); target.自定义数据.set('附魔', ['x']); return r() < 0.7; } }
  class 钥匙 extends 物品 {} class 金币 extends 物品 {}
  const made = [];
  const make = (K, o) => { const item = new K(o); made.push(item); return item; };
  Object.assign(globalThis, { 武器类, 防御装备类, 磨刀石, 空桶, 水桶, 岩浆桶, 冰桶, 血水桶, 药水类, 炸弹, 药水弹, 卷轴类, 附魔卷轴, 钥匙, 金币,
    socket: { emit: (...a) => calls.push(['emit', ...a]) }, prng: () => r(),
    克隆物品: item => { const copy = Object.assign(Object.create(Object.getPrototypeOf(item)), item); copy.自定义数据 = new Map(item.自定义数据);
      copy.唯一标识 = 'clone' + ++uid; calls.push(['clone', item.唯一标识]); made.push(copy); return copy; },
    扣除能量: n => { const ok = r() < 0.8; calls.push(['energy', n, ok]); if (ok) 玩家属性.当前能量值 -= n; return ok; },
    尝试收集物品: (item, silent) => { const ok = r() < 0.75; calls.push(['collect', item.唯一标识, silent, ok, 融合结果?.唯一标识]); return ok; },
    合并Buff列表: (a, b) => { calls.push(['merge', a.length, b.length]); return [...a, ...b]; },
    ...Object.fromEntries(['显示通知', '添加日志', '处理销毁物品', '放置物品到单元格', '从融合区移除', '检查融合配方', '更新融合窗口', '更新背包显示', '更新装备显示']
      .map(n => [n, (...a) => calls.push([n, ...a.map(v => v && typeof v === 'object' ? v.唯一标识 : v)])])) });
  const layouts = {
    药水桶融合: [血水桶, 治疗药水], 药水弹融合: [[炸弹, 治疗药水], [药水弹, 炸弹, 治疗药水], [药水弹, 治疗药水]], 卷轴附魔融合: [附魔卷轴, 武器类], 药水金币延长: [治疗药水, 金币, 金币],
    玻璃铁器转化融合: [武器类, 防御装备类], 木材转化融合: [武器类, 治疗药水], 铁器锈蚀融合: [武器类, 治疗药水], 岩浆淬火: [武器类, 岩浆桶],
    铁器生锈: [水桶, 武器类], 药水稀释: [治疗药水, 水桶], 磨刀石打磨: [磨刀石, 武器类], 装备融合: [武器类, 武器类],
    词条融合: [武器类, 炸弹, 金币, 钥匙], 未知: [物品, 物品] };
  const kinds = [武器类, 防御装备类, 磨刀石, 空桶, 水桶, 岩浆桶, 血水桶, 治疗药水, 炸弹, 药水弹, 附魔卷轴, 钥匙, 金币, 物品];
  for (let session = 0; session < 4; session++) {
    联机模式 = r() < 0.05;
    玩家属性 = { 当前能量值: pick([10, 50, 99, 100]) }; 自定义全局设置 = { 初始能量值: pick([100, 150]) }; 玩家 = { x: 3, y: pick([4, 5]) };
    const name = pick([...Object.keys(layouts), 'object', 'object', 'object']);
    const recipe = name === 'object' ? pick([...融合配方列表, { 输入: ['甲', '乙', '甲'], 输出类: '物品', 输出数量: 1 }]) : name === '未知' ? pick(['未知', null]) : name;
    let slots = [null, null, null, null];
    if (r() < 0.85) {
      const inputs = typeof recipe === 'object' && recipe ? recipe.输入.map(n => [n === '钢制长剑' ? 武器类 : n === '治疗药水' ? 治疗药水 : 物品, n]) : (Array.isArray(layouts[recipe ?? '未知'][0]) ? pick(layouts[recipe ?? '未知']) : layouts[recipe ?? '未知']).map(K => [K]);
      const positions = r() < 0.7 ? [0, 1, 2, 3] : pick([[1, 0, 2, 3], [0, 2, 3, 1]]);
      inputs.forEach(([K, n], i) => { slots[positions[i]] = make(K, { 名称: n, 材质: recipe === '玻璃铁器转化融合' ? (i === 0 ? '玻璃' : '铁质') : recipe === '木材转化融合' && i === 0 ? '木质' : undefined }); });
      if (recipe === '玻璃铁器转化融合' && r() < 0.8) slots[positions[1]].自定义数据.set('锈蚀度', pick([1, 3]));
    } else {
      slots = slots.map(() => r() < 0.5 ? null : make(pick(kinds)));
    }
    globalThis.lastScroll = slots.find(x => x instanceof 附魔卷轴);
    融合区物品 = slots;
    fusionGoldQuantities = slots.map(v => v instanceof 金币 ? pick([0, 4, 10]) : pick([0, 0, 2]));
    当前匹配的融合配方 = recipe;
    const resultBase = slots.find(Boolean) ?? new 物品();
    融合结果 = r() < 0.08 ? null : Object.assign(Object.create(Object.getPrototypeOf(resultBase)), resultBase, { 唯一标识: 'preview' + session,
      自定义数据: new Map([['fusedBuffs', pick([undefined, [], [{ type: 'MATERIAL_CHANGE', value: '金质' }, { type: 'RUST_INCREASE', value: 2 },
        { type: 'DURABILITY_MULTIPLIER', value: pick([0.5, 0.33]) }, { type: 'DURABILITY_BONUS', value: 3 }], [{ type: 'ATTACK_BONUS', value: 1 }]])]]) });
    const slotItems = [...slots];
    try { results.push(['exec', 执行融合()]); } catch (error) { results.push(['throw', error.constructor.name]); }
    results.push([融合区物品.map(v => v?.唯一标识 ?? null), fusionGoldQuantities.slice(), 融合结果, 当前匹配的融合配方, 玩家属性.当前能量值, slotItems]);
  }
  results.push(made);
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
  const context = vm.createContext({ calls: [], results: [], S: state, 融合配方列表 }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = <T,>(name: string) => (...args: unknown[]) => g<(...a: unknown[]) => T>(name)(...args);
  const classPorts = (): FusionClassPorts => ({ classes: Object.fromEntries(['武器类', '防御装备类', '空桶', '水桶', '岩浆桶', '冰桶', '血水桶', '炸弹', '卷轴类', '钥匙']
    .map(name => [name, g(name)])) as FusionClassPorts['classes'] });
  const ports: FusionExecPorts = {
    isOnline: () => g<boolean>('联机模式'), emit: (event, payload) => g<{ emit(...a: unknown[]): void }>('socket').emit(event, payload),
    isA: (item, name) => item instanceof g<abstract new () => unknown>(name),
    notify: fn('显示通知'), log: fn('添加日志'), spendEnergy: fn('扣除能量'), cloneItem: fn('克隆物品'), tryCollect: fn('尝试收集物品'),
    destroyItem: fn('处理销毁物品'), createEmptyBucket: config => new (g<new (c: unknown) => never>('空桶'))(config),
    placeItemAtCell: fn('放置物品到单元格'), random: fn('prng'), now: () => g<DateConstructor>('Date').now(),
    removeFromFusion: fn('从融合区移除'), mergeBuffs: fn('合并Buff列表'),
    isFusionWeapon: item => isFusionWeapon(classPorts(), item), isFusionMaterial: item => isFusionMaterial(classPorts(), item),
    checkRecipes: fn('检查融合配方'), refreshFusionWindow: fn('更新融合窗口'), refreshInventory: fn('更新背包显示'), refreshEquipment: fn('更新装备显示'),
  };
  context.执行融合 = () => executeFusion(state, ports);
  new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  return g<Record<string, unknown>>(`with (S) { ${final} }; final`);
}

describe('fusion commit (执行融合)', () => {
  it('matches the source over 1200 seeded sessions', () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 1200; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) {
        bump(String(call[0]));
        if (call[0] === '显示通知') for (const text of NOTICES) if (String(call[1]).includes(text)) bump(`notify:${text}`);
      }
      for (const entry of source.results as unknown[][]) if (entry?.[0] === 'throw') bump('throw');
    }
    for (const key of ['emit', 'energy', 'collect', 'clone', 'new', 'enchant', 'merge', '处理销毁物品', '放置物品到单元格', '从融合区移除', '添加日志',
      '检查融合配方', '更新融合窗口', 'throw', ...NOTICES.map(text => `notify:${text}`)])
      expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 180_000);
});
