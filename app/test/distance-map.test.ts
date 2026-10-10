import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { CellType, playerDistanceMap, type PathCell } from '../src/domain/distance-map';
import { createOracle } from './oracle/source';

class PlacedObstacle {}
class Obsidian {}
class ChildObstacle extends PlacedObstacle {}
const itemClasses = { obstacle: PlacedObstacle, obsidian: Obsidian };
function cell(type: number = CellType.Room): PathCell {
  return { 背景类型: type, 墙壁: { 上: false, 下: false, 左: false, 右: false } };
}
function grid(size: number): PathCell[][] {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => cell()));
}
function original(map: PathCell[][], x: number, y: number): number[][] {
  const oracle = createOracle(['单元格类型', '生成玩家距离图'], {
    地牢大小: map.length, 地牢: map, 已放置的障碍物: PlacedObstacle, 黑曜石: Obsidian,
  });
  return Array.from(oracle.invoke<number[][]>('生成玩家距离图', x, y), row => Array.from(row));
}
function candidate(map: PathCell[][], x: number, y: number) {
  return playerDistanceMap(map, { x, y }, map.length, itemClasses);
}

describe('exact-source player distance maps', () => {
  it('exhaustively matches 1024 two-by-two map/start combinations', () => {
    const types = [CellType.Wall, CellType.Room, CellType.LockedDoor, CellType.Item];
    for (let encoded = 0; encoded < 256; encoded++) {
      const map = grid(2);
      for (let index = 0; index < 4; index++) map[index >> 1]![index & 1]!.背景类型 = types[(encoded >> (index * 2)) & 3]!;
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        expect(candidate(map, x, y), `map=${encoded} start=${x},${y}`).toEqual(original(map, x, y));
      }
    }
  });

  it('preserves one-sided walls and JS truthiness in all four directions', () => {
    const dirs = [
      { x: 2, y: 1, from: '右', to: '左' }, { x: 0, y: 1, from: '左', to: '右' },
      { x: 1, y: 2, from: '下', to: '上' }, { x: 1, y: 0, from: '上', to: '下' },
    ] as const;
    for (const value of [undefined, null, false, true, 0, 1, '', '0', [], {}, NaN]) {
      for (const dir of dirs) for (const side of ['from', 'target'] as const) {
        const map = grid(3);
        (side === 'from' ? map[1]![1]!.墙壁 : map[dir.y]![dir.x]!.墙壁)[side === 'from' ? dir.from : dir.to] = value;
        expect(candidate(map, 1, 1)).toEqual(original(map, 1, 1));
      }
    }
  });

  it('keeps real instanceof identity, inherited obstacles and switch truthiness', () => {
    for (const item of [null, undefined, false, 0, '', new PlacedObstacle(), new ChildObstacle(), new Obsidian(),
      { 类型: '黑曜石' }, { 类型: '开关砖', 阻碍怪物: false }, { 类型: '开关砖', 阻碍怪物: '0' },
      { 类型: '开关砖', 阻碍怪物: 0 }, { 类型: 'other', 阻碍怪物: true }]) {
      const map = grid(3);
      map[1]![2]!.关联物品 = item;
      expect(candidate(map, 1, 1)).toEqual(original(map, 1, 1));
    }
  });

  it('retains the distance-100 boundary and true Infinity beyond it', () => {
    const map = grid(103);
    const result = candidate(map, 0, 0);
    expect(result).toEqual(original(map, 0, 0));
    expect(result[0]![99]).toBe(99);
    expect(result[0]![100]).toBe(100);
    expect(result[0]![101]).toBe(Infinity);
    expect(result[50]![50]).toBe(100);
    expect(result[51]![50]).toBe(Infinity);
  });

  it('rejects invalid starts exactly where the original fails', () => {
    const map = grid(2);
    expect(() => candidate(map, 0, -1)).toThrow();
    expect(() => original(map, 0, -1)).toThrow();
  });

  it('the oracle detects an actual >=99 mutation of the candidate source', () => {
    const source = readFileSync(new URL('../src/domain/distance-map.ts', import.meta.url), 'utf8');
    expect(source.match(/current\.distance > 99/g)).toHaveLength(1);
    const mutant = source.replace('current.distance > 99', 'current.distance >= 99');
    const { outputText } = ts.transpileModule(mutant, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
    const context = vm.createContext({ exports: {} });
    new vm.Script(outputText).runInContext(context);
    const mutantFn = (context.exports as { playerDistanceMap: typeof playerDistanceMap }).playerDistanceMap;
    const map = grid(103);
    const result = Array.from(mutantFn(map, { x: 0, y: 0 }, map.length, itemClasses), row => Array.from(row));
    expect(result[0]![100]).toBe(Infinity);
    expect(result).not.toEqual(original(map, 0, 0));
    expect(candidate(map, 0, 0)).toEqual(original(map, 0, 0));
  });
});
