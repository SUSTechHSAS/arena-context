import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { SOURCE_GLOBAL_CLASS_NAMES, SourceClassRegistry } from '../src/game/runtime/class-registry';
import { createItemCellCodec, type ItemCellCodecPorts } from '../src/game/runtime/save-items-cells';
import { createWorldState } from '../src/game/world/state';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['序列化物品', '恢复物品', '序列化单元格', '恢复单元格'];
const SOURCE_GLOBALS = ['单元格类型', '环境类型', '颜色表', '单元格'];
/** Stub classes shared by both realms; `栅栏` exists but is not in `注册全局类`, `随便` is unknown to every registry. */
const CLASSES = ['物品', '怪物', '刷怪笼', '武器类', '宠物', '附魔卷轴', '神秘商人', '祭坛类', '物品祭坛', '折跃门', '药水类', '神秘药水', '隐形毒气陷阱', '钥匙', '栅栏', '随便'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value, { GameCell: '单元格' }));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(r() * list.length)];
  const chance = p => r() < p;
  let serial = 0;
  globalThis.console = { warn: (...a) => calls.push(['warn', ...a.map(tag)]), error: (...a) => calls.push(['error', ...a.map(tag)]) };
  globalThis.Date = { now: () => { calls.push(['now']); return 1700000000000 + calls.length; } };
  globalThis.图标映射 = { 药水: '🧪', 祭坛: '⛩', 毒气: '☁', 钥匙: '🔑', 宝剑: '🗡' };
  globalThis.楼梯图标 = { 下楼: '⬇', 上楼: '⬆' };
  globalThis.切换楼层 = async (...a) => { calls.push(['switch', ...a]); await null; };
  function tag(v) {
    if (v instanceof Error || (v && typeof v === 'object' && typeof v.message === 'string' && typeof v.stack === 'string')) return ['Error', v.constructor.name, v.message];
    if (typeof v === 'symbol') return 'sym:' + v.description;
    if (v && typeof v === 'object') return 'obj:' + (v.名称 ?? v.类名 ?? Object.keys(v).length);
    return v;
  }
  const effects = [function 锋利() {}, function 耐久() {}, function 火焰() {}];
  class 物品 {
    constructor(c = {}) {
      this.类型 = c.类型 ?? '物品'; this.名称 = c.名称; this.图标 = c.图标 ?? '?'; this.品质 = c.品质 ?? 1; this.堆叠数量 = c.数量 ?? 1;
      this.最大堆叠数量 = c.最大堆叠数量 ?? 1; this.颜色索引 = c.颜色索引 ?? 0; this.强化 = c.强化 ?? false; this.能否拾起 = c.能否拾起 ?? true;
      this.是否正常物品 = c.是否正常物品 ?? true; this.是否隐藏 = c.是否隐藏 ?? false; this.是否为隐藏物品 = c.是否为隐藏物品 ?? false;
      this.效果描述 = c.效果描述 ?? null; this.已装备 = c.已装备 ?? false; this.装备槽位 = c.装备槽位 ?? null; this.x = c.x; this.y = c.y;
      this.阻碍怪物 = c.阻碍怪物; this.材质 = c.材质; this.玩家放置 = c.玩家放置;
      this.唯一标识 = 'id' in c ? c.id : (c.唯一标识 ?? Symbol.for('item_' + serial++));
      this.自定义数据 = c.数据 instanceof Map ? c.数据 : c.数据 === undefined ? new Map() : c.数据;
      this.收到配置键 = Object.keys(c);
    }
  }
  class 怪物 { constructor(c = {}) { this.类型 = c.类型 ?? '怪物'; this.名称 = c.名称 ?? '史莱姆'; } }
  class 刷怪笼 extends 物品 {}
  class 武器类 extends 物品 {}
  class 宠物 extends 物品 { constructor(c = {}) { super(c); this.是否已放置 = c.是否已放置; this.层数 = c.层数; } }
  class 附魔卷轴 extends 物品 {
    constructor(c = {}) { super(c); this.附魔池 = effects; this.效果名 = ['锋利', '耐久', '火焰']; this.附魔效果 = pick([...effects, () => 0]); this.可用次数 = pick([1, 2, undefined]); }
  }
  class 神秘商人 extends 物品 {}
  class 祭坛类 extends 物品 {}
  class 物品祭坛 extends 祭坛类 {}
  class 折跃门 extends 物品 {}
  class 药水类 extends 物品 {}
  class 神秘药水 extends 药水类 {}
  class 隐形毒气陷阱 extends 物品 {}
  class 钥匙 extends 物品 {}
  class 栅栏 extends 物品 {}
  class 随便 extends 物品 {}
  Object.assign(globalThis, { 物品, 怪物, 刷怪笼, 武器类, 宠物, 附魔卷轴, 神秘商人, 祭坛类, 物品祭坛, 折跃门, 药水类, 神秘药水, 隐形毒气陷阱, 钥匙, 栅栏, 随便 });
  const kinds = [物品, 刷怪笼, 武器类, 宠物, 附魔卷轴, 神秘商人, 物品祭坛, 折跃门, 药水类, 神秘药水, 隐形毒气陷阱, 钥匙, 栅栏, 随便];
  所有怪物.push(new 怪物(), new 怪物({ 名称: '蝙蝠' }));
  const strayMonster = new 怪物({ 名称: '游荡' });
  const id = () => pick([Symbol.for('k' + Math.floor(r() * 6)), Symbol('local'), Symbol(), undefined, 'str', 7]);
  const data = depth => {
    if (chance(0.1)) return pick([undefined, null, 0]);
    const m = new Map();
    if (chance(0.5)) m.set('耐久', Math.floor(r() * 50));
    if (chance(0.4)) m.set('冷却剩余', pick([0, 2, undefined, null]));
    if (chance(0.4)) m.set('当前生成物列表', [所有怪物[0], strayMonster, 所有怪物[1], depth < 2 ? makeItem(depth + 1) : null, 'x', null]);
    if (chance(0.4)) m.set('库存', [depth < 2 ? makeItem(depth + 1) : null, null, Object.create(null), { constructor: 0 }]);
    if (chance(0.4)) m.set('装备', { 头: depth < 2 ? makeItem(depth + 1) : null, 身: null, 手: { 唯一标识: null } });
    if (chance(0.4)) m.set('技能', [{ 名: '撕咬', 级: 2, f: undefined }]);
    if (chance(0.4)) m.set('目标房间', pick([{ id: 3 }, null, { id: 0 }]));
    return m;
  };
  function makeItem(depth = 0) {
    const Kind = pick(kinds);
    const cfg = { 名称: pick(['宝剑', '钥匙', undefined, '药水', '']), 数据: data(depth), 是否隐藏: chance(0.2), 数量: pick([1, 3, undefined]), x: pick([1, undefined, null, 0]), y: 2 };
    if (chance(0.85)) cfg.唯一标识 = id(); else cfg.id = id();
    const item = new Kind(cfg);
    if (chance(0.15)) item.是否被丢弃 = pick([true, 0, 'yes']);
    if (Kind === 宠物) { item.是否已放置 = pick([true, undefined, null]); item.层数 = pick([1, undefined]); }
    return item;
  }
  const scrub = (value, seen = new Map()) => {
    if (typeof value === 'function') return 'fn:' + value.name;
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    if (Object.prototype.toString.call(value) === '[object Map]') { const m = new Map(); seen.set(value, m); for (const [k, v] of value) m.set(scrub(k, seen), scrub(v, seen)); return m; }
    const out = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value)); seen.set(value, out);
    for (const key of Reflect.ownKeys(value)) out[key] = scrub(value[key], seen);
    return out;
  };
  globalThis.done = (async () => {
    // Items: serialize then restore (with tampering), and raw invalid inputs.
    const idMap = new Map();
    for (let i = 0; i < 6; i++) {
      const item = chance(0.08) ? pick([null, undefined, 0, Object.create(null), { constructor: null }]) : makeItem();
      const record = 序列化物品(item);
      results.push(['ser', scrub(record)]);
      let input = record ? JSON.parse(JSON.stringify(record)) : pick([null, {}, { 类名: '' }]);
      if (input && chance(0.3)) input.类名 = pick(['栅栏', '随便', '不存在', '钥匙', '物品', '神秘药水', '物品祭坛', 7]);
      if (input && chance(0.2)) input.唯一标识符串 = pick([undefined, '', 'Symbol(k1)', 'Symbol()', 'plain', 5]);
      if (input && chance(0.1)) input.配置 = pick([undefined, null, { 数据: null }, { 数据: { 冷却剩余: 4 } }]);
      if (input && input.配置 && input.配置.数据 && chance(0.4)) input.配置.数据.附魔效果名 = pick(['锋利', '火焰', '无']);
      if (input && input.配置 && chance(0.2)) input.配置.已装备 = pick([undefined, null, true]);
      const restored = 恢复物品(input, idMap);
      results.push(['res', scrub(restored), restored ? restored.唯一标识 === idMap.get(input.唯一标识符串) : null]);
    }
    results.push(['idMap', [...idMap.keys()]]);
    // Cells: serialize, tamper, restore; then exercise restored stairs.
    const itemIds = new Map(); const monsterIdx = new Map([[所有怪物[0], 0], [strayMonster, 'stray']]);
    const items = new Map(); const doors = new Map([['Symbol(door1)', { 唯一标识: Symbol.for('door1') }]]);
    for (let i = 0; i < 6; i++) {
      const cell = new 单元格(i, ${seed} % 5);
      if (chance(0.7)) cell.类型 = pick([0, 1, 2, 3, 5, 6, 7, 8, null]);
      if (chance(0.4)) cell.背景类型 = pick([0, 1, 2]);
      if (chance(0.2)) cell.是否强制墙壁 = pick([true, 1]);
      if (chance(0.4)) cell.环境 = pick(Object.values(环境类型).concat([null, '']));
      if (chance(0.2)) cell.已探索暗河 = true;
      if (chance(0.3)) cell.已揭示 = pick([true, 0]);
      if (chance(0.4)) cell.药水数据 = pick([{ 药水颜色: '#f00' }, null]);
      if (chance(0.5)) for (const d of ['上', '右', '下', '左']) cell.墙壁[d] = chance(0.4) ? pick([true, 1, 'x']) : false;
      if (chance(0.2)) cell.墙壁.斜 = true;
      if (chance(0.3)) cell.钥匙ID = pick([0, 3, undefined]);
      if (chance(0.3)) cell.颜色索引 = pick([0, 5, 6, 7]);
      if (chance(0.5)) {
        const item = chance(0.15) ? pick([{ 图标: '🪜' }, { 唯一标识: Symbol.for('ghost') }]) : makeItem();
        cell.关联物品 = item;
        if (chance(0.3) && item) itemIds.set(item.唯一标识, pick(['pre-' + i, '']));
      }
      if (chance(0.4)) cell.关联怪物 = pick([所有怪物[0], 所有怪物[1], strayMonster, 0]);
      if (chance(0.3)) cell.标识 = pick([Symbol.for('door1'), Symbol('door2')]);
      if (chance(0.2)) cell.配对单元格位置 = { x: 1, y: 2 };
      if (chance(0.2)) cell.isOneWay = true;
      if (chance(0.2)) cell.oneWayAllowedDirection = pick(['上', '']);
      if (chance(0.2)) cell.doorOrientation = pick(['水平', '']);
      if (chance(0.2)) cell.阻碍视野 = pick([true, 2]);
      if (chance(0.05)) Object.defineProperty(cell, '墙壁', { get() { throw new RangeError('walls'); } });
      const record = 序列化单元格(chance(0.05) ? null : cell, itemIds, monsterIdx);
      results.push(['cell', scrub(record)]);
      let input = record && chance(0.8) ? JSON.parse(JSON.stringify(record)) : pick([null, undefined, {}, { 类型: 6 }, { 类型: 7, 关联物品图标: '' }]);
      if (input && input.关联物品标识 && chance(0.6)) items.set(input.关联物品标识, makeItem());
      if (input && chance(0.2)) input.关联怪物索引 = pick([null, 0, 2]);
      if (input && chance(0.2)) input.墙壁 = pick([undefined, null, { 上: true }]);
      const restored = 恢复单元格(input, i, 9, items, new Map(), doors);
      const stairs = restored.关联物品 && restored.关联物品.类型 === '楼梯' ? restored.关联物品 : null;
      if (stairs) {
        results.push(['stairs-name', stairs.获取名称()]);
        当前层数 = pick([0, 4]);
        if (chance(0.3)) restored.类型 = pick([6, 7, 1]);
        await stairs.使用();
      }
      results.push(['cellRes', scrub(restored)]);
    }
    results.push(['itemIds', [...itemIds.entries()]]);
    globalThis.final = { results, calls };
  })();
`;

async function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`let 所有怪物 = []; let 当前层数 = 0;\n${[...SOURCE_GLOBALS, ...FUNCTIONS].map(name => declaration(name)).join('\n')}`).runInContext(context);
  // window: exactly the registered source names among the stubs, without Object.prototype (see SRC-45).
  const registered = CLASSES.filter(name => (SOURCE_GLOBAL_CLASS_NAMES as readonly string[]).includes(name));
  new vm.Script(scenario(seed).replace('const kinds', `globalThis.window = Object.assign(Object.create(null), { ${registered.join(', ')} }); const kinds`)).runInContext(context);
  await new vm.Script('done').runInContext(context);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

async function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const registry = new SourceClassRegistry();
  const ports: ItemCellCodecPorts = {
    classes: registry, icons: () => g('图标映射'), stairIcons: () => g('楼梯图标'),
    switchFloor: (...args) => g<(...a: unknown[]) => unknown>('切换楼层')(...args),
    now: () => g<{ now(): number }>('Date').now(),
    warn: (...args) => g<{ warn(...a: unknown[]): void }>('console').warn(...args),
    error: (...args) => g<{ error(...a: unknown[]): void }>('console').error(...args),
  };
  const codec = createItemCellCodec(state, ports);
  const { GameCell } = await import('../src/game/world/cell');
  const { 环境类型 } = await import('../src/game/world/constants');
  Object.assign(context, codec, { 单元格: GameCell, 环境类型 });
  const defineAll = () => {
    for (const name of CLASSES.filter(name => name !== '随便')) {
      const Kind = g<new (...a: unknown[]) => object>(name);
      registry.define(name, Kind, (...args) => new Kind(...args));
    }
  };
  Object.assign(context, { __defineAll: defineAll });
  new vm.Script(`with (S) { ${scenario(seed).replace('const kinds', '__defineAll(); const kinds')} }`).runInContext(context);
  await g<Promise<void>>('done');
  return g<Record<string, unknown>>('final');
}

describe('save records for items and cells (序列化物品, 恢复物品, 序列化单元格, 恢复单元格)', () => {
  it('matches the source over 400 seeded sessions', async () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 400; seed++) {
      const source = await sourceRun(seed); const mine = await rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const [kind, value] of source.results as [string, unknown][]) {
        if (kind === 'ser') bump(value === null ? 'ser-null' : 'ser-ok');
        if (kind === 'res') bump(value === null ? 'res-null' : 'res-ok');
        if (kind === 'cell') bump(value === null ? 'cell-null' : 'cell-ok');
        if (kind === 'stairs-name') bump('stairs');
      }
      for (const call of source.calls as unknown[][]) bump(`${call[0]}:${String(Array.isArray(call[1]) ? call[1][0] : call[1]).slice(0, 8)}`);
    }
    for (const key of ['ser-null', 'ser-ok', 'res-null', 'res-ok', 'cell-null', 'cell-ok', 'stairs', 'switch:-1', 'now:',
      'warn:尝试序列化无效', 'warn:未找到物品类构造', 'warn:物品缺少有效唯一', 'warn:无法找到附魔卷轴', 'warn:无法恢复附魔卷轴',
      'error:序列化物品 ', 'error:恢复物品 ', 'warn:单元格 (', 'error:序列化单元格']) {
      const total = Object.entries(tally).filter(([k]) => k.startsWith(key)).reduce((sum, [, n]) => sum + n, 0);
      expect(total, key).toBeGreaterThan(5);
    }
  }, 300_000);
});

describe('SRC-45 registry boundary', () => {
  it('the source restores browser globals named by a tampered save; the rewrite rejects them', () => {
    const context = vm.createContext({ console: { warn() {}, error() {} } });
    new vm.Script(`let 图标映射 = {}; class 武器类 {} class 药水类 {} class 神秘药水 {} class 祭坛类 {} class 附魔卷轴 {} class 刷怪笼 {} class 隐形毒气陷阱 {}
      ${declaration('恢复物品')}; globalThis.window = globalThis;`).runInContext(context);
    const record = { 类名: 'Object', 唯一标识符串: 'Symbol(x)', 配置: { 数量: 1 } };
    const source = new vm.Script('恢复物品').runInContext(context)(record, new Map()) as Record<string, unknown> | null;
    expect(source).not.toBeNull();
    expect(source!.堆叠数量).toBe(1);
    const warnings: unknown[] = [];
    const codec = createItemCellCodec(createWorldState(), {
      classes: new SourceClassRegistry(), icons: () => ({}), stairIcons: () => ({ 下楼: '', 上楼: '' }), switchFloor: () => undefined,
      now: () => 0, warn: (...args) => warnings.push(args), error: () => undefined,
    });
    expect(codec.恢复物品(record, new Map())).toBeNull();
    expect(warnings).toEqual([['未找到物品类构造器: Object']]);
  });
});
