import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 单元格类型, 环境类型 } from '../src/game/world/constants';
import { tryInteract, type InteractPorts, type InteractSession } from '../src/game/world/interact';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['尝试互动'];
const GLOBALS = ['prng', '单元格类型', '环境类型'];
const SESSION = ['编辑器状态', '旧编辑器状态'] as const;
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  let uid = 0;
  class Thing { constructor(kind) { this.kind = kind; this.id = ++uid; this.自定义数据 = new Map(); } }
  class 陷阱基类 extends Thing {}
  class 隐形毒气陷阱 extends Thing {}
  class Piece extends Thing { constructor() { super('piece'); this.类型 = '棋子'; } }
  class Npc extends Thing { constructor() { super('npc'); this.类型 = 'NPC'; } 使用() { calls.push(['npc', this.id]); } }
  class Interactive extends Thing { 尝试互动() { const ok = r() < 0.4; calls.push(['interact', this.id, ok]); return ok ? pick([true, 1]) : pick([false, 0]); } }
  class 祭坛类 extends Thing { 当被攻击(power, who) { calls.push(['altar-hit', this.id, power, who === 玩家]); } }
  class Weapon extends Thing {
    constructor() { super('weapon'); this.类型 = pick(['武器', '武器', '武器', '药水']); this.堆叠数量 = pick([1, 1, 0]); this.攻击力 = pick([3, 7]);
      this.耐久消耗 = pick([1, 5]); this.最终冷却回合 = pick([2, 4]); this.最终攻击范围 = pick([0, 1, 3]); this.唯一标识 = 'w' + this.id;
      this.自定义数据.set('冷却剩余', pick([0, 0, '0', 2])); this.自定义数据.set('攻击目标数', pick([0, 1, 2])); this.自定义数据.set('耐久', pick([1, 5, 9]));
      if (r() < 0.4) this.自定义数据.set('附魔', [{ 种类: pick(['连发附魔', '锋利']), 等级: pick([0, 1, 2]) }]); }
    使用(targets, paths, who) { const ok = r() < 0.6; calls.push(['use', this.id, targets.map(m => m.id), paths, who === 玩家, ok]); if (r() < 0.4 && targets[0]) targets[0].当前生命值 = 0; return ok; }
  }
  class 充能魔杖 extends Weapon {}
  class 金币手枪 extends Weapon {}
  class 宠物 extends Thing { 当玩家攻击(targets) { calls.push(['pet-attack', this.id, targets.map(m => m.id)]); } }
  class Pet { constructor() { this.id = ++uid; this.是否已放置 = r() < 0.8; this.x = pick([2, 3]); this.y = pick([2, 3]); this.层数 = pick([2, '2', 3]); } 尝试互动() { calls.push(['pet', this.id]); } }
  class Key { constructor() { this.唯一标识 = 'k' + (++uid); } 可交互目标(door) { const ok = r() < 0.5; calls.push(['key?', this.唯一标识, door && door.id, ok]); return ok; } }
  class Door { constructor(id) { this.id = id; this.房间ID = pick([0, 1, 9]); this.所在位置 = { x: pick([1, 2]), y: 3 }; } 尝试解锁(bag) { const ok = r() < 0.7; calls.push(['unlock', this.id, bag === 玩家背包, ok]); return ok ? pick([true, 1]) : false; } }
  const seeds = ['荆棘种子', '护卫种子', '远射种子', '吸能种子'].map(名称 => class { constructor(o) { this.名称 = 名称; this.数量 = o.数量; calls.push(['seed', 名称, o.数量]); } });
  [globalThis.荆棘种子, globalThis.护卫种子, globalThis.远射种子, globalThis.吸能种子] = seeds;
  const stub = name => (...a) => { calls.push([name, ...a.map(v => v && typeof v === 'object' ? (v.id ?? 'obj') : v)]); };
  const elements = {};
  Object.assign(globalThis, { 陷阱基类, 隐形毒气陷阱, 祭坛类, 充能魔杖, 金币手枪, 宠物,
    ...Object.fromEntries(['停止自动移动', '显示通知', '绘制', '更新编辑器快速访问栏', '处理玩家着陆效果', '更新视口', '更新光源地图', '触发游戏事件', '处理销毁物品', '更新装备显示',
      '执行连发攻击'].map(name => [name, stub(name)])),
    扣除能量: n => { const ok = r() < 0.7; calls.push(['energy', n, ok]); return ok; },
    尝试收集物品: (item, flag) => { const ok = r() < 0.35; calls.push(['collect', item && (item.id ?? item.名称), flag, ok]); return ok; },
    快速直线检查: (...a) => { const ok = r() < 0.8; calls.push(['line?', ...a, ok]); return ok; },
    获取周围怪物: (count, range) => {
      calls.push(['nearby', count, range]);
      if (r() < 0.04) return null;
      if (r() < 0.2) return { 怪物: null, 路径: [] };
      const monsters = [1, 2, 3].filter(() => r() < 0.7).map(() => ({ id: ++uid, 当前生命值: pick([0, 4, 9]) }));
      return { 怪物: monsters, 路径: monsters.map(() => Array.from({ length: pick([1, 2, 3, 5]) }, (_, i) => i)) };
    },
    socket: { emit: (...a) => calls.push(['emit', ...a]) },
    document: {
      getElementById: id => { calls.push(['el', id]); if (r() < 0.04) return null; return (elements[id] ??= { id, style: {} }); },
      querySelectorAll: sel => { calls.push(['all', sel]); return [1, 2].map(i => ({ classList: { remove: c => calls.push(['remove-class', i, c]) } })); },
    },
  });
  const item = () => {
    const k = r();
    if (k < 0.08) { const t = new (r() < 0.5 ? 陷阱基类 : 隐形毒气陷阱)('trap'); t.是否为隐藏物品 = r() < 0.7; t.自定义数据.set('激活后图标', 'T' + t.id); return t; }
    if (k < 0.14) return new Piece();
    if (k < 0.2) return new Npc();
    if (k < 0.3) return new Interactive('i');
    if (k < 0.38) { const a = new 祭坛类('altar'); a.自定义数据.set('激活条件', pick(['力量考验', '力量考验', '献祭'])); return a; }
    if (k < 0.45) return new Thing('misc');
    return null;
  };
  const setup = () => {
    地牢大小 = pick([5, 5, 4]);
    地牢 = Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => ({ x, y, 标识: 'd' + x + y,
      背景类型: r() < 0.15 ? 单元格类型.上锁的门 : pick([单元格类型.房间, 单元格类型.走廊]), 环境: pick([null, null, 环境类型.水, 环境类型.水, 环境类型.草地]),
      已探索暗河: r() < 0.3, 关联物品: item(), 类型: pick([null, 单元格类型.物品]), 配对单元格位置: r() < 0.3 ? { x: pick([0, 4]), y: pick([0, 4]) } : undefined })));
    玩家 = { x: pick([1, 2, 3, 0, 4]), y: pick([1, 2, 3]) };
    门实例列表 = new Map(地牢.flat().filter(c => c.背景类型 === 单元格类型.上锁的门 && r() < 0.9).map(c => [c.标识, new Door(c.标识)]));
    房间列表 = [0, 1].map(id => ({ id, 门: r() < 0.85 ? 地牢.flat().filter(c => c.背景类型 === 单元格类型.上锁的门 && r() < 0.5).map(c => ({ x: c.x, y: c.y })) : undefined }));
    玩家背包 = new Map([new Key(), new Key()].filter(() => r() < 0.7).map(k => [k.唯一标识, k]));
    当前装备页 = pick([0, 1]); 装备栏每页装备数 = pick([2, 4]);
    玩家装备 = new Map([1, 2, 3, 4, 5, 6].map(slot => {
      const k = r();
      return [slot, k < 0.45 ? new Weapon() : k < 0.55 ? new 充能魔杖() : k < 0.65 ? new 金币手枪() : k < 0.8 ? (() => { const pet = new 宠物('pet'); pet.自定义数据.set('休眠中', r() < 0.3); return pet; })() : null];
    }));
    当前出战宠物列表 = [new Pet(), r() < 0.3 ? null : new Pet()];
    当前层数 = 2; 死亡界面已显示 = r() < 0.05; 联机模式 = r() < 0.2; NPC互动中 = r() < 0.3;
    游戏状态 = pick(['游戏中', '游戏中', '游戏中', '游戏中', '地图编辑器']);
    游戏设置 = { 自动移动可打断: r() < 0.7 };
    玩家属性 = { 当前能量值: pick([50, 99]) }; 自定义全局设置 = { 初始能量值: pick([100, 80]) };
    编辑器状态 = { 模式: pick(['传送', '编辑', '笔刷']), 当前选中: 'x' }; 旧编辑器状态 = null;
    if (r() < 0.03) 地牢[玩家.y][玩家.x] = null;
  };
  for (let session = 0; session < 2; session++) {
    setup();
    for (let step = 0; step < 3; step++) {
      try { results.push(['ok', 尝试互动()]); } catch (error) { results.push(['throw', error.constructor.name]); }
      results.push([玩家.x, 玩家.y, NPC互动中, 编辑器状态, 旧编辑器状态, 玩家属性.当前能量值]);
    }
    results.push(地牢, 玩家装备, elements);
    if (地牢.flat().includes(null)) results.push('null-cell');
  }
`;

const final = 'globalThis.final = { results, calls }';

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${[...new Set([...GLOBALS, ...FUNCTIONS].map(name => declaration(name)))].join('\n')}
    globalThis.__setPrng = f => { prng = f; };`).runInContext(context);
  new vm.Script(scenario(seed).replace('const pick', '__setPrng(rand); const pick')).runInContext(context);
  return new vm.Script(`${final}; final`).runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state, 单元格类型, 环境类型 }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const is = (name: string) => (item: unknown) => item instanceof g<abstract new () => unknown>(name);
  const session = {} as InteractSession;
  for (const key of SESSION) Object.defineProperty(session, key, { get: () => context[key], set: (value) => { context[key] = value; } });
  const document = () => g<InteractPorts['dom']>('document');
  const ports: InteractPorts = {
    random: () => g<() => number>('__rand')(), isOnline: () => g('联机模式'), emit: (...args) => g<{ emit(...a: unknown[]): void }>('socket').emit(...args),
    dom: { getElementById: (id) => document().getElementById(id), querySelectorAll: (selector) => document().querySelectorAll(selector) },
    stopAutoMove: fn('停止自动移动'), notify: fn('显示通知'), draw: fn('绘制'), updateEditorQuickBar: fn('更新编辑器快速访问栏'),
    isTrap: is('陷阱基类'), isInvisibleGasTrap: is('隐形毒气陷阱'), isAltar: is('祭坛类'), isChargedWand: is('充能魔杖'), isGoldPistol: is('金币手枪'), isPet: is('宠物'),
    deductEnergy: fn('扣除能量'), handleLanding: fn('处理玩家着陆效果'), updateViewport: fn('更新视口'),
    seedClasses: () => ['荆棘种子', '护卫种子', '远射种子', '吸能种子'].map(name => g<new (o: { 数量: number }) => unknown>(name)),
    tryCollect: fn('尝试收集物品'), updateLightMap: fn('更新光源地图'), triggerEvent: fn('触发游戏事件'), destroyItem: fn('处理销毁物品'), refreshEquipment: fn('更新装备显示'),
    straightLineCheck: fn('快速直线检查'), nearbyMonsters: fn('获取周围怪物'), burstAttack: fn('执行连发攻击'),
  };
  Object.assign(context, { 尝试互动: () => tryInteract(state, session, ports) });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  return g<Record<string, unknown>>(`with (S) { ${final} }; final`);
}

describe('interaction (尝试互动)', () => {
  it('matches the source over 600 seeded sessions', () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 600; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) bump(String(call[0]) + (call[0] === '显示通知' ? String(call[1]).slice(0, 4) : ''));
      for (const entry of source.results as unknown[][]) if (entry[0] === 'throw') bump(`throw:${String(entry[1])}`);
    }
    for (const key of ['emit', '停止自动移动', 'el', 'remove-class', '更新编辑器快速访问栏', 'energy', '显示通知你仔细探', '显示通知能量不足', '显示通知这片水域', '显示通知你发现了',
      '显示通知你在水中', '显示通知你在草地', '显示通知解锁成功', '显示通知周围没有', 'seed', 'collect', 'npc', 'interact', 'pet', 'altar-hit', '处理销毁物品', 'key?', 'unlock',
      'line?', 'nearby', 'use', 'pet-attack', '执行连发攻击', '处理玩家着陆效果', 'throw:TypeError', 'prng']) expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 180_000);
});
