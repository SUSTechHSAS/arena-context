export const CellType = {
  Wall: 0, Room: 1, Corridor: 2, Door: 3, LockedDoor: 4, Item: 5,
  Downstairs: 6, Upstairs: 7, Monster: 8,
} as const;

type WallName = '上' | '下' | '左' | '右';
export interface PathCell {
  背景类型: number;
  墙壁: Record<WallName, unknown>;
  关联物品?: unknown;
}

export interface Position { x: number; y: number }
export interface SolidItemClasses {
  obstacle: abstract new (...args: never[]) => object;
  obsidian: abstract new (...args: never[]) => object;
}

/**
 * Faithful main-game path distances. Item constructors are injected so the engine
 * keeps source instanceof semantics without substituting tags for real identity.
 * Inputs are not sanitized: invalid starts fail as in the original.
 */
export function playerDistanceMap(
  grid: readonly (readonly PathCell[])[], start: Position, size: number,
  itemClasses: SolidItemClasses,
): number[][] {
  const distances: number[][] = Array.from({ length: size }, () => Array<number>(size).fill(Infinity));
  const queue = [{ ...start, distance: 0 }];
  const directions: { dx: number; dy: number; from: WallName; to: WallName }[] = [
    { dx: 1, dy: 0, from: '右', to: '左' },
    { dx: -1, dy: 0, from: '左', to: '右' },
    { dx: 0, dy: 1, from: '下', to: '上' },
    { dx: 0, dy: -1, from: '上', to: '下' },
  ];
  distances[start.y]![start.x] = 0;
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    // Cells at distance 100 are reachable but are not expanded in the source.
    if (current.distance > 99) continue;
    for (const direction of directions) {
      const x = current.x + direction.dx;
      const y = current.y + direction.dy;
      if (x < 0 || x >= size || y < 0 || y >= size) continue;
      const from = grid[current.y]![current.x]!;
      const target = grid[y]![x]!;
      const item = target.关联物品;
      if (from.墙壁[direction.from] || target.墙壁[direction.to] ||
          target.背景类型 === CellType.Wall || target.背景类型 === CellType.LockedDoor ||
          (item && (item instanceof itemClasses.obstacle || item instanceof itemClasses.obsidian ||
            ((item as { 类型?: unknown }).类型 === '开关砖' &&
             (item as { 阻碍怪物?: unknown }).阻碍怪物)))) continue;
      const nextDistance = distances[current.y]![current.x]! + 1;
      if (distances[y]![x]! > nextDistance) {
        distances[y]![x] = nextDistance;
        queue.push({ x, y, distance: nextDistance });
      }
    }
  }
  return distances;
}
