import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { createSignature, deepEqual, directionName, explosionColor, findNearestRoom, hashString, sanitizeHtml, seededRandom, syncEditorRoomState } from '../src/game/world/utils';
import { declaration, originalDeclaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['深度比较', '获取方向中文', '哈希字符串', '种子伪随机数', '获取爆炸颜色', '净化HTML', '寻找最近的房间', '处理房间状态', '生成签名'];
const GLOBALS = ['数据完整性密钥'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(r() * list.length)];
  const leaf = () => pick([0, 1, -0, NaN, '1', 'a', null, undefined, true, [], {}, [1, 2], { a: 1 }, { a: 1, b: [2] }]);
  const tree = d => d > 2 || r() < 0.4 ? leaf() : r() < 0.5 ? Array.from({ length: pick([0, 1, 2]) }, () => tree(d + 1)) : Object.fromEntries(['a', 'b', 'c'].filter(() => r() < 0.6).map(k => [k, tree(d + 1)]));
  const text = () => pick(['', 'abc', '<b>&"x\\'</b>', '龙与地牢', 'a'.repeat(40), '\\u{1F600}x', null, undefined, 12, ['x']]);
  (async () => {
    for (let step = 0; step < 40; step++) {
      const op = pick(['deep', 'deep', 'deep', 'dir', 'hash', 'rand', 'boom', 'html', 'near', 'rooms', 'sign']);
      try {
        if (op === 'deep') { const a = tree(0); const b = r() < 0.4 ? a : r() < 0.5 ? JSON.parse(JSON.stringify(a ?? null)) : tree(0);
          if (r() < 0.05 && b && typeof b === 'object') Object.setPrototypeOf(b, null);
          if (r() < 0.05 && b && typeof b === 'object' && !Array.isArray(b)) b.hasOwnProperty = () => true;
          results.push([op, 深度比较(a, b)]); }
        else if (op === 'dir') results.push([op, 获取方向中文(pick([1, -1, 0, '1', 2]), pick([1, -1, 0, -2]))]);
        else if (op === 'hash') results.push([op, 哈希字符串(text())]);
        else if (op === 'rand') results.push([op, 种子伪随机数(pick([0, 1, 12345, -7, 2 ** 31, 2 ** 32 + 3, 1.5, '3', NaN]))]);
        else if (op === 'boom') results.push([op, 获取爆炸颜色(pick([0, 1, 2, 3, -1, 1.5, '1', NaN]))]);
        else if (op === 'html') results.push([op, 净化HTML(text())]);
        else if (op === 'near') { 房间列表 = [0, 1, 2, 3].map(i => r() < 0.15 ? null : { id: i, x: pick([0, 3, 6]), y: pick([0, 4]), w: pick([3, 4, 5]), h: pick([2, 3]) });
          const room = 寻找最近的房间(pick([0, 2, 5, 9]), pick([0, 3, 7])); results.push([op, room && room.id]); }
        else if (op === 'rooms') { 游戏状态 = pick(['地图编辑器', '地图编辑器', '游戏中']); 已访问房间 = new Set([0, 5].filter(() => r() < 0.5));
          房间列表 = [0, 1, 2].map(i => r() < 0.15 ? null : { id: i, 已探索: r() < 0.5, 挑战状态: r() < 0.5 ? { 已完成: true } : null });
          results.push([op, 处理房间状态(), [...已访问房间], 房间列表]); }
        else results.push([op, await 生成签名(text())]);
      } catch (error) { results.push(['throw', op, error.constructor.name]); }
    }
  })();
`;

const final = 'globalThis.final = { results }';

async function sourceRun(seed: number, read: (name: string) => string = declaration) {
  const context = vm.createContext({ results: [], TextEncoder, crypto: webcrypto });
  new vm.Script(`${[...new Set([...GLOBALS, ...FUNCTIONS].map(name => read(name)))].join('\n')}`).runInContext(context);
  await new vm.Script(scenario(seed)).runInContext(context);
  return new vm.Script(`${final}; final`).runInContext(context) as Record<string, unknown>;
}

async function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ results: [], S: state }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  Object.assign(context, {
    深度比较: deepEqual, 获取方向中文: directionName, 哈希字符串: hashString, 种子伪随机数: seededRandom, 获取爆炸颜色: explosionColor, 净化HTML: sanitizeHtml,
    寻找最近的房间: (x: number, y: number) => findNearestRoom(state, x, y), 处理房间状态: () => syncEditorRoomState(state), 生成签名: (data: unknown) => createSignature(data),
  });
  await new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  return g<Record<string, unknown>>(`with (S) { ${final} }; final`);
}

describe('source utilities (深度比较, 哈希字符串, 种子伪随机数, 净化HTML, 生成签名, rooms …)', () => {
  it('matches the source over 600 seeded runs', async () => {
    const tally: Record<string, number> = {};
    let fixedSeeds = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const source = await sourceRun(seed); const mine = await rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      if (snap(await sourceRun(seed, originalDeclaration)) !== snap(source)) fixedSeeds++; // SRC-30: unpatched source differs
      for (const entry of source.results as unknown[][]) { const key = `${String(entry[0])}:${entry[0] === 'throw' ? String(entry[1]) : typeof entry[1] === 'boolean' ? String(entry[1]) : ''}`; tally[key] = (tally[key] ?? 0) + 1; }
    }
    expect(fixedSeeds, 'unpatched SRC-30 differs').toBeGreaterThan(5);
    for (const key of ['deep:true', 'deep:false', 'dir:', 'hash:', 'rand:', 'boom:', 'html:', 'near:', 'rooms:', 'sign:', 'throw:deep']) expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
