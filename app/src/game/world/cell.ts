import { 单元格类型, 颜色表, type EnvironmentKind } from './constants';

export type Walls = { 上: boolean; 右: boolean; 下: boolean; 左: boolean };
/** Structural view of what a cell reads from its item; ItemCore satisfies it. */
export interface CellItem { readonly 颜色表: readonly string[]; 颜色索引: number }
export interface PotionWaterData { 药水颜色?: string; [key: string]: unknown }

/**
 * Main-game `单元格` DATA contract (ChineseDungeon.html). Own-property order matches the
 * source constructor because saves, deep copies and snapshots enumerate it. Canvas methods
 * (`绘制`, `绘制物品`) belong to the rendering layer and are deliberately not ported here.
 * Unlike the viewer cell, `类型` starts as null and the cell carries environment/reveal state.
 */
export class GameCell<Item extends CellItem = CellItem, Monster = unknown> {
  declare x: number; declare y: number; declare 类型: number | null; declare 墙壁: Walls;
  declare 钥匙ID: unknown; declare 颜色索引: number;
  declare 关联物品: Item | null; declare 关联怪物: Monster | null; declare 背景类型: number;
  declare isOneWay: boolean; declare oneWayAllowedDirection: string | null; declare doorOrientation: string | null;
  declare 是否强制墙壁: boolean; declare 阻碍视野: boolean; declare 环境: EnvironmentKind | null;
  declare 已探索暗河: boolean; declare 药水数据: PotionWaterData | null; declare 已揭示: boolean;

  constructor(x: number, y: number) {
    this.x = x; this.y = y; this.类型 = null;
    this.墙壁 = { 上: false, 右: false, 下: false, 左: false };
    this.钥匙ID = null; this.颜色索引 = 颜色表.length; this.关联物品 = null; this.关联怪物 = null;
    this.背景类型 = 单元格类型.墙壁; this.isOneWay = false; this.oneWayAllowedDirection = null;
    this.doorOrientation = null; this.是否强制墙壁 = false; this.阻碍视野 = false; this.环境 = null;
    this.已探索暗河 = false; this.药水数据 = null; this.已揭示 = false;
  }

  /** Source: stairs are white; otherwise the item's colour-table entry or white (|| fallback). */
  获取物品颜色(): string {
    if (this.类型 === 单元格类型.楼梯下楼 || this.类型 === 单元格类型.楼梯上楼) return '#fff';
    return this.关联物品 ? this.关联物品.颜色表[this.关联物品.颜色索引] || '#FFFFFF' : '#FFFFFF';
  }
}
