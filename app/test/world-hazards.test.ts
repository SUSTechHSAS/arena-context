import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 环境类型 } from '../src/game/world/constants';
import { detonateSmokeNetwork, igniteSmokeNetwork, triggerPotionWater, type SmokePorts } from '../src/game/world/hazards';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['引燃烟雾网络', '引爆烟雾网络', '触发药水水域效果'];
const GLOBALS = ['环境类型'];
const POTIONS = ['治疗药水', '硫酸药水', '狂暴药水', '隐身药水', '抗火药水', '中毒药水', '冰冻药水', '失明药水'];
const EFFECTS = ['治疗', '腐蚀', '狂暴', '隐身', '抗火', '中毒', '冻结', '失明'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(r() * list.length)];
  let uid = 0;
  class 烟雾 { constructor(x, y) { this.x = x; this.y = y; this.唯一标识 = r() < 0.1 ? 'dup' : 'sm' + ++uid; }
    移除自身() { calls.push(['remove', this.唯一标识, this.x, this.y]); const cell = 地牢[this.y]?.[this.x]; if (cell && cell.关联物品 === this) cell.关联物品 = null; } }
  class 烟雾弹 extends 烟雾 {}
  class 火焰物品 { constructor(o) { this.o = o; calls.push(['fire-new', o]); } }
  class 炸弹 { constructor(o) { this.o = o; calls.push(['bomb-new', o]); bombs.push(this); } }
  class 状态效果 { constructor(...a) { calls.push(['status', ...a.map(v => v && typeof v === 'object' ? v.id : v)]); } }
  class 怪物 { constructor() { this.id = 'm' + ++uid; } 受伤(n, why) { calls.push(['hurt', this.id, n, why]); } }
  class 宠物 { constructor() { this.名称 = '宠' + ++uid; this.自定义数据 = new Map(); } 更新宠物管理窗口() { calls.push(['pet-window', this.名称]); } }
  class 防化服 { constructor() { this.唯一标识 = 'suit' + ++uid; this.自定义数据 = new Map([['耐久', pick([1, 2, 3])], ['不可破坏', r() < 0.2]]); } }
  class 药水基 { constructor(o) { this.o = o; this.自定义数据 = new Map(); calls.push(['potion-new', this.constructor.name, o]); }
    对实体生效(e, strength, duration) { calls.push(['apply', this.constructor.name, this.自定义数据.get('效果类型'), e === 玩家 ? 'player' : e?.名称 ?? e?.id, strength, duration]); } }
  ${POTIONS.map(name => `class ${name} extends 药水基 {}`).join(' ')}
  class PotA extends 药水基 {}
  const bombs = [];
  const stub = name => (...a) => { calls.push([name, ...a.map(v => v instanceof 火焰物品 ? 'fire' : v)]); };
  Object.assign(globalThis, { 烟雾, 烟雾弹, 火焰物品, 炸弹, 状态效果, 宠物, 防化服, PotA, ${POTIONS.join(', ')}, window: globalThis,
    效果颜色编号映射: { 7: '#f40' }, 效果名称编号映射: { 火焰: 7 }, 音效管理器: { 播放音效: stub('sound') },
    放置物品到单元格: (item, x, y) => { const out = r() < 0.75; calls.push(['place', x, y, out]); return out; },
    ...Object.fromEntries(['伤害玩家', '显示通知', '计划显示格子特效', '处理销毁物品', '添加日志', '更新装备显示'].map(name => [name, stub(name)])) });
  const potionData = () => r() < 0.15 ? null : { 药水名称: pick(['PotA', 'Missing', '治疗药水']), 药水效果: pick([...${JSON.stringify(EFFECTS)}, '未知']),
    药水颜色: pick([undefined, '#0f0']), 药水持续: pick([2, 5]), 药水强度: pick([1, 3]) };
  for (let session = 0; session < 3; session++) {
    地牢大小 = pick([5, 6, 6]);
    地牢 = Array.from({ length: 6 }, (_, y) => r() < 0.04 ? undefined : Array.from({ length: 6 }, (_, x) => r() < 0.04 ? null : ({ x, y,
      环境: pick([环境类型.药水水域, 环境类型.药水水域, 环境类型.水, null]), 药水数据: potionData(),
      关联物品: (k => k < 0.3 ? new 烟雾(x, y) : k < 0.45 ? new 烟雾弹(x, y) : null)(r()), 关联怪物: r() < 0.15 ? new 怪物() : null })));
    玩家 = { x: pick([0, 1, 2, 3]), y: pick([0, 1, 2, 3]) };
    当前装备页 = pick([0, 1]); 装备栏每页装备数 = 2;
    玩家装备 = new Map([1, 2, 3, 4].map(slot => [slot, r() < 0.25 ? new 防化服() : r() < 0.2 ? { id: 'gear' } : null]));
    const pets = [0, 1].map(() => { const pet = new 宠物(); const k = r(); if (k < 0.7) pet.自定义数据.set('装备', { 头: r() < 0.3 ? { id: 'hat' } : null, 身体: r() < 0.6 ? new 防化服() : null }); return pet; });
    const mob = { id: 'mob', 自定义数据: new Map([['装备', { 身体: new 防化服() }]]) };
    for (let step = 0; step < 6; step++) {
      const op = pick(['ignite', 'detonate', 'water', 'water']);
      const cells = 地牢.flat().filter(Boolean);
      try {
        if (op === 'water') results.push([op, 触发药水水域效果(pick([玩家, ...pets, { id: 'other' }, mob]), pick([...cells, null]))]);
        else {
          const start = r() < 0.1 ? null : pick(cells.map(c => c.关联物品).filter(Boolean)) ?? null;
          results.push([op, op === 'ignite' ? 引燃烟雾网络(start) : 引爆烟雾网络(start)]);
        }
      } catch (error) { results.push(['throw', op, error.constructor.name]); }
    }
    results.push(地牢, 玩家装备, pets, bombs.map(b => [b.x, b.y]));
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
  const context = vm.createContext({ calls: [], results: [], S: state, 环境类型 }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const is = (...names: string[]) => (item: unknown) => names.some(name => item instanceof g<abstract new () => unknown>(name));
  const make = (name: string) => (options: unknown) => new (g<new (o: unknown) => never>(name))(options);
  const smoke: SmokePorts = { isSmoke: is('烟雾', '烟雾弹'), damagePlayer: fn('伤害玩家'), notify: fn('显示通知'), scheduleCellEffect: fn('计划显示格子特效') };
  Object.assign(context, {
    引燃烟雾网络: (start: unknown) => igniteSmokeNetwork(state, {
      ...smoke, createFire: make('火焰物品'), placeItemAt: fn('放置物品到单元格'),
      fireColor: () => g<Record<string, unknown>>('效果颜色编号映射')[g<Record<string, string>>('效果名称编号映射').火焰!],
      createStatusEffect: (...args) => new (g<new (...a: unknown[]) => unknown>('状态效果'))(...args),
    }, start),
    引爆烟雾网络: (start: unknown) => detonateSmokeNetwork(state, { ...smoke, createBomb: make('炸弹'), playSound: (name) => g<{ 播放音效(n: string): void }>('音效管理器').播放音效(name) }, start),
    触发药水水域效果: (entity: unknown, cell: unknown) => triggerPotionWater(state, {
      isPet: is('宠物'), isHazmatSuit: is('防化服'), destroyItem: fn('处理销毁物品'), notify: fn('显示通知'), log: fn('添加日志'),
      refreshEquipment: fn('更新装备显示'), scheduleCellEffect: fn('计划显示格子特效'),
      lookupClass: (name) => g<Record<string, never>>('window')[name as string],
      potionForEffect: (effect) => (Object.fromEntries(EFFECTS.map((key, i) => [key, g(POTIONS[i]!)])) as Record<string, never>)[effect as string],
    }, entity, cell),
  });
  new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  return g<Record<string, unknown>>(`with (S) { ${final} }; final`);
}

describe('smoke networks and potion pools (引燃烟雾网络, 引爆烟雾网络, 触发药水水域效果)', () => {
  it('matches the source over 800 seeded sessions', () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 800; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) bump(call[0] === 'apply' ? `apply:${String(call[1])}` : String(call[0]));
      for (const entry of source.results as unknown[][]) if (entry[0] === 'throw') bump(`throw:${String(entry[1])}`);
    }
    for (const key of ['remove', 'fire-new', 'bomb-new', 'status', 'hurt', '伤害玩家', 'sound', 'pet-window', '处理销毁物品', '添加日志', '更新装备显示',
      'apply:PotA', 'apply:治疗药水', 'apply:硫酸药水', 'potion-new', '计划显示格子特效', 'throw:ignite']) expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
