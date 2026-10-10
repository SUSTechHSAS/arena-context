import { 单元格类型 } from './constants';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface SpecialRoomPorts {
  /** Source `连接房间(a, b)` and `生成走廊(路径)` (packet `t10-main-room-geometry`). */
  connectRooms(from: Loose, to: Loose): unknown;
  generateCorridor(path: unknown): void;
  log(message: string, type: string): void;
  /** Source `生成墙壁()` (packet `t10-main-room-geometry`). */
  generateWalls(): void;
  /** Source `instanceof 寻宝戒指` (packet `t10-map-quest-items`). */
  isTreasureRing(item: unknown): boolean;
  /** Source `处理销毁物品(id, true)`. */
  destroyInventoryItem(id: unknown, silent: true): void;
  requestDraw(): void;
}

/** Source `连接特殊房间(特殊房间)`: nearest unconnected room by top-left Manhattan distance (first wins ties). */
export function connectSpecialRoom(state: WorldState, ports: Pick<SpecialRoomPorts, 'connectRooms' | 'generateCorridor' | 'log'>, special: Loose): void {
  let nearest: Loose = null; let best = Infinity;
  for (const room of state.房间列表 as Loose[]) {
    if (room === special || room.已连接) continue;
    const distance = Math.abs(special.x - room.x) + Math.abs(special.y - room.y);
    if (distance < best) { best = distance; nearest = room; }
  }
  if (nearest) {
    const path = ports.connectRooms(special, nearest);
    if (path) { ports.generateCorridor(path); special.已连接 = true; }
    else ports.log(`无法将特殊房间连接到地牢！房间 ID: ${special.id}`, '错误');
  } else {
    ports.log(`没有找到可连接的房间！房间 ID: ${special.id}`, '错误');
  }
}

/** Source `尝试进入特殊房间(x, y)`: stepping into an unconnected `隐藏…` room connects it and consumes this floor's treasure rings. */
export function tryEnterSpecialRoom(state: WorldState, ports: SpecialRoomPorts, x: number, y: number): void {
  const roomId = state.房间地图[y]![x];
  if (roomId === -1) return;
  // eslint-disable-next-line eqeqeq
  const room = (state.房间列表 as Loose[]).find(entry => entry.id == roomId);
  if (room && !room.已连接 && room?.类型?.slice(0, 2) === '隐藏') {
    connectSpecialRoom(state, ports, room);
    ports.generateWalls();
    const rings: unknown[] = [];
    (state.玩家背包 as Map<unknown, Loose>).forEach(item => {
      if (ports.isTreasureRing(item) && item.自定义数据.get('生效层数') === state.当前层数) rings.push(item.唯一标识);
    });
    rings.forEach(id => { ports.destroyInventoryItem(id, true); });
    ports.requestDraw();
  }
}

export interface OneWayRoomPorts {
  /** Source page global `联机模式` (multiplayer flag, outside the world state). */
  isOnline(): boolean;
  /** Source `randomlySetOneWayDirection(门单元格)` (packet `t10-main-room-geometry`). */
  randomOneWayDirection(doorCell: Loose): unknown;
}

const doorCellAt = (grid: Loose[][], point: { x: number; y: number }) => {
  const cell = grid[point.y]?.[point.x];
  if (!cell || ![单元格类型.门, 单元格类型.上锁的门].includes(cell.背景类型)) return null;
  return cell;
};

/**
 * Source `处理单向房间(旧X, 旧Y, 新X, 新Y)`: entrance doors are reopened on every step; on first entry into a
 * `单向房间` the nearest door (and its pair) becomes the entrance and every other door turns one-way.
 * Quirk preserved: the paired cell of a one-way door gets the direction but not `isOneWay = true`.
 */
export function handleOneWayRoom(state: WorldState, ports: OneWayRoomPorts, oldX: number | undefined, oldY: number | undefined, newX: number, newY: number): void {
  if (ports.isOnline()) return;
  const grid = state.地牢 as unknown as Loose[][];
  const newRoomId = state.房间地图[newY]?.[newX];
  // eslint-disable-next-line eqeqeq
  const room = (state.房间列表 as Loose[]).find(entry => entry.id == newRoomId);
  if (newRoomId === -1) return;
  room?.门?.forEach((door: { x: number; y: number }) => {
    const cell = doorCellAt(grid, door);
    if (!cell) return;
    const pairAt = cell.配对单元格位置;
    const pair = pairAt ? grid[pairAt.y]?.[pairAt.x] : null;
    const entrance = room?.首次进入的门坐标系统?.some((saved: { x: number; y: number }) => saved.x === door.x && saved.y === door.y);
    if (entrance) {
      cell.isOneWay = false; cell.oneWayAllowedDirection = null;
      if (pair) { pair.isOneWay = false; pair.oneWayAllowedDirection = null; }
    }
  });
  if (oldX !== undefined && state.房间地图[oldY as number]?.[oldX] === newRoomId) return;
  if (!room || room.类型 !== '单向房间') return;
  if (!room.首次进入的门坐标系统) {
    room.首次进入的门坐标系统 = [];
    let best = Infinity; let nearest: { x: number; y: number } | null = null;
    for (const door of room.门) {
      const distance = Math.abs(newX - door.x) + Math.abs(newY - door.y);
      if (distance < best) { best = distance; nearest = door; }
    }
    if (nearest) {
      const main = grid[nearest.y]?.[nearest.x];
      if (main) {
        room.首次进入的门坐标系统.push({ x: nearest.x, y: nearest.y });
        if (main.配对单元格位置) room.首次进入的门坐标系统.push({ ...main.配对单元格位置 });
      }
    }
  }
  room.门.forEach((door: { x: number; y: number }) => {
    const cell = doorCellAt(grid, door);
    if (!cell) return;
    const pairAt = cell.配对单元格位置;
    const pair = pairAt ? grid[pairAt.y]?.[pairAt.x] : null;
    const entrance = room.首次进入的门坐标系统.some((saved: { x: number; y: number }) => saved.x === door.x && saved.y === door.y);
    if (!entrance) {
      cell.isOneWay = true;
      cell.oneWayAllowedDirection = ports.randomOneWayDirection(cell);
      if (pair) pair.oneWayAllowedDirection = cell.oneWayAllowedDirection;
    }
  });
}

/** Source theme table inside `生成特殊房间`. */
export const SPECIAL_ROOM_THEMES = [
  { 类型: '隐藏解谜棋盘', 概率: 0.15 },
  { 类型: '隐藏罐子房间', 概率: 0.25 },
  { 类型: '隐藏植物房间', 概率: 0.2 },
  { 类型: '隐藏书库房间', 概率: 0.25 },
  { 类型: '隐藏药水房间', 概率: 0.15 },
  { 类型: '隐藏推箱子房间', 概率: 0.2 },
];

export interface SpecialRoomGenerationPorts {
  random(): number;
  /** Source `加权随机选择` (packet `t10-spawn-selection`). */
  weightedPick(options: readonly Loose[]): Loose;
  /** Source `区域是否空闲` and `放置房间` (packet `t10-main-room-geometry`). */
  isAreaFree(x: number, y: number, w: number, h: number): boolean;
  placeRoom(room: Loose): void;
  /** Theme content generators (`生成推箱子谜题(room, editor)`, `生成解谜棋盘`, `生成罐子房间内容`, `生成植物房间内容`, `生成书库房间内容`, `生成药水房内容`). */
  generateSokoban(room: Loose, editorMode: boolean): unknown;
  generatePuzzleBoard(room: Loose): void;
  generateJarRoom(room: Loose): void;
  generatePlantRoom(room: Loose): void;
  generateLibraryRoom(room: Loose): void;
  generatePotionRoom(room: Loose): void;
}

/**
 * Source `async 生成特殊房间(编辑器模式 = false)`: one theme is drawn up front, then up to 100 square placements
 * (side 7–9) are tried. The function stays async (no awaits) so a throwing theme generator rejects, as in the source.
 */
export async function generateSpecialRoom(state: WorldState, ports: SpecialRoomGenerationPorts, editorMode: Loose = false): Promise<void> {
  let placed = false;
  let attempts = 0;
  const theme = ports.weightedPick(SPECIAL_ROOM_THEMES.map(t => ({ 值: t.类型, 权重: t.概率 })));
  while (!placed && attempts < 100) {
    attempts++;
    const w = Math.floor(ports.random() * 3) + 7;
    const h = w;
    const x = Math.floor(ports.random() * (state.地牢大小 - w - 2)) + 1;
    const y = Math.floor(ports.random() * (state.地牢大小 - h - 2)) + 1;
    if (ports.isAreaFree(x, y, w, h)) {
      const rooms = state.房间列表 as Loose[];
      const room = { x, y, w, h, id: rooms.length, 门: [], 已连接: false, 类型: theme };
      rooms.push(room);
      rooms.sort((a, b) => a.id - b.id);
      ports.placeRoom(room);
      if (theme === '隐藏推箱子房间') {
        (state.推箱子任务列表 as unknown[]).push(ports.generateSokoban(room, editorMode));
      } else {
        switch (theme) {
          case '隐藏解谜棋盘': ports.generatePuzzleBoard(room); break;
          case '隐藏罐子房间': ports.generateJarRoom(room); break;
          case '隐藏植物房间': ports.generatePlantRoom(room); break;
          case '隐藏书库房间': ports.generateLibraryRoom(room); break;
          case '隐藏药水房间': ports.generatePotionRoom(room); break;
        }
      }
      placed = true;
    }
  }
}
