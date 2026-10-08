import { CellType, type Position } from '../domain/distance-map';

export const LOCK_COLORS = ['#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#FF0000', '#800080'] as const;
export type Walls = Record<'上' | '右' | '下' | '左', boolean>;

/** Keep optional own-property presence: it matters in original saves/snapshots. */
export class ViewerCell {
  declare x: number; declare y: number; declare 类型: number; declare 墙壁: Walls;
  declare 钥匙ID: number | null; declare 颜色索引: number; declare 关联物品: null; declare 关联怪物: null;
  declare 背景类型: number; declare isOneWay: boolean; declare oneWayAllowedDirection: null;
  declare doorOrientation: null; declare 是否强制墙壁: boolean; declare 阻碍视野: boolean;
  declare 标识?: symbol;
  constructor(x: number, y: number) {
    this.x = x; this.y = y; this.类型 = CellType.Wall;
    this.墙壁 = { 上: false, 右: false, 下: false, 左: false };
    this.钥匙ID = null; this.颜色索引 = LOCK_COLORS.length; this.关联物品 = null; this.关联怪物 = null;
    this.背景类型 = CellType.Wall; this.isOneWay = false; this.oneWayAllowedDirection = null;
    this.doorOrientation = null; this.是否强制墙壁 = false; this.阻碍视野 = false;
  }
}

export interface Room extends Position {
  w: number; h: number; id: number; 名称: string; 门: Position[];
  类型?: string; 已解锁?: boolean; 颜色索引?: number;
}

export class ViewerDoor {
  declare 唯一标识: symbol; declare 类型: string; declare 是否上锁: boolean;
  declare 房间ID: number; declare 所在位置: Position;
  constructor(roomId: number, position: Position, identity: symbol) {
    this.唯一标识 = identity; this.类型 = '门'; this.是否上锁 = false;
    this.房间ID = roomId; this.所在位置 = position;
  }
}

export interface ViewerSnapshot {
  地牢大小: number; 地牢: ViewerCell[][]; 房间列表: Room[]; 上锁房间列表: Room[]; 房间地图: number[][];
  门实例列表: Map<symbol, ViewerDoor>; 玩家初始位置: Position;
  下楼楼梯位置: Position | null; 上楼楼梯位置: Position | null;
}
