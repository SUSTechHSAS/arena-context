import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { generateCaveDungeon, type CaveDungeonPorts } from '../src/game/world/cave-dungeon';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['位置是否可用', '寻找可放置位置', '放置地牢出入口', '生成洞穴地牢'];
const GLOBALS = ['单元格类型', '颜色表', '单元格', 'prng', '地牢大小', '自定义游戏设置', '当前层数', '地牢', '房间列表', '上锁房间列表', '所有怪物', '门实例列表',
  '房间地图', '已访问房间', '所有计时器', '当前天气效果', '地牢生成方式', '玩家初始位置', '玩家', '当前出战宠物列表'];

/** Logged, deterministic stand-ins for every port; identical in both realms. */
const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  const log = name => (...a) => { calls.push([name, ...a]); };
  class 金币 { constructor(options) { calls.push(['coin', options]); this.选项 = options; } }
  Object.assign(globalThis, {
    金币,
    初始化洞穴地图: rate => { calls.push(['init', rate]); for (const row of 地牢) for (const cell of row) cell.背景类型 = r() < 0.6 ? 1 : 0; },
    执行元细胞自动机迭代: log('step'),
    处理洞穴连通性: () => { calls.push(['connect']); if (r() < 0.1) return { 主洞穴: null, 所有洞穴: pick([null, undefined, false]) };
      const cells = 地牢.flat().filter(cell => cell.背景类型 === 1).map(cell => ({ x: cell.x, y: cell.y }));
      const cut = Math.floor(cells.length / 2); return { 主洞穴: cells.slice(0, cut), 所有洞穴: [cells.slice(0, cut), cells.slice(cut)] }; },
    生成评分图: (kind, options) => { calls.push(['score', kind, options, 地牢.length, 所有怪物.length]); return 地牢.map(row => row.map(() => pick([0, 1, 2, 3, 3, 5]))); },
    显示通知: log('notify'), 重置所有游戏状态: () => calls.push(['reset', 地牢生成方式]),
    生成地牢: async () => { calls.push(['default-start', 地牢生成方式]); await null; calls.push(['default-end', 地牢生成方式]); },
    创建楼梯实例: kind => { calls.push(['stairs', kind]); return { 楼梯: kind }; },
    放置物品到单元格: (item, x, y, ...rest) => { calls.push(['place', item, x, y, ...rest]); 地牢[y][x].关联物品 = item; return true; },
    生成路障: log('fence'),
    使用评分图放置物品: (map, area, kind) => { calls.push(['by-score', map, area.length, kind]);
      if (kind === '怪物') for (let i = 0; i < 3; i++) 所有怪物.push({ x: pick(area).x, y: pick(area).y }); },
    全局生成环境: log('environment'), 生成水怪: log('water'),
    生成并放置洞穴配方卷轴: (grid, floor) => calls.push(['scrolls', grid === 地牢, floor]),
    生成毒气陷阱群: room => calls.push(['gas', room]),
    生成墙壁: () => calls.push(['walls', 已访问房间.has(-1)]), 更新视口: () => calls.push(['viewport', 已访问房间.has(-1)]), 更新界面状态: () => calls.push(['ui', 已访问房间.has(-1), 地牢大小, 玩家初始位置.x]),
  });
  当前层数 = pick([0, 1, 4, 10, 13, 20]);
  自定义游戏设置 = { 地牢初始大小: pick([8, 12, 20, 30]), 洞穴开阔度: pick([40, 55, 70]), 陷阱密度: pick(['无', '稀少', '普通', '致命', undefined, 'toString']) };
  地牢生成方式 = 'cave'; 玩家 = { x: -5, y: -5 }; 当前出战宠物列表 = [];
  const startPosition = 玩家初始位置; const oldMonsters = 所有怪物;
  globalThis.__run = () => 生成洞穴地牢().then(value => { results.push(value);
    globalThis.final = { results, calls, 地牢大小, 地牢, 房间列表, 上锁房间列表, 所有怪物, 门实例列表, 房间地图, 已访问房间, 所有计时器, 当前天气效果,
      地牢生成方式, 玩家初始位置, samePosition: startPosition === 玩家初始位置, freshMonsters: oldMonsters !== 所有怪物 }; });
`;

async function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${[...new Set([...GLOBALS, ...FUNCTIONS].map(name => declaration(name)))].join('\n')}
    globalThis.__setPrng = f => { prng = f; };`).runInContext(context);
  new vm.Script(scenario(seed).replace('const pick', '__setPrng(rand); const pick')).runInContext(context);
  await (new vm.Script('__run()').runInContext(context) as Promise<void>);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

async function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state });
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const ports: CaveDungeonPorts = {
    random: () => g<() => number>('__rand')(),
    initCaveMap: fn('初始化洞穴地图'), cellularStep: fn('执行元细胞自动机迭代'), resolveConnectivity: fn('处理洞穴连通性'), scoreMap: fn('生成评分图'),
    notify: fn('显示通知'), resetAllGameState: fn('重置所有游戏状态'), generateDefaultDungeon: fn('生成地牢'),
    createStairs: fn('创建楼梯实例'), placeItemAt: fn('放置物品到单元格'), generateBarricades: fn('生成路障'), placeByScoreMap: fn('使用评分图放置物品'),
    placeCaveRecipeScrolls: fn('生成并放置洞穴配方卷轴'), generateWaterMonsters: fn('生成水怪'), generatePoisonTrapCluster: fn('生成毒气陷阱群'),
    createCoin: options => new (g<new (o: unknown) => unknown>('金币'))(options), generateEnvironment: fn('全局生成环境'),
    generateWalls: fn('生成墙壁'), updateViewport: fn('更新视口'), updateUi: fn('更新界面状态'),
  };
  context.生成洞穴地牢 = () => generateCaveDungeon(state, ports);
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  await (g<() => Promise<void>>('__run')());
  return g<Record<string, unknown>>('final');
}

describe('生成洞穴地牢 orchestrator', () => {
  it('matches the source over 120 seeds: state rebuild, call/prng order, fallback, coins, traps', async () => {
    const tally = { fallback: 0, upStairs: 0, coins: 0, water: 0, gas: 0, trapRoomShared: 0 };
    for (let seed = 1; seed <= 120; seed++) {
      const source = await sourceRun(seed); const mine = await rewriteRun(seed);
      expect(JSON.stringify(graphSnapshot(mine, { GameCell: '单元格' })), `seed ${seed}`).toBe(JSON.stringify(graphSnapshot(source)));
      const calls = source.calls as unknown[][];
      if (calls.some(call => call[0] === 'reset')) tally.fallback++;
      if (calls.some(call => call[0] === 'stairs' && call[1] === '上楼')) tally.upStairs++;
      if (calls.some(call => call[0] === 'coin')) tally.coins++;
      if (calls.some(call => call[0] === 'water')) tally.water++;
      const gas = calls.filter(call => call[0] === 'gas');
      if (gas.length) tally.gas++;
      if (gas.length > 1 && gas.every(call => call[1] === gas[0]![1])) tally.trapRoomShared++;
    }
    for (const [key, count] of Object.entries(tally)) expect(count, key).toBeGreaterThan(5);
  });
});
