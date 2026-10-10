import { 怪物状态 } from './constants';
import type { WorldState } from './state';

type Point = { x: number; y: number };
type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Path-search collaborators (packets `t10-path-search`, `t10-path-primitives`, `t10-turn-movement-audit`) and class checks. */
export interface TargetingPorts {
  /** Source `检查视线(sx, sy, ex, ey, 最大距离)`. */
  lineOfSight(sx: number, sy: number, ex: number, ey: number, max: number): boolean;
  /** Source `快速直线检查(sx, sy, ex, ey, 最大距离)`. */
  quickLineCheck(sx: number, sy: number, ex: number, ey: number, max: number): boolean;
  /** Source `获取直线路径(sx, sy, ex, ey)`. */
  straightPath(sx: number, sy: number, ex: number, ey: number): Point[] | null | undefined;
  /** Source `广度优先搜索路径(sx, sy, ex, ey, 最大距离, true)`. */
  searchPath(sx: number, sy: number, ex: number, ey: number, max: number, flag: true): Point[] | null | undefined;
  /** Source `instanceof 骷髅仆从`. */
  isSkeletonMinion(monster: unknown): boolean;
  /** Source `instanceof 巡逻怪物 || instanceof 远射陷阱`. */
  isLowPriorityTarget(monster: unknown): boolean;
}

export interface MovementPorts {
  /** Source `检查移动可行性(fromX, fromY, toX, toY, 未解锁房间视作障碍)` (packet `t10-turn-movement-audit`). */
  canStep(fromX: number, fromY: number, toX: number, toY: number, lockedRoomsBlock: unknown): boolean;
}

export type NearbyMonsters = { 路径: Point[][]; 怪物: unknown[] } | { 路径: null; 怪物: null };

/**
 * Source `获取周围怪物(数量 = 1, 范围 = null, 原位置 = 玩家)`. With `范围 === null` the first ready weapon
 * on the current equipment page sets the range; candidates are scanned column-major (dx outer, dy inner),
 * stable-sorted by Manhattan distance with patrols/ranged traps last, then routed straight or by search.
 */
export function getNearbyMonsters(state: WorldState, ports: TargetingPorts, count: number = 1, range: number | null = null, origin: Point = state.玩家): NearbyMonsters {
  if (state.当前天气效果.includes('诡魅') && (range as number) > 2) range = 2;
  let attackRange: Loose = 0;
  if (range === null) {
    const perPage = state.装备栏每页装备数;
    const weapon: Loose = Array.from({ length: perPage }, (_, i) => state.玩家装备.get(state.当前装备页 * perPage + i + 1))
      // eslint-disable-next-line eqeqeq
      .filter(value => value != null)
      .find((item: Loose) => item.类型 === '武器' && item.堆叠数量 > 0 && item.自定义数据.get('冷却剩余') === 0);
    if (!weapon) return { 路径: null, 怪物: null };
    attackRange = weapon.最终攻击范围;
  } else {
    attackRange = range;
  }
  const grid = state.地牢 as unknown as { 关联怪物: Loose }[][];
  const candidates: { 怪物: unknown; 距离: number; x: number; y: number }[] = [];
  for (let dx = -attackRange; dx <= attackRange; dx++) {
    for (let dy = -attackRange; dy <= attackRange; dy++) {
      const x = origin.x + dx; const y = origin.y + dy;
      if (x >= 0 && x < state.地牢大小 && y >= 0 && y < state.地牢大小 &&
        grid[y]![x]!.关联怪物?.状态 === 怪物状态.活跃 &&
        (state.怪物状态表.get(grid[y]![x]!.关联怪物) as Loose)?.类型 !== '魅惑') {
        const monster = grid[y]![x]!.关联怪物;
        if (ports.isSkeletonMinion(monster)) continue;
        if (ports.lineOfSight(origin.x, origin.y, x, y, attackRange)) candidates.push({ 怪物: monster, 距离: Math.abs(dx) + Math.abs(dy), x, y });
      }
    }
  }
  const sorted = candidates.sort((a, b) => {
    if (a.距离 !== b.距离) return a.距离 - b.距离;
    const aLow = ports.isLowPriorityTarget(a.怪物); const bLow = ports.isLowPriorityTarget(b.怪物);
    if (aLow && !bLow) return 1;
    if (!aLow && bLow) return -1;
    return 0;
  });
  const paths: Point[][] = []; const monsters: unknown[] = [];
  for (const item of sorted.slice(0, count)) {
    let path: Point[] | null | undefined = [];
    if (ports.quickLineCheck(origin.x, origin.y, item.x, item.y, attackRange)) path = ports.straightPath(origin.x, origin.y, item.x, item.y);
    else path = ports.searchPath(origin.x, origin.y, item.x, item.y, attackRange, true);
    if (path) { path.shift(); paths.push(path); monsters.push(item.怪物); }
  }
  return paths.length > 0 ? { 路径: paths, 怪物: monsters } : { 路径: null, 怪物: null };
}

/** Source `检查直线移动可行性(fromX, fromY, toX, toY, 未解锁房间视作障碍 = false)`: orthogonal only, every step checked. */
export function canMoveStraight(state: WorldState, ports: MovementPorts, fromX: number, fromY: number, toX: number, toY: number, lockedRoomsBlock: unknown = false): boolean {
  const dx = toX - fromX; const dy = toY - fromY;
  if (dx !== 0 && dy !== 0) return false;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const dirX = dx > 0 ? 1 : dx < 0 ? -1 : 0; const dirY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  for (let i = 1; i <= steps; i++) {
    const x = fromX + dirX * i; const y = fromY + dirY * i;
    if (x < 0 || x >= state.地牢大小 || y < 0 || y >= state.地牢大小) return false;
    if (!ports.canStep(x - dirX, y - dirY, x, y, lockedRoomsBlock)) return false;
  }
  return true;
}
