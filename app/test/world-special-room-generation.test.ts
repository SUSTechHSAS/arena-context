import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { generateSpecialRoom, type SpecialRoomGenerationPorts } from '../src/game/world/special-rooms';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['生成特殊房间'];
const GLOBALS = ['prng', '地牢大小', '房间列表', '推箱子任务列表'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));
const THEMES = ['隐藏解谜棋盘', '隐藏罐子房间', '隐藏植物房间', '隐藏书库房间', '隐藏药水房间', '隐藏推箱子房间'];

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  const freeChance = pick([0, 0.05, 0.4, 1]);
  const content = name => (...a) => { calls.push([name, ...a]); if (r() < 0.1) throw new RangeError(name); return { puzzle: name }; };
  Object.assign(globalThis, {
    加权随机选择: options => { calls.push(['weighted', options]); return r() < 0.1 ? 'unknown-theme' : pick(${JSON.stringify(THEMES)}); },
    区域是否空闲: (...a) => { calls.push(['free?', ...a]); return r() < freeChance; },
    放置房间: room => calls.push(['place', room, 房间列表.length]),
    生成推箱子谜题: content('sokoban'), 生成解谜棋盘: content('board'), 生成罐子房间内容: content('jars'),
    生成植物房间内容: content('plants'), 生成书库房间内容: content('library'), 生成药水房内容: content('potions'),
  });
  地牢大小 = pick([8, 10, 12, 30, 60]);
  房间列表 = Array.from({ length: Math.floor(r() * 5) }, (_, i) => ({ id: pick([i, i + 3, 0]), 类型: '房间' }));
  globalThis.done = (async () => {
    for (let step = 0; step < 4; step++) {
      const args = pick([[], [true], [false], ['x']]);
      const promise = 生成特殊房间(...args);
      results.push(['thenable', typeof promise.then]);
      try { results.push(['ok', await promise]); } catch (error) { results.push(['rejected', error.constructor.name, error.message]); }
    }
    globalThis.final = { results, calls, 房间列表, 推箱子任务列表 };
  })();
`;

async function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${[...new Set([...GLOBALS, ...FUNCTIONS].map(name => declaration(name)))].join('\n')}
    globalThis.__setPrng = f => { prng = f; };`).runInContext(context);
  new vm.Script(scenario(seed).replace('const pick', '__setPrng(rand); const pick')).runInContext(context);
  await new vm.Script('done').runInContext(context);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

async function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state });
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const ports: SpecialRoomGenerationPorts = {
    random: () => g<() => number>('__rand')(), weightedPick: fn('加权随机选择'), isAreaFree: fn('区域是否空闲'), placeRoom: fn('放置房间'),
    generateSokoban: fn('生成推箱子谜题'), generatePuzzleBoard: fn('生成解谜棋盘'), generateJarRoom: fn('生成罐子房间内容'),
    generatePlantRoom: fn('生成植物房间内容'), generateLibraryRoom: fn('生成书库房间内容'), generatePotionRoom: fn('生成药水房内容'),
  };
  Object.assign(context, { 生成特殊房间: (...args: unknown[]) => generateSpecialRoom(state, ports, ...args) });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  await g<Promise<void>>('done');
  return g<Record<string, unknown>>('final');
}

describe('special room generation (生成特殊房间)', () => {
  it('matches the source over 400 seeded worlds', async () => {
    const tally = { placed: 0, exhausted: 0, rejected: 0, sokoban: 0, unknownTheme: 0, negativeRange: 0 };
    for (let seed = 1; seed <= 400; seed++) {
      const source = await sourceRun(seed); const mine = await rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      const calls = source.calls as unknown[][];
      tally.placed += calls.filter(call => call[0] === 'place').length;
      tally.sokoban += calls.filter(call => call[0] === 'sokoban').length;
      tally.rejected += (source.results as unknown[][]).filter(entry => entry[0] === 'rejected').length;
      tally.exhausted += Number(calls.filter(call => call[0] === 'free?').length >= 100 && !calls.some(call => call[0] === 'place'));
      tally.negativeRange += calls.filter(call => call[0] === 'free?' && (call[1] as number) < 1).length;
      tally.unknownTheme += Number(calls.some((call, i) => call[0] === 'place' && calls.slice(0, i).some(c => c[0] === 'weighted')
        && (call[1] as { 类型: string }).类型 === 'unknown-theme'));
    }
    for (const [key, count] of Object.entries(tally)) expect(count, key).toBeGreaterThan(5);
  });
});
