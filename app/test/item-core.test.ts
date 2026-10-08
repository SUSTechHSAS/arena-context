import { describe, expect, it } from 'vitest';
import { ItemCore, MATERIALS, type ItemConfig, type ItemPorts } from '../src/game/item-core';
import { sourceDeepEqual } from '../src/domain/source-deep-equal';
import { createOracle } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

function world() {
  const events: unknown[][] = []; let draws = 0;
  class FixedDate extends Date {
    constructor() { super(1720000000000); events.push(['date']); }
    static now() { events.push(['now']); return 1720000000000; }
  }
  class WeaponStub extends ItemCore {}
  const ports: ItemPorts = {
    materials: MATERIALS, colors: ['#fff', '#aaa'], maxStack: 64,
    equipment: new Map(), equipmentPage: 0, equipmentPerPage: 3,
    timers: [], cells: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ 关联物品: null }))),
    Weapon: WeaponStub, random: () => { const value = (++draws % 7) / 8; events.push(['random', value]); return value; },
    now: FixedDate.now, date: () => new FixedDate(),
    log: (message, type) => { events.push(['log', message, type]); }, refreshInventory: () => { events.push(['inventory']); },
    refreshEquipment: () => { events.push(['equipment']); },
    formatBuff: buff => JSON.stringify(buff), describeEnchantments: value => `enchant:${JSON.stringify(value)}`,
  };
  return { ports, events, FixedDate, WeaponStub, summary: () => ({ draws, events, equipment: ports.equipment, timers: ports.timers, cells: ports.cells }) };
}
function copyInputs<T>(value: T, seen = new Map<object, object>()): T {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value) as T;
  if (value instanceof Map) {
    const result = new Map(); seen.set(value, result);
    for (const [key, item] of value) result.set(copyInputs(key, seen), copyInputs(item, seen));
    return result as T;
  }
  const result = Array.isArray(value) ? new Array(value.length) : Object.create(Object.getPrototypeOf(value)) as object;
  seen.set(value, result);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in descriptor)) throw new Error('No accessor inputs in this fixture copier');
    Object.defineProperty(result, key, { ...descriptor, value: copyInputs(descriptor.value, seen) });
  }
  return result as T;
}
function compare(configs: ItemConfig[], action: (items: ItemCore[], ports: ItemPorts) => unknown = () => null, weapon = false) {
  const first = world(); const second = world();
  const source = createOracle(['物品', '深度比较'], {
    Map, Date: second.FixedDate, 材质: second.ports.materials, 最大堆叠数: second.ports.maxStack,
    prng: second.ports.random, 颜色表: second.ports.colors, 玩家装备: second.ports.equipment,
    当前装备页: second.ports.equipmentPage, 装备栏每页装备数: second.ports.equipmentPerPage,
    所有计时器: second.ports.timers, 地牢: second.ports.cells, 添加日志: second.ports.log,
    更新背包显示: second.ports.refreshInventory, 更新装备显示: second.ports.refreshEquipment,
    格式化Buff提示: second.ports.formatBuff, 获取附魔描述: second.ports.describeEnchantments,
  });
  source.evaluate('class WeaponStub extends 物品 {}; 武器类 = WeaponStub;');
  const actualConfigs = copyInputs(configs); const sourceConfigs = copyInputs(configs);
  const actual = actualConfigs.map(config => weapon ? new first.WeaponStub(first.ports, config) : new ItemCore(first.ports, config));
  const expected = sourceConfigs.map(config => {
    if (!weapon) return source.construct<ItemCore>('物品', config);
    source.context.__config = config;
    try { return source.evaluate<ItemCore>('new WeaponStub(__config)'); }
    finally { delete source.context.__config; }
  });
  const result = action(actual, first.ports);
  const sourcePorts = second.ports;
  Object.defineProperties(sourcePorts, {
    timers: { get: () => source.context.所有计时器, set: value => { source.context.所有计时器 = value; } },
    equipmentPage: { get: () => source.context.当前装备页, set: value => { source.context.当前装备页 = value; } },
    equipmentPerPage: { get: () => source.context.装备栏每页装备数, set: value => { source.context.装备栏每页装备数 = value; } },
  });
  const expectedResult = action(expected, sourcePorts);
  const encode = (value: unknown) => JSON.stringify(graphSnapshot(value, { ItemCore: '物品' }));
  expect(encode({ configs: actualConfigs, items: actual, result, ...first.summary() })).toBe(encode({ configs: sourceConfigs, items: expected, result: expectedResult, ...second.summary() }));
}

// Representative source inputs include numeric falsy and raw Map/object shallow-copy data.
const profiles: ItemConfig[] = [
  {}, { 类型: '', 名称: '', 图标: '', 品质: 0, 堆叠数量: 0, x: 0, y: 0 },
  { 类型: '工具', 名称: '剑', 图标: '剑', 品质: 3, 堆叠数量: 2, 强化: true, 材质: '铁质' },
  { 材质: null, 颜色索引: 0, 品质: 0 }, { 颜色索引: null, 品质: -1, 最大堆叠数量: 1 },
  { 品质: NaN, x: NaN, y: -1, 已装备: false }, { 已装备: 2, x: 1, y: 2 },
  { 唯一标识: Symbol.for('supplied-item'), 材质: '木质', 阻碍怪物: false, 能否拾起: false, 是否正常物品: false },
  { 数据: { nested: { value: 3 }, 静默回合: 2, 耐久: 5, 原耐久: 10, 不可破坏: true }, 效果描述: '说明' },
  { 数据: new Map([['静默回合', 0], ['倒计时', -1]]) },
  { 数据: { 静默回合: 0, 倒计时: 0, 冷却剩余: 2, 冷却回合: 5 } },
  { 数据: { fusedBuffs: [{ id: 'buff' }], 附魔: ['火'], 冷却剩余: 2, 冷却回合: 3 } },
];

describe('base item data/lifecycle source contracts (legacy DOM methods pending)', () => {
  it.each(profiles.map((config, index) => [index, config] as const))('constructor #%i preserves fields, Symbol.for, exact calls and shallow data', (_index, config) => {
    compare([config]);
  });
  it('equipment slots/presence, null occupants, page arithmetic, consume underflow and destruction', () => {
    compare([{}, {}, {}, {}], (items, ports) => {
      const results: unknown[] = []; ports.equipment.set(1, null);
      for (const item of items) results.push(item.装备());
      results.push(items[0]!.装备(), items[0]!.取消装备(), items[0]!.取消装备());
      results.push(items[3]!.装备()); items[3]!.使用(); items[3]!.使用();
      results.push(items[3]!.安全销毁());
      return results;
    });
  });
  it('page and empty-page arithmetic remain exact, including full slots and NaN fallback', () => {
    for (const page of [0, 1, -1]) for (const perPage of [0, 2]) compare([{}, {}, {}], (items, ports) => {
      ports.equipmentPage = page; ports.equipmentPerPage = perPage;
      return items.map(item => item.装备());
    });
  });
  it('weapon classification keeps cooldown timers while removing ended silence', () => {
    for (const cooldown of [0, 1, NaN]) compare([{ 数据: { 静默回合: 0, 冷却剩余: cooldown } }], ([item], ports) => {
      ports.timers = [{ 唯一标识: item!.唯一标识 }]; return item!.更新倒计时();
    }, true);
  });
  it('stack limits and material omission preserve the original rule', () => {
    for (const quantity of [1, 63, 64, 65]) compare([{ 堆叠数量: quantity, 材质: '木质' }, { 材质: '铁质' }], items => itemStack(items));
    function itemStack(items: ItemCore[]) { return items[0]!.可堆叠于(items[1]!); }
  });
  it('countdown filters exact timer identities and preserves other timers', () => {
    for (const data of [{ 静默回合: 2 }, { 静默回合: 0, 倒计时: -1 }, { 静默回合: 0, 倒计时: 0 }, {}]) {
      compare([{ 数据: data }], ([item], ports) => {
        ports.timers = [{ 唯一标识: item!.唯一标识 }, { 唯一标识: Symbol.for('other') }];
        return Array.from({ length: 4 }, () => item!.更新倒计时());
      });
    }
  });
  it('removal only clears the matching cell and destroyed-null timer behavior remains', () => compare([{ x: 1, y: 1 }], ([item], ports) => {
    ports.cells[1]![1]!.关联物品 = item!;
    ports.timers = [{ 唯一标识: item!.唯一标识 }, { 唯一标识: null }];
    item!.移除自身(); item!.安全销毁(); item!.移除自身();
    return null;
  }));
  it('tooltip strings and default actions match original (including genuine quality errors)', () => {
    for (const config of profiles) compare([config], ([item]) => {
      let hint: unknown; try { hint = item!.获取提示(); } catch (error) { hint = { error: (error as Error).name }; }
      return { hint, name: item!.获取名称(), icon: item!.显示图标, colors: item!.颜色表,
        collected: item!.当被收集(null), dropped: item!.当被丢弃(0, 0), interact: item!.可交互目标({}) };
    });
  });
  it('data equality/stacking uses the original comparator, not richer diagnostic equality', () => {
    const dataPairs: [unknown, unknown][] = [[NaN, NaN], [null, null], [0, -0], [{ x: 1 }, { x: 1 }],
      [[1, 2], [1, 3]], [new Map([['x', 1]]), new Map([['x', 2]])]];
    for (const [first, second] of dataPairs) compare([{ 数据: { data: first } }, { 数据: { data: second } }], items => ({
      same: items[0]!.比较自定义数据(items[1]!.自定义数据), stack: items[0]!.可堆叠于(items[1]!),
    }));
  });
});

it('deep comparator reproduces ignored Map/prototype/symbol contents and null-prototype failures', () => {
  const source = createOracle(['深度比较']);
  const pairs: [unknown, unknown][] = [[1, 1], [NaN, NaN], [0, -0], [{ a: [1, 2] }, { a: [1, 2] }],
    [new Map([['a', 1]]), new Map([['a', 2]])], [new Date(0), new Date(100)],
    [{ [Symbol('x')]: 1 }, {}], [{ a: 1 }, Object.assign(Object.create(null) as object, { a: 1 })]];
  for (const [first, second] of pairs) {
    let expected: unknown; let actual: unknown;
    try { expected = source.invoke('深度比较', first, second); } catch (error) { expected = (error as Error).name; }
    try { actual = sourceDeepEqual(first, second); } catch (error) { actual = (error as Error).name; }
    expect(actual).toBe(expected);
  }
});
