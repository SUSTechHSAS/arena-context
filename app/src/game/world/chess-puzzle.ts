import { 单元格类型 } from './constants';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ChessPuzzlePorts {
  isChessPiece(item: unknown): boolean; // instanceof 棋子 (t10-chess-pieces)
  /** Source `window[类名]`. */
  lookupClass(name: unknown): (new (options: unknown) => unknown) | undefined;
  placeItemInRoom(item: unknown, room: unknown, kind: number, a: boolean, b: boolean): unknown; // 放置物品到房间
  generateReward(room: unknown): void; // 生成奖励
  notify(message: string, type: string): void; // 显示通知
  draw(): void; // 绘制
}

/** Source `解谜成功(房间)` (HTML L40340): clears the board's pieces and grants the room's reward. */
export function completeChessPuzzle(state: WorldState, ports: ChessPuzzlePorts, room: Loose): void {
  const S = state as Loose;
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (S.地牢[y][x].类型 === 单元格类型.物品 && ports.isChessPiece(S.地牢[y][x].关联物品)) {
        S.地牢[y][x].类型 = null;
        S.地牢[y][x].关联物品 = null;
      }
    }
  }
  if (room.自定义奖励 && room.自定义奖励.length > 0) {
    room.自定义奖励.forEach((reward: Loose) => {
      const RewardClass = ports.lookupClass(reward.类名);
      if (RewardClass) ports.placeItemInRoom(new RewardClass(reward.配置 || {}), room, 单元格类型.物品, false, true);
    });
  } else {
    ports.generateReward(room);
  }
  ports.notify('解谜成功！获得了丰厚奖励！', '成功');
  ports.draw();
}

/**
 * Source `检查解谜是否成功(棋子数量)` (HTML L50729): with enough single pieces on the player's puzzle board and no
 * piece attacking another, completes the puzzle (`onSolved` = `解谜成功`). SRC-20 fixed (owner rule 2026-10-10): the room is looked up by
 * id with index fallback (source used the index only and threw on a missing entry); a missing room returns false.
 */
export function checkChessPuzzle(state: WorldState, ports: Pick<ChessPuzzlePorts, 'isChessPiece'> & { onSolved(room: unknown): void }, pieceCount: Loose): boolean {
  const S = state as Loose;
  const roomId = S.房间地图[S.玩家.y][S.玩家.x];
  if (roomId === -1) return false;
  const room = S.房间列表.find((r: Loose) => r && r.id === roomId) || S.房间列表[roomId];
  if (!room || room.类型 !== '隐藏解谜棋盘') return false;
  let present = 0;
  const board = Array(room.h).fill(null).map(() => Array(room.w).fill(0));
  const pieces: { x: number; y: number; 棋子: Loose }[] = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const cell = S.地牢[y][x];
      if (cell.类型 === 单元格类型.物品 && ports.isChessPiece(cell.关联物品) && cell.关联物品.堆叠数量 === 1) {
        board[y - room.y]![x - room.x] = cell.关联物品;
        pieces.push({ x: x - room.x, y: y - room.y, 棋子: cell.关联物品 });
        present++;
      }
    }
  }
  if (present >= pieceCount) {
    for (const piece of pieces) {
      const attacks = piece.棋子.可攻击位置(piece.x, piece.y, board);
      for (const other of pieces) {
        if (piece === other) continue;
        if (attacks.some((pos: Loose) => pos.x === other.x && pos.y === other.y)) return false;
      }
    }
    ports.onSolved(room);
    return true;
  }
  return false;
}
