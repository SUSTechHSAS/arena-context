import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { FUSION_BUFF_TYPES } from '../src/game/buffs';
import { MATERIALS } from '../src/game/item-core';
import { SourceClassRegistry } from '../src/game/runtime/class-registry';
import { createTurnActors } from '../src/game/runtime/turn-actors';
import { GameCell } from '../src/game/world/cell';
import { 单元格类型, 怪物状态, 环境类型 } from '../src/game/world/constants';
import { createWorldState } from '../src/game/world/state';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['检查移动可行性', '获取实际移动步数', '更新武器冷却', '处理宠物着陆效果', '伤害玩家', '处理怪物回合'];
const SOURCE_GLOBALS = ['单元格类型', '环境类型', '颜色表', '单元格', '怪物状态', '材质', '融合Buff类型', '效果名称编号映射'];
const ITEMS = ['红砖块', '蓝砖块', '绿砖块', '紫砖块', '栅栏', '水鞋', '马', '时间卷轴', '钩索', '蛛网', '渔网陷阱', '火焰物品', '毒液物品', '药水类', '烟雾',
  '纵火狂', '防御装备类', '守卫者盔甲', '宠物', '空桶', '挑战石碑', '传送带', '潜行靴子', '开关砖'];
const MONSTERS = ['怪物', '超速怪物', '同步怪物', '巡逻怪物', '王座守护者', '大魔法师', '炸弹怪物'];
const GLOBALS = ['调试无限生命', '地牢', '玩家', '玩家状态', '玩家属性', '装备栏每页装备数', '玩家装备', '当前装备页', '游戏设置', '玩家总受到伤害', 'isAutoMoving',
  'moveQueue', '游戏状态', '地牢大小', '自定义游戏设置', '生存挑战激活', '红蓝开关状态', '绿紫开关状态', '房间地图', '已访问房间', '当前激活卷轴列表', '玩家背包',
  '所有怪物', '跟踪玩家怪物数', '怪物状态表'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value, { GameCell: '单元格' }));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(r() * list.length)];
  const chance = q => r() < q;
  let p = ${seed} * 7919 % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  function tag(v) {
    if (v && typeof v === 'object' && typeof v.message === 'string' && typeof v.stack === 'string') return ['Error', v.constructor.name, v.message];
    if (v && typeof v === 'object') return 'obj:' + (v.名称 ?? v.类型 ?? Object.keys(v).length);
    return v;
  }
  const log = name => (...a) => { calls.push([name, ...a.map(tag)]); };
  globalThis.快速直线检查 = (...a) => { calls.push(['line', ...a]); return chance(0.7); };
  globalThis.添加日志 = log('log'); globalThis.显示浮动文字 = log('float'); globalThis.显示通知 = log('notify');
  globalThis.更新装备显示 = log('equip'); globalThis.处理销毁物品 = log('destroy'); globalThis.更新胜利条件显示 = log('victory');
  globalThis.处理玩家着陆效果 = (...a) => { calls.push(['landing', ...a]); return chance(0.5); };
  globalThis.更新视口 = log('viewport'); globalThis.玩家死亡 = log('death'); globalThis.恢复挑战区域 = log('restore-area');
  globalThis.触发药水水域效果 = log('potion-water');
  globalThis.怪物动画状态 = chance(0.8) ? { delete: log('anim-delete') } : undefined;
  const label = { classList: { add: log('label-add'), remove: log('label-remove') } };
  globalThis.怪物追踪提示 = { 容器元素: { querySelector: sel => { calls.push(['query', sel]); return label; } }, 更新: u => calls.push(['tracker', u.内容]) };
  class 状态效果 { constructor(...a) { calls.push(['effect', ...a.map(tag)]); } }
  let serial = 0;
  const crowd = chance(0.15); // every monster awake and already on its target: exercises the tracker warning
  class 物品 {
    constructor(c = {}) { this.名称 = c.名称 ?? 'x' + serial; this.类型 = c.类型 ?? '物品'; this.强化 = c.强化 ?? false; this.材质 = c.材质; this.能否拾起 = c.能否拾起;
      this.唯一标识 = Symbol.for('i' + serial++); this.自定义数据 = new Map(c.数据 ?? []); }
    获取名称() { return '[' + this.名称 + ']'; }
  }
  ${ITEMS.map(name => `class ${name} extends 物品 {}`).join(' ')}
  蛛网.prototype.移除自身 = function () { calls.push(['remove-self', this.名称]); };
  渔网陷阱.prototype.移除自身 = 蛛网.prototype.移除自身;
  药水类.prototype.当被收集 = function (who) { calls.push(['collect', this.名称, tag(who)]); };
  纵火狂.prototype.当被攻击 = function (d, src) { calls.push(['arson-hit', d, tag(src)]); };
  防御装备类.prototype.当被攻击 = function (d, src) { calls.push(['armor-hit', d, tag(src)]); return d * 0.75 - (this.强化 ? 1 : 0); };
  宠物.prototype.当玩家被攻击 = function (d, src) { calls.push(['pet-hit', d, tag(src)]); return d - 1; };
  挑战石碑.prototype.发放奖励 = function (wave) { calls.push(['reward', wave]); };
  class 怪物 {
    constructor(c = {}) { this.名称 = '怪' + serial; this.类型 = c.类型 ?? pick(['史莱姆', '蝙蝠']); this.x = 0; this.y = 0; serial++; }
    选择目标() { calls.push(['choose', this.名称]); if (crowd) return { x: this.x, y: this.y }; return pick([玩家, 玩家, { x: Math.floor(r() * 5), y: Math.floor(r() * 5) }, 所有怪物[0] ?? 玩家, { x: this.x, y: this.y }, { x: this.x, y: this.y }]); }
    计算目标路径(x, y) { calls.push(['path', this.名称, x, y]); if (x === this.x && y === this.y) return []; if (chance(0.2)) return null; const out = []; for (let i = Math.floor(r() * 4); i > 0; i--) out.push({ x, y: y + i }); return out; }
    尝试移动() { calls.push(['move', this.名称, tag(this.目标路径?.[0]), this.基础移动距离]); if (this.目标路径?.[0] && chance(0.5)) { this.x = this.目标路径[0].x; this.y = this.目标路径[0].y; } }
    尝试攻击() { calls.push(['attack', this.名称]); if (chance(0.15)) 伤害玩家(pick([4, 9]), this); if (chance(0.1)) this.当前生命值 = 0; }
    追踪玩家() { calls.push(['track', this.名称]); }
    绘制血条() { calls.push(['bar', this.名称]); }
    恢复背景类型() { calls.push(['restore-bg', this.名称]); }
    强制释放随机技能() { calls.push(['skill', this.名称]); return chance(0.5); }
    更新技能冷却() { calls.push(['cooldown', this.名称]); }
  }
  ${MONSTERS.filter(name => name !== '怪物').map(name => `class ${name} extends 怪物 {}`).join(' ')}
  Object.assign(globalThis, { 状态效果, 物品, ${[...ITEMS, ...MONSTERS].join(', ')} });
  const kinds = [${MONSTERS.join(', ')}, 怪物];
  const scrub = (value, seen = new Map()) => {
    if (typeof value === 'function') return 'fn:' + value.name;
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    const kind = Object.prototype.toString.call(value);
    if (kind === '[object WeakMap]') return 'weakmap';
    if (kind === '[object Map]') { const m = new Map(); seen.set(value, m); for (const [k, v] of value) m.set(scrub(k, seen), scrub(v, seen)); return m; }
    if (kind === '[object Set]') { const m = new Set(); seen.set(value, m); for (const v of value) m.add(scrub(v, seen)); return m; }
    const out = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value)); seen.set(value, out);
    for (const key of Reflect.ownKeys(value)) out[key] = scrub(value[key], seen);
    return out;
  };
  const view = () => scrub({ ${GLOBALS.filter(name => name !== '怪物状态表').map(name => `${name}: ${name}`).join(', ')} });
  const item = () => {
    const Kind = pick([物品, 红砖块, 蓝砖块, 绿砖块, 紫砖块, 栅栏, 开关砖, 开关砖, 开关砖, 蛛网, 渔网陷阱, 火焰物品, 毒液物品, 药水类, 烟雾, 挑战石碑, 传送带]);
    const out = new Kind({ 类型: Kind === 开关砖 ? '开关砖' : pick(['物品', '楼梯', '物品']), 能否拾起: pick([undefined, false, true]),
      数据: [['牵制回合', 2], ['已激活', chance(0.5)], ['当前波数', 3]] });
    if (Kind === 开关砖) out.阻碍怪物 = chance(0.5);
    if (Kind === 药水类) out.是否被丢弃 = chance(0.5);
    return out;
  };
  globalThis.done = (async () => {
    const N = 5;
    地牢大小 = chance(0.05) ? 6 : N;
    地牢 = [];
    for (let y = 0; y < N; y++) {
      const row = [];
      for (let x = 0; x < N; x++) {
        const c = new 单元格(x, y);
        c.背景类型 = pick([单元格类型.房间, 单元格类型.房间, 单元格类型.走廊, 单元格类型.墙壁, 单元格类型.上锁的门]);
        for (const d of ['上', '下', '左', '右']) c.墙壁[d] = chance(0.15);
        if (chance(0.25)) c.关联物品 = item();
        if (chance(0.15)) c.环境 = 环境类型.水;
        row.push(c);
      }
      地牢.push(row);
    }
    房间地图 = 地牢.map(row => row.map(() => pick([-1, 0, 1, 1, 2])));
    已访问房间 = new Set([1]);
    玩家 = { x: Math.floor(r() * N), y: Math.floor(r() * N), 名称: '玩家' };
    玩家状态 = [{ 类型: '缓慢' }, { 类型: '抗火' }, { 类型: '隐身' }].filter(() => chance(0.25));
    玩家属性 = { 移动步数: pick([1, 2]), 闪避率: pick([0, 0.1, undefined]), 最大生命值加成: pick([0, 20, undefined]), 当前生命值: pick([undefined, 50, 8, 3, 120]),
      防御加成: pick([0, 1, undefined]) };
    调试无限生命 = chance(0.03);
    装备栏每页装备数 = 3; 当前装备页 = pick([0, 1]);
    const gear = () => {
      const Kind = pick([水鞋, 马, 纵火狂, 防御装备类, 守卫者盔甲, 宠物, 空桶, 潜行靴子, 物品, 物品]);
      const g = new Kind({ 强化: chance(0.4), 材质: pick(['金质', '铁质', undefined]), 数据: [['休眠中', chance(0.3)]] });
      if (g instanceof 防御装备类 && chance(0.5)) g.自定义数据.set('fusedBuffs', [{ type: 融合Buff类型.闪避几率, value: pick([0.2, 0.9]) }]);
      return g;
    };
    玩家装备 = new Map(); for (let slot = 1; slot <= 6; slot++) if (chance(0.7)) 玩家装备.set(slot, chance(0.85) ? gear() : null);
    游戏设置 = { 自动移动可打断: chance(0.5), 受伤时击退: chance(0.6) }; isAutoMoving = chance(0.5); moveQueue = [1, 2];
    玩家总受到伤害 = 0; 游戏状态 = pick(['游戏中', '游戏中', '图鉴']); 自定义游戏设置 = { 极限模式: chance(0.4) }; 生存挑战激活 = chance(0.5);
    红蓝开关状态 = pick(['红', '蓝']); 绿紫开关状态 = pick(['绿', '紫']);
    当前激活卷轴列表 = new Set(chance(0.4) ? [new 时间卷轴()] : [new 物品()]);
    玩家背包 = new Map([new 物品({ 类型: '武器', 数据: [['冷却剩余', pick([0, 1, 3])]] }), new 钩索({ 数据: [['冷却剩余', pick([2, 0])]] }),
      new 物品({ 数据: [['冷却剩余', 5]] }), new 物品({ 类型: '武器', 数据: [['冷却剩余', 1]] })].map(i => [i.唯一标识, i]));
    怪物状态表 = new WeakMap();
    所有怪物 = [];
    for (let i = chance(0.3) ? 6 + Math.floor(r() * 4) : 2 + Math.floor(r() * 4); i > 0; i--) {
      const m = new (pick(kinds))();
      m.x = Math.floor(r() * N); m.y = Math.floor(r() * N); 地牢[m.y][m.x].关联怪物 = m; 地牢[m.y][m.x].类型 = pick([单元格类型.怪物, 单元格类型.怪物, 单元格类型.房间, undefined]);
      m.状态 = crowd ? 怪物状态.活跃 : pick([怪物状态.休眠, 怪物状态.活跃, 怪物状态.活跃]); m.当前生命值 = pick([10, 10, 0]); m.始终追踪玩家 = chance(0.2);
      m.本回合行动次数 = pick([undefined, 1, 2]); m.基础移动距离 = 1; m.移动距离 = pick([1, 0]); m.移动率 = pick([1, 0.5, 0]); m.跟踪距离 = pick([3, 8]);
      m.攻击范围 = pick([1, 3]); m.加速范围 = 1; m.加速回合数 = 2; m.当前阶段 = pick([1, 3]);
      if (chance(0.3)) m.血条元素 = { remove: log('bar-remove') };
      if (chance(0.4)) 怪物状态表.set(m, { 类型: pick(['中毒', '魅惑']), 更新状态: log('status-tick') });
      所有怪物.push(m);
    }
    跟踪玩家怪物数 = 0;
    for (let i = 0; i < 60; i++) {
      const c = () => Math.floor(r() * (N + 2)) - 1;
      if (i % 2) { // diagonal walks
        const x = Math.floor(r() * N), y = Math.floor(r() * N), d = 1 + Math.floor(r() * 3), sx = pick([1, -1]), sy = pick([1, -1]);
        try { results.push(['can', 检查移动可行性(x, y, x + sx * d, y + sy * d, chance(0.5), chance(0.2))]); } catch (e) { results.push(['can', tag(e)]); }
        continue;
      }
      try { results.push(['can', 检查移动可行性(c(), c(), c(), c(), chance(0.5), chance(0.2))]); } catch (e) { results.push(['can', tag(e)]); }
    }
    try { results.push(['steps', 获取实际移动步数()]); } catch (e) { results.push(['steps', tag(e)]); }
    try { 更新武器冷却(); } catch (e) { results.push(['cooldowns', tag(e)]); }
    const pet = new 怪物({ 类型: '宠物' });
    for (let i = 0; i < 3; i++) {
      try { 处理宠物着陆效果(pet, 0, 0, Math.floor(r() * N), Math.floor(r() * N)); results.push(['pet-landing', 'ok']); } catch (e) { results.push(['pet-landing', tag(e)]); }
    }
    for (let i = 0; i < 8; i++) {
      const source = pick([null, '火焰', '岩浆', '炸弹', 所有怪物[0], 所有怪物[0], { 名称: '陨石法杖' }, '陷阱', new 炸弹怪物()]);
      if (source instanceof 怪物 && chance(0.5)) { source.x = 玩家.x + pick([0, 1, -1]); source.y = 玩家.y + pick([0, 2, 1, -1]); }
      try { 伤害玩家(pick([5, 0, -1, 20, 2.5, 60]), source); results.push(['hurt', 'ok']); } catch (e) { results.push(['hurt', tag(e)]); }
    }
    for (let i = 0; i < 2; i++) {
      try { 处理怪物回合(); results.push(['monster-turn', 'ok']); } catch (e) { results.push(['monster-turn', tag(e)]); }
    }
    results.push(['view', view()]);
    globalThis.final = { results, calls };
  })();
`;

async function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`let ${GLOBALS.join(', ')}; let prng;
    ${[...SOURCE_GLOBALS, ...FUNCTIONS].map(name => declaration(name)).join('\n')}
    globalThis.__setPrng = f => { prng = f; };`).runInContext(context);
  new vm.Script(scenario(seed).replace('const kinds', '__setPrng(rand); const kinds')).runInContext(context);
  await new vm.Script('done').runInContext(context);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

async function rewriteRun(seed: number) {
  const state = Object.assign(createWorldState(), { moveQueue: [] as unknown[], isAutoMoving: false });
  for (const name of GLOBALS) if (!(name in state)) throw new Error(`state lacks ${name}`);
  const context = vm.createContext({ calls: [], results: [], S: state }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const call = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => unknown>(name)(...args);
  const registry = new SourceClassRegistry();
  const actors = createTurnActors(state, state, {
    classes: registry, random: () => g<() => number>('__rand')(), quickLineCheck: call('快速直线检查') as never, addLog: call('添加日志'),
    floatText: call('显示浮动文字'), notify: call('显示通知'), createStatusEffect: (...args) => new (g<new (...a: unknown[]) => unknown>('状态效果'))(...args),
    updateEquipmentDisplay: call('更新装备显示'), destroyItem: call('处理销毁物品'), updateVictoryDisplay: call('更新胜利条件显示'),
    playerLanding: call('处理玩家着陆效果'), updateViewport: call('更新视口'), playerDeath: call('玩家死亡'), restoreChallengeArea: call('恢复挑战区域'),
    triggerPotionWater: call('触发药水水域效果'), monsterAnimations: () => g('怪物动画状态'),
    trackerLabel: () => g<{ 容器元素: { querySelector(s: string): never } }>('怪物追踪提示').容器元素.querySelector('.hud-label'),
    updateTracker: update => g<{ 更新(u: unknown): void }>('怪物追踪提示').更新(update),
  });
  const defineAll = () => {
    for (const name of ['物品', ...ITEMS, ...MONSTERS]) {
      const Kind = g<new (...a: unknown[]) => object>(name);
      registry.define(name, Kind, (...args) => new Kind(...args));
    }
  };
  Object.assign(context, actors, { 单元格: GameCell, 单元格类型, 环境类型, 怪物状态, 材质: MATERIALS, 融合Buff类型: FUSION_BUFF_TYPES, __defineAll: defineAll });
  new vm.Script(`with (S) { ${scenario(seed).replace('const kinds', 'globalThis.__rand = rand; __defineAll(); const kinds')} }`).runInContext(context);
  await g<Promise<void>>('done');
  return g<Record<string, unknown>>('final');
}

describe('turn actors (检查移动可行性, 获取实际移动步数, 更新武器冷却, 处理宠物着陆效果, 伤害玩家, 处理怪物回合)', () => {
  it('matches the source over 300 seeded sessions', async () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 300; seed++) {
      const source = await sourceRun(seed); const mine = await rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const [kind, value] of source.results as [string, unknown][]) if (kind !== 'view') bump(`${kind}:${JSON.stringify(value).slice(0, 40)}`);
      for (const c of source.calls as unknown[][]) bump(`${c[0]}:${String(c[1]).slice(0, 10)}`);
    }
    const count = (prefix: string) => Object.entries(tally).filter(([k]) => k.startsWith(prefix)).reduce((sum, [, n]) => sum + n, 0);
    // `格挡` needs prng() < 0.005 after full absorption (the source re-rolls 0 damage), so it is not asserted.
    const rare: string[] = [];
    for (const key of ['can:true', 'can:false', 'steps:1', 'steps:2', 'steps:3', 'pet-landing:"ok"', 'pet-landing:["Error","ReferenceError"', 'hurt:"ok"',
      'monster-turn:"ok"', 'line', 'prng', 'effect:牵制', 'remove-self', 'collect', 'potion-water', 'arson-hit', 'armor-hit', 'pet-hit', 'destroy', 'notify:生命垂危',
      'reward', 'restore-area', 'death', 'landing', 'viewport', 'float:闪避', 'log:烟雾保护了你', 'log:通过 ', 'log:爆炸治愈了你', 'anim-delete', 'bar-remove',
      'restore-bg', 'status-tick', 'choose', 'path', 'move', 'attack', 'track', 'bar:', 'skill', 'cooldown', 'label-add', 'label-remove', 'tracker'])
      if (count(key) <= 2) rare.push(`${key}=${count(key)}`);
    expect(rare).toEqual([]);
  }, 900_000);
});
