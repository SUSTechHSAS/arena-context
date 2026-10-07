import { describe, expect, it } from 'vitest';
import { generateDistanceMap, type Cell, type Direction, type Dungeon, type MapItem, type Position, type Terrain } from '../src/domain/distance-map';
import { deepFreeze, legacyDistanceMap } from './legacy-oracle';

type MutableGrid = Cell[][];
function grid(size: number, terrain: Terrain = 'room'): MutableGrid {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => ({ terrain, walls: {} })));
}
function patch(map: MutableGrid, x: number, y: number, change: Partial<Cell>) {
  map[y]![x] = { ...map[y]![x]!, ...change };
}
function parity(map: Dungeon, start: Position = { x: 0, y: 0 }) {
  const before = structuredClone(map);
  deepFreeze(map);
  deepFreeze(start);
  const expected = legacyDistanceMap(map, start);
  const actual = generateDistanceMap(map, start);
  expect(actual).toStrictEqual(expected);
  expect(map).toStrictEqual(before);
  return actual;
}

// Isolate a single neighbor so a wall cannot be bypassed around the test edge.
function isolatedEdge(direction: Direction): { map: MutableGrid; target: Position } {
  const map = grid(3, 'wall');
  const target = {
    right: { x: 2, y: 1 }, left: { x: 0, y: 1 },
    down: { x: 1, y: 2 }, up: { x: 1, y: 0 },
  }[direction];
  patch(map, 1, 1, { terrain: 'room' });
  patch(map, target.x, target.y, { terrain: 'room' });
  return { map, target };
}

describe('unmodified upstream vs TypeScript distance-map behavior', () => {
  it('single cell has zero distance', () => {
    expect(parity(grid(1))).toStrictEqual([[0]]);
  });
  it('open grid uses Manhattan distance, not diagonal moves', () => {
    expect(parity(grid(3))).toStrictEqual([[0, 1, 2], [1, 2, 3], [2, 3, 4]]);
  });
  it('center start and all four directions work', () => {
    expect(parity(grid(3), { x: 1, y: 1 })).toStrictEqual([[2, 1, 2], [1, 0, 1], [2, 1, 2]]);
  });
  it('bottom-right boundary has no wrapping', () => {
    expect(parity(grid(2), { x: 1, y: 1 })).toStrictEqual([[2, 1], [1, 0]]);
  });

  const opposites: Record<Direction, Direction> = { right: 'left', left: 'right', up: 'down', down: 'up' };
  for (const direction of Object.keys(opposites) as Direction[]) {
    it(`source ${direction} wall alone blocks crossing`, () => {
      const { map, target } = isolatedEdge(direction);
      patch(map, 1, 1, { walls: { [direction]: true } });
      expect(parity(map, { x: 1, y: 1 })[target.y]![target.x]).toBe(Infinity);
    });
    it(`target ${opposites[direction]} wall alone blocks crossing`, () => {
      const { map, target } = isolatedEdge(direction);
      patch(map, target.x, target.y, { walls: { [opposites[direction]]: true } });
      expect(parity(map, { x: 1, y: 1 })[target.y]![target.x]).toBe(Infinity);
    });
  }

  it.each<Terrain>(['wall', 'locked-door'])('target terrain %s blocks entry', terrain => {
    const { map, target } = isolatedEdge('right');
    patch(map, target.x, target.y, { terrain });
    expect(parity(map, { x: 1, y: 1 })[1]![2]).toBe(Infinity);
  });
  it.each<Terrain>(['room', 'corridor', 'door', 'item', 'stairs-down', 'stairs-up', 'monster'])('%s remains traversable', terrain => {
    const { map, target } = isolatedEdge('right');
    patch(map, target.x, target.y, { terrain });
    expect(parity(map, { x: 1, y: 1 })[1]![2]).toBe(1);
  });
  it.each<MapItem['kind']>(['placed-obstacle', 'obsidian'])('%s blocks even when blocksMonsters is false', kind => {
    const { map, target } = isolatedEdge('right');
    patch(map, target.x, target.y, { item: { kind, blocksMonsters: false } });
    expect(parity(map, { x: 1, y: 1 })[1]![2]).toBe(Infinity);
  });
  it.each([true, 1, 'false'])('truthy switch-brick flag %s blocks', flag => {
    const { map, target } = isolatedEdge('right');
    patch(map, target.x, target.y, { item: { kind: 'switch-brick', blocksMonsters: flag } });
    expect(parity(map, { x: 1, y: 1 })[1]![2]).toBe(Infinity);
  });
  it.each([false, 0, '', null, undefined])('falsy switch-brick flag %s does not block', flag => {
    const { map, target } = isolatedEdge('right');
    patch(map, target.x, target.y, { item: { kind: 'switch-brick', blocksMonsters: flag } });
    expect(parity(map, { x: 1, y: 1 })[1]![2]).toBe(1);
  });
  it('ordinary items with blocksMonsters=true are still traversable', () => {
    const { map, target } = isolatedEdge('right');
    patch(map, target.x, target.y, { item: { kind: 'other', blocksMonsters: true } });
    expect(parity(map, { x: 1, y: 1 })[1]![2]).toBe(1);
  });
  it('null items do not block', () => {
    const map = grid(2);
    patch(map, 1, 0, { item: null });
    expect(parity(map)[0]![1]).toBe(1);
  });
  it('takes the shortest detour through a gap', () => {
    const map = grid(5);
    for (let y = 0; y < 4; y++) patch(map, 2, y, { terrain: 'wall' });
    expect(parity(map)[0]![4]).toBe(12);
  });
  it('a sealed region remains Infinity', () => {
    const map = grid(3);
    for (let y = 0; y < 3; y++) patch(map, 1, y, { terrain: 'locked-door' });
    expect(parity(map)[2]![2]).toBe(Infinity);
  });
  it.each<Terrain>(['wall', 'locked-door'])('blocked start %s is zero and may leave', terrain => {
    const map = grid(2);
    patch(map, 0, 0, { terrain, item: { kind: 'obsidian' } });
    expect(parity(map)).toStrictEqual([[0, 1], [1, 2]]);
  });
  it('distance 100 is reachable but 101 is not', () => {
    const map = grid(102, 'wall');
    for (let x = 0; x < 102; x++) patch(map, x, 0, { terrain: 'corridor' });
    const distances = parity(map);
    expect(distances[0]![99]).toBe(99);
    expect(distances[0]![100]).toBe(100);
    expect(distances[0]![101]).toBe(Infinity);
  });
  it('repeat calls return fresh matrices and do not leak state', () => {
    const map = deepFreeze(grid(3));
    const first = parity(map);
    first[0]![1] = -999;
    expect(parity(map)[0]![1]).toBe(1);
    expect(parity(map, { x: 2, y: 2 })[0]![0]).toBe(4);
  });

  // Enumerate every wall layout on a 3×3 grid from every start: reproducible,
  // bounded exhaustive coverage rather than unseeded random pass/fail results.
  it('all 512 small wall layouts agree at all 9 start positions', () => {
    for (let mask = 0; mask < 512; mask++) {
      const map = grid(3);
      for (let cell = 0; cell < 9; cell++) {
        if (mask & (1 << cell)) patch(map, cell % 3, Math.floor(cell / 3), { terrain: 'wall' });
      }
      for (let cell = 0; cell < 9; cell++) {
        parity(map, { x: cell % 3, y: Math.floor(cell / 3) });
      }
    }
  }, 30_000);
});
