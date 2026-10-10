import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 单元格类型 } from '../src/game/world/constants';
import { deepClone } from '../src/game/world/helpers';
import { switchFloor, type FloorSwitchPorts } from '../src/game/world/floor-switch';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['切换楼层', 'isObject', 'deepClone'];
const GLOBALS = ['prng', '单元格类型', '地牢大小', '地牢', '房间列表', '门实例列表', '上锁房间列表', '已访问房间', '地牢生成方式', '已揭示洞穴格子', '房间地图', '所有怪物',
  '玩家', '玩家初始位置', '所有计时器', '当前天气效果', '所有地牢层', '玩家装备', '玩家背包', '当前层数', '玩家仆从列表', '传送点列表', '自定义游戏设置', '当前游戏种子',
  '彩蛋1触发', '当前出战宠物列表', '玩家属性', '自定义全局设置', '游戏状态', '是否是自定义关卡'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  class 定位器地图 { constructor(n) { this.唯一标识 = 'map' + n; this.堆叠数量 = n; } }
  class 佣兵单位 { constructor(id, x, y, follow) { this.id = id; this.x = x; this.y = y; this.跟随层数 = follow; } 绘制血条(...a) { calls.push(['hp', this.id, ...a]); } }
  class 瞬间移动饰品 {}
  class Monster { constructor(id) { this.id = id; } 绘制血条(...a) { calls.push(['hp', this.id, ...a]); } }
  class Pet { constructor(id) { this.id = id; this.是否已放置 = r() < 0.7; this.自定义数据 = new Map(r() < 0.7 ? [['装备', { a: r() < 0.6 ? new 瞬间移动饰品() : null }]] : []); } 瞬移到玩家身旁() { calls.push(['blink', this.id]); } }
  const elements = { transitionMask: { style: {} }, floorTitle: { style: {} } };
  const queue = [];
  const stub = name => (...a) => calls.push([name, ...a.map(v => v && typeof v === 'object' ? (v.唯一标识 ?? 'obj') : v)]);
  Object.assign(globalThis, { 定位器地图, 佣兵单位, 瞬间移动饰品,
    socket: { emit: (...a) => calls.push(['emit', ...a]) },
    document: { getElementById: id => { calls.push(['el', id]); return r() < 0.05 ? null : elements[id]; } },
    setTimeout: (fn, ms) => { calls.push(['setTimeout', ms]); queue.push(fn); return queue.length; },
    ...Object.fromEntries(['添加日志', '显示通知', '处理销毁物品', '更新背包显示', '更新装备显示', '更新物体指示器', '初始化随机数生成器', '生成迷宫关卡', '生成法师图书馆',
      '生成最终首领楼层', '生成沉没的迷宫', '生成天气效果', '绘制', '更新视口', '绘制小地图', '更新界面状态', '更新洞穴视野', '移动玩家'].map(name => [name, stub(name)])),
    音效管理器: { 播放音效: name => calls.push(['sound', name]) },
    寻找可放置位置: (x, y) => { calls.push(['find', x, y]); return r() < 0.7 ? { x: 1, y: 1 } : null; },
    位置是否可用: (...a) => { calls.push(['free?', ...a]); return r() < 0.5; },
    生成地牢: async () => { calls.push(['gen']); await null; if (r() < 0.05) throw new RangeError('gen'); 玩家初始位置 = { x: 2, y: 1 }; },
    显示升级界面: async () => { calls.push(['levelup']); await null; },
  });
  const grid = n => Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => ({ x, y, 类型: 1, 关联怪物: null })));
  const floorData = () => { const n = pick([3, 4]); const data = { 地牢数组: grid(n), 房间列表: [{ id: 0 }], 门实例列表: new Map(), 上锁房间列表: [], 已访问房间: new Set([0]),
    已揭示洞穴格子: new Set(['1,1']), 地牢生成方式: 'cave', 房间地图: Array.from({ length: n }, () => Array(n).fill(0)), 所有怪物: [new Monster(50)], 所有计时器: [],
    玩家初始位置: { x: 1, y: 2 }, 当前天气效果: r() < 0.3 ? undefined : ['大风'] }; if (r() < 0.9) data.玩家位置 = { x: 2, y: 2 }; return data; };
  const setup = () => {
    联机模式 = r() < 0.1;
    当前层数 = pick([0, 2, 4, 9, 14, 15, null]);
    地牢大小 = 4; 地牢 = grid(4); 房间列表 = [{ id: 1 }]; 门实例列表 = new Map(); 上锁房间列表 = []; 已访问房间 = new Set(); 地牢生成方式 = 'default';
    已揭示洞穴格子 = new Set(['0,0']); 房间地图 = Array.from({ length: 4 }, () => Array(4).fill(1)); 所有计时器 = []; 当前天气效果 = ['深夜'];
    所有怪物 = [new Monster(1), new Monster(2)];
    玩家 = { x: 3, y: 3 }; 玩家初始位置 = { x: 0, y: 1 };
    所有地牢层 = new Map(); for (const floor of [0, 1, 3, 5, 10, 16]) if (r() < 0.3) 所有地牢层.set(floor, floorData());
    if (当前层数 !== null && r() < 0.3) 所有地牢层.set(当前层数, r() < 0.5 ? {} : floorData());
    玩家装备 = new Map(r() < 0.4 ? [[1, new 定位器地图(pick([1, 2]))]] : []);
    玩家背包 = new Map(r() < 0.4 ? [[1, new 定位器地图(pick([1, 3]))]] : []);
    玩家仆从列表 = [new 佣兵单位(7, 2, 2, pick([0, 1, 2])), { id: 8 }, new 佣兵单位(9, 1, 3, pick([0, 1]))].filter(() => r() < 0.7);
    for (const m of 玩家仆从列表) if (m.x !== undefined && r() < 0.7) { 地牢[m.y][m.x].关联怪物 = m; 地牢[m.y][m.x].类型 = 8; 所有怪物.push(m); }
    传送点列表 = ['tp'];
    自定义游戏设置 = { 开启Boss战: r() < 0.6, 天气系统: pick(['五层一次', '三层一次', '两层一次', '大概率随机', '低概率随机', '关闭']), 开启升级奖励: r() < 0.7 };
    当前游戏种子 = 'seed' + ${seed}; 彩蛋1触发 = false;
    当前出战宠物列表 = [new Pet(1), null, new Pet(2)].filter(() => r() < 0.7);
    玩家属性 = { 初始能量加成: pick([0, 10]), 当前能量值: 50 }; 自定义全局设置 = { 初始能量值: pick([100, 50]) };
    游戏状态 = pick(['游戏中', '游戏中', '编辑器游玩', '地图编辑器']); 是否是自定义关卡 = r() < 0.15;
  };
  globalThis.done = (async () => {
    setup();
    for (let step = 0; step < 3; step++) {
      if (r() < 0.3) setup();
      const target = pick([0, 1, 3, 5, 10, 15, 16, -1, 当前层数, (当前层数 ?? 0) + 1]);
      const extra = pick([[], [false, null, true], [true], [false, { x: 1, y: 1 }, true, () => calls.push(['done-cb'])], [false, null, false, 'not-fn']]);
      let settled = 'pending';
      const minionsBefore = 玩家仆从列表;
      const promise = 切换楼层(target, ...extra);
      promise.then(() => { settled = 'ok'; }, error => { settled = 'rejected:' + error.constructor.name; });
      for (let guard = 0; guard < 10 && queue.length; guard++) {
        const fn = queue.shift();
        try { await fn(); } catch (error) { calls.push(['timer-threw', error.constructor.name]); }
      }
      for (let tick = 0; tick < 5; tick++) await null;
      results.push([target, settled, queue.length, minionsBefore.length, minionsBefore === 玩家仆从列表]);
      queue.length = 0;
    }
    globalThis.final = { results, calls, elements, 当前层数, 地牢大小, 地牢, 所有地牢层, 玩家, 所有怪物, 玩家仆从列表, 传送点列表, 彩蛋1触发, 当前出战宠物列表,
      当前天气效果, 已揭示洞穴格子, 房间列表, 房间地图, 门实例列表, 所有计时器, 玩家初始位置, 玩家属性, 玩家装备, 玩家背包 };
  })();
`;

async function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${[...new Set([...GLOBALS, ...FUNCTIONS].map(name => declaration(name)))].join('\n')}
    globalThis.__setPrng = f => { prng = f; };`).runInContext(context);
  new vm.Script(scenario(seed).replace('const pick', '__setPrng(rand); const pick')).runInContext(context);
  await new vm.Script('done').runInContext(context);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

async function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state, 单元格类型, Map, Set }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const is = (name: string) => (item: unknown) => item instanceof g<abstract new () => unknown>(name);
  const ports: FloorSwitchPorts = {
    isOnline: () => g('联机模式'), emit: (...args) => g<{ emit(...a: unknown[]): void }>('socket').emit(...args),
    getElement: id => g<{ getElementById(id: string): unknown }>('document').getElementById(id), setTimeout: fn('setTimeout'),
    isLocatorMap: is('定位器地图'), isMercenary: is('佣兵单位'), isBlinkCharm: is('瞬间移动饰品'),
    log: fn('添加日志'), notify: fn('显示通知'), destroyInventoryItem: fn('处理销毁物品'), refreshInventory: fn('更新背包显示'), refreshEquipment: fn('更新装备显示'),
    deepClone, findPlacement: fn('寻找可放置位置'), updateObjectIndicators: fn('更新物体指示器'), isPositionFree: fn('位置是否可用'),
    seedRng: fn('初始化随机数生成器'), generateMazeLevel: fn('生成迷宫关卡'), generateMageLibrary: fn('生成法师图书馆'), generateFinalBossFloor: fn('生成最终首领楼层'),
    generateSunkenMaze: fn('生成沉没的迷宫'), playSound: name => g<{ 播放音效(n: string): void }>('音效管理器').播放音效(name), random: () => g<() => number>('__rand')(),
    generateWeather: fn('生成天气效果'), generateDungeon: fn('生成地牢'), draw: fn('绘制'), updateViewport: fn('更新视口'), drawMinimap: fn('绘制小地图'),
    updateUiState: fn('更新界面状态'), updateCaveVision: fn('更新洞穴视野'), movePlayer: fn('移动玩家'), showLevelUp: fn('显示升级界面'),
  };
  Object.assign(context, { 切换楼层: (...args: [unknown, ...unknown[]]) => switchFloor(state, ports, ...args) });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  await g<Promise<void>>('done');
  return g<Record<string, unknown>>('final');
}

describe('floor switching (切换楼层)', () => {
  it('matches the source over 400 seeded sessions', async () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
    for (let seed = 1; seed <= 400; seed++) {
      const source = await sourceRun(seed); const mine = await rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const [, settled] of source.results as [unknown, string][]) bump(settled.split(':')[0]!);
      for (const call of source.calls as unknown[][]) {
        if (['emit', 'gen', 'levelup', 'blink', 'find', 'free?', 'done-cb', 'timer-threw', '生成迷宫关卡', '生成法师图书馆', '生成最终首领楼层', '生成沉没的迷宫', '生成天气效果', '处理销毁物品'].includes(call[0] as string)) bump(call[0] as string);
        if (call[0] === '显示通知') bump(String(call[1]).slice(0, 4));
        if (call[0] === '添加日志') bump('locator');
      }
    }
    for (const key of ['ok', 'pending', 'rejected', 'emit', 'gen', 'levelup', 'blink', 'find', 'free?', 'done-cb', 'timer-threw', '生成迷宫关卡', '生成法师图书馆',
      '生成最终首领楼层', '生成沉没的迷宫', '生成天气效果', '处理销毁物品', '佣兵的契', '喜悦..', 'locator']) expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 180_000);
});
