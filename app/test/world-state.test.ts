import vm from 'node:vm';
import { types } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createRoomMap, createWorldState } from '../src/game/world/state';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));
/** Evaluates exact top-level source declarations (deduplicated multi-name statements). */
function sourceGlobals(names: readonly string[]) {
  const texts = [...new Set(names.map(name => declaration(name)))];
  const context = vm.createContext({});
  new vm.Script(texts.join('\n'), { filename: 'original:ChineseDungeon.html' }).runInContext(context, { timeout: 5000 });
  return (name: string) => new vm.Script(name).runInContext(context) as unknown;
}

describe('session world state mirrors source global initial values', () => {
  const state = createWorldState();
  const keys = Object.keys(state);
  // 房间地图's initializer reads 地牢大小, so the oracle declares it first, as the source does.
  const read = sourceGlobals(['地牢大小', ...keys]);

  it('covers the intended gameplay/persisted globals, each a real top-level source declaration', () => {
    expect(keys.length).toBe(98);
    expect(new Set(keys).size).toBe(keys.length);
  });
  for (const key of keys) {
    it(`${key} has the exact source initial value`, () => {
      const mine = (state as Record<string, unknown>)[key]; const theirs = read(key);
      if (types.isWeakMap(theirs)) { expect(types.isWeakMap(mine)).toBe(true); return; }
      expect(snap(mine)).toBe(snap(theirs));
    });
  }
  it('every call returns fresh, unshared containers (no module-level mutable state)', () => {
    const a = createWorldState(); const b = createWorldState();
    for (const key of keys) {
      const value = (a as Record<string, unknown>)[key];
      if (value !== null && typeof value === 'object') expect((b as Record<string, unknown>)[key], key).not.toBe(value);
    }
    expect(a.玩家属性.已获得神龛效果).not.toBe(a.初始玩家属性.已获得神龛效果);
    expect(a.房间地图[0]).not.toBe(a.房间地图[1]);
  });
});

describe('createRoomMap', () => {
  const sourceRoomMap = (size: unknown) => {
    const context = vm.createContext({ 地牢大小: size });
    const text = declaration('房间地图').replace(/^let /, 'var ');
    try { new vm.Script(text).runInContext(context); return snap(context.房间地图); }
    catch (error) { return `throws ${(error as Error).constructor.name}`; }
  };
  it('matches the source initializer for valid and invalid sizes', () => {
    for (const size of [0, 1, 2, 7, 100, 1.5, -1, NaN]) {
      let mine: string;
      try { mine = snap(createRoomMap(size)); } catch (error) { mine = `throws ${(error as Error).constructor.name}`; }
      // Cross-realm error constructors share names; compare by name, not identity.
      expect(mine.replace(/^throws .*Error$/, 'throws RangeError')).toBe(sourceRoomMap(size).replace(/^throws .*Error$/, 'throws RangeError'));
    }
  });
});
