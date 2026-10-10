import type { WorldState } from './state';
import type { PlaceableItem, RoomBounds } from './placement';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Point = { x: number; y: number };

export interface KeyGenerationPorts {
  random(): number;
  /** Source `new 钥匙({ 对应门ID, 颜色索引, 地牢层数 })` (packet `t10-keys-coins`). */
  createKey(options: { 对应门ID: unknown; 颜色索引: unknown; 地牢层数: number }): PlaceableItem;
  /** Source `放置物品到房间(钥匙, 房间)` — `world/placement.ts#placeItemInRoom` with default arguments. */
  placeItemInRoom(item: PlaceableItem, room: RoomBounds): boolean;
}

/**
 * Source `生成钥匙`: one key per locked room, created before the room choice, placed in a random
 * unlocked `房间`-type room whose id is below `floor(房间列表.length * 0.5)`. No candidate: no prng draw, no placement.
 */
export function generateKeys(state: WorldState, ports: KeyGenerationPorts): void {
  const cutoff = Math.floor(state.房间列表.length * 0.5);
  const locked = state.上锁房间列表 as Loose[];
  locked.forEach(lockedRoom => {
    const key = ports.createKey({ 对应门ID: lockedRoom.id, 颜色索引: lockedRoom.颜色索引, 地牢层数: state.当前层数 });
    const candidates = (state.房间列表 as Loose[]).filter(room => !locked.some(other => other.id === room.id) && room.id < cutoff && room.类型 === '房间');
    const target = candidates.length > 0 ? candidates[Math.floor(ports.random() * candidates.length)] : null;
    if (target && ports.placeItemInRoom(key, target)) { /* placed */ }
  });
}

/**
 * Source `放置地牢出入口(评分图, 可用区域)`: entry = random top-score point; zeroes truthy scores in the 21×21
 * square around it (mutating the map); exit = the first farthest point among the new top-score points.
 */
export function placeCaveEntrances(random: () => number, scoreMap: number[][], area: Point[]): { 入口: Point; 出口: Point } {
  const topPoint = (map: number[][]) => {
    let best = -1; let candidates: Point[] = [];
    area.forEach(point => {
      const score = map[point.y]![point.x]!;
      if (score > best) { best = score; candidates = [point]; } else if (score === best) candidates.push(point);
    });
    return candidates[Math.floor(random() * candidates.length)]!;
  };
  const entry = topPoint(scoreMap);
  for (let dy = -10; dy <= 10; dy++) {
    for (let dx = -10; dx <= 10; dx++) {
      if (scoreMap[entry.y + dy]?.[entry.x + dx]) scoreMap[entry.y + dy]![entry.x + dx] = 0;
    }
  }
  let best = -1; let exits: Point[] = [];
  area.forEach(point => {
    const score = scoreMap[point.y]![point.x]!;
    if (score > best) { best = score; exits = [point]; } else if (score === best) exits.push(point);
  });
  let exit: Point | null = null; let farthest = -1;
  exits.forEach(point => {
    const distance = Math.pow(point.x - entry.x, 2) + Math.pow(point.y - entry.y, 2);
    if (distance > farthest) { farthest = distance; exit = point; }
  });
  return { 入口: entry, 出口: exit || exits[0]! };
}
