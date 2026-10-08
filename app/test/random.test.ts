import { describe, expect, it } from 'vitest';
import { DungeonRandom, fusionRandom, hashString } from '../src/domain/random';
import { createOracle } from './oracle/source';

const seeds: unknown[] = ['', '0', 0, 1, -1, 1.5, '中文地牢', '🌋🐉', '\ud800', '\udfff', 'a'.repeat(1000),
  '  spaced seed  ', 'A\u0000B', '雪\r\n山', 2147483648, Number.MAX_SAFE_INTEGER, Infinity, NaN, true,
  { toString: () => '自定义对象' }];

describe('exact-source numeric/random parity', () => {
  const oracle = createOracle(['哈希字符串', '种子伪随机数', '初始化随机数生成器'],
    { 随机数状态: 0, prng: () => 0 });

  it('hashes UTF-16 code units and preserves falsy/invalid behavior', () => {
    for (const input of [...seeds.filter(seed => typeof seed === 'string'), null, undefined, false, 0]) {
      expect(hashString(input)).toBe(oracle.invoke('哈希字符串', input));
    }
    // Source reads .length without coercion: truthy non-strings with no length hash to 0.
    for (const input of [42, true, {}, []]) {
      expect(hashString(input)).toBe(oracle.invoke('哈希字符串', input));
      expect(hashString(input)).toBe(0);
    }
    // A positive-length object without charCodeAt really does fail in the source.
    for (const input of [{ length: 1 }, [42]]) {
      expect(() => hashString(input)).toThrow();
      expect(() => oracle.invoke('哈希字符串', input)).toThrow();
    }
  });

  it.each(seeds.map((seed, index) => [index, seed] as const))('seed #%i preserves 1000 draws AND states', (_index, seed) => {
    oracle.invoke('初始化随机数生成器', seed);
    const random = new DungeonRandom(seed);
    expect(random.state).toBe(oracle.context.随机数状态);
    for (let draw = 0; draw < 1000; draw++) {
      expect(random.next()).toBe(oracle.evaluate('prng()'));
      expect(random.state).toBe(oracle.context.随机数状态);
    }
  });

  it('null and undefined seeds fail instead of being silently coerced', () => {
    for (const seed of [null, undefined]) {
      expect(() => new DungeonRandom(seed)).toThrow();
      expect(() => oracle.invoke('初始化随机数生成器', seed)).toThrow();
    }
  });

  it('restores arbitrary source states without drawing or clamping', () => {
    for (const state of [0, -1, 233280, 1.5, Number.MAX_SAFE_INTEGER, Infinity, NaN]) {
      const random = new DungeonRandom('restore');
      random.restore(state);
      oracle.context.随机数状态 = state;
      expect(random.state).toBe(state);
      expect(random.next()).toBe(oracle.evaluate('prng()'));
      expect(random.state).toBe(oracle.context.随机数状态);
    }
  });

  it('fusion has exact imul/bitwise parity and does not advance dungeon state', () => {
    const random = new DungeonRandom('separate streams');
    const initial = random.state;
    for (const seed of [0, -1, 2 ** 32, NaN, Infinity, ...Array.from({ length: 1024 }, (_, i) => i * 1234567 - 2 ** 31)]) {
      expect(fusionRandom(seed)).toBe(oracle.invoke('种子伪随机数', seed));
    }
    expect(random.state).toBe(initial);
  });
});
