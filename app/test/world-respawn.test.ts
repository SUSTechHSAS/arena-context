import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 单元格类型 } from '../src/game/world/constants';
import { handleRespawn, type RespawnPorts } from '../src/game/world/respawn';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['处理重生'];
const GLOBALS = ['prng', '单元格类型', '当前天气效果', '玩家', '玩家初始位置', '地牢大小', '游戏状态', '房间地图', '房间列表', '生存挑战激活', '地牢', '是否为教程层', '当前层数', '上次死亡地点',
  '玩家死亡次数', '玩家属性', '自定义全局设置', '玩家状态', '当前激活卷轴列表', '自定义游戏设置', '地牢生成方式', '已使用存档点', '已揭示洞穴格子', '已访问房间',
  '所有怪物', '玩家背包', '玩家装备', '所有地牢层', '所有计时器', '死亡界面已显示'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  class 挑战石碑 { constructor(id, on) { this.id = id; this.自定义数据 = new Map([['已激活', on]]); } 发放奖励(wave) { calls.push(['reward', this.id, wave]); } }
  class 王座守护者 { constructor() { this.x = 1; this.y = 1; } }
  class Effect { constructor(id) { this.id = id; } 移除状态() { calls.push(['remove', this.id]); } }
  class Scroll { constructor(id) { this.id = id; } 卸下() { calls.push(['unequip', this.id, 当前激活卷轴列表.size]); } }
  const stub = name => (...a) => calls.push([name, ...a.map(v => typeof v === 'function' ? 'fn' : v && typeof v === 'object' ? 'obj' : v)]);
  Object.assign(globalThis, { 挑战石碑, 王座守护者,
    ...Object.fromEntries(['处理诡魅房间刷新', '显示通知', '处理挑战失败', '恢复挑战区域', '更新装备显示', '更新背包显示', '进入教程层',
      '更新界面状态', '更新物体指示器', '更新视口', '绘制小地图', '更新光源地图'].map(name => [name, stub(name)])),
    更新胜利条件显示: () => calls.push(['victory', 玩家死亡次数]),
    应用永久Buffs: () => calls.push(['buffs', 玩家属性.允许移动, 玩家状态.length, 当前激活卷轴列表.size]),
    位置是否可用: (...a) => { const ok = r() < 0.4; calls.push(['free?', ...a, ok]); return ok; },
    广度优先搜索路径: (...a) => { const ok = r() < 0.5; calls.push(['bfs', ...a, ok]); return ok; },
    切换楼层: (...a) => { calls.push(['floor', ...a.map(v => typeof v === 'function' ? 'fn' : v)]); if (r() < 0.5) a[4](); },
    document: { getElementById: id => { calls.push(['el', id]); return r() < 0.5 ? { remove: () => calls.push(['mask-removed']) } : null; } },
  });
  if (r() < 0.7) globalThis.socket = { get connected() { calls.push(['connected?']); return r() < 0.6; }, emit: (...a) => calls.push(['emit', ...a]) };
  const setup = () => {
    联机模式 = r() < 0.3;
    当前层数 = pick([null, 0, 3, 5, 15, 15]);
    地牢大小 = 当前层数 === 5 ? 30 : 6;
    地牢 = Array.from({ length: 地牢大小 }, (_, y) => Array.from({ length: 地牢大小 }, (_, x) => ({ x, y, 背景类型: r() < 0.3 ? 单元格类型.走廊 : 单元格类型.房间,
      关联物品: 地牢大小 < 10 && r() < 0.06 ? new 挑战石碑(x * 10 + y, r() < 0.7) : null })));
    房间地图 = Array.from({ length: 地牢大小 }, () => Array.from({ length: 地牢大小 }, () => pick([-1, 0, 1, 2])));
    房间列表 = [0, 1, 2].map(id => ({ id: pick([id, id, (id + 1) % 3]), 类型: pick(['房间', '挑战房间']), 挑战状态: r() < 0.6 ? { 进行中: r() < 0.6 } : undefined,
      isSurvivalChallenge: r() < 0.4, survivalWave: pick([1, 4]), x: pick([0, 1]), y: pick([0, 2]), w: pick([1, 3]), h: pick([1, 3]), 名称: pick(['普通', '最终秘室']) }));
    if (r() < 0.1) 房间列表[1] = null;
    玩家 = { x: pick([1, 2, 4]), y: pick([0, 3, 5, r() < 0.05 ? 9 : 3]) }; 玩家初始位置 = { x: 0, y: 1 };
    当前天气效果 = r() < 0.3 ? ['诡魅'] : [];
    游戏状态 = pick(['游戏中', '游戏中', '游戏中', '地图编辑器', '胜利', '图鉴']);
    生存挑战激活 = r() < 0.4; 是否为教程层 = r() < 0.2; 上次死亡地点 = 'old'; 玩家死亡次数 = 2;
    玩家属性 = { 当前生命值: 3, 当前能量值: 4, 允许移动: 2 }; 自定义全局设置 = { 初始生命值: 100, 初始能量值: pick([100, 80]) };
    玩家状态 = [new Effect(1), new Effect(2)].filter(() => r() < 0.6);
    当前激活卷轴列表 = new Set([new Scroll(1), new Scroll(2)].filter(() => r() < 0.6));
    自定义游戏设置 = { 洞穴随机重生: r() < 0.6 }; 地牢生成方式 = pick(['cave', 'maze', 'default']); 已使用存档点 = r() < 0.3;
    已揭示洞穴格子 = new Set(r() < 0.8 ? ['1,1', '2,3', '4,4', '9,9'] : []); 已访问房间 = new Set(r() < 0.8 ? [0, 1] : []);
    所有怪物 = r() < 0.6 ? [new 王座守护者()] : [];
    玩家背包 = new Map([[1, { 类型: '武器', 自定义数据: new Map([['冷却剩余', pick([0, 3])]]) }], [2, { 类型: '药水', 自定义数据: new Map([['冷却剩余', 5]]) }]]);
    玩家装备 = new Map([[1, 'gear']]); 所有地牢层 = new Map([[0, {}]]); 所有计时器 = ['t']; 死亡界面已显示 = true;
  };
  for (let step = 0; step < 3; step++) {
    setup();
    try { results.push(['ok', 处理重生(pick([true, false, 1, 0, undefined]))]); } catch (error) { results.push(['throw', error.constructor.name]); }
    results.push([玩家.x, 玩家.y, 上次死亡地点, 玩家死亡次数, 死亡界面已显示]);
    results.push(地牢.flat().filter(c => c.关联物品).map(c => [c.x, c.y, c.关联物品.自定义数据.get('已激活')]));
    results.push(['fallback15', 当前层数 === 15 && 房间列表.some(room => room && room.名称 === '最终秘室') && !所有怪物.length]);
  }
  globalThis.final = { results, calls, 玩家属性, 房间列表, 地牢: 地牢.length, 所有计时器, 玩家背包, 玩家装备, 所有地牢层, 已访问房间, 当前激活卷轴列表, 玩家状态, 生存挑战激活 };
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
  const context = vm.createContext({ calls: [], results: [], S: state, 单元格类型 }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const is = (name: string) => (item: unknown) => item instanceof g<abstract new () => unknown>(name);
  const ports: RespawnPorts = {
    random: () => g<() => number>('__rand')(), refreshPhantomRooms: fn('处理诡魅房间刷新'), notify: fn('显示通知'), failChallenge: fn('处理挑战失败'),
    isOnline: () => g('联机模式'), socketConnected: () => g("typeof socket !== 'undefined' && socket.connected"),
    emit: (...args) => g<{ emit(...a: unknown[]): void }>('socket').emit(...args),
    restoreChallengeArea: fn('恢复挑战区域'), isChallengeStele: is('挑战石碑'), isThroneGuardian: is('王座守护者'), updateVictoryDisplay: fn('更新胜利条件显示'),
    applyPermanentBuffs: fn('应用永久Buffs'), isPositionFree: fn('位置是否可用'), findPath: fn('广度优先搜索路径'), refreshEquipment: fn('更新装备显示'),
    refreshInventory: fn('更新背包显示'), changeFloor: fn('切换楼层'), enterTutorial: fn('进入教程层'), updateUiState: fn('更新界面状态'),
    updateObjectIndicators: fn('更新物体指示器'),
    removeDeathMask: () => { const mask = g<{ getElementById(id: string): { remove(): void } | null }>('document').getElementById('死亡遮罩'); if (mask) mask.remove(); },
    updateViewport: fn('更新视口'), drawMinimap: fn('绘制小地图'), updateLightMap: fn('更新光源地图'),
  };
  Object.assign(context, { 处理重生: (keep: unknown) => handleRespawn(state, ports, keep) });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  return g<Record<string, unknown>>('final');
}

describe('respawn (处理重生)', () => {
  it('matches the source over 400 seeded deaths', () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 400; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) bump(String(call[0]));
      for (const entry of source.results as unknown[][]) { if (entry[0] === 'throw') bump('throw'); if (entry[0] === 'fallback15' && entry[1]) bump('fallback15'); }
    }
    for (const key of ['处理诡魅房间刷新', '显示通知', '处理挑战失败', 'emit', 'connected?', '恢复挑战区域', 'reward', 'remove', 'unequip', 'free?', 'bfs', 'floor',
      '进入教程层', 'mask-removed', 'victory', 'buffs', 'throw', 'prng']) expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 180_000);
});
