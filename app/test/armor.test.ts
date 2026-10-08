import { describe, expect, it } from 'vitest';
import { ArmorItem, type ArmorAttacker, type ArmorConfig, type ArmorPorts } from '../src/game/armor';
import { FUSION_BUFF_TYPES as B } from '../src/game/buffs';
import { MATERIALS } from '../src/game/item-core';
import { createOracle } from './oracle/source';
import { graphSnapshot } from './oracle/graph';
import { copyInputs } from './oracle/inputs';

function world(draws: number[] = [0.25, 0.75, 0.5, 0.01]) {
  const events: unknown[][] = []; let index = 0;
  class MonsterStub implements ArmorAttacker {
    当前生命值 = 20; 类型 = '测试怪物';
    受伤(amount: number, type: string) { events.push(['damage', this, amount, type]); this.当前生命值 -= amount; }
  }
  class CactusStub extends MonsterStub {}
  class WeaponStub {}
  class FixedDate extends Date { constructor() { super(1720000000000); events.push(['date']); } static now() { events.push(['now']); return 1720000000000; } }
  const status = (...args: unknown[]) => { events.push(['status', ...args]); };
  class StatusStub { constructor(...args: unknown[]) { status(...args); } }
  const ports: ArmorPorts = {
    materials: MATERIALS, colors: ['#fff'], maxStack: 64, equipment: new Map(), equipmentPage: 0, equipmentPerPage: 3,
    timers: [], cells: [], Weapon: WeaponStub, Monster: MonsterStub, Cactus: CactusStub, buffTypes: B,
    player: { 当前能量值: 30 }, initialEnergy: 50, poisonColor: '#poison', status,
    random: () => { const value = draws[index++ % draws.length]!; events.push(['random', value]); return value; },
    date: () => new FixedDate(), now: FixedDate.now, log: (text, type) => { events.push(['log', text, type]); },
    refreshEquipment: () => { events.push(['equipment']); }, refreshInventory: () => { events.push(['inventory']); },
    formatBuff: buff => JSON.stringify(buff), describeEnchantments: value => JSON.stringify(value),
    destroy: (id, automatic) => { events.push(['destroy', id, automatic]); },
    notify: (text, type) => { events.push(['notify', text, type]); }, hud: () => { events.push(['hud']); },
  };
  return { ports, events, MonsterStub, CactusStub, WeaponStub, FixedDate, StatusStub,
    summary: () => ({ events, index, player: ports.player, equipment: ports.equipment, timers: ports.timers }) };
}
function compare(config: ArmorConfig, action: (armor: ArmorItem, env: ReturnType<typeof world>) => unknown = () => null,
  draws?: number[]) {
  const first = world(draws); const second = world(draws);
  const original = createOracle(['物品', '防御装备类', '深度比较', '融合Buff类型'], {
    Map, Date: second.FixedDate, prng: second.ports.random, 材质: MATERIALS, 最大堆叠数: 64,
    颜色表: second.ports.colors, 玩家装备: second.ports.equipment, 当前装备页: 0, 装备栏每页装备数: 3,
    所有计时器: second.ports.timers, 地牢: [], 武器类: second.WeaponStub,
    格式化Buff提示: second.ports.formatBuff, 获取附魔描述: second.ports.describeEnchantments,
    添加日志: second.ports.log, 显示通知: second.ports.notify, 更新装备显示: second.ports.refreshEquipment,
    更新背包显示: second.ports.refreshInventory, 处理销毁物品: second.ports.destroy, 触发HUD显示: second.ports.hud,
    玩家属性: second.ports.player, 自定义全局设置: { 初始能量值: second.ports.initialEnergy },
    怪物: second.MonsterStub, 仙人掌怪物: second.CactusStub, 状态效果: second.StatusStub,
    效果颜色编号映射: { poison: second.ports.poisonColor }, 效果名称编号映射: { 中毒: 'poison' },
  });
  Object.defineProperty(second.ports, 'initialEnergy', {
    get: () => (original.context.自定义全局设置 as { 初始能量值: number }).初始能量值,
    set: value => { (original.context.自定义全局设置 as { 初始能量值: number }).初始能量值 = value; },
  });
  const actualInput = copyInputs(config); const expectedInput = copyInputs(config);
  const actual = new ArmorItem(first.ports, actualInput);
  const expected = original.construct<ArmorItem>('防御装备类', expectedInput);
  const result = outcome(() => action(actual, first)); const expectedResult = outcome(() => action(expected, second));
  const encode = (value: unknown) => JSON.stringify(graphSnapshot(value, { ArmorItem: '防御装备类', ItemCore: '物品' }));
  expect(encode({ input: actualInput, armor: actual, result, ...first.summary() })).toBe(encode({ input: expectedInput, armor: expected, result: expectedResult, ...second.summary() }));
}
function outcome(action: () => unknown) { try { return { value: action() }; } catch (error) { return { error: (error as Error).name, message: (error as Error).message }; } }

const profiles: ArmorConfig[] = [
  {}, { 品质: 0, 防御力: 0, 耐久: 0 }, { 品质: undefined, 类型: '覆盖类型', 名称: '' } as unknown as ArmorConfig,
  { 品质: 5, 强化: true, 防御力: 7, 耐久: 1, 附魔: [{ 种类: '保护附魔', 等级: 3 }, { 种类: '耐久附魔', 等级: 3 }, { 种类: '荆棘附魔', 等级: 2 }] },
  { 数据: new Map([['防御力', 99]]) },
  { 数据: { 防御力: '2', 耐久: '0.20' }, 强化: true },
  { 数据: { 防御力: NaN, 耐久: Infinity }, 品质: -1 },
  { 不可破坏: true, 耐久: 2 },
  { 附魔: [{ 种类: '爆炸保护附魔', 等级: 2 }, { 种类: '火焰附魔', 等级: 1 }] },
  { 附魔: [{ 种类: '火焰附魔', 等级: 0 }, { 种类: '火焰附魔', 等级: 2 }],
    fusedBuffs: [{ type: B.闪避几率, value: 1 }, { type: B.中毒几率, value: 1 }, { type: B.受击回能, value: 1.2 }] },
  { fusedBuffs: [{ type: B.防御加成, value: 2 }, { type: B.防御倍率, value: 0.5 }, { type: B.协同效应, value: 3 }, { type: B.固定伤害减免, value: 2 }] },
  { 数据: { 附魔: null, fusedBuffs: [] } },
];

describe('complete defensive-equipment logic against exact original base class', () => {
  it.each(profiles.map((config, index) => [index, config] as const))('constructor/getters/hints/use profile #%i', (_index, config) => compare(config,
    armor => ({ defense: armor.最终防御力, consumption: armor.耐久消耗, thorn: armor.反伤,
      hint: outcome(() => armor.获取提示()), use: armor.使用(), equip: armor.装备(), unequip: armor.取消装备() })));

  it('all profiles × damage boundaries × attacker kinds preserve events/state and draws', () => {
    for (const config of profiles) for (const amount of [-1, 0, 0.1, 2, 20, NaN, Infinity]) for (const kind of ['none', 'bomb', 'monster', 'dead', 'cactus']) {
      compare(config, (armor, env) => {
        const target = kind === 'cactus' ? new env.CactusStub() : new env.MonsterStub();
        if (kind === 'dead') target.当前生命值 = 0;
        const attacker = kind === 'none' ? null : kind === 'bomb' ? '炸弹' : target;
        return { damage: armor.当被攻击(amount, attacker), target };
      });
    }
  });
  it('sequential attacks, dodge chip damage, thorns exclusion and destroyed callbacks repeat', () => {
    compare({ 耐久: 0.2, fusedBuffs: [{ type: B.闪避几率, value: 1 }], 附魔: [{ 种类: '荆棘附魔', 等级: 2 }] }, (armor, env) => {
      const target = new env.MonsterStub();
      return [armor.当被攻击(5, target), armor.当被攻击(5, target), armor.当被攻击(5, new env.CactusStub())];
    });
  });
  it('ordered buffs, duplicate enchantments and initial-energy zero/NaN preserve source quirks', () => {
    for (const initial of [0, -1, NaN, 100]) compare({ fusedBuffs: [{ type: B.受击回能, value: 0 }],
      附魔: [{ 种类: '爆炸保护附魔', 等级: 0 }, { 种类: '爆炸保护附魔', 等级: 1 }] }, (armor, env) => {
      env.ports.initialEnergy = initial; return armor.当被攻击(8, '炸弹');
    });
    compare({ fusedBuffs: [{ type: B.防御倍率, value: 0.5 }, { type: B.防御加成, value: 2 },
      { type: B.协同效应, value: 1 }, { type: B.协同效应, value: 7 }] }, armor => armor.最终防御力);
  });
});
