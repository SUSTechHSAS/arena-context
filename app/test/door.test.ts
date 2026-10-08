import { expect, it } from 'vitest';
import { GameDoor } from '../src/game/door';
import { createOracle } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

it('main doors preserve Symbol.for collisions, registration, position aliases and short-circuit interactions', () => {
  const position = { x: 1, y: 2 }; const actualDoors = new Map<symbol, GameDoor>();
  const ports = { now: () => 1720000000000, random: () => 0.5, doors: actualDoors };
  const original = createOracle(['门'], { Date: { now: ports.now }, prng: ports.random, 门实例列表: new Map() });
  const first = new GameDoor(ports, { 关联房间ID: 3, 位置: position });
  const expected = original.construct<GameDoor>('门', { 关联房间ID: 3, 位置: position });
  expect(first.所在位置).toBe(position);
  expect(first.唯一标识).toBe(expected.唯一标识);
  const next = new GameDoor(ports, { 关联房间ID: 4, 位置: position });
  original.construct<GameDoor>('门', { 关联房间ID: 4, 位置: position });
  expect(actualDoors.size).toBe(1);
  expect(actualDoors.get(first.唯一标识)).toBe(next);
  expect(JSON.stringify(graphSnapshot(actualDoors, { GameDoor: '门' }))).toBe(JSON.stringify(graphSnapshot(original.context.门实例列表)));
  for (const values of [[], [false, false], [false, '0', true], [0, NaN, undefined]]) {
    const calls: number[] = []; const expectedCalls: number[] = [];
    const inventory = new Map(values.map((value, index) => [index, { 可交互目标: () => { calls.push(index); return value; } }]));
    const sourceInventory = new Map(values.map((value, index) => [index, { 可交互目标: () => { expectedCalls.push(index); return value; } }]));
    expect(first.尝试解锁(inventory)).toBe(expected.尝试解锁(sourceInventory));
    expect(calls).toEqual(expectedCalls);
  }
});
