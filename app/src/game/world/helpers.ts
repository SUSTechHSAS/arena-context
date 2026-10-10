import { 单元格类型 } from './constants';
import { GameCell } from './cell';

/** Source `isObject`: functions are NOT objects here (typeof check only). */
export function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/**
 * Source `deepClone` (main page). Quirks preserved deliberately:
 * - functions return early through `!isObject` (the dedicated function branch is unreachable);
 * - Map keys are kept by reference, values cloned; Set members cloned;
 * - class instances become plain objects/arrays (prototype dropped), own enumerable string keys only,
 *   read through ordinary property access (own getters run);
 * - array holes are skipped, so trailing holes shorten the clone;
 * - Date/Map/Set checks use this realm's constructors (instanceof), like the source page.
 */
export function deepClone<T>(target: T): T {
  const map = new Map<unknown, unknown>();
  function clone(value: unknown): unknown {
    if (map.has(value)) return map.get(value);
    if (!isObject(value)) return value;
    if (typeof value === 'function') { map.set(value, value); return value; }
    if (value instanceof Date) { const result = new Date(value); map.set(value, result); return result; }
    if (value instanceof Map) {
      const result = new Map(); map.set(value, result);
      value.forEach((entry, key) => { result.set(key, clone(entry)); });
      return result;
    }
    if (value instanceof Set) {
      const result = new Set(); map.set(value, result);
      value.forEach(item => { result.add(clone(item)); });
      return result;
    }
    const result: Record<string, unknown> = Array.isArray(value) ? ([] as unknown as Record<string, unknown>) : {};
    map.set(value, result);
    for (const key in value) {
      if (Object.hasOwn(value, key)) result[key] = clone((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return clone(target) as T;
}

type WallCell = { x: number; y: number };
type WallGrid = readonly (readonly { 背景类型: number }[])[];

/** Source `获取墙壁字符(单元格, 地牢数组 = 地牢)`; the size bound is the session's 地牢大小. */
export function getWallGlyph(cell: WallCell, grid: WallGrid, size: number): string {
  const up = cell.y > 0 && grid[cell.y - 1]![cell.x]!.背景类型 === 单元格类型.墙壁;
  const down = cell.y < size - 1 && grid[cell.y + 1]![cell.x]!.背景类型 === 单元格类型.墙壁;
  const left = cell.x > 0 && grid[cell.y]![cell.x - 1]!.背景类型 === 单元格类型.墙壁;
  const right = cell.x < size - 1 && grid[cell.y]![cell.x + 1]!.背景类型 === 单元格类型.墙壁;
  const mask = (up ? 1 : 0) | (down ? 2 : 0) | (left ? 4 : 0) | (right ? 8 : 0);
  if (mask === 0) return '#';
  const glyphs: Record<number, string> = { 0: ' ', 1: '│', 2: '│', 3: '│', 4: '─', 5: '┘', 6: '┐', 7: '┤', 8: '─', 9: '└', 10: '┌', 11: '├', 12: '─', 13: '┴', 14: '┬', 15: '┼' };
  return glyphs[mask] || '#';
}

/** Source idiom `Array(地牢大小).fill().map((_, y) => Array(地牢大小).fill().map((_, x) => new 单元格(x, y)))`. */
export function createGrid(size: number): GameCell[][] {
  return Array(size).fill(undefined).map((_, y) => Array(size).fill(undefined).map((__, x) => new GameCell(x, y)));
}
