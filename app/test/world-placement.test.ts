import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { findDropPosition, isPositionFree, placeItemAt, placeItemInRoom, type PlacementPorts } from '../src/game/world/placement';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['位置是否可用', '寻找可放置位置', '放置物品到单元格', '放置物品到房间'];
const GLOBALS = ['单元格类型', '环境类型', '材质', 'prng', '地牢大小', '地牢', '玩家', '当前出战宠物列表', '房间地图', '已访问房间', '所有计时器', '所有传送门'];

/** Seeded world plus a random operation script, shared verbatim by both realms. */
const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed * 7 + 3}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296; const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  class Item { constructor(id) { this.唯一标识 = id; this.颜色索引 = pick([null, null, 0, 2]); this.颜色表 = ['#111111', '#22AA33', '#ABCDEF'];
    this.x = null; this.y = null; this.材质 = pick(['铁质', '铁质', '木质', undefined]); this.自定义数据 = new Map();
    if (r() < 0.2) this.自定义数据.set('不可破坏', pick([true, 0])); if (r() < 0.5) this.自定义数据.set('锈蚀度', pick([0, 3]));
    if (r() < 0.5) this.自定义数据.set('耐久', pick([2, 40])); this.阻碍怪物 = r() < 0.2; }
    获取名称() { return '物品' + String(this.唯一标识.description); } }
  class 远射植物 extends Item {} class 护卫植物 extends Item {} class 刷怪笼 extends Item {} class 开关脉冲器 extends Item {}
  class 侦测器 extends Item {} class 发生器 extends Item {} class 沉浸式传送门 extends Item {}
  Object.assign(globalThis, { 远射植物, 护卫植物, 刷怪笼, 开关脉冲器, 侦测器, 发生器, 沉浸式传送门 });
  const kinds = [Item, Item, 远射植物, 护卫植物, 刷怪笼, 开关脉冲器, 侦测器, 发生器, 沉浸式传送门];
  const items = Array.from({ length: 30 }, (_, i) => new (pick(kinds))(Symbol('i' + i)));
  地牢大小 = 5 + Math.floor(r() * 6);
  地牢 = r() < 0.05 ? [] : Array.from({ length: 地牢大小 }, (_, y) => Array.from({ length: 地牢大小 }, (_, x) => ({
    x, y, 背景类型: pick([0, 1, 1, 1, 2, 2, 3, 4, 5]), 类型: null, 颜色索引: null, 关联怪物: r() < 0.1 ? { 名: 'm' } : null,
    关联物品: r() < 0.12 ? { 阻碍怪物: pick([true, false, 1, undefined]) } : null, 环境: pick([null, null, '水', '水', '岩浆', '冰']) })));
  玩家 = { x: Math.floor(r() * 地牢大小), y: Math.floor(r() * 地牢大小) };
  当前出战宠物列表 = r() < 0.5 ? [] : [{ x: Math.floor(r() * 地牢大小), y: Math.floor(r() * 地牢大小) }];
  房间地图 = Array.from({ length: 地牢大小 }, () => Array.from({ length: 地牢大小 }, () => pick([-1, -1, 0, 1, 2])));
  已访问房间 = new Set(r() < 0.5 ? [0] : [1, 2]);
  所有计时器 = [{ 唯一标识: items[3].唯一标识 }, { 唯一标识: Symbol('t') }];
  所有传送门 = [items[4]];
  if (${seed} % 17 === 0) 所有计时器.unshift(null);
  const coord = () => Math.floor(r() * (地牢大小 + 2)) - 1;
  for (let step = 0; step < 60; step++) {
    const op = Math.floor(r() * 4); const item = pick(items);
    try {
      if (op === 0) results.push([op, 位置是否可用(coord(), coord(), pick([undefined, true, false]), pick([undefined, false, true]))]);
      if (op === 1) results.push([op, 寻找可放置位置(coord(), coord())]);
      if (op === 2) results.push([op, 放置物品到单元格(item, coord(), coord(), pick([undefined, 5, 8]), pick([undefined, false, true, 0, 1]), pick([undefined, false, true]))]);
      if (op === 3) { const room = { x: coord(), y: coord(), w: 1 + Math.floor(r() * 4), h: 1 + Math.floor(r() * 4) };
        results.push([op, 放置物品到房间(item, room, pick([undefined, 5]), pick([undefined, false, true]), pick([undefined, false, true]), pick([undefined, false, true]))]); }
    } catch (error) { results.push([op, 'throw', error.constructor.name]); }
  }
  globalThis.final = { results, calls, 地牢, 所有计时器, 所有传送门, items };
`;

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  const declarations = [...new Set([...GLOBALS, ...FUNCTIONS].map(name => declaration(name)))].join('\n');
  new vm.Script(`${declarations}
    function 绘制() { calls.push(['draw']); }
    function 计划显示格子特效(cells, color) { calls.push(['fx', cells, color]); }
    function 添加日志(message, type) { calls.push(['log', message, type]); }
    globalThis.__setPrng = f => { prng = f; };`).runInContext(context);
  new vm.Script(scenario(seed).replace('const pick', '__setPrng(rand); const pick')).runInContext(context);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  const calls: unknown[][] = [];
  const context = vm.createContext({ calls, results: [], S: state });
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const isAny = (item: unknown, names: string[]) => names.some(name => item instanceof g<abstract new () => unknown>(name));
  const ports: PlacementPorts = {
    random: () => g<() => number>('__rand')(),
    requestDraw: () => { calls.push(['draw']); },
    scheduleCellEffect: (cells, color) => { calls.push(['fx', cells, color]); },
    log: (message, type) => { calls.push(['log', message, type]); },
    isSelfTimedItem: item => isAny(item, ['远射植物', '护卫植物', '刷怪笼', '开关脉冲器', '侦测器', '发生器']),
    isImmersivePortal: item => isAny(item, ['沉浸式传送门']),
  };
  Object.assign(context, {
    位置是否可用: (...args: Parameters<typeof isPositionFree> extends [unknown, ...infer R] ? R : never) => isPositionFree(state, ...args),
    寻找可放置位置: (x: number, y: number) => findDropPosition(state, x, y),
    放置物品到单元格: (...args: never[]) => (placeItemAt as (...a: unknown[]) => boolean)(state, ports, ...args),
    放置物品到房间: (...args: never[]) => (placeItemInRoom as (...a: unknown[]) => boolean)(state, ports, ...args),
  });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  return g<Record<string, unknown>>('final');
}

describe('world placement (位置是否可用 / 寻找可放置位置 / 放置物品到单元格 / 放置物品到房间)', () => {
  it('matches the source over 200 seeded worlds: returns, draw/fx/log/prng order and final graphs', () => {
    const tally = { free: 0, drop: 0, cell: 0, room: 0, rust: 0, fx: 0, timers: 0, portals: 0, throws: 0 };
    for (let seed = 1; seed <= 200; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(JSON.stringify(graphSnapshot(mine))).toBe(JSON.stringify(graphSnapshot(source)));
      for (const [op, value, extra] of source.results as unknown[][]) {
        if (value === 'throw') { tally.throws++; continue; }
        if (op === 0 && value) tally.free++; if (op === 1 && value) tally.drop++;
        if (op === 2 && value) tally.cell++; if (op === 3 && value) tally.room++; void extra;
      }
      for (const call of source.calls as unknown[][]) { if (call[0] === 'log') tally.rust++; if (call[0] === 'fx') tally.fx++; }
      tally.timers += (source.所有计时器 as unknown[]).length - 2; tally.portals += (source.所有传送门 as unknown[]).length - 1;
    }
    for (const [key, count] of Object.entries(tally)) expect(count, key).toBeGreaterThan(5);
  });
});
