import { 单元格类型 } from './constants';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Point = { x: number; y: number };

export interface RedBluePuzzlePorts {
  random(): number;
  tracePath(endX: number, endY: number, distances: Loose): Point[]; // 回溯路径 (t10-path-primitives)
  createSwitch(): unknown; // new 红蓝开关({})
  isSwitch(item: unknown): boolean; // instanceof 红蓝开关
  /** `蓝砖块` / `红砖块` constructors; the source picks one class and builds a fresh brick per cell. */
  brickClasses(): { blue: new (options: object) => unknown; red: new (options: object) => unknown };
  placeItemInRoom(item: unknown, room: unknown): unknown; // 放置物品到房间
  placeItemAt(item: unknown, x: number, y: number): unknown; // 放置物品到单元格
  log(message: string): void; // console.log
}

const centre = (room: Loose) => ({ x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) });

/**
 * Source `生成红蓝开关谜题(距离图)` (HTML L38460): blocks the critical path to the farthest room with a red or blue
 * brick wall and puts the switch in an earlier room off that path.
 */
export function generateRedBluePuzzle(state: WorldState, ports: RedBluePuzzlePorts, distances: Loose): void {
  const S = state as Loose;
  let farthestDistance = -1;
  let farthest: Loose = null;
  const rooms = S.房间列表.filter((room: Loose) => room && room.id !== 0 && room.类型 === '房间');
  rooms.forEach((room: Loose) => {
    const c = centre(room);
    const distance = distances[c.y]?.[c.x];
    if (distance !== undefined && distance !== Infinity && distance > farthestDistance) {
      farthestDistance = distance;
      farthest = room;
    }
  });
  if (!farthest) return;
  const end = centre(farthest);
  const path = ports.tracePath(end.x, end.y, distances);
  if (path.length < 20) return;

  const from = Math.floor(path.length * 0.3);
  const to = Math.floor(path.length * 0.7);
  const candidates: { 位置: Point; 索引: number }[] = [];
  for (let i = from; i < to; i++) {
    const position = path[i]!;
    if (S.地牢[position.y][position.x].背景类型 === 单元格类型.走廊) candidates.push({ 位置: position, 索引: i });
  }
  // Source shuffles with a random comparator; the draw count follows the engine's sort, so keep Array#sort.
  candidates.sort(() => ports.random() - 0.5);

  let barrier: { 位置: Point; 索引: number } | null = null;
  let switchRoom: Loose = null;
  for (const candidate of candidates) {
    const barrierDistance = distances[candidate.位置.y][candidate.位置.x];
    const pathRooms = new Set(path.map((p) => S.房间地图[p.y][p.x]));
    const switchRooms = S.房间列表.filter((room: Loose) => {
      if (!room || room.类型 !== '房间' || pathRooms.has(room.id)) return false;
      const roomDistance = distances[room.y + Math.floor(room.h / 2)][room.x + Math.floor(room.w / 2)];
      return roomDistance < barrierDistance;
    });
    if (switchRooms.length > 0) {
      barrier = candidate;
      switchRoom = switchRooms[Math.floor(ports.random() * switchRooms.length)];
      break;
    }
  }
  if (!barrier || !switchRoom) return;

  const switchItem = ports.createSwitch();
  const target = switchRoom;
  for (let y = target.y; y < target.y + target.h; y++) {
    for (let x = target.x; x < target.x + target.w; x++) {
      const cell = S.地牢[y]?.[x];
      if (cell && ports.isSwitch(cell.关联物品)) switchRoom = null;
    }
  }
  if (switchRoom) ports.placeItemInRoom(switchItem, switchRoom);
  ports.log(`已在房间 ${switchRoom?.id} 生成红蓝开关`);
  let vertical = true;
  const prev = path[barrier.索引 - 1];
  const next = path[barrier.索引 + 1];
  if (prev && next && prev.y === next.y) vertical = false;

  const middle = barrier.位置;
  const cells: Point[] = [middle];
  const { blue, red } = ports.brickClasses();
  const Brick = ports.random() > 0.5 ? blue : red;
  if (vertical) {
    for (let dx = -1; dx <= 1; dx += 2) {
      for (let i = 1; i < 100; i++) {
        const x = middle.x + i * dx;
        const y = middle.y;
        const cell = S.地牢[y]?.[x];
        if (cell && cell.背景类型 === 单元格类型.走廊) cells.push({ x, y });
        else break;
      }
    }
  } else {
    for (let dy = -1; dy <= 1; dy += 2) {
      for (let i = 1; i < 100; i++) {
        const x = middle.x;
        const y = middle.y + i * dy;
        const cell = S.地牢[y]?.[x];
        if (cell && cell.背景类型 === 单元格类型.走廊) cells.push({ x, y });
        else break;
      }
    }
  }
  let placed = 0;
  cells.forEach((p) => {
    if (ports.placeItemAt(new Brick({}), p.x, p.y)) placed++;
  });
  if (placed > 0) ports.log(`已在关键路径上生成了由 ${placed} 块砖块构成的障碍墙`);
}
