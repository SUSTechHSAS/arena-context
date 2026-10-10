import { CellType, type Position } from '../domain/distance-map';
import { DungeonRandom, type RandomStream } from '../domain/random';
import { LOCK_COLORS, ViewerCell, ViewerDoor, type Room, type ViewerSnapshot } from './model';

type AvoidDirections = Partial<Record<'上' | '下' | '左' | '右', boolean>>;

/** Stateful viewer contract, distinct from the main game's generator. */
export class ViewerGenerator {
  private size = 100;
  private cells: ViewerCell[][] = [];
  private roomMap: number[][] = [];
  private rooms: Room[] = [];
  private lockedRooms: Room[] = [];
  private doors = new Map<symbol, ViewerDoor>();
  private playerStart: Position = { x: 0, y: 0 };
  private stairsDown: Position | null = null;
  private stairsUp: Position | null = null;

  constructor(private random: RandomStream, private now: () => number = Date.now) {}

  generate(level: number): ViewerSnapshot {
    this.size = 100 + level * 2;
    this.cells = Array.from(new Array(this.size), (_, y) => Array.from(new Array(this.size), (_, x) => new ViewerCell(x, y)));
    this.roomMap = Array.from(new Array(this.size), () => Array<number>(this.size).fill(-1));
    this.rooms = []; this.lockedRooms = []; this.doors = new Map();
    this.stairsDown = null; this.stairsUp = null;
    const connectedPairs = new Set<string>();
    let width = this.roomDimension();
    let height = this.roomDimension();
    let x = Math.floor(this.size / 2 - width / 2);
    let y = Math.floor(this.size / 2 - height / 2);
    this.rooms.push({ x, y, w: width, h: height, id: 0, 名称: '房间_0', 门: [] });
    this.placeRoom(this.rooms[0]!);
    for (let index = 1; index < 15 + level; index++) {
      let placed = false;
      let attempts = 0;
      while (!placed && attempts < 300) {
        attempts++;
        const previous = this.rooms[index - 1]!;
        width = this.roomDimension(); height = this.roomDimension();
        const direction = Math.floor(this.random.next() * 4);
        const extension = Math.floor(this.random.next() * Math.max(0, attempts - 10)) + 12;
        switch (direction) {
          case 0: x = previous.x + Math.floor((previous.w - width) / 2); y = previous.y - height - extension; break;
          case 1: x = previous.x + previous.w + extension; y = previous.y + Math.floor((previous.h - height) / 2); break;
          case 2: x = previous.x + Math.floor((previous.w - width) / 2); y = previous.y + previous.h + extension; break;
          case 3: x = previous.x - width - extension; y = previous.y + Math.floor((previous.h - height) / 2); break;
        }
        x = Math.max(5, Math.min(x, this.size - width - 5));
        y = Math.max(5, Math.min(y, this.size - height - 5));
        if (!this.isAreaFree(x, y, width, height)) continue;
        const room: Room = { x, y, w: width, h: height, id: index, 名称: `房间_${index}`, 门: [], 类型: '房间' };
        this.rooms.push(room); this.placeRoom(room);
        const pair = this.pairId(this.rooms[index - 1]!, room);
        if (!connectedPairs.has(pair)) {
          const path = this.connectRooms(this.rooms[index - 1]!, room);
          if (path) { this.placeCorridors(path); connectedPairs.add(pair); }
        }
        placed = true;
      }
    }
    this.addExtraCorridors(5 + level, connectedPairs);
    this.generateWalls();
    const first = this.rooms[0]!;
    this.playerStart.x = first.x + Math.floor(first.w / 2);
    this.playerStart.y = first.y + Math.floor(first.h / 2);
    if (this.rooms.length > 4) this.lockDoors();
    const distances = this.distanceMap(this.playerStart);
    let farthestDistance = -1;
    let farthest: Room | null = null;
    const available = this.rooms.filter(room => room.id !== 0 && room.类型 == '房间');
    for (const room of available) {
      const distance = distances[room.y + Math.floor(room.h / 2)]?.[room.x + Math.floor(room.w / 2)];
      if (distance !== undefined && distance !== Infinity && distance > farthestDistance) {
        farthestDistance = distance; farthest = room;
      }
    }
    if (!farthest) farthest = available[Math.floor(this.random.next() * available.length)]!;
    this.placeStairs(farthest, CellType.Downstairs);
    if (level > 0) this.placeStairs(first, CellType.Upstairs);
    return this.snapshot();
  }

  snapshot(): ViewerSnapshot {
    return {
      地牢大小: this.size, 地牢: this.cells, 房间列表: this.rooms, 上锁房间列表: this.lockedRooms,
      房间地图: this.roomMap, 门实例列表: this.doors, 玩家初始位置: this.playerStart,
      下楼楼梯位置: this.stairsDown, 上楼楼梯位置: this.stairsUp,
    };
  }

  private roomDimension(): number { return 7 + 2 * Math.floor((this.random.next() * (10 - 7)) / 2); }
  private pairId(first: Room, second: Room): string {
    // Deliberately preserve default JS lexicographic sort, not numeric sorting.
    return [first.id, second.id].sort().join('-');
  }

  private isAreaFree(x: number, y: number, width: number, height: number): boolean {
    for (let row = y; row < y + height; row++) for (let column = x; column < x + width; column++) {
      if (row >= this.size || column >= this.size || this.cells[row]![column]!.背景类型 !== CellType.Wall) return false;
    }
    for (let row = Math.max(0, y - 2); row <= Math.min(this.size - 1, y + height - 1 + 2); row++) {
      for (let column = Math.max(0, x - 2); column <= Math.min(this.size - 1, x + width - 1 + 2); column++) {
        const dx = column < x ? x - column : column >= x + width ? column - (x + width - 1) : 0;
        const dy = row < y ? y - row : row >= y + height ? row - (y + height - 1) : 0;
        if (dx + dy <= 2 && this.cells[row]![column]!.背景类型 !== CellType.Wall) return false;
      }
    }
    return true;
  }

  private placeRoom(room: Room): void {
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) {
      const cell = this.cells[y]![x]!;
      cell.背景类型 = CellType.Room; this.roomMap[y]![x] = room.id;
      cell.墙壁 = { 上: y === room.y, 下: y === room.y + room.h - 1, 左: x === room.x, 右: x === room.x + room.w - 1 };
    }
    room.已解锁 = false;
  }

  private roomEntrances(room: Room, avoid: AvoidDirections): Position[] {
    const { x, y, w, h } = room;
    const entrances: Position[] = [];
    // The original tests 类型, which stays Wall, not 背景类型. Preserve that quirk.
    if (!avoid.上 && y > 0) for (let column = x + 1; column < x + w - 1; column++) {
      if (this.cells[y - 1]![column]!.类型 === CellType.Wall) entrances.push({ x: column, y: y - 1 });
    }
    if (!avoid.下 && y + h < this.size - 1) for (let column = x + 1; column < x + w - 1; column++) {
      if (this.cells[y + h]![column]!.类型 === CellType.Wall) entrances.push({ x: column, y: y + h });
    }
    if (!avoid.左 && x > 0) for (let row = y + 1; row < y + h - 1; row++) {
      if (this.cells[row]![x - 1]!.类型 === CellType.Wall) entrances.push({ x: x - 1, y: row });
    }
    if (!avoid.右 && x + w < this.size - 1) for (let row = y + 1; row < y + h - 1; row++) {
      if (this.cells[row]![x + w]!.类型 === CellType.Wall) entrances.push({ x: x + w, y: row });
    }
    return entrances;
  }

  private connectRooms(first: Room | undefined, second: Room | undefined): Position[] | undefined {
    if (!first || !second) return;
    const relative = { 左: first.x < second.x, 右: first.x > second.x, 上: first.y < second.y, 下: first.y > second.y };
    const starts = this.roomEntrances(first, relative);
    const ends = this.roomEntrances(second, { 左: relative.右, 右: relative.左, 上: relative.下, 下: relative.上 });
    let start: Position | null = null; let end: Position | null = null; let minimum = Infinity;
    for (const candidate of starts) for (const target of ends) {
      const distance = Math.abs(candidate.x - target.x) + Math.abs(candidate.y - target.y);
      if (distance < minimum) { minimum = distance; start = candidate; end = target; }
    }
    if (!start || !end) return;
    const current = { x: start.x, y: start.y };
    // Original stores this first mutable object in the path; preserve its alias.
    const path = [current];
    const xFirst = Math.abs(end.x - start.x) > Math.abs(end.y - start.y);
    while (current.x !== end.x || current.y !== end.y) {
      const dx = end.x - current.x; const dy = end.y - current.y;
      if (xFirst && dx !== 0) current.x += dx > 0 ? 1 : -1;
      else if (dy !== 0) current.y += dy > 0 ? 1 : -1;
      else if (!xFirst && dx !== 0) current.x += dx > 0 ? 1 : -1;
      path.push({ x: current.x, y: current.y });
    }
    this.placeDoor(start.x, start.y, first);
    this.placeDoor(end.x, end.y, second);
    return path;
  }

  private placeDoor(x: number, y: number, room: Room): void {
    const identity = Symbol(this.now().toString() + this.random.next().toString());
    const door = new ViewerDoor(room.id, { x, y }, identity);
    this.doors.set(identity, door);
    const cell = this.cells[y]![x]!;
    cell.标识 = identity; cell.背景类型 = CellType.Door;
    if (!room.门.some(position => position.x === x && position.y === y)) room.门.push({ x, y });
  }

  private placeCorridors(path: Position[]): void {
    for (const { x, y } of path) if (this.cells[y]?.[x]?.背景类型 === CellType.Wall) this.cells[y]![x]!.背景类型 = CellType.Corridor;
  }

  private generateWalls(): void {
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
      const cell = this.cells[y]![x]!;
      const type = cell.背景类型;
      const open = [CellType.Wall, CellType.Corridor, CellType.Room].includes(type as 0 | 1 | 2);
      const boundary = (row: number, column: number) => open
        ? this.cells[row]![column]!.背景类型 !== type : this.cells[row]![column]!.背景类型 === CellType.Wall;
      cell.墙壁 = { 上: y > 0 && boundary(y - 1, x), 下: y < this.size - 1 && boundary(y + 1, x),
        左: x > 0 && boundary(y, x - 1), 右: x < this.size - 1 && boundary(y, x + 1) };
    }
  }

  private addExtraCorridors(count: number, connected: Set<string>): void {
    let added = 0; let attempts = 0;
    while (added < count && attempts < 100) {
      attempts++;
      const first = this.rooms[Math.floor(this.random.next() * this.rooms.length)]!;
      const second = this.rooms[Math.floor(this.random.next() * this.rooms.length)]!;
      if (first.id === second.id) continue;
      const pair = this.pairId(first, second);
      if (connected.has(pair)) continue;
      const path = this.connectRooms(first, second);
      if (path) { connected.add(pair); this.placeCorridors(path); added++; }
    }
  }

  private lockDoors(): void {
    const firstLockedIndex = Math.floor(this.rooms.length * 0.5);
    const candidates = this.rooms.filter(room => room.门.length > 0 && room.id >= firstLockedIndex);
    const count = Math.min(candidates.length, Math.floor(this.random.next() * candidates.length * 0.5) + 1);
    for (let index = 0; index < count; index++) {
      if (candidates.length === 0) break;
      const room = candidates.splice(Math.floor(this.random.next() * candidates.length), 1)[0]!;
      if (room.id === 0) continue;
      const color = index % LOCK_COLORS.length;
      for (const position of room.门) {
        const main = this.cells[position.y]?.[position.x];
        if (!main?.标识) continue;
        for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
          const cell = this.cells[y]![x]!;
          if (cell.标识 === main.标识) {
            cell.背景类型 = CellType.LockedDoor; cell.钥匙ID = room.id; cell.颜色索引 = color;
          }
        }
      }
      this.lockedRooms.push({ ...room, 颜色索引: color });
    }
  }

  private distanceMap(start: Position): number[][] {
    const distances = Array.from({ length: this.size }, () => Array<number>(this.size).fill(Infinity));
    const queue: [number, number, number][] = [[start.x, start.y, 0]];
    distances[start.y]![start.x] = 0;
    for (let head = 0; head < queue.length; head++) {
      const [x, y, distance] = queue[head]!;
      for (const { dx, dy } of [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }]) {
        const column = x + dx; const row = y + dy;
        if (column < 0 || column >= this.size || row < 0 || row >= this.size) continue;
        if (distances[row]![column] !== Infinity) continue;
        const type = this.cells[row]![column]!.背景类型;
        if (type !== CellType.Wall && type !== CellType.LockedDoor) {
          distances[row]![column] = distance + 1; queue.push([column, row, distance + 1]);
        }
      }
    }
    return distances;
  }

  private placeStairs(room: Room, type: number): void {
    const position = { x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) };
    if (type === CellType.Downstairs) this.stairsDown = position;
    else this.stairsUp = position;
  }
}

/** Viewer reseeds independently for every floor and consumes floor skipped draws. */
export function generateViewerLevel(seed: unknown, level: number, now: () => number = Date.now): ViewerSnapshot {
  const random = new DungeonRandom(seed);
  for (let draw = 0; draw < level; draw++) random.next();
  return new ViewerGenerator(random, now).generate(level);
}
