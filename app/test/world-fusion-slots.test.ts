import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 最大堆叠数 } from '../src/game/world/constants';
import { addToFusion, burnWoodenScrolls, clearFusion, removeFromFusion, type FusionSlotPorts } from '../src/game/world/fusion-slots';
import { declaration, originalDeclaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['添加到融合区', '从融合区移除', '清空融合区', '处理燃烧木质卷轴'];
const GLOBALS = ['最大堆叠数', '材质'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(r() * list.length)];
  let uid = 0; const timers = [];
  class 类列表 { constructor(id) { this.id = id; } remove(c) { calls.push(['class-remove', this.id, c]); } }
  class 物品 { constructor(o = {}) { this.唯一标识 = 'id' + ++uid; this.名称 = o.名称 ?? '物'; this.堆叠数量 = o.数量 ?? pick([1, 1, 2, 5]); this.装备槽位 = r() < 0.2 ? 1 : null;
      this.材质 = pick(['木质', '铁质']); if (r() < 0.5) this.显示元素 = { classList: new 类列表(this.唯一标识) }; }
    取消装备() { calls.push(['unequip', this.唯一标识]); } 获取名称() { return this.名称 + this.唯一标识; } }
  class 金币 extends 物品 { constructor(o = {}) { super(o); this.名称 = '金币'; this.堆叠数量 = o.数量 ?? pick([1, 2, 64]); calls.push(['gold-new', o.数量]); } }
  class 卷轴类 extends 物品 {}
  const tip = { style: { display: 'block' } };
  const name = v => v?.唯一标识 ?? String(v);
  Object.assign(globalThis, { 物品, 金币, 卷轴类, socket: { emit: (...a) => calls.push(['emit', ...a]) },
    document: { getElementById: id => { calls.push(['element', id]); return id === '浮动提示框' ? tip : { id }; } },
    克隆物品: item => { const copy = Object.assign(Object.create(Object.getPrototypeOf(item)), item); copy.唯一标识 = 'clone' + ++uid; calls.push(['clone', item.唯一标识]); return copy; },
    创建并播放物品移动动画: (start, target) => calls.push(['animate', start, target()?.id]),
    尝试收集物品: (item, silent) => { const out = r() < 0.7; calls.push(['collect', name(item), item?.堆叠数量, silent, out]); return out; },
    setTimeout: (f, ms) => { calls.push(['timeout', ms]); timers.push(f); },
    ...Object.fromEntries(['显示通知', '更新融合窗口', '检查融合配方', '更新背包显示', '更新装备显示', '处理销毁物品'].map(n => [n, (...a) => calls.push([n, ...a])])) });
  const make = () => new (pick([物品, 金币, 金币, 卷轴类]))();
  for (let session = 0; session < 3; session++) {
    联机模式 = r() < 0.2; 命令行模式开启 = r() < 0.4; if (r() < 0.5) globalThis.gsap = {}; else delete globalThis.gsap;
    const items = Array.from({ length: 6 }, make);
    玩家背包 = new Map(items.map(it => [it.唯一标识, it]));
    玩家装备 = new Map([[1, r() < 0.5 ? new 卷轴类() : null], [2, items[0]]].filter(([, v]) => v));
    融合区物品 = (r() < 0.25 ? [0, 1, 2, 3, 4] : [0, 1, 2, 3]).map((i) => r() < (i === 4 ? 0.9 : 0.4) ? null : make());
    const slotItems = [...融合区物品];
    fusionGoldQuantities = 融合区物品.map(v => v instanceof 金币 ? pick([0, 1, 63, 64]) : pick([0, 0, 2]));
    for (const slot of 融合区物品) if (slot && r() < 0.3) 玩家背包.set(slot, slot);
    融合结果 = r() < 0.5 ? { id: 'result' } : null;
    for (let step = 0; step < 6; step++) {
      const op = pick(['add', 'add', 'add', 'remove', 'remove', 'clear', 'burn']);
      try {
        if (op === 'add') results.push([op, 添加到融合区(r() < 0.08 ? null : pick([...玩家背包.values()]) ?? null, pick(['start-el', null]))]);
        else if (op === 'remove') results.push([op, 从融合区移除(pick([0, 1, 2, 3, 5]))]);
        else if (op === 'clear') results.push([op, 清空融合区()]);
        else results.push([op, 处理燃烧木质卷轴()]);
      } catch (error) { results.push(['throw', op, error.constructor.name]); }
      if (r() < 0.5) while (timers.length) timers.shift()();
      results.push([融合区物品.map(name), fusionGoldQuantities.slice(), [...玩家背包.keys()].map(name), 融合结果, { ...tip.style }]);
    }
    results.push(items, slotItems, 融合区物品);
  }
`;

const final = 'globalThis.final = { results, calls }';

function sourceRun(seed: number, read: (name: string) => string = declaration) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${[...new Set([...GLOBALS, ...FUNCTIONS].map(name => read(name)))].join('\n')}`).runInContext(context);
  new vm.Script(scenario(seed)).runInContext(context);
  return new vm.Script(`${final}; final`).runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state, 最大堆叠数 }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const is = (name: string) => (item: unknown) => item instanceof g<abstract new () => unknown>(name);
  const ports: FusionSlotPorts = {
    isOnline: () => g<boolean>('联机模式'), emit: (event, payload) => g<{ emit(...a: unknown[]): void }>('socket').emit(event, payload),
    isGold: is('金币'), createGold: (o) => new (g<new (o: unknown) => unknown>('金币'))(o), tryCollect: fn('尝试收集物品'), notify: fn('显示通知'),
    cloneItem: fn('克隆物品'), animate: fn('创建并播放物品移动动画'), getElement: (id) => g<{ getElementById(id: string): never }>('document').getElementById(id),
    gsapMissing: () => g<boolean>("typeof gsap === 'undefined'"), schedule: fn('setTimeout'),
    refreshFusionWindow: fn('更新融合窗口'), checkRecipes: fn('检查融合配方'), refreshInventory: fn('更新背包显示'), refreshEquipment: fn('更新装备显示'),
  };
  Object.assign(context, {
    添加到融合区: (item: unknown, start: unknown) => addToFusion(state, ports, item, start),
    从融合区移除: (index: unknown) => removeFromFusion(state, ports, index),
    清空融合区: () => clearFusion(state, { ...ports, remove: fn('从融合区移除') }),
    处理燃烧木质卷轴: () => burnWoodenScrolls(state, { isScroll: is('卷轴类'), notify: fn('显示通知'), destroyItem: fn('处理销毁物品'), refreshInventory: fn('更新背包显示'), refreshEquipment: fn('更新装备显示') }),
  });
  new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  return g<Record<string, unknown>>(`with (S) { ${final} }; final`);
}

describe('fusion slots and scroll burning (添加到融合区, 从融合区移除, 清空融合区, 处理燃烧木质卷轴)', () => {
  it('matches the source over 1000 seeded sessions', () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    let fixedSeeds = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      if (snap(sourceRun(seed, originalDeclaration)) !== snap(source)) fixedSeeds++; // SRC-31: unpatched source differs
      for (const call of source.calls as unknown[][]) bump(call[0] === '显示通知' ? `notify:${String(call[1]).slice(0, 6)}` : String(call[0]));
      for (const entry of source.results as unknown[][]) if (entry?.[0] === 'throw') bump(`throw:${String(entry[1])}`);
    }
    expect(fixedSeeds, 'unpatched SRC-31 differs').toBeGreaterThan(5);
    for (const key of ['emit', 'clone', 'animate', 'collect', 'timeout', 'unequip', 'class-remove', 'gold-new', '处理销毁物品', '检查融合配方', 'notify:融合区已满！', 'notify:背包已满，无', 'notify:融合区已满或'])
      expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
