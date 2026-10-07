import { describe, expect, it } from 'vitest';
import { createContext, runInContext } from 'node:vm';
import { declaration } from '../../scripts/legacy-source.mjs';
import { DungeonRandom, fusionRandom, hashSeed } from '../../src/engine/random';
const seeds = ['', '0', '1', '-1', '中文地牢', '🔥', 'a', 'Aa', 'BB', '2147483648', 'NaN', 'Infinity', '01', 'seed  ', '\0', '🧙‍♂️', 'x'.repeat(1000), '关卡-15', '2026-10-07', 'Reforged'];
function oracle(seed: string) {
  const context = createContext({});
  runInContext(`let 随机数状态, prng; ${declaration('哈希字符串')}\n${declaration('初始化随机数生成器')}\n${declaration('种子伪随机数')}`, context);
  context.seed = seed;
  runInContext('初始化随机数生成器(seed)', context);
  return { next: () => runInContext('prng()', context), state: () => runInContext('随机数状态', context), hash: () => runInContext('哈希字符串(seed)', context), fusion: (n: number) => { context.n = n; return runInContext('种子伪随机数(n)', context); } };
}
describe('frozen legacy PRNG differential', () => {
  it.each(seeds)('matches 1,000 draws and state for %j', (seed) => {
    const old = oracle(seed), rng = new DungeonRandom(seed);
    expect(hashSeed(seed)).toBe(old.hash());
    for (let i = 0; i < 1000; i++) { expect(rng.next()).toBe(old.next()); expect(rng.state).toBe(old.state()); }
    expect(rng.calls).toBe(1000);
  });
  it('preserves the distinct one-shot fusion function', () => {
    const old = oracle('');
    for (const n of [0, 1, -1, 233280, 2147483648, 1e20, Number.NaN, Infinity]) expect(fusionRandom(n)).toBe(old.fusion(n));
  });
  it('does not normalize numeric-looking strings', () => {
    expect(new DungeonRandom('01').next()).not.toBe(new DungeonRandom(1).next());
    expect(new DungeonRandom('Aa').next()).toBe(new DungeonRandom('BB').next());
  });
});
