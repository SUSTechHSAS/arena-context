import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { generateKeys, placeCaveEntrances, type KeyGenerationPorts } from '../src/game/world/generation';
import type { PlaceableItem, RoomBounds } from '../src/game/world/placement';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));
const rng = (seed: number) => `let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296; const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };`;

const keyScenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(r() * list.length)];
  class 钥匙 { constructor(options) { calls.push(['key', options.对应门ID, options.颜色索引, options.地牢层数]); Object.assign(this, options); } }
  globalThis.钥匙 = 钥匙;
  globalThis.放置物品到房间 = (item, room, ...rest) => { calls.push(['place', item.对应门ID, room.id, rest.length]); return r() < 0.7; };
  const count = Math.floor(r() * 12);
  房间列表 = Array.from({ length: count }, (_, id) => ({ id: pick([id, id, id, String(id), id + 0.5]), 类型: pick(['房间', '房间', '房间', '宝藏房间', undefined]), 颜色索引: pick([0, 1, 2]) }));
  上锁房间列表 = 房间列表.filter(() => r() < 0.3).concat(r() < 0.2 ? [{ id: 99, 颜色索引: 4 }] : []);
  当前层数 = Math.floor(r() * 20);
  生成钥匙();
  globalThis.final = { calls, 房间列表, 上锁房间列表 };
`;

const entranceScenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(r() * list.length)];
  const size = 3 + Math.floor(r() * 30);
  const map = Array.from({ length: size }, () => Array.from({ length: size }, () => pick([0, 1, 2, 3, 3, 5, 5, -1, NaN, 0.5])));
  if (r() < 0.05) for (const row of map) row.fill(-2);
  const area = []; for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (r() < 0.6) area.push({ x, y });
  let result; try { result = 放置地牢出入口(map, area); } catch (error) { result = ['throw', error.constructor.name]; }
  globalThis.final = { calls, map, area, result };
`;

function sourceRun(names: string[], body: string, seed: number) {
  const context = vm.createContext({ calls: [] });
  new vm.Script(`${[...new Set(['prng', ...names].map(name => declaration(name)))].join('\n')}
    globalThis.__setPrng = f => { prng = f; };`).runInContext(context);
  new vm.Script(`${rng(seed * 3 + 1)} __setPrng(rand); ${body}`).runInContext(context);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

function rewriteRun(body: string, seed: number, bind: (context: vm.Context, state: ReturnType<typeof createWorldState>, random: () => number) => void) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], S: state });
  new vm.Script(`${rng(seed * 3 + 1)} globalThis.__rand = rand;`).runInContext(context);
  bind(context, state, () => (new vm.Script('__rand').runInContext(context) as () => number)());
  new vm.Script(`with (S) { ${body} }`).runInContext(context);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

describe('world generation helpers', () => {
  it('生成钥匙 matches the source over 300 seeded room lists (creation/choice/placement order)', () => {
    const tally = { keys: 0, placed: 0, noCandidate: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      const source = sourceRun(['房间列表', '上锁房间列表', '当前层数', '生成钥匙'], keyScenario(seed), seed);
      const mine = rewriteRun(keyScenario(seed), seed, (context, state, random) => {
        const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
        const ports: KeyGenerationPorts = {
          random,
          createKey: options => new (g<new (o: unknown) => PlaceableItem>('钥匙'))(options),
          placeItemInRoom: (item, room) => g<(i: unknown, r: RoomBounds) => boolean>('放置物品到房间')(item, room),
        };
        context.生成钥匙 = () => generateKeys(state, ports);
      });
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      const calls = source.calls as unknown[][];
      const keys = calls.filter(call => call[0] === 'key').length; const places = calls.filter(call => call[0] === 'place').length;
      tally.keys += keys; tally.placed += places; tally.noCandidate += keys - places;
    }
    for (const [key, count] of Object.entries(tally)) expect(count, key).toBeGreaterThan(10);
  });

  it('放置地牢出入口 matches the source over 400 seeded score maps (choice, 21×21 clearing, farthest exit)', () => {
    const tally = { ok: 0, throws: 0, far: 0 };
    for (let seed = 1; seed <= 400; seed++) {
      const source = sourceRun(['放置地牢出入口'], entranceScenario(seed), seed);
      const mine = rewriteRun(entranceScenario(seed), seed, (context, _state, random) => {
        context.放置地牢出入口 = (map: number[][], area: { x: number; y: number }[]) => placeCaveEntrances(random, map, area);
      });
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      const result = source.result as unknown;
      if (Array.isArray(result)) tally.throws++;
      else { tally.ok++; const { 入口, 出口 } = result as Record<string, { x: number; y: number }>; if (Math.abs(入口!.x - 出口!.x) > 10 || Math.abs(入口!.y - 出口!.y) > 10) tally.far++; }
    }
    for (const [key, count] of Object.entries(tally)) expect(count, key).toBeGreaterThan(5);
  });
});
