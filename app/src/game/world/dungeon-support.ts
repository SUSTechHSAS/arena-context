import { 单元格类型, 颜色表 } from './constants';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Source `计算距离图(起始X, 起始Y)` (HTML L39561): BFS step distances from a start cell that stop at walls, locked
 * doors, wall flags on either side and `开关砖` items. Unreached cells stay `Infinity`; an off-grid start row throws.
 */
export function computeDistanceMap(state: WorldState, startX: number, startY: number): number[][] {
  const S = state as Loose;
  const distances: number[][] = Array(S.地牢大小).fill(null).map(() => Array(S.地牢大小).fill(Infinity));
  const queue: [number, number, number][] = [[startX, startY, 0]];
  distances[startY]![startX] = 0;
  const visited = new Set([`${startX},${startY}`]);
  const directions = [
    { dx: 0, dy: -1, wall: '上', opposite: '下' },
    { dx: 0, dy: 1, wall: '下', opposite: '上' },
    { dx: -1, dy: 0, wall: '左', opposite: '右' },
    { dx: 1, dy: 0, wall: '右', opposite: '左' },
  ];
  while (queue.length > 0) {
    const [x, y, distance] = queue.shift()!;
    for (const dir of directions) {
      const nx = x + dir.dx;
      const ny = y + dir.dy;
      if (nx < 0 || nx >= S.地牢大小 || ny < 0 || ny >= S.地牢大小) continue;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      const current = S.地牢[y]?.[x];
      const next = S.地牢[ny]?.[nx];
      if (current && next && ![单元格类型.墙壁, 单元格类型.上锁的门].includes(next.背景类型) && !current.墙壁[dir.wall]
        && !next.墙壁[dir.opposite] && !(next.关联物品?.类型 === '开关砖')) {
        distances[ny]![nx] = distance + 1;
        visited.add(key);
        queue.push([nx, ny, distance + 1]);
      }
    }
  }
  return distances;
}

/** Source `处理上锁的门()` (HTML L42517): locks the doors of a random subset of later plain rooms.
 * SRC-18 fixed (owner rule 2026-10-10): `null` room-list entries are skipped instead of throwing. */
export function lockRooms(state: WorldState, ports: { random(): number }): void {
  const S = state as Loose;
  const firstLockable = Math.floor(S.房间列表.length * 0.5);
  const candidates = S.房间列表.filter((room: Loose) => room && room.门.length > 0 && // SRC-18 fixed: null entries skipped
    room.id >= firstLockable && room.类型 == '房间'); // eslint-disable-line eqeqeq
  const count = Math.min(candidates.length, Math.floor(ports.random() * candidates.length * 0.5) + 1);
  for (let i = 0; i < count; i++) {
    if (candidates.length === 0) break;
    const room = candidates.splice(Math.floor(ports.random() * candidates.length), 1)[0];
    if (room.id !== 0) {
      const colorIndex = i % 颜色表.length;
      room.门.forEach((door: Loose) => {
        const doorCell = S.地牢[door.y]?.[door.x];
        if (doorCell && doorCell.标识) {
          const id = doorCell.标识;
          for (let y = 0; y < S.地牢大小; y++) {
            for (let x = 0; x < S.地牢大小; x++) {
              const cell = S.地牢[y]?.[x];
              if (cell && cell.标识 === id && cell.背景类型 === 单元格类型.门) {
                cell.背景类型 = 单元格类型.上锁的门;
                cell.钥匙ID = room.id;
                cell.颜色索引 = colorIndex;
                const instance = S.门实例列表.get(id);
                if (instance) {
                  instance.类型 = '上锁的门';
                  instance.是否上锁 = true;
                }
              }
            }
          }
        }
      });
      S.上锁房间列表.push({ ...room, 颜色索引: colorIndex });
    }
  }
  S.上锁房间列表.forEach((locked: Loose) => {
    const original = S.房间列表.find((r: Loose) => r && r.id === locked.id);
    if (original) original.已解锁 = false;
  });
}

export interface RecipeScrollPorts {
  random(): number;
  generateRecipe(floor: number): Loose; // 生成单个随机融合配方
  createRecipeScroll(options: { recipeData: unknown; 层数: number }): unknown; // new 配方卷轴(...)
  placeItemInRoom(item: unknown, room: unknown): unknown; // 放置物品到房间
  log(message: string): void; // console.log
  warn(message: string): void; // console.warn
}

/** Source `生成并放置随机配方卷轴(层数)` (HTML L47525). */
export function placeRandomRecipeScrolls(state: WorldState, ports: RecipeScrollPorts, floor: Loose): void {
  const S = state as Loose;
  if (floor === null || floor < 0) return;
  const count = 1 + Math.floor(ports.random() * floor);
  let placed = 0;
  for (let i = 0; i < count; i++) {
    const recipe = ports.generateRecipe(floor);
    if (recipe) {
      ports.log(`为第 ${floor} 层生成了新的配方知识: ${recipe.说明}`);
      const scroll = ports.createRecipeScroll({ recipeData: recipe, 层数: floor });
      const rooms = S.房间列表.filter((room: Loose) => room.类型 === '房间' && !S.上锁房间列表.some((r: Loose) => r.id === room.id));
      if (rooms.length > 0) {
        const room = rooms[Math.floor(ports.random() * rooms.length)];
        if (ports.placeItemInRoom(scroll, room)) placed++;
        else ports.warn(`无法在房间 ${room.id} 为配方 "${recipe.说明}" 找到放置位置。`);
      } else {
        ports.warn('没有找到合适的房间来放置配方卷轴。');
      }
    }
  }
  if (placed > 0) ports.log(`在第 ${floor} 层成功放置了 ${placed} 个配方卷轴。`);
}

export interface SokobanSolvedPorts {
  isSokobanBox(item: unknown): boolean; // instanceof 推箱子箱子
  isSokobanTarget(item: unknown): boolean; // instanceof 推箱子目标
  notify(message: string, type: string, flag?: boolean): void; // 显示通知
  /** Source `window[类名]`. */
  lookupClass(name: unknown): (new (options: unknown) => unknown) | undefined;
  placeItemInRoom(item: unknown, room: unknown, kind: number, a: boolean, b: boolean): unknown; // 放置物品到房间
  generateReward(room: unknown): void; // 生成奖励
  draw(): void; // 绘制
}

/** Source `解谜成功_推箱子(房间)` (HTML L40313): clears boxes and targets and grants the room's reward. */
export function completeSokobanRoom(state: WorldState, ports: SokobanSolvedPorts, room: Loose): void {
  const S = state as Loose;
  room.解谜已完成 = true;
  ports.notify('谜题解开了！一个隐藏的宝藏出现了！', '成功', true);
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const cell = S.地牢[y]?.[x];
      if (cell?.关联物品 && (ports.isSokobanBox(cell.关联物品) || ports.isSokobanTarget(cell.关联物品))) {
        cell.关联物品 = null;
        cell.类型 = null;
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
  ports.draw();
}

/** Source `检查推箱子解谜完成(房间标识)` (HTML L40272). `onSolved` is `解谜成功_推箱子`. */
export function checkSokobanSolved(state: WorldState, ports: Pick<SokobanSolvedPorts, 'isSokobanBox' | 'isSokobanTarget'> & { onSolved(room: unknown): void }, roomId: unknown): void {
  const S = state as Loose;
  const room = S.房间列表.find((r: Loose) => r && r.id === roomId);
  if (!room || room.类型 !== '隐藏推箱子房间' || room.解谜已完成) return;
  const targets: Loose[] = [];
  const boxes: Loose[] = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const cell = S.地牢[y]?.[x];
      if (cell?.关联物品) {
        if (ports.isSokobanTarget(cell.关联物品)) targets.push(cell.关联物品);
        if (ports.isSokobanBox(cell.关联物品)) boxes.push(cell.关联物品);
      }
    }
  }
  let covered = true;
  for (const target of targets) {
    if (!boxes.some((box) => box.x === target.x && box.y === target.y)) {
      covered = false;
      break;
    }
  }
  if (covered) ports.onSolved(room);
}
