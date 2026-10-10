import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 单元格类型, 效果名称编号映射, 效果颜色编号映射, 环境类型 } from '../src/game/world/constants';
import { MATERIALS } from '../src/game/item-core';
import { handlePlayerLanding, updateCaveVision, type LandingPorts } from '../src/game/world/landing';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['处理玩家着陆效果', '更新洞穴视野'];
const GLOBALS = ['prng', '单元格类型', '环境类型', '效果颜色编号映射', '效果名称编号映射', '材质', '地牢大小', '地牢', '房间地图', '玩家', '玩家属性', '玩家状态',
  '装备栏每页装备数', '玩家装备', '当前装备页', '所有计时器', '当前激活卷轴列表', '房间列表', '是否为教程层', '所有怪物', '当前层数', '已访问房间', '自定义全局设置',
  '教程阶段', '教程提示已显示', '地牢生成方式', '游戏状态', '已揭示洞穴格子', 'moveQueue', 'isAutoMoving'];
const CLASSES = ['水鞋', '卷轴类', '火把', '自定义NPC', '告示牌', '折跃门'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  let uid = 0;
  class Item {
    constructor(extra = {}) { this.唯一标识 = 'u' + (++uid); this.名称 = this.constructor.name + uid; this.自定义数据 = new Map(Object.entries(extra.data ?? {})); this.材质 = extra.材质 ?? '普通'; }
    使用() { const ok = r() < 0.5; calls.push(['use', this.名称, ok]); return ok; }
    显示内容() { calls.push(['show', this.名称, this.自定义数据.get('隐藏')]); }
    尝试互动() { calls.push(['interact', this.名称]); }
    获取名称() { return '名' + this.名称; }
  }
  for (const name of ${JSON.stringify(CLASSES)}) globalThis[name] = ({ [name]: class extends Item {} })[name];
  class Effect { constructor(type) { this.类型 = type; } 移除状态() { calls.push(['remove-effect', this.类型]); } }
  class Monster { constructor(id, x, y) { this.id = id; this.x = x; this.y = y; } 绘制血条(...a) { calls.push(['hp-bar', this.id, ...a]); } }
  Object.assign(globalThis, {
    状态效果: class { constructor(...a) { calls.push(['status-effect', ...a]); } },
    document: { querySelector: sel => { calls.push(['query', sel]); return r() < 0.2 ? {} : null; }, getElementById: id => ({ style: { set display(v) { calls.push(['display', id, v]); } } }) },
    ...Object.fromEntries(['伤害玩家', '添加日志', '显示通知', '处理销毁物品', '更新装备显示', '触发药水水域效果', '处理挑战失败', '重置玩家状态', '处理单向房间', '开始挑战', '显示教程提示', '尝试进入特殊房间']
      .map(name => [name, (...a) => calls.push([name, ...a.map(v => v?.唯一标识 ?? v?.id ?? (v && typeof v === 'object' ? 'obj' : v))])])),
    尝试收集物品: item => { const ok = r() < 0.6; calls.push(['collect', item.名称, ok]); return ok; },
    切换楼层: (...a) => calls.push(['floor', ...a]),
    广度优先搜索路径: (...a) => { calls.push(['bfs', ...a]); return r() < 0.6; },
  });
  const makeEquipment = () => pick([
    () => new 卷轴类(), () => new 火把({ data: r() < 0.3 ? { 静默回合: pick([0, 5]) } : {} }), () => new 水鞋(),
    () => new Item({ 材质: '木质', data: r() < 0.3 ? { 静默回合: pick([-1, 3]) } : {} }),
    () => new Item({ 材质: '铁质', data: { 耐久: pick([1, 2, 5]), ...(r() < 0.2 ? { 不可破坏: true } : {}), ...(r() < 0.3 ? { 锈蚀度: 2 } : {}) } }),
    () => new Item({ 材质: '铁质', data: {} }), () => null,
  ])();
  const setup = () => {
    地牢大小 = 5;
    地牢 = Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => {
      const cell = { x, y, 类型: pick([1, 1, 5, 6, 7]), 环境: pick([undefined, undefined, '岩浆', '水', '血水', '药水水域', '草地']), 关联物品: null, 关联怪物: null };
      const roll = r();
      if (roll < 0.15) cell.关联物品 = new 自定义NPC({ data: { 强制对话: r() < 0.7 } });
      else if (roll < 0.25) cell.关联物品 = new 告示牌({ data: { 隐藏: r() < 0.7 } });
      else if (roll < 0.35) cell.关联物品 = new 折跃门();
      else if (roll < 0.55) cell.关联物品 = new Item({ data: r() < 0.3 ? { 隐藏: true } : {} });
      if (cell.关联物品 && r() < 0.15) cell.关联物品.是否被丢弃 = true;
      if (cell.关联物品 && r() < 0.1) cell.关联物品.使用 = undefined;
      return cell;
    }));
    房间地图 = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => pick([-1, 0, 1, 2])));
    房间列表 = [0, 1, 2].map(id => ({ id: pick([id, String(id)]), 类型: pick(['房间', '挑战房间']), 挑战状态: r() < 0.7 ? { 进行中: r() < 0.5, 已完成: r() < 0.3 } : undefined }));
    玩家 = { x: 2, y: 2 };
    玩家属性 = { 当前生命值: pick([40, 99, 100, 120]), 当前能量值: pick([50, 99.5]), 最大生命值加成: pick([undefined, 20]) };
    玩家状态 = [r() < 0.3 ? new Effect('抗火') : null, r() < 0.4 ? new Effect('火焰') : null].filter(Boolean);
    装备栏每页装备数 = 3; 当前装备页 = pick([0, 1]);
    玩家装备 = new Map(); for (let slot = 1; slot <= 6; slot++) 玩家装备.set(slot, makeEquipment());
    所有计时器 = [];
    if (r() < 0.3) { const first = 玩家装备.get(当前装备页 * 3 + 1); if (first) 所有计时器.push({ 唯一标识: first.唯一标识 }); }
    当前激活卷轴列表 = new Set([...玩家装备.values()].filter(item => item instanceof 卷轴类 && r() < 0.5));
    是否为教程层 = r() < 0.25; 教程阶段 = -5; 教程提示已显示 = true;
    所有怪物 = Array.from({ length: 2 }, (_, i) => new Monster(i, pick([0, 1, 9]), pick([0, 1])));
    for (const m of 所有怪物) if (地牢[m.y]?.[m.x]) 地牢[m.y][m.x].关联怪物 = m;
    当前层数 = 3; 已访问房间 = new Set(r() < 0.5 ? [1] : []);
    自定义全局设置 = { 初始能量值: pick([100, 50]) };
    地牢生成方式 = pick(['default', 'cave', 'maze']); 游戏状态 = pick(['游戏中', '地图编辑器']);
    已揭示洞穴格子 = new Set(); moveQueue = ['old']; isAutoMoving = true;
  };
  setup();
  for (let step = 0; step < 10; step++) {
    const op = pick(['land', 'land', 'land', 'vision', 'reset']);
    try {
      if (op === 'land') {
        const oldX = pick([1, 2, 3, r() < 0.05 ? 9 : 2]); const oldY = pick([1, 2, 3]);
        const newX = pick([0, 1, 2, 3, 4, -1, 7]); const newY = pick([0, 1, 2, 3, 4]);
        玩家.x = newX; 玩家.y = newY;
        const before = 所有怪物;
        results.push([op, 处理玩家着陆效果(oldX, oldY, newX, newY), before === 所有怪物, before.length]);
      }
      if (op === 'vision') results.push([op, 更新洞穴视野()]);
      if (op === 'reset') { setup(); results.push([op]); }
    } catch (error) { results.push([op, 'throw', error.constructor.name]); }
  }
  globalThis.final = { results, calls, 地牢, 玩家属性, 所有计时器, 玩家装备, 所有怪物, 已访问房间, 已揭示洞穴格子, 教程阶段, 教程提示已显示, moveQueue, isAutoMoving, 是否为教程层 };
`;

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${[...new Set([...GLOBALS, ...FUNCTIONS].map(name => declaration(name)))].join('\n')}
    globalThis.__setPrng = f => { prng = f; };`).runInContext(context);
  new vm.Script(scenario(seed).replace('const pick', '__setPrng(rand); const pick')).runInContext(context);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state, 单元格类型, 环境类型, 效果颜色编号映射, 效果名称编号映射, 材质: MATERIALS,
    教程提示已显示: false, moveQueue: [], isAutoMoving: false }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const is = (name: string) => (item: unknown) => item instanceof g<abstract new () => unknown>(name);
  const ports: LandingPorts = {
    kinds: { isWaterShoes: is('水鞋'), isScroll: is('卷轴类'), isTorch: is('火把'), isCustomNpc: is('自定义NPC'), isSignboard: is('告示牌'), isWarpGate: is('折跃门') },
    random: () => g<() => number>('__rand')(), damagePlayer: fn('伤害玩家'),
    createStatusEffect: (...args) => { new (g<new (...a: unknown[]) => unknown>('状态效果'))(...args); },
    log: fn('添加日志'), notify: fn('显示通知'), destroyInventoryItem: fn('处理销毁物品'), refreshEquipment: fn('更新装备显示'),
    triggerPotionWater: fn('触发药水水域效果'), isDialogueOpen: () => !!g<{ querySelector(s: string): unknown }>('document').querySelector('.galgame-overlay'),
    failChallenge: fn('处理挑战失败'), tryCollectItem: fn('尝试收集物品'),
    hideSkipTutorialButton: () => { g<{ getElementById(id: string): { style: { display: string } } }>('document').getElementById('跳过教程按钮').style.display = 'none'; },
    resetPlayerState: fn('重置玩家状态'), changeFloor: fn('切换楼层'), handleOneWayRoom: fn('处理单向房间'),
    cancelAutoMove: () => { context.moveQueue = []; context.isAutoMoving = false; },
    startChallenge: fn('开始挑战'), resetTutorialHint: () => { context.教程提示已显示 = false; }, showTutorialHint: fn('显示教程提示'),
    updateCaveVision: fn('更新洞穴视野'), tryEnterSpecialRoom: fn('尝试进入特殊房间'),
  };
  Object.assign(context, {
    处理玩家着陆效果: (oldX: number, oldY: number, newX: number, newY: number) => handlePlayerLanding(state, ports, oldX, oldY, newX, newY),
    更新洞穴视野: () => updateCaveVision(state, { findPath: fn('广度优先搜索路径') }),
  });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  return g<Record<string, unknown>>('final');
}

describe('player landing (处理玩家着陆效果 / 更新洞穴视野)', () => {
  it('matches the source over 400 seeded sessions', () => {
    const tally: Record<string, number> = {};
    const bump = (key: string, n = 1) => { tally[key] = (tally[key] ?? 0) + n; };
    for (let seed = 1; seed <= 400; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) {
        const [name, a] = call as [string, unknown];
        if (name === '伤害玩家') bump('lava');
        if (name === '显示通知') bump(String(a).slice(0, 6));
        if (['interact', 'show', 'collect', 'floor', 'display', '开始挑战', '处理挑战失败', '显示教程提示', 'bfs', '处理销毁物品', 'remove-effect', '触发药水水域效果', '尝试进入特殊房间'].includes(name)) bump(name);
      }
      for (const entry of source.results as unknown[][]) if (entry[1] === 'throw') bump('throw'); else if (entry[1] === true) bump('ended');
    }
    for (const key of ['lava', 'interact', 'show', 'collect', 'floor', 'display', '开始挑战', '处理挑战失败', '显示教程提示', 'bfs', '处理销毁物品', 'remove-effect',
      '触发药水水域效果', '尝试进入特殊房间', 'throw', 'ended', '你的背包进水', '血水滋养了你', '你踩到了一个', '你的 名It']) expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  });
});
