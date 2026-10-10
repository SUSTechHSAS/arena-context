import { 单元格类型, 环境类型, 颜色表 } from './constants';
import { isPositionFree } from './placement';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Point = { x: number; y: number };

/** Source `生成时间随机数(length = 16)`: `Date.now()` digits followed by zero-padded prng digits. */
export function timeRandomId(random: () => number, now: () => number, length = 16): number {
  const timestamp = now().toString();
  const randomLength = length - timestamp.length;
  if (randomLength <= 0) return Number(timestamp.slice(0, length));
  const digits = Math.floor(random() * (10 ** randomLength)).toString().padStart(randomLength, '0');
  return Number(timestamp + digits);
}

export interface WaterMonsterPorts {
  random(): number;
  /** Source `new 水怪({ x, y, 强化 })` (packet `t10-monsters-ghost-water`). */
  createWaterMonster(options: { x: number; y: number; 强化: boolean }): unknown;
  /** Source `放置怪物到单元格`. */
  placeMonsterAt(monster: unknown, x: number, y: number): boolean;
}

const isWater = (cell: { 环境: unknown }) => cell.环境 === 环境类型.水 || cell.环境 === 环境类型.血水;

/** Source `生成水怪`: free water/blood-water groups (4-connected BFS, size ≥ 3) get 2–4 monsters half the time. */
export function generateWaterMonsters(state: WorldState, ports: WaterMonsterPorts): void {
  const grid = state.地牢 as unknown as { 环境: unknown }[][];
  const size = state.地牢大小;
  const water: Point[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (isWater(grid[y]![x]!) && isPositionFree(state, x, y, false)) water.push({ x, y });
  }
  if (water.length === 0) return;
  const seen = new Set<string>(); const groups: Point[][] = [];
  for (const point of water) {
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) continue;
    const group: Point[] = []; const queue = [point]; seen.add(key);
    while (queue.length > 0) {
      const current = queue.shift()!; group.push(current);
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
        const nx = current.x + dx; const ny = current.y + dy; const nKey = `${nx},${ny}`;
        if (nx >= 0 && nx < size && ny >= 0 && ny < size && !seen.has(nKey)) {
          if (isWater(grid[ny]![nx]!) && isPositionFree(state, nx, ny, false)) { seen.add(nKey); queue.push({ x: nx, y: ny }); }
        }
      }
    }
    if (group.length >= 3) groups.push(group);
  }
  for (const group of groups) {
    if (ports.random() < 0.5) continue;
    const count = Math.min(group.length, Math.floor(ports.random() * 3) + 2);
    for (let i = 0; i < count; i++) {
      const spot = group[Math.floor(ports.random() * group.length)]!;
      if (isPositionFree(state, spot.x, spot.y, false)) {
        const monster = ports.createWaterMonster({ x: spot.x, y: spot.y, 强化: ports.random() < 0.1 + state.当前层数 * 0.02 });
        ports.placeMonsterAt(monster, spot.x, spot.y);
      }
    }
  }
}

export interface PoisonTrapPorts {
  random(): number;
  /** Clock for `生成时间随机数` (source `Date.now()`). */
  now(): number;
  /** Source `检查移动可行性(fx, fy, tx, ty, false)` (packet `t10-turn-movement-audit`). */
  canStep(fromX: number, fromY: number, toX: number, toY: number, lockedRoomsBlock: false): boolean;
  /** Source `new 隐形毒气陷阱({ 强化, 关联陷阱ID })` (packet `t10-poison-smoke-items`). */
  createHiddenGasTrap(options: { 强化: boolean; 关联陷阱ID: number }): unknown;
  /** Source `放置物品到单元格(item, x, y)`. */
  placeItemAt(item: unknown, x: number, y: number): boolean;
}

/**
 * Source `生成毒气陷阱群(房间)`: up to 100 tries for a cross or X of arms `长度` long. Ported verbatim, including
 * code that cannot run: a fully built pattern has ≥ 9 cells that were all just checked free, so it is
 * always accepted, and the `尝试 % 50` arm-length re-roll is never reached (equivalent mutants confirm this).
 */
export function generatePoisonTrapCluster(state: WorldState, ports: PoisonTrapPorts, room: Loose): void {
  if (room.id === 0 || room.类型 !== '房间') return;
  const pattern = ports.random() < 0.5 ? '十字' : 'X形';
  let length = 2 + Math.floor(ports.random() * 2);
  const grid = state.地牢 as unknown as { 背景类型: number }[][];
  for (let attempt = 0; attempt < 100; attempt++) {
    const centerX = room.x + 1 + Math.floor(ports.random() * (room.w - 2));
    const centerY = room.y + 1 + Math.floor(ports.random() * (room.h - 2));
    const spots: Point[] = [];
    if (isPositionFree(state, centerX, centerY, false)) spots.push({ x: centerX, y: centerY });
    else continue;
    const directions = pattern === '十字' ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[1, 1], [-1, -1], [1, -1], [-1, 1]];
    let failed = false;
    for (const [dx, dy] of directions as [number, number][]) {
      let prevX = centerX; let prevY = centerY;
      for (let i = 1; i <= length; i++) {
        const x = centerX + i * dx; const y = centerY + i * dy;
        // eslint-disable-next-line eqeqeq
        if (ports.canStep(prevX, prevY, x, y, false) && isPositionFree(state, x, y, false) && ((grid[y]![x]!.背景类型 == 单元格类型.房间 && state.地牢生成方式 == 'default') || state.地牢生成方式 == 'cave')) {
          spots.push({ x, y }); prevX = x; prevY = y;
        } else { failed = true; break; }
      }
    }
    if (failed) continue;
    const unique = [...new Map(spots.map(spot => [`${spot.x},${spot.y}`, spot])).values()];
    const allFree = unique.every(spot => isPositionFree(state, spot.x, spot.y, false));
    if (allFree && unique.length > 2) {
      const trapId = timeRandomId(ports.random, ports.now, 15);
      const empowered = ports.random() < 0.15 + state.当前层数 * 0.02;
      unique.forEach(spot => { ports.placeItemAt(ports.createHiddenGasTrap({ 强化: empowered, 关联陷阱ID: trapId }), spot.x, spot.y); });
      break;
    }
    if (attempt % 50 === 0) length = 2 + Math.floor(ports.random() * 2);
  }
}

export interface TrapRevealPorts {
  /** Source `instanceof 隐形毒气陷阱`. */
  isHiddenGasTrap(item: unknown): boolean;
  /** Source `new 毒气({ 中毒持续, 中毒强度, 来源: '陷阱', 倒计时: 9999, 爆炸时间: 9999 })`. */
  createGas(options: { 中毒持续: unknown; 中毒强度: unknown; 来源: '陷阱'; 倒计时: 9999; 爆炸时间: 9999 }): unknown;
  /** Source `显示通知(message, type, flag)`. */
  notify(message: string, type: string, flag: boolean): void;
  placeItemAt(item: unknown, x: number, y: number): boolean;
  requestDraw(): void;
}

/** Source `揭示并激活陷阱群(陷阱ID, 中毒持续, 中毒强度)`: every hidden trap of the group becomes gas (pushed to timers again if placed). */
export function revealPoisonTrapCluster(state: WorldState, ports: TrapRevealPorts, trapId: unknown, duration: unknown, strength: unknown): void {
  const grid = state.地牢 as unknown as ({ 关联物品: Loose; 类型: unknown } | undefined)[][];
  const pending: { x: number; y: number; item: Loose }[] = [];
  for (let y = 0; y < state.地牢大小; y++) for (let x = 0; x < state.地牢大小; x++) {
    const item = grid[y]?.[x]?.关联物品;
    if (ports.isHiddenGasTrap(item) && item.自定义数据.get('关联陷阱ID') === trapId) pending.push({ x, y, item });
  }
  if (pending.length > 0) ports.notify('陷阱被激活了，周围的毒气喷涌而出！', '警告', true);
  pending.forEach(({ x, y, item }) => {
    if (grid[y]?.[x]?.关联物品 === item) {
      const gas = ports.createGas({ 中毒持续: duration, 中毒强度: strength, 来源: '陷阱', 倒计时: 9999, 爆炸时间: 9999 });
      grid[y]![x]!.关联物品 = null; grid[y]![x]!.类型 = null;
      if (ports.placeItemAt(gas, x, y)) (state.所有计时器 as unknown[]).push(gas);
    }
  });
  ports.requestDraw();
}

export interface StairPorts {
  /** Source page global `楼梯图标 = { 下楼: 图标映射.下楼楼梯, 上楼: 图标映射.上楼楼梯 }`, read at creation time. */
  stairIcons(): { 下楼: unknown; 上楼: unknown };
  /** Source `切换楼层(层数, false, null, true)` (orchestrator, wired at integration). */
  changeFloor(floor: number, a: false, b: null, c: true): unknown;
}

/** Source `创建楼梯实例(类型)`: a plain stair item; `使用` reads `当前层数` when used. */
export function createStairs(state: WorldState, ports: StairPorts, kind: unknown) {
  const isDown = kind === '下楼';
  const icons = ports.stairIcons();
  return {
    类型: '楼梯',
    图标: isDown ? icons.下楼 : icons.上楼,
    显示图标: isDown ? icons.下楼 : icons.上楼,
    颜色索引: 颜色表.length,
    使用: () => { ports.changeFloor(state.当前层数 + (isDown ? 1 : -1), false, null, true); },
    唯一标识: Symbol.for(`楼梯_${kind as string}`),
    获取名称: () => isDown ? '下楼楼梯' : '上楼楼梯',
    自定义数据: new Map(),
    品质: 1, 能否拾起: false, 是否正常物品: false, 是否隐藏: false, 是否为隐藏物品: false,
    效果描述: null, 已装备: false, 装备槽位: null, 堆叠数量: 1, 最大堆叠数量: 1, 颜色表,
  };
}
