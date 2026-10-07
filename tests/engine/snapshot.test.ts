import { expect, it } from 'vitest';
import { snapshotGraph } from '../../src/engine/snapshot';
it('retains cycles, object aliases and symbol identities', () => {
  const item = { id: Symbol.for('item'), hp: 3 };
  const world: any = { item, inventory: new Map([[item.id, item]]) }; world.self = world;
  expect(() => snapshotGraph(world)).not.toThrow();
  const copied: any = { item: { ...item }, inventory: new Map([[item.id, { ...item }]]) }; copied.self = copied;
  expect(snapshotGraph(copied)).not.toEqual(snapshotGraph(world));
});
it('detects injected state drift at each of 20 command checkpoints', () => {
  const old = { hp: 100, ticks: 0 }, next = { hp: 100, ticks: 0 };
  for (let i = 0; i < 20; i++) {
    old.ticks++; next.ticks++;
    expect(snapshotGraph(next)).toEqual(snapshotGraph(old));
    expect(snapshotGraph({ ...next, hp: 99 })).not.toEqual(snapshotGraph(old));
  }
});
it('does not collapse special numbers, absent properties, or collection ordering', () => {
  expect(snapshotGraph({ x: undefined })).not.toEqual(snapshotGraph({}));
  expect(snapshotGraph([NaN, Infinity, -0])).not.toEqual(snapshotGraph([null, null, 0]));
  expect(snapshotGraph(new Set([1, 2]))).not.toEqual(snapshotGraph(new Set([2, 1])));
  expect(() => snapshotGraph({ f() {} })).toThrow();
});
