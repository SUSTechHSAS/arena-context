import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { GameDoor } from '../src/game/door';
import { SOURCE_GLOBAL_CLASS_NAMES, SourceClassRegistry } from '../src/game/runtime/class-registry';
import { createFloorCodec } from '../src/game/runtime/save-floors';
import { createItemCellCodec } from '../src/game/runtime/save-items-cells';
import { createMonsterCodec } from '../src/game/runtime/save-monsters';
import { GameCell } from '../src/game/world/cell';
import { 单元格类型, 环境类型 } from '../src/game/world/constants';
import { createWorldState } from '../src/game/world/state';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['序列化物品', '恢复物品', '序列化单元格', '恢复单元格', '序列化怪物', '恢复怪物', '序列化楼层', '恢复楼层'];
const SOURCE_GLOBALS = ['单元格类型', '环境类型', '颜色表', '单元格', '怪物状态', '门'];
const ITEM_CLASSES = ['物品', '刷怪笼', '武器类', '防御装备类', '宠物', '神秘商人', '祭坛类', '物品祭坛', '折跃门', '药水类', '附魔卷轴', '神秘药水', '隐形毒气陷阱'];
const MONSTER_CLASSES = ['怪物', '王座守护者', '蜈蚣怪物', '蜈蚣部位', '骷髅仆从', '召唤师怪物', '幽灵仆从', '大魔法师', '旋风怪物', '旋风'];
/** Classes the monster codec tests with `instanceof`; defined so both realms resolve them, not instantiated here. */
const OTHER_MONSTERS = ['佣兵单位', '腐蚀怪物', '盗贼怪物', '吸能怪物', '剧毒云雾怪物', '萨满怪物', '大史莱姆怪物', '瞬移怪物', '伪装怪物', '炸弹怪物', '超速怪物', '巡逻怪物'];
const ALL = [...ITEM_CLASSES, ...MONSTER_CLASSES, ...OTHER_MONSTERS, '野怪'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value, { GameCell: '单元格', GameDoor: '门' }));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(r() * list.length)];
  const chance = p => r() < p;
  let p = ${seed} * 7919 % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  let serial = 0;
  globalThis.console = { log: (...a) => calls.push(['log', ...a.map(tag)]), warn: (...a) => calls.push(['warn', ...a.map(tag)]),
    error: (...a) => calls.push(['error', ...a.map(tag)]) };
  globalThis.Date = { now: () => 1700000000000 };
  globalThis.图标映射 = { 史莱姆: '🟢', 宝剑: '🗡' };
  globalThis.楼梯图标 = { 下楼: '⬇', 上楼: '⬆' };
  globalThis.切换楼层 = async () => undefined;
  globalThis.怪物技能池 = { a: { 名称: '冲撞' } };
  function tag(v) {
    if (v && typeof v === 'object' && typeof v.message === 'string' && typeof v.stack === 'string') return ['Error', v.constructor.name, v.message];
    if (typeof v === 'symbol') return 'sym:' + v.description;
    if (v && typeof v === 'object') return 'obj:' + (v.类型 ?? v.名称 ?? Object.keys(v).length);
    return v;
  }
  class 物品 {
    constructor(c = {}) {
      this.类型 = c.类型 ?? '物品'; this.名称 = c.名称; this.图标 = c.图标 ?? '?'; this.x = c.x; this.y = c.y;
      this.唯一标识 = c.唯一标识 ?? Symbol.for('item_' + serial++);
      this.自定义数据 = c.数据 instanceof Map ? c.数据 : new Map(); this.收到配置键 = Object.keys(c);
    }
  }
  class 刷怪笼 extends 物品 {} class 武器类 extends 物品 {} class 防御装备类 extends 物品 {} class 宠物 extends 物品 {} class 神秘商人 extends 物品 {}
  class 祭坛类 extends 物品 {} class 物品祭坛 extends 祭坛类 {} class 折跃门 extends 物品 {} class 药水类 extends 物品 {}
  class 附魔卷轴 extends 物品 {} class 神秘药水 extends 药水类 {} class 隐形毒气陷阱 extends 物品 {}
  class 杂物 extends 物品 {} // unknown to every registry: its records restore as null
  class 怪物 {
    constructor(c = {}) {
      this.类型 = c.类型 ?? pick(['史莱姆', '蝙蝠']); this.图标 = c.图标 ?? '?'; this.基础生命值 = c.基础生命值 || 20; this.基础攻击力 = c.基础攻击力 || 3;
      this.x = c.x; this.y = c.y; this.当前生命值 = c.当前生命值 || 40; this.攻击冷却回合剩余 = 0; this.技能池 = []; this.永久增益 = []; this.收到配置键 = Object.keys(c);
    }
    get 生命值() { return this.基础生命值 * 2; }
  }
  class 王座守护者 extends 怪物 {} class 蜈蚣怪物 extends 怪物 {} class 蜈蚣部位 extends 怪物 {} class 骷髅仆从 extends 怪物 {}
  class 召唤师怪物 extends 怪物 {} class 幽灵仆从 extends 怪物 {} class 大魔法师 extends 怪物 {} class 旋风怪物 extends 怪物 {} class 旋风 extends 怪物 {}
  class 野怪 extends 怪物 {}
  ${OTHER_MONSTERS.map(name => `class ${name} extends 怪物 {}`).join(' ')}
  class 状态效果 { constructor(...a) { calls.push(['effect', ...a.map(tag)]); 怪物状态表.set(a[6], { 类型: a[0], 剩余回合: a[4] }); } }
  Object.assign(globalThis, { ${ALL.join(', ')}, 状态效果 });
  const kinds = [${MONSTER_CLASSES.join(', ')}, 野怪, 怪物];
  const stray = new 怪物({ 类型: '游荡' });
  const simple = () => new (pick([物品, 武器类, 防御装备类, 药水类]))({ 名称: pick(['宝剑', '药水']) });
  const maybe = (value, q = 0.85) => chance(q) ? value : pick([undefined, null]);
  const scrub = (value, seen = new Map()) => {
    if (typeof value === 'function') return 'fn:' + value.name;
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    const kind = Object.prototype.toString.call(value);
    if (kind === '[object Map]') { const m = new Map(); seen.set(value, m); for (const [k, v] of value) m.set(scrub(k, seen), scrub(v, seen)); return m; }
    if (kind === '[object Set]') { const m = new Set(); seen.set(value, m); for (const v of value) m.add(scrub(v, seen)); return m; }
    const out = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value)); seen.set(value, out);
    for (const key of Reflect.ownKeys(value)) out[key] = scrub(value[key], seen);
    return out;
  };
  const makeFloor = layer => {
    const N = 3 + Math.floor(r() * 2);
    门实例列表 = new Map();
    const doors = [];
    for (let i = Math.floor(r() * 3); i > 0; i--) { const d = new 门({ 关联房间ID: pick([0, 1]), 位置: { x: i, y: 0 } }); d.是否上锁 = chance(0.5); doors.push(d); }
    const doorMap = 门实例列表;
    const monsters = [];
    for (let i = 2 + Math.floor(r() * 4); i > 0; i--) monsters.push(new (pick(kinds))({}));
    for (const m of monsters) {
      m.x = pick([0, 1, 2, 2, null]); m.y = pick([0, 1, 2]); m.层数 = pick([layer, layer, 9]); m.仇恨 = pick([玩家, monsters[0], stray, undefined, undefined]);
      if (chance(0.25)) 怪物状态表.set(m, { 类型: '中毒', 颜色: '#0f0', 图标: '☠', 持续时间: 3, 剩余回合: 2, 强度: 1 });
      if (m instanceof 召唤师怪物 || m instanceof 旋风怪物) m.当前召唤物列表 = maybe([monsters[0], stray, pick(monsters)], 0.9);
      if (m instanceof 召唤师怪物) m.召唤物类 = pick([幽灵仆从, 骷髅仆从]);
      if (m instanceof 幽灵仆从) m.召唤者 = pick([monsters[0], stray]);
      if (m instanceof 大魔法师) m.分身 = pick([undefined, monsters[0], stray]);
      if (m instanceof 蜈蚣怪物 || m instanceof 蜈蚣部位) m.存档ID = pick(['c' + layer, 'p' + layer, '']);
      if (m instanceof 蜈蚣怪物) m.身体部位 = maybe(monsters.filter(x => x instanceof 蜈蚣部位).concat([{ 存档ID: 'zz' }]), 0.9);
      if (m instanceof 蜈蚣部位) { m.主体 = pick([undefined, monsters.find(x => x instanceof 蜈蚣怪物)]); m.跟随 = pick([null, { 存档ID: 'p' + layer }]); }
      if (m instanceof 王座守护者) { m.皇家守卫列表 = maybe([monsters[0], stray, pick(monsters)], 0.9); m.激活的墓碑列表 = maybe([pick(monsters)], 0.9); }
      if (m instanceof 骷髅仆从 && chance(0.7)) 玩家仆从列表.push(m);
    }
    if (chance(0.15)) 玩家仆从列表.push(stray);
    const pool = [simple(), simple(), new 杂物({ 名称: '杂物' })];
    const makeItem = () => {
      const Kind = pick([物品, 刷怪笼, 武器类, 宠物, 神秘商人, 物品祭坛, 折跃门, 药水类]);
      const data = new Map();
      if (Kind === 宠物) data.set('装备', pick([{ 武器: pick(pool), 防具: pick([pick(pool), null]), 饰品: pick(pool) }, undefined, { 武器: null }]));
      if (Kind === 折跃门) data.set('目标房间', pick([{ id: 1 }, { id: 7 }, null, undefined]));
      if (Kind === 神秘商人 || Kind === 物品祭坛) data.set('库存', maybe([simple(), pick(pool)], 0.9));
      if (Kind === 刷怪笼) data.set('当前生成物列表', [monsters[0], pick(pool), stray, pick(monsters)]);
      return new Kind({ 名称: pick(['宝剑', '钥匙', '药水']), 数据: data, x: pick([1, 2, undefined]), y: 1,
        唯一标识: chance(0.15) ? Symbol.for('shared' + Math.floor(r() * 3)) : undefined });
    };
    const grid = [];
    for (let y = 0; y < N; y++) {
      const row = [];
      for (let x = 0; x < N; x++) {
        const c = new 单元格(x, y);
        if (chance(0.25)) c.关联物品 = makeItem();
        if (chance(0.2)) { c.关联怪物 = pick(monsters); c.类型 = 单元格类型.怪物; }
        if (doors.length && chance(0.2)) { c.标识 = pick(doors).唯一标识; c.类型 = 单元格类型.门; }
        row.push(c);
      }
      if (chance(0.03)) row.push(null);
      grid.push(row);
    }
    const room = id => {
      const out = { id, 类型: pick(['普通房间', '挑战房间', '宝藏房间']), x: id, y: 0, w: 2, h: 2, 门: maybe([{ x: 1, y: 0 }], 0.7) };
      if (chance(0.5)) out.挑战状态 = { 进行中: chance(0.5), 已完成: false, 当前波次: 1, 总波次: 3, 波次最大回合数: 10, 波次当前回合数: 2, 挑战怪物层级: 1,
        候选怪物池: ['史莱姆'], 波次内怪物: maybe([monsters[0], stray, pick(monsters)], 0.8),
        原始门数据: maybe([{ x: 1, y: 0, 原标识: pick([doors[0]?.唯一标识, Symbol('local'), null]) }], 0.8), 额外: 1 };
      if (chance(0.3)) out.自定义奖励 = pick([[], [{ 类名: '物品', 配置: { 数据: chance(0.6) ? new RewardMap([['k', 1]]) : { k: 2 } } }, { 类名: '武器类' }]]);
      return out;
    };
    const floor = { 地牢数组: grid, 房间列表: [room(0), room(1)], 上锁房间列表: chance(0.5) ? [room(2)] : undefined, 已访问房间: maybe(new Set([0, 1]), 0.7),
      房间地图: grid.map(row => row.map(() => pick([-1, 0, 1]))), 门实例列表: doorMap, 所有怪物: monsters,
      所有计时器: chance(0.6) ? [makeItem(), makeItem(), ...pool.filter(() => chance(0.7))] : undefined, 玩家初始位置: pick([{ x: 1, y: 1 }, undefined, { y: 2 }, null]),
      玩家位置: chance(0.92) ? { x: 1, y: 2 } : undefined, 当前天气效果: pick([undefined, ['雨']]),
      已揭示洞穴格子: chance(0.93) ? pick([new Set(['1,1', '2,2']), new Set(['1,1', '2,2']), null]) : undefined, 地牢生成方式: chance(0.93) ? pick(['cave', 'default', '']) : undefined };
    for (const key of Object.keys(floor)) if (floor[key] === undefined && chance(0.7)) delete floor[key];
    return floor;
  };
  globalThis.done = (async () => {
    for (let round = 0; round < 2; round++) {
      玩家仆从列表.length = 0;
      const floors = [makeFloor(0), makeFloor(1), makeFloor(2)];
      if (chance(0.1)) floors.push(pick([null, 0, {}, { 玩家位置: {}, 已揭示洞穴格子: [], 地牢生成方式: 'x', 地牢数组: [null] }]));
      所有怪物 = floors[0].所有怪物;
      const idMap = new Map();
      const records = floors.map((f, i) => 序列化楼层(i, f, idMap));
      results.push(['ser', scrub(records)], ['idMap', scrub([...idMap.entries()])]);
      const inputs = JSON.parse(JSON.stringify(records));
      for (let i = 0; i < inputs.length; i++) {
        const rec = inputs[i];
        if (!rec) continue;
        if (chance(0.08)) delete rec.序列化地牢格子;
        if (chance(0.15)) rec.序列化门实例.push({ 唯一标识符串: pick(['Symbol(x1)', rec.序列化门实例[0]?.唯一标识符串 ?? 'Symbol(x2)']), 类型: '门', 是否上锁: true, 房间ID: 1, 所在位置: { x: 0, y: 1 } });
        if (chance(0.2)) rec.挑战状态列表.push({ id: pick([0, 1, 5]), 状态: { 波次内怪物: ['怪物_0', '怪物_9', 3, 'x'], 原始门数据: [{ 原标识: 'Symbol(d)' }, { 原标识: 'plain' }, { 原标识: 5 }, { 原标识: rec.序列化门实例[0]?.唯一标识符串 }] } });
        if (chance(0.15)) rec.序列化玩家仆从索引 = [0, 0, 1, 7];
        if (chance(0.15)) rec.玩家初始位置 = pick([{ x: 3 }, null]);
        if (chance(0.15)) rec.已揭示洞穴格子 = pick([undefined, ['5,5']]);
        if (chance(0.04) && rec.序列化怪物列表[0]) rec.序列化怪物列表[0].配置.仇恨目标标识 = 5;
        if (chance(0.06)) inputs[i] = pick([null, 0, {}]);
      }
      门实例列表 = new Map();
      const instances = new Map(); const identities = new Map();
      if (chance(0.5)) identities.set('Symbol(x1)', Symbol('pre-restored'));
      for (let i = 0; i < inputs.length; i++) {
        const restored = 恢复楼层(i, inputs[i], instances, identities);
        results.push(['res', scrub(restored), 地牢大小, 门实例列表.size, 玩家仆从列表.length]);
      }
      results.push(['maps', scrub([...instances.entries()]), scrub([...identities.entries()])]);
    }
    globalThis.final = { results, calls };
  })();
`;

async function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`let 所有怪物 = []; let 当前层数 = 0; let 怪物状态表 = new WeakMap(); let 玩家 = { x: 1, y: 1, 名: '玩家' }; let 是否是自定义关卡 = false;
    let prng; let 玩家仆从列表 = []; let 地牢大小 = 7; let 门实例列表 = new Map(); globalThis.RewardMap = Map;
    ${[...SOURCE_GLOBALS, ...FUNCTIONS].map(name => declaration(name)).join('\n')}
    globalThis.__setPrng = f => { prng = f; };`).runInContext(context);
  const registered = ALL.filter(name => (SOURCE_GLOBAL_CLASS_NAMES as readonly string[]).includes(name));
  new vm.Script(scenario(seed).replace('const kinds', `__setPrng(rand); globalThis.window = Object.assign(Object.create(null), { ${registered.join(', ')} }); const kinds`))
    .runInContext(context);
  await new vm.Script('done').runInContext(context);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

async function rewriteRun(seed: number) {
  const state = createWorldState();
  state.玩家 = { x: 1, y: 1, 名: '玩家' } as typeof state.玩家;
  state.地牢大小 = 7;
  const context = vm.createContext({ calls: [], results: [], S: state }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const registry = new SourceClassRegistry();
  const log = (kind: 'log' | 'warn' | 'error') => (...args: unknown[]) => g<Record<string, (...a: unknown[]) => void>>('console')[kind]!(...args);
  const now = () => g<{ now(): number }>('Date').now();
  const random = () => g<() => number>('__rand')();
  const createStatusEffect = (...args: unknown[]) => new (g<new (...a: unknown[]) => unknown>('状态效果'))(...args);
  const items = createItemCellCodec(state, { classes: registry, icons: () => g('图标映射'), stairIcons: () => g('楼梯图标'),
    switchFloor: () => undefined, now, warn: log('warn'), error: log('error') });
  const monsters = createMonsterCodec(state, { classes: registry, random, icons: () => g('图标映射'), skillPool: () => g('怪物技能池'),
    createStatusEffect, warn: log('warn'), error: log('error') }, items);
  const floors = createFloorCodec(state, { classes: registry, createStatusEffect, log: log('log'), warn: log('warn'), error: log('error') }, items, monsters);
  const 门 = registry.defineWithPorts('门', GameDoor, { now, random, get doors() { return state.门实例列表 as Map<symbol, GameDoor>; } });
  const defineAll = () => {
    for (const name of ALL.filter(name => name !== '野怪')) {
      const Kind = g<new (...a: unknown[]) => object>(name);
      registry.define(name, Kind, (...args) => new Kind(...args));
    }
  };
  Object.assign(context, items, monsters, floors, { 单元格: GameCell, 单元格类型, 环境类型, 门, RewardMap: Map, __defineAll: defineAll });
  new vm.Script(`with (S) { ${scenario(seed).replace('const kinds', 'globalThis.__rand = rand; __defineAll(); const kinds')} }`).runInContext(context);
  await g<Promise<void>>('done');
  return g<Record<string, unknown>>('final');
}

describe('save records for floors (序列化楼层, 恢复楼层)', () => {
  it('matches the source over 200 seeded sessions', async () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 200; seed++) {
      const source = await sourceRun(seed); const mine = await rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const [kind, value] of source.results as [string, unknown][]) {
        if (kind === 'ser') for (const record of value as unknown[]) bump(record === null ? 'ser-null' : 'ser-ok');
        if (kind === 'res') bump(value === null ? 'res-null' : 'res-ok');
      }
      for (const call of source.calls as unknown[][]) {
        bump(`${call[0]}:${String(call[1]).slice(0, 5)}`);
        if (call[0] === 'error') bump(`error-cause:${JSON.stringify(call[2]).slice(0, 60)}`);
      }
    }
    const count = (prefix: string) => Object.entries(tally).filter(([k]) => k.startsWith(prefix)).reduce((sum, [, n]) => sum + n, 0);
    for (const key of ['ser-null', 'ser-ok', 'res-null', 'res-ok', 'prng', 'effect', 'warn:楼层', 'error:序列化楼层', 'error:恢复楼层',
      "error-cause:[\"Error\",\"ReferenceError\",\"Cannot access '玩家位置'", "error-cause:[\"Error\",\"ReferenceError\",\"Cannot access '已揭示洞穴格子'",
      "error-cause:[\"Error\",\"ReferenceError\",\"Cannot access '地牢生成方式'", 'error-cause:["Error","TypeError"']) expect(count(key), key).toBeGreaterThan(3);
  }, 600_000);
});
