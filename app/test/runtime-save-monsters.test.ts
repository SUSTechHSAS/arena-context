import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { SOURCE_GLOBAL_CLASS_NAMES, SourceClassRegistry } from '../src/game/runtime/class-registry';
import { createItemCellCodec } from '../src/game/runtime/save-items-cells';
import { createMonsterCodec } from '../src/game/runtime/save-monsters';
import { createWorldState } from '../src/game/world/state';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['序列化物品', '恢复物品', '序列化怪物', '恢复怪物'];
const ITEM_CLASSES = ['物品', '刷怪笼', '武器类', '宠物', '附魔卷轴', '神秘商人', '祭坛类', '物品祭坛', '折跃门', '药水类', '神秘药水', '隐形毒气陷阱'];
const MONSTER_CLASSES = ['怪物', '王座守护者', '蜈蚣怪物', '蜈蚣部位', '骷髅仆从', '佣兵单位', '腐蚀怪物', '盗贼怪物', '吸能怪物', '剧毒云雾怪物', '召唤师怪物',
  '幽灵仆从', '萨满怪物', '大史莱姆怪物', '瞬移怪物', '伪装怪物', '炸弹怪物', '大魔法师', '旋风怪物', '旋风', '超速怪物', '巡逻怪物'];
const ALL = [...ITEM_CLASSES, ...MONSTER_CLASSES, '野怪'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(r() * list.length)];
  const chance = p => r() < p;
  let p = ${seed} * 7919 % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  let serial = 0;
  globalThis.console = { warn: (...a) => calls.push(['warn', ...a.map(tag)]), error: (...a) => calls.push(['error', ...a.map(tag)]) };
  globalThis.Date = { now: () => 1700000000000 };
  globalThis.图标映射 = { 史莱姆: '🟢', 幽灵: '👻', 盗贼: '🦹' };
  globalThis.怪物技能池 = { a: { 名称: '冲撞' }, b: { 名称: '吐息' }, c: { 名称: '冲撞', 第二: true } };
  function tag(v) {
    if (v && typeof v === 'object' && typeof v.message === 'string' && typeof v.stack === 'string') return ['Error', v.constructor.name, v.message];
    if (typeof v === 'symbol') return 'sym:' + v.description;
    if (v && typeof v === 'object') return 'obj:' + (v.类型 ?? v.名称 ?? Object.keys(v).length);
    return v;
  }
  class 物品 {
    constructor(c = {}) { this.名称 = c.名称; this.图标 = c.图标; this.唯一标识 = c.唯一标识 ?? Symbol.for('item_' + serial++); this.自定义数据 = c.数据 instanceof Map ? c.数据 : new Map(); this.收到配置键 = Object.keys(c); }
  }
  class 刷怪笼 extends 物品 {} class 武器类 extends 物品 {} class 宠物 extends 物品 {} class 附魔卷轴 extends 物品 {} class 神秘商人 extends 物品 {}
  class 祭坛类 extends 物品 {} class 物品祭坛 extends 祭坛类 {} class 折跃门 extends 物品 {} class 药水类 extends 物品 {} class 神秘药水 extends 药水类 {} class 隐形毒气陷阱 extends 物品 {}
  class 怪物 {
    constructor(c = {}) {
      if (c.炸) throw new RangeError('bad config');
      this.类型 = c.类型 ?? pick(['史莱姆', '幽灵', '盗贼', '蝙蝠', undefined]); this.图标 = c.图标 ?? pick(['?', ' ', undefined]);
      this.基础生命值 = c.基础生命值 || 23; this.基础攻击力 = c.基础攻击力 || 3; this.当前生命值 = c.当前生命值 || 46;
      this.攻击冷却回合剩余 = 0; this.移动率 = 0.5; this.基础移动距离 = 1; this.基础攻击范围 = 1; this.跟踪距离 = 6; this.攻击冷却 = 2;
      this.受伤冻结回合 = 1; this.掉落概率 = 0.3; this.始终追踪玩家 = false; this.技能池 = []; this.永久增益 = []; this.收到配置键 = Object.keys(c);
    }
    get 生命值() { return this.基础生命值 * 2; }
  }
  class 王座守护者 extends 怪物 { constructor(c) { super(c); this.技能冷却 = { 召唤: 3 }; } }
  class 蜈蚣怪物 extends 怪物 {} class 蜈蚣部位 extends 怪物 {} class 骷髅仆从 extends 怪物 {} class 佣兵单位 extends 怪物 {} class 腐蚀怪物 extends 怪物 {}
  class 盗贼怪物 extends 怪物 {} class 吸能怪物 extends 怪物 {} class 剧毒云雾怪物 extends 怪物 {} class 召唤师怪物 extends 怪物 {} class 幽灵仆从 extends 怪物 {}
  class 萨满怪物 extends 怪物 {} class 大史莱姆怪物 extends 怪物 {} class 瞬移怪物 extends 怪物 {} class 伪装怪物 extends 怪物 {} class 炸弹怪物 extends 怪物 {}
  class 大魔法师 extends 怪物 {} class 旋风怪物 extends 怪物 {} class 旋风 extends 怪物 {} class 超速怪物 extends 怪物 {} class 巡逻怪物 extends 怪物 {} class 野怪 extends 怪物 {}
  class 状态效果 { constructor(...a) { calls.push(['effect', ...a.map(tag)]); 怪物状态表.set(a[6], { 类型: a[0], 颜色: a[1], 图标: a[2], 持续时间: a[3], 剩余回合: a[4], 强度: a[7] }); } }
  Object.assign(globalThis, { ${ALL.join(', ')}, 状态效果 });
  const kinds = [${MONSTER_CLASSES.join(', ')}, 野怪, 怪物, 怪物];
  const stray = new 怪物({ 类型: '游荡' });
  const item = () => new (pick([物品, 武器类, 药水类]))({ 名称: pick(['宝剑', '药水']), 唯一标识: pick([Symbol.for('d' + Math.floor(r() * 4)), undefined]) });
  const maybe = (value, p = 0.85) => chance(p) ? value : pick([undefined, null]);
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
    for (let round = 0; round < 3; round++) {
      const floor = [];
      const n = 3 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) floor.push(new (pick(kinds))({}));
      for (const m of floor) {
        m.x = Math.floor(r() * 9); m.y = 2; m.房间ID = pick([0, 3, undefined]); m.状态 = pick([0, 1, 2, undefined]); m.强化 = chance(0.3);
        m.攻击冷却回合剩余 = pick([0, 2]); m.受伤冻结回合剩余 = pick([0, 1, undefined]); m.当前格 = pick([undefined, { x: 1 }]);
        if (chance(0.3)) m.基础攻击力 = pick([undefined, 0, 9]);
        if (chance(0.2)) m.基础生命值 = pick([undefined, null]);
        m.仇恨 = pick([玩家, 玩家, floor[0], floor[floor.length - 1], stray, item(), undefined]);
        if (chance(0.3)) 怪物状态表.set(m, { 类型: pick(['中毒', '冰冻']), 颜色: '#0f0', 图标: '☠', 持续时间: 3, 剩余回合: pick([1, 2]), 强度: pick([1, undefined]) });
        m.携带药水 = pick([null, undefined, { 类型: '一次性治疗', 值: 5 }]);
        if (chance(0.05)) m.永久增益 = undefined; else if (chance(0.3)) m.永久增益 = [{ 类型: '永久力量' }];
        m.残血逃跑 = chance(0.5); m.等级 = pick([1, 3]);
        m.技能池 = chance(0.04) ? undefined : [怪物技能池.a, 怪物技能池.b, { 名称: '未知' }].filter(() => chance(0.5));
        if (chance(0.4)) m.掉落物 = chance(0.9) ? item() : { 名称: '坏的', 唯一标识: undefined };
        if (m instanceof 王座守护者) { m.当前阶段 = pick([1, 2]); m.技能冷却剩余 = maybe({ 召唤: 1 }); m.无敌 = chance(0.5); m.无敌次数 = pick([0, 2]);
          m.皇家守卫列表 = maybe([floor[0], stray, floor[1]], 0.9); m.激活的墓碑列表 = maybe([floor[floor.length - 1]], 0.9); }
        if (m instanceof 蜈蚣怪物 || m instanceof 蜈蚣部位) { if (chance(0.5)) m.存档ID = pick(['c1', '']); }
        if (m instanceof 蜈蚣怪物) { m.身体部位 = maybe([new 蜈蚣部位({}), { 存档ID: 'part' }], 0.9); m.长度 = 3; m.朝向 = pick(['N', undefined, '']); }
        if (m instanceof 蜈蚣部位) { m.主体 = pick([undefined, { 存档ID: 'head' }]); m.跟随 = pick([null, { 存档ID: 'p2' }]); m.基础颜色 = '#a00'; }
        if (m instanceof 骷髅仆从 || m instanceof 幽灵仆从 || m instanceof 旋风) m.生命周期 = pick([undefined, null, 5, 0]);
        if (m instanceof 佣兵单位) m.跟随层数 = pick([0, 2]);
        if (m instanceof 腐蚀怪物) { m.腐蚀强度 = pick([undefined, 2]); m.腐蚀持续 = pick([null, 6]); }
        if (m instanceof 盗贼怪物) { m.偷窃几率 = pick([undefined, 0.2]); m.偷窃武器几率 = 0.1; m.偷到的金币 = pick([0, 7]);
          m.偷到的武器列表 = maybe([item(), null, Object.create(null)], 0.9); }
        if (m instanceof 吸能怪物) { m.吸能比例 = pick([undefined, 0.5]); m.最小吸能 = pick([null, 2]); }
        if (m instanceof 剧毒云雾怪物) { m.毒云范围 = 2; m.毒云持续 = pick([undefined, 4]); m.毒云强度 = 1; }
        if (m instanceof 召唤师怪物 || m instanceof 旋风怪物) { m.召唤冷却剩余 = pick([undefined, 2]); m.最大召唤物数量 = pick([undefined, 3]);
          m.当前召唤物列表 = maybe([floor[0], stray], 0.9); }
        if (m instanceof 召唤师怪物) m.召唤物类 = pick([幽灵仆从, 骷髅仆从, 野怪, undefined, 旋风]);
        if (m instanceof 幽灵仆从) m.召唤者 = pick([floor[0], stray]);
        if (m instanceof 萨满怪物) m.治疗冷却剩余 = pick([undefined, 1]);
        if (m instanceof 瞬移怪物) { m.瞬移几率 = pick([undefined, 0.1]); m.受击瞬移几率 = pick([null, 0.2]); }
        if (m instanceof 伪装怪物) m.伪装状态 = pick([undefined, true]);
        if (m instanceof 炸弹怪物) m.携带炸弹 = pick([undefined, false]);
        if (m instanceof 大魔法师) { m.技能冷却 = pick([undefined, { 隐身术: 2 }]); m.隐身中 = pick([undefined, true]); m.isClone = pick([undefined, false]); m.分身 = pick([undefined, floor[0], stray]); }
        if (m instanceof 超速怪物) { m.加速范围 = pick([undefined, null, 4, 0]); m.加速回合数 = pick([undefined, 3]); }
        if (m instanceof 巡逻怪物) { m.随机游走 = pick([undefined, true]); m.巡逻方向 = pick(['N', '', undefined]); m.随机游走方向 = pick(['S', undefined]); }
      }
      if (chance(0.05)) floor.push(pick([null, Object.create(null)]));
      是否是自定义关卡 = chance(0.2);
      const items = new Map(); const monsters = new Map();
      for (let i = 0; i < floor.length; i++) {
        const record = 序列化怪物(floor[i], i, floor);
        results.push(['ser', scrub(record)]);
        let input = record ? JSON.parse(JSON.stringify(record)) : pick([null, {}, { 类名: '' }]);
        if (input && chance(0.2)) input.类名 = pick(['野怪', '不存在', '幽灵仆从', '怪物', 3]);
        if (input && chance(0.15)) input.配置 = pick([undefined, {}, { 技能池名称列表: '冲撞' }, { 召唤物类名: '不存在' }]);
        if (input && input.配置 && chance(0.2)) input.配置.攻击冷却回合剩余 = 4;
        if (input && input.配置 && chance(0.06)) input.配置.炸 = true;
        if (input && chance(0.1)) delete input.怪物索引;
        if (input && input.掉落物 && chance(0.2)) input.掉落物.类名 = pick(['野怪', '武器类']);
        if (input && input.掉落物 && chance(0.3)) items.set(input.掉落物.唯一标识符串, pick([item(), null]));
        const restored = 恢复怪物(input, items, monsters);
        results.push(['res', scrub(restored)]);
      }
      results.push(['maps', scrub([...items.entries()]), scrub([...monsters.entries()])]);
    }
    globalThis.final = { results, calls };
  })();
`;

async function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`let 怪物状态表 = new WeakMap(); let 玩家 = { x: 1, y: 1, 名: '玩家' }; let 是否是自定义关卡 = false; let prng;
    ${['怪物状态', ...FUNCTIONS].map(name => declaration(name)).join('\n')}
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
  const context = vm.createContext({ calls: [], results: [], S: state }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const registry = new SourceClassRegistry();
  const log = (kind: 'warn' | 'error') => (...args: unknown[]) => g<Record<string, (...a: unknown[]) => void>>('console')[kind]!(...args);
  const items = createItemCellCodec(state, { classes: registry, icons: () => g('图标映射'), stairIcons: () => ({ 下楼: '', 上楼: '' }),
    switchFloor: () => undefined, now: () => g<{ now(): number }>('Date').now(), warn: log('warn'), error: log('error') });
  const codec = createMonsterCodec(state, {
    classes: registry, random: () => g<() => number>('__rand')(), icons: () => g('图标映射'), skillPool: () => g('怪物技能池'),
    createStatusEffect: (...args) => new (g<new (...a: unknown[]) => unknown>('状态效果'))(...args), warn: log('warn'), error: log('error'),
  }, items);
  const defineAll = () => {
    for (const name of ALL.filter(name => name !== '野怪')) {
      const Kind = g<new (...a: unknown[]) => object>(name);
      registry.define(name, Kind, (...args) => new Kind(...args));
    }
  };
  Object.assign(context, codec, { __defineAll: defineAll });
  new vm.Script(`with (S) { ${scenario(seed).replace('const kinds', 'globalThis.__rand = rand; __defineAll(); const kinds')} }`).runInContext(context);
  await g<Promise<void>>('done');
  return g<Record<string, unknown>>('final');
}

describe('save records for monsters (序列化怪物, 恢复怪物)', () => {
  it('matches the source over 300 seeded sessions', async () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 300; seed++) {
      const source = await sourceRun(seed); const mine = await rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const [kind, value] of source.results as [string, Record<string, unknown> | null][]) {
        if (kind === 'ser') bump(value === null ? 'ser-null' : 'ser:' + String(value.类名));
        if (kind === 'res') bump(value === null ? 'res-null' : 'res-ok');
      }
      for (const call of source.calls as unknown[][]) bump(`${call[0]}:${String(call[1]).slice(0, 6)}`);
    }
    const count = (prefix: string) => Object.entries(tally).filter(([k]) => k.startsWith(prefix)).reduce((sum, [, n]) => sum + n, 0);
    for (const key of ['ser-null', 'res-null', 'res-ok', 'prng', 'effect', 'warn:尝试序列化无', 'warn:未找到怪物类', 'warn:怪物 ', 'error:序列化怪物', 'error:恢复怪物 ',
      'warn:未找到物品类', ...MONSTER_CLASSES.map(name => 'ser:' + name)]) expect(count(key), key).toBeGreaterThan(5);
  }, 300_000);
});
