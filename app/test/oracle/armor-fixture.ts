import { expect } from 'vitest';
import { ArmorItem, type ArmorAttacker, type ArmorConfig } from '../../src/game/armor';
import { DEFENSIVE_CLASSES, type DefensiveKind, type DefensivePorts } from '../../src/game/armor-items';
import type { EffectSource } from '../../src/game/status-ports';
import { FUSION_BUFF_TYPES as B } from '../../src/game/buffs';
import { MATERIALS } from '../../src/game/item-core';
import { createOracle } from './source';
import { graphSnapshot } from './graph';
import { copyInputs } from './inputs';

export function world(draws: number[] = [0.25, 0.75, 0.5, 0.01]) {
  const events: unknown[][] = []; let index = 0;
  class MonsterStub implements ArmorAttacker {
    当前生命值 = 20; 类型 = '测试怪物';
    受伤(amount: number, type: string) { events.push(['damage', this, amount, type]); this.当前生命值 -= amount; }
  }
  class CactusStub extends MonsterStub {}
  class WeaponStub {}
  class FixedDate extends Date { constructor() { super(1720000000000); events.push(['date']); } static now() { events.push(['now']); return 1720000000000; } }
  const effects: DefensivePorts['playerEffects'] = [];
  const status = (...args: unknown[]) => {
    events.push(['status', ...args]);
    if (args[6] === null) effects.push({ 类型: args[0] as string, 来源: args[5] as EffectSource | null,
      剩余回合: (args[4] || args[3]) as number });
  };
  class StatusStub { constructor(...args: unknown[]) { status(...args); } }
  const ports: DefensivePorts = {
    materials: MATERIALS, colors: ['#fff'], maxStack: 64, equipment: new Map(), equipmentPage: 0, equipmentPerPage: 3,
    timers: [], cells: Array.from({ length: 2 }, () => Array.from({ length: 2 }, () => ({ 关联物品: null, 类型: 'item' }))), Weapon: WeaponStub, Monster: MonsterStub, Cactus: CactusStub, buffTypes: B,
    player: { 当前能量值: 30, 攻击加成: 0 }, playerEffects: effects, chargeColor: '#charge',
    icons: Object.fromEntries(Object.keys(DEFENSIVE_CLASSES).map(name => [name, `icon:${name}`])) as DefensivePorts['icons'],
    itemCellType: 'item', damagePlayer: (amount, type) => { events.push(['playerDamage', amount, type]); }, paint: () => { events.push(['paint']); }, initialEnergy: 50, poisonColor: '#poison', status,
    random: () => { const value = draws[index++ % draws.length]!; events.push(['random', value]); return value; },
    date: () => new FixedDate(), now: FixedDate.now, log: (text, type) => { events.push(['log', text, type]); },
    refreshEquipment: () => { events.push(['equipment']); }, refreshInventory: () => { events.push(['inventory']); },
    formatBuff: buff => JSON.stringify(buff), describeEnchantments: value => JSON.stringify(value),
    destroy: (id, automatic) => { events.push(['destroy', id, automatic]); },
    notify: (text, type) => { events.push(['notify', text, type]); }, hud: () => { events.push(['hud']); },
  };
  return { ports, events, MonsterStub, CactusStub, WeaponStub, FixedDate, StatusStub,
    summary: () => ({ events, index, player: ports.player, equipment: ports.equipment, timers: ports.timers, effects, cells: ports.cells }) };
}
export function compareArmor(config: ArmorConfig, action: (armor: ArmorItem, env: ReturnType<typeof world>) => unknown = () => null,
  draws?: number[], kind?: DefensiveKind) {
  const first = world(draws); const second = world(draws);
  const original = createOracle(['物品', '防御装备类', '深度比较', '融合Buff类型', ...(kind ? [kind] : [])], {
    Map, Date: second.FixedDate, prng: second.ports.random, 材质: MATERIALS, 最大堆叠数: 64,
    颜色表: second.ports.colors, 玩家装备: second.ports.equipment, 当前装备页: 0, 装备栏每页装备数: 3,
    所有计时器: second.ports.timers, 地牢: second.ports.cells, 武器类: second.WeaponStub,
    格式化Buff提示: second.ports.formatBuff, 获取附魔描述: second.ports.describeEnchantments,
    添加日志: second.ports.log, 显示通知: second.ports.notify, 更新装备显示: second.ports.refreshEquipment,
    更新背包显示: second.ports.refreshInventory, 处理销毁物品: second.ports.destroy, 触发HUD显示: second.ports.hud,
    玩家属性: second.ports.player, 自定义全局设置: { 初始能量值: second.ports.initialEnergy },
    怪物: second.MonsterStub, 仙人掌怪物: second.CactusStub, 状态效果: second.StatusStub,
    效果颜色编号映射: { poison: second.ports.poisonColor, charge: second.ports.chargeColor }, 效果名称编号映射: { 中毒: 'poison', 充能: 'charge' },
    图标映射: second.ports.icons, 玩家状态: second.ports.playerEffects, 单元格类型: { 物品: second.ports.itemCellType },
    伤害玩家: second.ports.damagePlayer, 绘制: second.ports.paint,
  });
  Object.defineProperty(second.ports, 'initialEnergy', {
    get: () => (original.context.自定义全局设置 as { 初始能量值: number }).初始能量值,
    set: value => { (original.context.自定义全局设置 as { 初始能量值: number }).初始能量值 = value; },
  });
  const actualInput = copyInputs(config); const expectedInput = copyInputs(config);
  const actual = kind ? new DEFENSIVE_CLASSES[kind](first.ports, actualInput) : new ArmorItem(first.ports, actualInput);
  const expected = original.construct<ArmorItem>(kind || '防御装备类', expectedInput);
  const result = outcome(() => action(actual, first)); const expectedResult = outcome(() => action(expected, second));
  const encode = (value: unknown) => JSON.stringify(graphSnapshot(value, { ArmorItem: '防御装备类', ItemCore: '物品' }));
  expect(encode({ input: actualInput, armor: actual, result, ...first.summary() })).toBe(encode({ input: expectedInput, armor: expected, result: expectedResult, ...second.summary() }));
}
export function outcome(action: () => unknown) { try { return { value: action() }; } catch (error) { return { error: (error as Error).name, message: (error as Error).message }; } }

