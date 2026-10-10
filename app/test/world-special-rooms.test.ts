import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { connectSpecialRoom, handleOneWayRoom, tryEnterSpecialRoom, type OneWayRoomPorts, type SpecialRoomPorts } from '../src/game/world/special-rooms';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['连接特殊房间', '尝试进入特殊房间', '处理单向房间'];
const GLOBALS = ['单元格类型', '地牢大小', '地牢', '房间地图', '房间列表', '玩家背包', '当前层数', '联机模式'];

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(r() * list.length)];
  class 寻宝戒指 { constructor(floor) { this.唯一标识 = Symbol('ring'); this.自定义数据 = new Map([['生效层数', floor]]); } }
  Object.assign(globalThis, { 寻宝戒指,
    连接房间: (a, b) => { calls.push(['connect', a.id, b.id]); return r() < 0.7 ? [{ x: a.x, y: a.y }, { x: b.x, y: b.y }] : null; },
    生成走廊: path => calls.push(['corridor', path]), 添加日志: (...a) => calls.push(['log', ...a]), 生成墙壁: () => calls.push(['walls']),
    处理销毁物品: (...a) => calls.push(['destroy', ...a]), 绘制: () => calls.push(['draw']),
    randomlySetOneWayDirection: cell => { calls.push(['dir', cell.x, cell.y]); return pick(['上', '下', '左', '右']); } });
  联机模式 = r() < 0.1; 当前层数 = Math.floor(r() * 6);
  const size = 8 + Math.floor(r() * 7);
  地牢 = Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => ({ x, y, 背景类型: pick([1, 1, 2, 3, 3, 4, 0]), isOneWay: pick([undefined, true, false]), oneWayAllowedDirection: pick([undefined, '上']) })));
  for (const row of 地牢) for (const cell of row) if (r() < 0.4) cell.配对单元格位置 = { x: Math.floor(r() * (size + 1)), y: Math.floor(r() * size) };
  const door = () => ({ x: Math.floor(r() * (size + 1)) - (r() < 0.05 ? 1 : 0), y: Math.floor(r() * size) });
  房间列表 = Array.from({ length: 2 + Math.floor(r() * 6) }, (_, id) => ({ id, x: Math.floor(r() * size), y: Math.floor(r() * size),
    类型: pick(['普通', '隐藏宝藏', '隐藏商店', '单向房间', '单向房间', undefined]), 已连接: r() < 0.3, 门: Array.from({ length: Math.floor(r() * 4) }, door) }));
  for (const room of 房间列表) if (r() < 0.08) delete room.门;
  for (const room of 房间列表) if (room.门 && r() < 0.2) room.首次进入的门坐标系统 = room.门.slice(0, 1).map(d => ({ ...d }));
  房间地图 = Array.from({ length: size }, () => Array.from({ length: size }, () => pick([-1, -1, 0, 1, 2, 3, '1', 9])));
  玩家背包 = new Map(); for (let i = 0; i < 4; i++) if (r() < 0.6) { const item = r() < 0.7 ? new 寻宝戒指(pick([当前层数, 当前层数 + 1])) : { 唯一标识: Symbol('x'), 自定义数据: new Map() }; 玩家背包.set(item.唯一标识, item); }
  let px = Math.floor(r() * size), py = Math.floor(r() * size), first = true;
  for (let step = 0; step < 25; step++) {
    const op = pick([0, 0, 0, 1, 2]);
    try {
      if (op === 0) { const nx = Math.min(size - 1, Math.max(0, px + pick([-1, 0, 1]))), ny = Math.min(size - 1, Math.max(0, py + pick([-1, 0, 1])));
        results.push([op, first && r() < 0.5 ? 处理单向房间(undefined, undefined, nx, ny) : 处理单向房间(px, py, nx, ny)]); first = false; px = nx; py = ny; }
      if (op === 1) results.push([op, 尝试进入特殊房间(Math.floor(r() * size), Math.floor(r() * (size + 1)))]);
      if (op === 2) results.push([op, 连接特殊房间(pick(房间列表))]);
    } catch (error) { results.push([op, 'throw', error.constructor.name]); }
  }
  globalThis.final = { results, calls, 地牢, 房间列表, 玩家背包 };
`;

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script([...new Set([...GLOBALS, ...FUNCTIONS].map(name => declaration(name)))].join('\n')).runInContext(context);
  new vm.Script(scenario(seed)).runInContext(context);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state });
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const ports: SpecialRoomPorts & OneWayRoomPorts = {
    connectRooms: fn('连接房间'), generateCorridor: fn('生成走廊'), log: fn('添加日志'), generateWalls: fn('生成墙壁'),
    isTreasureRing: item => item instanceof g<abstract new () => unknown>('寻宝戒指'), destroyInventoryItem: fn('处理销毁物品'), requestDraw: fn('绘制'),
    isOnline: () => g<boolean>('联机模式'), randomOneWayDirection: fn('randomlySetOneWayDirection'),
  };
  Object.assign(context, {
    连接特殊房间: (room: unknown) => connectSpecialRoom(state, ports, room),
    尝试进入特殊房间: (x: number, y: number) => tryEnterSpecialRoom(state, ports, x, y),
    处理单向房间: (ox: number | undefined, oy: number | undefined, nx: number, ny: number) => handleOneWayRoom(state, ports, ox, oy, nx, ny),
  });
  new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  return g<Record<string, unknown>>('final');
}

describe('special rooms (连接特殊房间 / 尝试进入特殊房间 / 处理单向房间)', () => {
  it('matches the source over 300 seeded worlds', () => {
    const tally = { connect: 0, corridor: 0, logs: 0, walls: 0, destroy: 0, oneWay: 0, entrances: 0, throws: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(JSON.stringify(graphSnapshot(mine)), `seed ${seed}`).toBe(JSON.stringify(graphSnapshot(source)));
      for (const call of source.calls as unknown[][]) {
        const key = ({ connect: 'connect', corridor: 'corridor', log: 'logs', walls: 'walls', destroy: 'destroy', dir: 'oneWay' } as Record<string, keyof typeof tally>)[call[0] as string];
        if (key) tally[key]++;
      }
      tally.entrances += (source.房间列表 as { 首次进入的门坐标系统?: unknown[] }[]).filter(room => room.首次进入的门坐标系统?.length).length;
      tally.throws += (source.results as unknown[][]).filter(entry => entry[1] === 'throw').length;
    }
    for (const [key, count] of Object.entries(tally)) expect(count, key).toBeGreaterThan(5);
  });
});
