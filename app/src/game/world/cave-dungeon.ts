import { 单元格类型 } from './constants';
import { createGrid } from './helpers';
import { findDropPosition, isPositionFree } from './placement';
import { placeCaveEntrances } from './generation';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Point = { x: number; y: number };

/** Every callee of the source `生成洞穴地牢` that is not a pure world helper. */
export interface CaveDungeonPorts {
  random(): number;
  /** `t10-cave-kernel`: `初始化洞穴地图(填充率)`, `执行元细胞自动机迭代()`, `处理洞穴连通性()`, `生成评分图(类型, 选项?)`. */
  initCaveMap(fillRate: number): void;
  cellularStep(): void;
  resolveConnectivity(): { 主洞穴: unknown; 所有洞穴: Point[][] | null | undefined | false };
  scoreMap(kind: string, options?: { 已放置点: Point[] }): number[][];
  /** Fallback path: `显示通知`, `重置所有游戏状态`, `await 生成地牢()`. */
  notify(message: string, type: string): void;
  resetAllGameState(): void;
  generateDefaultDungeon(): unknown;
  /** `创建楼梯实例` (`world/features.ts`) and `放置物品到单元格(item, x, y, 类型?)` (`world/placement.ts`). */
  createStairs(kind: '上楼' | '下楼'): unknown;
  placeItemAt(item: unknown, x: number, y: number, kind?: unknown): boolean;
  /** `生成路障`, `使用评分图放置物品`, `生成并放置洞穴配方卷轴`, `生成水怪`, `生成毒气陷阱群` (ported world functions). */
  generateBarricades(): void;
  placeByScoreMap(scoreMap: number[][], area: Point[], kind: string): void;
  placeCaveRecipeScrolls(grid: unknown, floor: number): void;
  generateWaterMonsters(): void;
  generatePoisonTrapCluster(room: { id: number; x: number; y: number; w: number; h: number; 类型: string }): void;
  /** `new 金币({ 数量 })` (`t10-keys-coins`), `全局生成环境` (weather), `生成墙壁`, `更新视口`, `更新界面状态`. */
  createCoin(options: { 数量: number }): unknown;
  generateEnvironment(): void;
  generateWalls(): void;
  updateViewport(): void;
  updateUi(): void;
}

/** Source `async 生成洞穴地牢()`. Always resolves `true`; without a cave it falls back to the default generator. */
export async function generateCaveDungeon(state: WorldState, ports: CaveDungeonPorts): Promise<boolean> {
  const settings = state.自定义游戏设置 as Loose;
  state.地牢大小 = settings.地牢初始大小 + state.当前层数 * 2;
  const size = state.地牢大小;
  state.地牢 = createGrid(size);
  state.房间列表 = [];
  state.上锁房间列表 = [];
  state.所有怪物 = [];
  state.门实例列表 = new Map();
  state.房间地图 = Array(size).fill(undefined).map(() => Array(size).fill(-1));
  state.已访问房间 = new Set();
  state.所有计时器 = [];
  state.当前天气效果 = [];
  ports.initCaveMap((100 - settings.洞穴开阔度) / 100 + 0.05 * ports.random());
  for (let i = 0; i < 5; i++) ports.cellularStep();

  const connectivity = ports.resolveConnectivity();
  const caves = connectivity.所有洞穴;
  if (!caves) {
    ports.notify('未能生成有效的洞穴区域，将退回默认生成器。', '错误');
    ports.resetAllGameState();
    state.地牢生成方式 = 'default';
    await ports.generateDefaultDungeon();
    return true;
  }
  const area = caves.flat();
  let scoreMap = ports.scoreMap('entry');
  const { 入口: entry, 出口: exit } = placeCaveEntrances(() => ports.random(), scoreMap, area);
  state.玩家初始位置.x = entry.x;
  state.玩家初始位置.y = entry.y;
  if (state.当前层数 > 0) {
    const upStairs = findDropPosition(state, state.玩家初始位置.x, state.玩家初始位置.y);
    if (upStairs) ports.placeItemAt(ports.createStairs('上楼'), upStairs.x, upStairs.y, 单元格类型.楼梯上楼);
    else ports.placeItemAt(ports.createStairs('上楼'), state.玩家初始位置.x, state.玩家初始位置.y, 单元格类型.楼梯上楼);
  }
  ports.placeItemAt(ports.createStairs('下楼'), exit.x, exit.y, 单元格类型.楼梯下楼);
  ports.generateBarricades();

  for (let i = 0; i < Math.round((10 + state.当前层数 * 2) * Math.pow(state.地牢大小 / 100, 2)); i++) {
    const x = area[Math.floor(ports.random() * area.length)]!.x;
    const y = area[Math.floor(ports.random() * area.length)]!.y;
    if (isPositionFree(state, x, y, false)) ports.placeItemAt(ports.createCoin({ 数量: 1 + Math.floor(ports.random() * 10) }), x, y);
  }
  scoreMap = ports.scoreMap('corner', { 已放置点: [entry, exit] });
  ports.placeByScoreMap(scoreMap, area, '普通物品');
  scoreMap = ports.scoreMap('entry', { 已放置点: [entry, exit] });
  ports.placeByScoreMap(scoreMap, area, '特殊物品');
  scoreMap = ports.scoreMap('monster', { 已放置点: [entry, exit] });
  ports.placeByScoreMap(scoreMap, area, '怪物');

  ports.generateEnvironment();
  if (state.当前层数 >= 10) ports.generateWaterMonsters();

  scoreMap = ports.scoreMap('trap', { 已放置点: [entry, exit, ...(state.所有怪物 as Loose[]).map(monster => ({ x: monster.x, y: monster.y }))] });
  ports.placeByScoreMap(scoreMap, area, '陷阱');
  ports.placeCaveRecipeScrolls(state.地牢, state.当前层数);

  const floor = state.当前层数;
  const trapRoom = { id: -1, x: 0, y: 0, w: 100 + floor * 2, h: 100 + floor * 2, 类型: '房间' };
  const density = ({ 无: 0, 稀少: 0.3, 普通: 1, 致命: 2.5 } as Record<string, number | undefined>)[settings.陷阱密度] ?? 1;
  const trapCount = ports.random() < (0.5 * density) ? Math.ceil(ports.random() * density * (floor + 1) * 2 * Math.pow(state.地牢大小 / 100, 2)) : 0;
  for (let i = 0; i < trapCount; i++) ports.generatePoisonTrapCluster(trapRoom);

  ports.generateWalls();
  ports.updateViewport();
  state.已访问房间.add(-1);
  ports.updateUi();
  return true;
}
