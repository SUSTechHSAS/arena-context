import { 单元格类型 } from './constants';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface Placement { x: number; y: number; 图标?: string; 名称?: string }
export interface ChessSolution { 成功: boolean; 放置: Placement[]; 宽: number; 高: number }

/** Source `获取当前玩家棋盘房间()` (HTML L67919): the player's chess-board room, looked up by id first, then by index. */
export function findPlayerChessRoom(state: WorldState): { 房间: Loose; 原因?: string } {
  const S = state as Loose;
  if (S.玩家 === undefined || S.房间地图 === undefined || S.房间列表 === undefined) return { 房间: null, 原因: '缺少全局变量：玩家/房间地图/房间列表' };
  const roomId = S.房间地图?.[S.玩家.y]?.[S.玩家.x];
  if (roomId == null || roomId === -1) return { 房间: null, 原因: '玩家不在任何房间中' };
  const room = S.房间列表.find((r: Loose) => r.id === roomId) || S.房间列表[roomId];
  if (!room) return { 房间: null, 原因: '房间不存在' };
  if (room.类型 !== '隐藏解谜棋盘') return { 房间: null, 原因: '当前房间不是隐藏解谜棋盘' };
  return { 房间: room };
}

/** Source `收集房间内棋子(房间)` (HTML L67932): single (unstacked) pieces lying in the room. */
export function collectRoomPieces(state: WorldState, isChessPiece: (item: unknown) => boolean, room: Loose): Loose[] {
  const S = state as Loose;
  const list: Loose[] = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const cell = S.地牢?.[y]?.[x];
      if (!cell) continue;
      if (cell.类型 === 单元格类型.物品 && isChessPiece(cell.关联物品) && cell.关联物品.堆叠数量 === 1) list.push(cell.关联物品);
    }
  }
  return list;
}

export interface InventoryPiecePorts {
  isChessPiece(item: unknown): boolean; // instanceof 棋子
  difficulty(value: unknown): number; // _棋子难度值 (t10-chess-solver)
}

/** Source `收集背包棋子类(最多数量 = Infinity)` (HTML L67946): up to `max` piece classes from the backpack, hardest first. */
export function collectInventoryPieceClasses(state: WorldState, ports: InventoryPiecePorts, max: number = Infinity): unknown[] {
  const S = state as Loose;
  const result: unknown[] = [];
  let remaining = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : Infinity;
  if (!S.玩家背包 || remaining === 0) return result;
  const entries: { 类: unknown; 数量: number }[] = [];
  const iter = typeof S.玩家背包.values === 'function' ? S.玩家背包.values() : Object.values(S.玩家背包 || {});
  for (const entry of iter) {
    const item = entry?.value || entry;
    if (!ports.isChessPiece(item)) continue;
    const count = Math.max(0, item.堆叠数量 | 0);
    if (count <= 0) continue;
    entries.push({ 类: item.constructor, 数量: count });
  }
  entries.sort((a, b) => ports.difficulty(b.类) - ports.difficulty(a.类));
  for (const e of entries) {
    if (remaining <= 0) break;
    const take = Math.min(e.数量, remaining);
    for (let i = 0; i < take; i++) result.push(e.类);
    remaining -= take;
  }
  return result;
}

/** Source `_打印棋盘方案到控制台(房间, 解)` (HTML L68071): prints the solution grid with row and column labels. */
export function printChessSolution(log: (line: string) => void, _room: unknown, solution: ChessSolution): void {
  const { 宽, 高, 放置 } = solution;
  const grid = Array.from({ length: 高 }, () => Array(宽).fill('·'));
  for (const p of 放置) grid[p.y]![p.x] = p.图标 || '?';
  const rows = grid.map((row) => row.join(' '));
  for (let y = 0; y < rows.length; y++) log(`${y.toString().padStart(2, ' ')} | ${rows[y]}`);
  let header = '   | ';
  for (let x = 0; x < 宽; x++) header += `${x} `;
  log(header);
}

export interface PuzzleAnswerPorts {
  findRoom(): { 房间: Loose; 原因?: string }; // 获取当前玩家棋盘房间
  collectRoomPieces(room: unknown): Loose[]; // 收集房间内棋子
  collectInventoryClasses(max: number): unknown[]; // 收集背包棋子类
  difficulty(value: unknown): number; // _棋子难度值 (t10-chess-solver)
  solve(width: number, height: number, classes: unknown[], timeoutMs: number): ChessSolution; // _求解棋盘布局 (t10-chess-solver)
  printSolution(room: unknown, solution: ChessSolution): void; // _打印棋盘方案到控制台
  warn(message: string): void; // console.warn
  table(rows: unknown[]): void; // console.table
}

/** Source `调试_输出当前谜题答案(选项 = {})` (HTML L67860): developer helper that solves the current chess-board room. */
export function debugPrintPuzzleAnswer(ports: PuzzleAnswerPorts, options: Loose = {}): Record<string, unknown> {
  const { 超时毫秒 = 10000, 打印网格 = true, 打印明细 = true } = options;
  const info = ports.findRoom();
  if (!info.房间) {
    ports.warn(info.原因 || '未找到有效的谜题房间');
    return { 成功: false, 消息: info.原因 || '未在谜题房间内' };
  }
  const room = info.房间;
  const width = room.w;
  const height = room.h;
  const target = room.棋子数量 || 0;
  const roomClasses = ports.collectRoomPieces(room).map((it) => it.constructor);
  const gap = Math.max(0, target - roomClasses.length);
  const inventoryClasses = ports.collectInventoryClasses(gap);
  const available = roomClasses.concat(inventoryClasses);
  if (available.length < target) {
    ports.warn(`可用棋子不足：需要 ${target}，当前仅有 ${available.length}（房间 ${roomClasses.length} + 背包 ${inventoryClasses.length}）。`);
    ports.warn('仍尝试用当前可用棋子数量进行求解（可能无法触发解谜成功判定）...');
  }
  available.sort((a, b) => ports.difficulty(b) - ports.difficulty(a));
  const needed = Math.min(target, available.length);
  const solution = ports.solve(width, height, available.slice(0, needed), 超时毫秒);
  if (!solution.成功) {
    ports.warn('未在时限内找到解。');
    return { 成功: false, 消息: '未找到解或超时', 详情: solution };
  }
  if (打印网格) ports.printSolution(room, solution);
  if (打印明细) {
    ports.table(solution.放置.map((p) => ({ 图标: p.图标, 名称: p.名称, 相对x: p.x, 相对y: p.y, 绝对x: room.x + p.x, 绝对y: room.y + p.y })));
  }
  return { 成功: true, 房间: room, 方案: solution };
}

/** Source `db()` (HTML L68093): grants the debug tool and enables developer mode. */
export function grantDebugTool(state: WorldState, ports: { createDebugTool(options: Record<string, never>): unknown; tryCollect(item: unknown, silent: boolean): unknown }): void {
  ports.tryCollect(ports.createDebugTool({}), true);
  (state as Loose).开发者模式 = true;
}
