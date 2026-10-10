import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 融合配方列表 } from '../src/game/world/constants';
import { checkFusionRecipes, type FusionCheckPorts } from '../src/game/world/fusion-check';
import { isFusionMaterial, isFusionWeapon, type FusionClassPorts } from '../src/game/world/fusion-recipes';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['检查融合配方', '是否为有效融合武器', '是否为有效融合材料'];
const GLOBALS = ['材质', '融合Buff类型', '融合配方列表'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 5; i++) r();
  const pick = list => list[Math.floor(r() * list.length)];
  let uid = 0; let handler = null;
  Date.now = () => 5000 + uid;
  class 元素 { constructor(tag) { this.tag = tag; this.style = {}; this.children = []; }
    appendChild(child) { calls.push(['append', this.tag, child.tag]); this.children.push(child); } }
  class 输出格 { set innerHTML(v) { calls.push(['html', v]); } set onclick(v) { calls.push(['onclick', typeof v, 融合结果 === null]); handler = v; }
    appendChild(c) { calls.push(['out-append', c.tag, c.style.cursor, c.children.map(x => [x.tag, x.textContent, x.style.cssText, x.style.color, x.style.fontSize, x.style.textAlign])]); } }
  const output = new 输出格();
  const typeOf = { 武器类: '武器', 防御装备类: '防御装备', 药水类: '药水', 附魔卷轴: '卷轴', 卷轴类: '卷轴' };
  class 物品 {
    constructor(o = {}) {
      this.唯一标识 = 'id' + ++uid; this.名称 = o.名称 ?? (r() < 0.75 ? new.target.name : pick(['甲', '乙']));
      this.堆叠数量 = pick([1, 1, 3]); this.材质 = pick(['木质', '铁质', '铁质', '玻璃', '普通', undefined]);
      this.品质 = pick([1, 2, 3]); this.强化 = r() < 0.3; this.攻击力 = pick([3, 7, 12]); this.图标 = 'i' + uid; this.颜色索引 = 0;
      this.类型 = pick([typeOf[new.target.name] ?? typeOf[Object.getPrototypeOf(new.target).name] ?? '杂物', '杂物']);
      this.自定义数据 = r() < 0.03 ? undefined : new Map([
        ['耐久', pick([0, 5, 10, undefined])], ['原耐久', pick([undefined, 20])], ['锈蚀度', pick([0, 0, 2])],
        ['不可破坏', r() < 0.2], ['已解锁', r() < 0.75], ['效果强度', pick([1, 3])], ['基础持续时间', pick([undefined, 4])],
        ['效果类型', 'e' + uid], ['fusedBuffs', r() < 0.3 ? [{ type: 'FIRE_DAMAGE_CHANCE', value: pick([0.3, 0.6]), usesLeft: pick([undefined, 2]) }] : undefined],
        ['附魔', r() < 0.3 ? [{ 种类: pick(['火焰附魔', '锋利附魔']), 等级: pick([1, 3]) }] : undefined]]);
      if (o.config) calls.push(['new', new.target.name, o.config]);
    }
    生成显示元素(mode) { calls.push(['display', this.唯一标识, mode]); return new 元素('preview:' + String(this.名称)); }
  }
  class 武器类 extends 物品 {} class 钢制长剑 extends 武器类 {} class 防御装备类 extends 物品 {} class 磨刀石 extends 物品 {}
  class 空桶 extends 物品 {} class 水桶 extends 物品 {} class 岩浆桶 extends 物品 {} class 冰桶 extends 物品 {} class 血水桶 extends 物品 {}
  class 药水类 extends 物品 { constructor(o) { super(o); this.强度 = 2; this.效果描述 = pick(['持续 3 回合，好', undefined, '无']); }
    get 持续时间() { return (this.自定义数据?.get('基础持续时间') ?? 3) + 1; } 获取药水颜色() { return 'c' + this.唯一标识; } }
  class 治疗药水 extends 药水类 {} class 狂暴药水 extends 药水类 {} class 失明药水 extends 药水类 {} class 普通药水 extends 药水类 {}
  class 炸弹 extends 物品 {} class 药水弹 extends 炸弹 { constructor(config) { super({ config }); } }
  class 药水桶 extends 物品 { constructor(config) { super({ config }); } }
  class 卷轴类 extends 物品 {} class 附魔卷轴 extends 卷轴类 { constructor(o) { super(o); this.当前附魔效果名 = pick(['火焰附魔', '锋利附魔', '保护附魔', '未知']); } }
  class 钥匙 extends 物品 {} class 金币 extends 物品 {}
  class 吸血剑 extends 武器类 { constructor(config) { super({ config }); } }
  class 产物 extends 物品 { constructor(config) { super({ config }); if (r() < 0.5) made.forEach(x => x.自定义数据?.set('不可破坏', !x.自定义数据.get('不可破坏'))); } }
  const kinds = [武器类, 钢制长剑, 防御装备类, 磨刀石, 空桶, 水桶, 岩浆桶, 冰桶, 血水桶, 治疗药水, 狂暴药水, 失明药水, 普通药水,
    炸弹, 药水弹, 附魔卷轴, 卷轴类, 钥匙, 金币, 金币, 物品];
  const combos = [[磨刀石, 武器类], [武器类, 磨刀石], [岩浆桶, 钢制长剑], [水桶, 治疗药水], [血水桶, 狂暴药水], [血水桶, 普通药水],
    [水桶, 武器类], [炸弹, 失明药水], [药水弹, 治疗药水], [物品, 物品], [附魔卷轴, 武器类], [防御装备类, 附魔卷轴], [武器类, 武器类],
    [防御装备类, 防御装备类], [水桶, 水桶], [武器类, 炸弹, 金币], [防御装备类, 卷轴类, 钥匙], [血水桶, 金币], [物品, 治疗药水],
    [治疗药水, 金币, 金币], [普通药水, 金币], [治疗药水, 治疗药水], [钢制长剑, 钢制长剑], [钢制长剑, 治疗药水]];
  const made = [];
  const make = (K, o) => { const item = new K(o ?? (K === 药水弹 || K === 药水桶 || K === 吸血剑 || K === 产物 ? undefined : {})); made.push(item); return item; };
  Object.assign(globalThis, { 物品, 武器类, 钢制长剑, 防御装备类, 磨刀石, 空桶, 水桶, 岩浆桶, 冰桶, 血水桶, 药水类, 治疗药水, 狂暴药水, 隐身药水: class extends 药水类 {},
    硫酸药水: class extends 药水类 {}, 中毒药水: class extends 药水类 {}, 冰冻药水: class extends 药水类 {}, 抗火药水: class extends 药水类 {}, 失明药水,
    炸弹, 药水弹, 药水桶, 卷轴类, 附魔卷轴, 钥匙, 金币, 产物,
    document: { getElementById: id => { calls.push(['element', id]); return output; }, createElement: tag => { calls.push(['create', tag]); return new 元素(tag); } },
    克隆物品: item => { const copy = Object.assign(Object.create(Object.getPrototypeOf(item)), item); if (item.自定义数据) copy.自定义数据 = new Map(item.自定义数据);
      copy.唯一标识 = 'clone' + ++uid; calls.push(['clone', item.唯一标识]); made.push(copy); return copy; },
    setTimeout: (f, ms) => { calls.push(['timeout', ms]); f(); return 'timer'; },
    执行融合: () => calls.push(['执行融合']),
    合并Buff列表: (a, b) => { calls.push(['merge-buffs', a?.length, b?.length]); return [...(a || []), ...(b || [])].slice(0, pick([0, 1, 2])); },
    合并附魔列表: (a, b) => { calls.push(['merge-ench', a?.length, b?.length]); return [...(a || []), ...(b || [])]; },
    计算融合Buff: (w, m, g) => { calls.push(['buffs', w.唯一标识, m.map(x => x.唯一标识), g]); return pick([[], [{ type: 'ATTACK_BONUS', value: 2 }]]); } });
  globalThis.window = globalThis;
  for (let session = 0; session < 4; session++) {
    handler = null; globalThis.吸血剑 = r() < 0.5 ? 吸血剑 : undefined;
    已发现的程序生成配方 = r() < 0.5 ? [{ 输入: pick([['甲', '乙'], ['磨刀石', '钥匙'], ['甲', '甲'], ['治疗药水', '治疗药水']]), 输出类: pick(['产物', '不存在的类']),
      输出数量: pick([undefined, 2]), 输出配置: pick([undefined, { 强化: true }]) }] : [];
    const layout = r();
    let slots;
    if (layout < 0.55) {
      const combo = pick(combos); slots = [null, null, null, null];
      const positions = r() < 0.7 ? [0, 1, 2, 3] : pick([[1, 0, 2, 3], [0, 2, 1, 3], [3, 1, 2, 0]]);
      combo.forEach((K, i) => { slots[positions[i]] = make(K); });
    } else if (layout < 0.65) {
      const recipe = pick([...已发现的程序生成配方, ...融合配方列表]);
      slots = [null, null, null, null];
      recipe.输入.forEach((name, i) => { slots[i] = make(globalThis[name] && typeof globalThis[name] === 'function' && globalThis[name] !== 吸血剑 ? globalThis[name] : 物品, { 名称: name }); });
    } else {
      slots = [0, 1, 2, 3].map(i => r() < (i === 0 ? 0.25 : 0.5) ? null : make(pick(kinds)));
    }
    融合区物品 = slots;
    fusionGoldQuantities = slots.map(v => v instanceof 金币 ? pick([0, 5, 20]) : pick([0, 3]));
    当前匹配的融合配方 = 'stale'; 融合结果 = { stale: session };
    try { results.push(['check', 检查融合配方()]); } catch (error) { results.push(['throw', error.constructor.name]); }
    const recipe = 当前匹配的融合配方;
    results.push([typeof recipe === 'string' || recipe === null ? recipe : ['recipe', recipe.输入, recipe.输出类, recipe.输出配置], 融合结果, handler === null]);
    if (handler && r() < 0.5) results.push(['click', handler()]);
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
  const ports: FusionCheckPorts = {
    isA: (item, name) => item instanceof g<abstract new () => unknown>(name),
    getElement: id => g<{ getElementById(id: string): never }>('document').getElementById(id),
    createElement: tag => g<{ createElement(tag: string): never }>('document').createElement(tag),
    cloneItem: fn('克隆物品'), construct: (name, config) => new (g<new (c: unknown) => never>(name))(config),
    windowLookup: name => g<Record<string, never>>('window')[name], now: () => g<DateConstructor>('Date').now(),
    schedule: (callback, delay) => g<(f: () => void, ms: number) => unknown>('setTimeout')(callback, delay),
    fuse: fn('执行融合'), mergeBuffs: fn('合并Buff列表'), mergeEnchantments: fn('合并附魔列表'), computeBuffs: fn('计算融合Buff'),
    isFusionWeapon: item => isFusionWeapon(classPorts(), item), isFusionMaterial: item => isFusionMaterial(classPorts(), item),
  };
  context.检查融合配方 = () => checkFusionRecipes(state, ports);
  new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  return g<Record<string, unknown>>(`with (S) { ${final} }; final`);
}

describe('fusion preview (检查融合配方)', () => {
  it('matches the source over 1200 seeded sessions', () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 1200; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) bump(String(call[0]));
      for (const entry of source.results as unknown[][]) {
        if (entry?.[0] === 'throw') bump('throw');
        else if (Array.isArray(entry) && entry.length === 3 && typeof entry[2] === 'boolean') bump(`recipe:${Array.isArray(entry[0]) ? `list:${String(entry[0][2])}` : String(entry[0])}`);
      }
    }
    for (const key of ['recipe:磨刀石打磨', 'recipe:岩浆淬火', 'recipe:药水稀释', 'recipe:药水桶融合', 'recipe:铁器生锈', 'recipe:药水弹融合',
      'recipe:玻璃铁器转化融合', 'recipe:卷轴附魔融合', 'recipe:药水金币延长', 'recipe:list:产物', 'recipe:list:治疗药水', 'recipe:list:吸血剑',
      'recipe:list:钢制长剑', 'recipe:装备融合', 'recipe:词条融合', 'recipe:木材转化融合', 'recipe:null', 'throw', 'create', 'timeout', '执行融合',
      'merge-buffs', 'merge-ench', 'buffs', 'new', 'clone'])
      expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 180_000);
});
