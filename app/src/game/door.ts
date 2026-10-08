import type { Position } from '../domain/distance-map';

export interface DoorConfig { 关联房间ID: number; 位置: Position }
export interface DoorPorts { now(): number; random(): number; doors: Map<symbol, GameDoor> }
export interface DoorInteractor { 可交互目标(door: GameDoor): unknown }

/** Main doors use Symbol.for, unlike viewer doors' fresh local Symbols. */
export class GameDoor {
  declare 唯一标识: symbol; declare 类型: string; declare 是否上锁: boolean; declare 房间ID: number; declare 所在位置: Position;
  constructor(ports: DoorPorts, config: DoorConfig) {
    this.唯一标识 = Symbol.for(ports.now().toString() + ports.random().toString());
    this.类型 = '门'; this.是否上锁 = false; this.房间ID = config.关联房间ID; this.所在位置 = config.位置;
    ports.doors.set(this.唯一标识, this);
  }
  尝试解锁(inventory: Map<unknown, DoorInteractor>): boolean {
    return [...inventory.values()].some(item => item.可交互目标(this));
  }
}
