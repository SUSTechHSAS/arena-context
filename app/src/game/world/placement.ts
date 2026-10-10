import { 单元格类型, 环境类型 } from './constants';
import { MATERIALS } from '../item-core';
import type { WorldState } from './state';

/** Collaborators outside the kernel (random stream, renderer, log, item class checks). */
export interface PlacementPorts {
  /** Source `prng()`: the session's active random stream. */
  random(): number;
  /** Source `绘制()`: request a redraw. */
  requestDraw(): void;
  /** Source `计划显示格子特效(cells, colorWithoutHash)`. */
  scheduleCellEffect(cells: { x: number; y: number }[], color: string): void;
  /** Source `添加日志(message, type)`. */
  log(message: string, type: string): void;
  /** Source `instanceof 远射植物 || 护卫植物 || 刷怪笼 || 开关脉冲器 || 侦测器 || 发生器`. */
  isSelfTimedItem(item: unknown): boolean;
  /** Source `instanceof 沉浸式传送门`. */
  isImmersivePortal(item: unknown): boolean;
}

/** Minimal item surface the placement code reads/writes (ItemCore satisfies it). */
export interface PlaceableItem {
  颜色索引: number | null; readonly 颜色表: readonly string[]; x: number | null; y: number | null;
  唯一标识?: unknown; 材质?: unknown; 自定义数据: Map<unknown, unknown>; 获取名称(): string; 阻碍怪物?: unknown;
}
export interface RoomBounds { x: number; y: number; w: number; h: number }
type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Cell = { 背景类型: number; 关联物品: Loose; 关联怪物: unknown; 类型: unknown; 颜色索引: unknown; 环境: unknown };

const cellAt = (state: WorldState, x: number, y: number) => (state.地牢 as unknown as Cell[][])[y]![x]!;

/** Source `位置是否可用(x, y, 考虑玩家 = true, 无视怪物 = false)`. */
export function isPositionFree(state: WorldState, x: number, y: number, considerPlayer = true, ignoreMonsters = false): boolean {
  // eslint-disable-next-line eqeqeq
  if (x < 0 || x >= state.地牢大小 || y < 0 || y >= state.地牢大小 || state.地牢?.length == 0) return false;
  if (considerPlayer && state.玩家.x === x && state.玩家.y === y) return false;
  if ((state.当前出战宠物列表 as { x: unknown; y: unknown }[]).some(pet => pet.x === x && pet.y === y)) return false;
  const cell = cellAt(state, x, y);
  return [单元格类型.房间, 单元格类型.走廊, 单元格类型.门].includes(cell.背景类型 as 1 | 2 | 3) &&
    (!cell.关联物品 || !cell.关联物品?.阻碍怪物) && (!cell.关联怪物 || ignoreMonsters);
}

/** Source `寻找可放置位置`: N, E, S, W, centre; visited room or corridor (-1) only. */
export function findDropPosition(state: WorldState, centerX: number, centerY: number): { x: number; y: number } | null {
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [0, 0]] as const) {
    const x = centerX + dx; const y = centerY + dy;
    if (x >= 0 && x < state.地牢大小 && y >= 0 && y < state.地牢大小 && isPositionFree(state, x, y, false) &&
      // eslint-disable-next-line eqeqeq
      (state.已访问房间.has(state.房间地图[y]![x]!) || state.房间地图[y]![x] == -1)) return { x, y };
  }
  return null;
}

/** Source `放置物品到单元格(物品, x, y, 放置物体 = 物品, 禁用光晕 = false, 无视怪物 = false)`. */
export function placeItemAt(state: WorldState, ports: PlacementPorts, item: PlaceableItem, x: number, y: number,
  kind: unknown = 单元格类型.物品, disableGlow: unknown = false, ignoreMonsters = false): boolean {
  if (isPositionFree(state, x, y, false, ignoreMonsters) && !cellAt(state, x, y).关联物品) {
    const cell = cellAt(state, x, y);
    cell.类型 = kind; cell.关联物品 = item;
    if (item.颜色索引 === null || disableGlow) item.颜色索引 = item.颜色表.length;
    item.x = x; item.y = y;
    if (ports.isSelfTimedItem(item)) {
      const timers = state.所有计时器 as Loose[];
      if (!timers.some(timer => timer.唯一标识 === item.唯一标识)) timers.push(item);
    }
    if (ports.isImmersivePortal(item) && !state.所有传送门.includes(item)) state.所有传送门.push(item);
    if (cellAt(state, x, y).环境 === 环境类型.水 && item.材质 === MATERIALS.铁质 && !item.自定义数据.get('不可破坏')) {
      if (ports.random() < 0.5) {
        const rust: Loose = item.自定义数据.get('锈蚀度') || 0;
        item.自定义数据.set('锈蚀度', rust + 2);
        if (item.自定义数据.has('耐久')) item.自定义数据.set('耐久', Math.max(0, (item.自定义数据.get('耐久') as number) - 5));
        ports.log(`${item.获取名称()} 接触水面严重生锈。`, '警告');
      }
    }
    cellAt(state, x, y).颜色索引 = item.颜色索引;
    ports.requestDraw();
    return true;
  }
  return false;
}

/**
 * Source `放置物品到房间`: up to 20 random attempts (x draw, then y draw) inside the room,
 * rejecting lava. Unlike `放置物品到单元格` it registers no timers/portals and never rusts.
 */
export function placeItemInRoom(state: WorldState, ports: PlacementPorts, item: PlaceableItem, room: RoomBounds,
  kind: unknown = 单元格类型.物品, disableGlow: unknown = false, effect: unknown = false, ignoreMonsters = false): boolean {
  let placed = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const minX = room.x; const maxX = room.x + room.w - 1; const minY = room.y; const maxY = room.y + room.h - 1;
    const x = minX + Math.floor(ports.random() * (maxX - minX + 1));
    const y = minY + Math.floor(ports.random() * (maxY - minY + 1));
    // eslint-disable-next-line eqeqeq
    if (isPositionFree(state, x, y, false, ignoreMonsters) && !cellAt(state, x, y).关联物品 && cellAt(state, x, y).环境 != 环境类型.岩浆) {
      const cell = cellAt(state, x, y);
      cell.类型 = kind; cell.关联物品 = item;
      if (item.颜色索引 === null || disableGlow) item.颜色索引 = item.颜色表.length;
      item.x = x; item.y = y;
      cell.颜色索引 = item.颜色索引;
      ports.requestDraw();
      placed = true;
      if (effect) ports.scheduleCellEffect([{ x, y }], item.颜色表[item.颜色索引 as number]!.slice(1));
      break;
    }
  }
  return placed;
}

/** Collaborators for monster placement. */
export interface MonsterPlacementPorts {
  random(): number;
  requestDraw(): void;
  /** Source `instanceof 巨人怪物`. */
  isGiant(monster: unknown): boolean;
  /** Source `console.error` / `console.warn` diagnostics (not game state). */
  diagnostic(level: 'error' | 'warn', message: string): void;
}
type PlacedMonster = Loose;
export interface MonsterRoom extends RoomBounds { id: Loose; 类型?: Loose }

/** Source `放置怪物到单元格`: a free cell, or an item cell whose item does not block monsters. */
export function placeMonsterAt(state: WorldState, ports: Pick<MonsterPlacementPorts, 'requestDraw'>, monster: PlacedMonster, x: number, y: number): boolean {
  // eslint-disable-next-line eqeqeq
  if (isPositionFree(state, x, y, false) || (cellAt(state, x, y).类型 == 单元格类型.物品 && !cellAt(state, x, y).关联物品?.阻碍怪物)) {
    const cell = cellAt(state, x, y);
    cell.类型 = 单元格类型.怪物; cell.关联怪物 = monster;
    monster.x = x; monster.y = y; monster.房间ID = state.房间地图[y]![x];
    (state.所有怪物 as unknown[]).push(monster);
    ports.requestDraw();
    return true;
  }
  return false;
}

/** Source `放置巨人`: all four cells of the 2×2 footprint must be free; then body and parts are placed. */
export function placeGiant(state: WorldState, ports: Pick<MonsterPlacementPorts, 'requestDraw'>, giant: PlacedMonster, x: number, y: number): boolean {
  for (const spot of [{ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }]) {
    if (!isPositionFree(state, spot.x, spot.y, false)) return false;
  }
  giant.保存新位置类型(x, y);
  placeMonsterAt(state, ports, giant, x, y);
  giant.部位列表.forEach((part: PlacedMonster, index: number) => {
    const offset = giant.部位偏移[index];
    placeMonsterAt(state, ports, part, x + offset.dx, y + offset.dy);
  });
  return true;
}

/** Source `放置怪物到房间`: giants get 50 tries in the (w-2)×(h-2) corner area, others w·h·2 tries. */
export function placeMonsterInRoom(state: WorldState, ports: MonsterPlacementPorts, monster: PlacedMonster, room: MonsterRoom | null | undefined): boolean {
  if (!monster || !room) { ports.diagnostic('error', '放置怪物到房间：无效的怪物实例或目标房间。'); return false; }
  if (ports.isGiant(monster)) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const x = room.x + Math.floor(ports.random() * (room.w - 2));
      const y = room.y + Math.floor(ports.random() * (room.h - 2));
      if (placeGiant(state, ports, monster, x, y)) { monster.房间ID = room.id; return true; }
    }
    ports.diagnostic('warn', `在房间 ${room.id} 多次尝试后未能放置巨人怪物。`);
    return false;
  }
  let placed = false;
  const maxAttempts = room.w * room.h * 2;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const x = room.x + Math.floor(ports.random() * room.w);
    const y = room.y + Math.floor(ports.random() * room.h);
    if (isPositionFree(state, x, y, false)) {
      if (placeMonsterAt(state, ports, monster, x, y)) { monster.房间ID = room.id; ports.requestDraw(); placed = true; break; }
    }
  }
  if (!placed) ports.diagnostic('warn', `在房间 ${room.id} (${room.类型 || '未知类型'}) 中多次尝试后未能放置怪物 ${monster.类型}。房间可能已满或无合适位置。`);
  return placed;
}

/** Source `清空房间内容`: drops items (and their first timer entry), monsters (new 所有怪物 array), kinds and environments. */
export function clearRoomContents(state: WorldState, ports: Pick<MonsterPlacementPorts, 'requestDraw'>, room: RoomBounds | null | undefined): void {
  if (!room) return;
  const grid = state.地牢 as unknown as (Cell | undefined)[][];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const cell = grid[y]?.[x];
      if (cell) {
        if (cell.关联物品) {
          const timers = state.所有计时器 as Loose[];
          const index = timers.findIndex(timer => timer.唯一标识 === cell.关联物品.唯一标识);
          if (index !== -1) timers.splice(index, 1);
          cell.关联物品 = null;
        }
        if (cell.关联怪物) {
          state.所有怪物 = (state.所有怪物 as unknown[]).filter(monster => monster !== cell.关联怪物) as typeof state.所有怪物;
          cell.关联怪物 = null;
        }
        if (cell.类型 !== null) cell.类型 = null;
        cell.环境 = null;
      }
    }
  }
  ports.requestDraw();
}
