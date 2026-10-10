import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { generateRoomTraps, refreshRoomContents, type RoomRefreshPorts, type RoomTrapPorts } from '../src/game/world/room-content';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['位置是否可用', '生成陷阱', '刷新房间内容'];
const GLOBALS = ['单元格类型', '颜色表', 'prng', '地牢大小', '地牢', '玩家', '当前出战宠物列表', '上锁房间列表', '自定义游戏设置', '当前层数', '已访问房间',
  '所有计时器', '玩家背包', '所有怪物', '怪物状态表', '游戏状态', '是否是自定义关卡', '自定义全局设置', '怪物引入计划'];
const TRAPS = ['隐形落石陷阱', '隐形地刺陷阱', '远射陷阱', '隐形失明陷阱', '召唤怪物陷阱', '烈焰触发陷阱', '隐形虫洞陷阱'];

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  let serial = 0;
  class Thing { constructor(options) { calls.push(['new', this.constructor.name, options]); this.选项 = options; this.唯一标识 = Symbol('u' + serial++); } }
  class Bar { constructor(id) { this.id = id; } remove() { calls.push(['bar-remove', this.id]); } }
  const named = (Base, name) => ({ [name]: class extends Base {} })[name];
  for (const name of ${JSON.stringify(TRAPS)}) globalThis[name] = named(Thing, name);
  globalThis.钥匙 = named(Thing, '钥匙'); globalThis.金币 = named(Thing, '金币');
  const monsterKinds = ['史莱姆', '蝙蝠', '大魔法师', '骷髅'].map(name => named(Thing, name));
  Object.assign(globalThis, {
    加权随机选择: options => { calls.push(['weighted', options.map(o => o.权重)]); return rand() < 0.1 ? null : options[Math.floor(rand() * options.length)].值; },
    生成毒气陷阱群: room => calls.push(['gas', room]),
    放置怪物到单元格: (monster, x, y) => { calls.push(['place-monster', monster, x, y]); if (地牢[y]?.[x]) { 地牢[y][x].关联怪物 = monster; 所有怪物.push(monster); } return true; },
    放置物品到单元格: (item, x, y) => { calls.push(['place-item', item, x, y]); if (地牢[y]?.[x]) 地牢[y][x].关联物品 = item; return true; },
    放置物品到房间: (item, room) => { calls.push(['place-room', item, room]); return r() < 0.7; },
    添加日志: (...a) => calls.push(['log', ...a]), 处理销毁物品: (...a) => calls.push(['destroy', ...a]), 生成物品: rooms => calls.push(['items', rooms]),
  });
  当前层数 = Math.floor(r() * 15); 地牢大小 = 8 + Math.floor(r() * 10);
  自定义游戏设置 = { 陷阱密度: pick(['无', '稀少', '普通', '致命', undefined]) };
  游戏状态 = pick(['游戏中', '游戏中', '地图编辑器', '编辑器游玩']); 是否是自定义关卡 = r() < 0.2;
  自定义全局设置 = { 诡魅天气怪物层级: pick([undefined, null, 0, 2, 6]) };
  怪物引入计划 = new Map(); for (let f = 0; f < 16; f++) if (r() < 0.4) 怪物引入计划.set(f, [{ 类: pick(monsterKinds), 权重: pick([1, 3, 10]) }, { 类: pick(monsterKinds), 权重: 2 }]);
  玩家 = { x: 0, y: 0 }; 当前出战宠物列表 = []; 所有怪物 = []; 怪物状态表 = new WeakMap(); 玩家背包 = new Map();
  所有计时器 = []; 已访问房间 = new Set([0, 1, 2, 3]);
  地牢 = Array.from({ length: 地牢大小 }, (_, y) => Array.from({ length: 地牢大小 }, (_, x) => {
    const cell = { x, y, 背景类型: pick([0, 1, 1, 1, 2, 3]), 类型: null, 颜色索引: 2, 关联物品: null, 关联怪物: null };
    const roll = r();
    if (roll < 0.06) cell.关联物品 = new 钥匙({});
    else if (roll < 0.1) cell.关联物品 = { 类型: '楼梯', 唯一标识: Symbol('stairs') };
    else if (roll < 0.2) { cell.关联物品 = new Thing({}); if (r() < 0.5) 所有计时器.push({ 唯一标识: cell.关联物品.唯一标识 }); if (r() < 0.3) 玩家背包.set(cell.关联物品.唯一标识, cell.关联物品); }
    else if (roll < 0.28) { const m = new (pick(monsterKinds))({}); m.血条元素 = r() < 0.5 ? new Bar(m.唯一标识) : undefined;
      cell.关联怪物 = m; 所有怪物.push(m); if (r() < 0.5) 怪物状态表.set(m, { 类型: '中毒' }); }
    return cell; }));
  上锁房间列表 = [{ id: 2 }];
  const statusKeep = 所有怪物.slice();
  for (let step = 0; step < 10; step++) {
    const room = { id: pick([0, 1, 2, 3]), 类型: pick(['房间', '房间', '宝藏']), x: Math.floor(r() * 地牢大小) - 1, y: Math.floor(r() * 地牢大小) - 1,
      w: 2 + Math.floor(r() * 7), h: 2 + Math.floor(r() * 7) };
    results.push([r() < 0.6 ? ['traps', 生成陷阱(room)] : ['refresh', 刷新房间内容(room)]]);
  }
  globalThis.final = { results, calls, 地牢, 所有怪物, 所有计时器, 已访问房间, statuses: statusKeep.map(m => 怪物状态表.has(m)) };
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
  const context = vm.createContext({ calls: [], results: [], S: state });
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const random = () => g<() => number>('__rand')();
  const traps = {} as RoomTrapPorts['traps'];
  for (const name of TRAPS) Object.defineProperty(traps, name, { get: () => g(name) });
  const trapPorts: RoomTrapPorts = { random, traps, weightedPick: fn('加权随机选择'), generatePoisonTrapCluster: fn('生成毒气陷阱群'),
    placeMonsterAt: fn('放置怪物到单元格'), placeItemAt: fn('放置物品到单元格') };
  const refreshPorts: RoomRefreshPorts = { random, log: fn('添加日志'), isKey: item => item instanceof g<abstract new () => unknown>('钥匙'),
    destroyInventoryItem: fn('处理销毁物品'), createCoin: options => new (g<new (o: unknown) => unknown>('金币'))(options),
    placeItemInRoom: fn('放置物品到房间'), placeMonsterAt: fn('放置怪物到单元格'), generateItems: fn('生成物品') };
  Object.assign(context, {
    生成陷阱: (room: never) => generateRoomTraps(state, trapPorts, room),
    刷新房间内容: (room: never) => refreshRoomContents(state, refreshPorts, room),
  });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  return g<Record<string, unknown>>('final');
}

describe('room content (生成陷阱 / 刷新房间内容)', () => {
  it('matches the source over 200 seeded worlds (random-comparator shuffle, density, respawn, clearing)', () => {
    const tally = { traps: 0, ranged: 0, gas: 0, refresh: 0, destroy: 0, bar: 0, respawn: 0, coins: 0, items: 0 };
    for (let seed = 1; seed <= 200; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(JSON.stringify(graphSnapshot(mine)), `seed ${seed}`).toBe(JSON.stringify(graphSnapshot(source)));
      for (const call of source.calls as unknown[][]) {
        if (call[0] === 'new' && TRAPS.includes(call[1] as string)) tally.traps++;
        if (call[0] === 'new' && call[1] === '远射陷阱') tally.ranged++;
        if (call[0] === 'new' && ['史莱姆', '蝙蝠', '骷髅'].includes(call[1] as string) && (call[2] as { 房间ID?: unknown }).房间ID !== undefined) tally.respawn++;
        if (call[0] === 'new' && call[1] === '金币') tally.coins++;
        if (call[0] === 'gas') tally.gas++; if (call[0] === 'log') tally.refresh++; if (call[0] === 'destroy') tally.destroy++;
        if (call[0] === 'bar-remove') tally.bar++; if (call[0] === 'items') tally.items++;
      }
    }
    for (const [key, count] of Object.entries(tally)) expect(count, key).toBeGreaterThan(5);
  });
});
