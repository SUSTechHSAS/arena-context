// SPDX-License-Identifier: GPL-3.0-only
// Behavior ported from SUSTechHSAS/chinese-dungeon, commit 8d80b5a4.
// See reference/chinese-dungeon/LICENSE and docs/task-10/unit-01.md.

export type Direction = 'right' | 'left' | 'down' | 'up';
export type Terrain =
  | 'wall' | 'room' | 'corridor' | 'door' | 'locked-door'
  | 'item' | 'stairs-down' | 'stairs-up' | 'monster';

export interface MapItem {
  readonly kind: 'placed-obstacle' | 'obsidian' | 'switch-brick' | 'other';
  // The legacy predicate uses JS truthiness, not a strict boolean check.
  readonly blocksMonsters?: unknown;
}

export interface Cell {
  readonly terrain: Terrain;
  readonly walls: Readonly<Partial<Record<Direction, boolean>>>;
  readonly item?: MapItem | null;
}
export interface Position { readonly x: number; readonly y: number }
export type Dungeon = readonly (readonly Cell[])[];

const DIRECTIONS = [
  { dx: 1, dy: 0, from: 'right', to: 'left' },
  { dx: -1, dy: 0, from: 'left', to: 'right' },
  { dx: 0, dy: 1, from: 'down', to: 'up' },
  { dx: 0, dy: -1, from: 'up', to: 'down' },
] as const;

/**
 * Legacy-compatible four-neighbor distances; unreachable cells remain Infinity.
 * Contract: nonempty square grid and integer start coordinates inside it. This
 * first slice does not specify legacy behavior on malformed/out-of-range input.
 * Neither the grid nor its nested items/walls are mutated.
 */
export function generateDistanceMap(dungeon: Dungeon, start: Position): number[][] {
  const size = dungeon.length;
  const distances = Array.from({ length: size }, () => Array<number>(size).fill(Infinity));
  distances[start.y]![start.x] = 0;
  const queue: Position[] = [start];

  // A cursor avoids Array.shift's repeated reindexing, retaining the same FIFO order.
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor]!;
    const distance = distances[current.y]![current.x]!;
    // Intentional upstream boundary: distance 99 may discover distance 100.
    if (distance > 99) continue;

    for (const direction of DIRECTIONS) {
      const x = current.x + direction.dx;
      const y = current.y + direction.dy;
      if (x < 0 || x >= size || y < 0 || y >= size) continue;
      const source = dungeon[current.y]![current.x]!;
      const target = dungeon[y]![x]!;
      const item = target.item;
      if (
        source.walls[direction.from] || target.walls[direction.to] ||
        target.terrain === 'wall' || target.terrain === 'locked-door' ||
        (item && (item.kind === 'placed-obstacle' || item.kind === 'obsidian' ||
          (item.kind === 'switch-brick' && item.blocksMonsters)))
      ) continue;

      if (distances[y]![x]! > distance + 1) {
        distances[y]![x] = distance + 1;
        queue.push({ x, y });
      }
    }
  }
  return distances;
}
