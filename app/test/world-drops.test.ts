import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { cloneItem, monsterDropItem, playerDropItem, type CloneItemPorts } from '../src/game/world/drops';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['位置是否可用', '克隆物品', '怪物放置物品', '玩家放置物品'];
const GLOBALS = ['单元格类型', 'prng', '地牢大小', '地牢', '玩家', '当前出战宠物列表'];

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  let clock = 1700000000000 + ${seed}; Date.now = () => { calls.push(['now']); return clock++; };
  class Item { constructor(config) { calls.push(['ctor', this.constructor.name, config]); this.类型 = config?.类型 ?? '杂物'; this.堆叠数量 = config?.堆叠数量 ?? 1;
    this.自定义数据 = new Map(Object.entries(config?.数据 ?? {})); this.唯一标识 = Symbol('orig'); this.fromCtor = true; } }
  class Sword extends Item { constructor(config) { super(config); this.攻击 = 3; } }
  Object.assign(globalThis, {
    添加日志: (...a) => calls.push(['log', ...a]),
    放置怪物到单元格: (entity, x, y) => { calls.push(['place-monster', entity, x, y]); 地牢[y][x].关联怪物 = entity; return true; },
    放置物品到单元格: (item, x, y) => { calls.push(['place-item', item, x, y]); 地牢[y][x].关联物品 = item; return true; },
    console: { error: (...a) => calls.push(['error', ...a]) },
  });
  地牢大小 = 3 + Math.floor(r() * 5);
  地牢 = Array.from({ length: 地牢大小 }, (_, y) => Array.from({ length: 地牢大小 }, (_, x) => ({ x, y, 背景类型: pick([0, 1, 1, 2, 3]), 关联物品: null, 关联怪物: null })));
  玩家 = { x: Math.floor(r() * 地牢大小), y: Math.floor(r() * 地牢大小) }; 当前出战宠物列表 = r() < 0.3 ? [{ x: 玩家.x, y: 玩家.y - 1 }] : [];
  const makeItem = () => { const K = pick([Item, Sword]); const item = new K({ 类型: pick(['武器', '杂物']), 堆叠数量: pick([1, 5]), 数据: r() < 0.5 ? { 耐久: 9 } : undefined });
    item.品质 = pick([1, 2]); item.名称 = 'n' + Math.floor(r() * 9); if (r() < 0.3) item.自定义数据 = pick([null, { plain: 1 }]); if (r() < 0.3) item.已装备 = true; return item; };
  for (let step = 0; step < 14; step++) {
    const op = pick([0, 1, 2, 2]);
    try {
      if (op === 0) { const original = pick([makeItem(), makeItem(), null, Object.create(null), { constructor: 5 }]);
        const extra = pick([undefined, {}, { 品质: 9 }, { 数据: { 附魔: 'x' } }, { 数据: null }]);
        results.push([op, extra === undefined ? 克隆物品(original) : 克隆物品(original, extra), original]); }
      if (op === 1) results.push([op, 怪物放置物品(makeItem(), Math.floor(r() * 地牢大小), Math.floor(r() * 地牢大小), pick([undefined, true]))]);
      if (op === 2) { const item = makeItem(); results.push([op, 玩家放置物品(item, pick([undefined, true, 0])), item]); }
    } catch (error) { results.push([op, 'throw', error.constructor.name]); }
  }
  globalThis.final = { results, calls, 地牢 };
`;

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${[...new Set([...GLOBALS, ...FUNCTIONS].map(name => declaration(name)))].join('\n')}
    globalThis.__setPrng = f => { prng = f; };`).runInContext(context);
  new vm.Script(scenario(seed).replace('const pick', '__setPrng(rand); const pick')).runInContext(context);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  // Same-realm Map, as in production, so `instanceof Map` in 克隆物品 sees scenario maps.
  const context = vm.createContext({ calls: [], results: [], S: state, Map });
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const clonePorts: CloneItemPorts = {
    random: () => g<() => number>('__rand')(), now: () => g<DateConstructor>('Date').now(),
    diagnostic: (message, value) => { g<{ error(...a: unknown[]): void }>('console').error(message, value); },
  };
  Object.assign(context, {
    克隆物品: (...args: [unknown, unknown?]) => cloneItem(clonePorts, ...args),
    怪物放置物品: (item: unknown, x: number, y: number, ...rest: unknown[]) => monsterDropItem(state, { log: fn('添加日志'), placeMonsterAt: fn('放置怪物到单元格') }, item, x, y, ...rest),
    玩家放置物品: (item: unknown, ...rest: unknown[]) => playerDropItem(state, { ...clonePorts, log: fn('添加日志'), placeItemAt: fn('放置物品到单元格') }, item, ...rest),
  });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  return g<Record<string, unknown>>('final');
}

describe('item drops (克隆物品 / 怪物放置物品 / 玩家放置物品)', () => {
  it('matches the source over 300 seeded worlds', () => {
    const tally = { clones: 0, invalid: 0, monsterDrop: 0, playerDrop: 0, noSpot: 0, neighbour: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(JSON.stringify(graphSnapshot(mine)), `seed ${seed}`).toBe(JSON.stringify(graphSnapshot(source)));
      for (const call of source.calls as unknown[][]) {
        if (call[0] === 'error') tally.invalid++; if (call[0] === 'log') tally.noSpot++;
        if (call[0] === 'place-monster') tally.monsterDrop++; if (call[0] === 'place-item') tally.playerDrop++;
        if (call[0] === 'now') tally.clones++;
      }
      const player = (source as { results: unknown[][] }).results.filter(entry => entry[0] === 2 && (entry[1] as { x: unknown })?.x !== null);
      tally.neighbour += player.length;
    }
    for (const [key, count] of Object.entries(tally)) expect(count, key).toBeGreaterThan(5);
  });
});
