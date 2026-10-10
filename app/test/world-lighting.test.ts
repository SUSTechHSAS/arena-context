import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState, type WorldState } from '../src/game/world/state';
import { getPlayerSightRange, getVisibleRoomIds, isLit, updateLightMap, type LightingPorts } from '../src/game/world/lighting';
import { declaration } from './oracle/source';

const FUNCTIONS = ['获取玩家视野范围', '是否在光源范围内', '更新光源地图', '获取视野内房间ID'];
const GLOBALS = ['地牢大小', '玩家状态', '房间地图', '玩家', '房间列表', '当前天气效果', '玩家属性', '玩家装备', '当前装备页',
  '装备栏每页装备数', '光源地图', '所有计时器', '地牢', '所有怪物', '怪物状态表'];

/** Deterministic world builder shared verbatim by both realms (seeded, no Math.random). */
const world = (seed: number) => `
  let s = ${seed};
  const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(r() * list.length)];
  class 火把 { constructor(bonus, range) { this.自定义数据 = new Map(); if (bonus !== undefined) this.自定义数据.set('视野加成', bonus); if (range !== undefined) this.自定义数据.set('光照范围', range); } }
  globalThis.火把 = 火把;
  地牢大小 = 6 + Math.floor(r() * 7);
  房间列表 = [{ 类型: '普通' }, { 类型: '黑暗房间' }, { 类型: pick(['普通', '黑暗房间']) }, null];
  房间地图 = Array.from({ length: 地牢大小 }, () => Array.from({ length: 地牢大小 }, () => pick([-1, -1, 0, 1, 2, 3])));
  地牢 = r() < 0.15 ? [] : Array.from({ length: 地牢大小 }, (_, y) => Array.from({ length: 地牢大小 }, (_, x) => {
    const roll = r();
    if (roll < 0.08) return { x, y, 关联物品: { x, y, 自定义数据: new Map([['光照范围', pick([0, 1, 2, 3, '2', -1])]]) } };
    if (roll < 0.12) return { x, y, 关联物品: { x, y } };
    return { x, y, 关联物品: null };
  }));
  玩家 = { x: pick([0, 1, 2, 3, 5, 地牢大小 - 1, 地牢大小, -1]), y: pick([0, 2, 4, 地牢大小 - 1, -1]) };
  玩家状态 = r() < 0.15 ? [{ 类型: '失明' }] : [{ 类型: '中毒' }];
  当前天气效果 = r() < 0.6 ? ['深夜'] : pick([[], ['大风']]);
  玩家属性 = { 视野加成: pick([undefined, 0, 1, 2]) };
  当前装备页 = pick([0, 1]); 装备栏每页装备数 = 7;
  玩家装备 = new Map();
  for (let slot = 1; slot <= 14; slot++) if (r() < 0.3) 玩家装备.set(slot, r() < 0.6 ? new 火把(pick([undefined, 0, 1, 2]), pick([undefined, 2])) : { 名称: '其他' });
  所有计时器 = [null, { x: pick([0, 1, 3]), y: pick([0, 2]), 自定义数据: new Map([['光照范围', pick([1, 2])]]) }, { x: 2, y: 1 }, { x: 4, y: 4, 自定义数据: new Map() }];
  所有怪物 = [{ x: pick([1, 3]), y: pick([1, 3]) }, { x: 5, y: 2 }];
  怪物状态表 = new WeakMap(); if (r() < 0.7) 怪物状态表.set(所有怪物[0], { 类型: '火焰' }); 怪物状态表.set(所有怪物[1], { 类型: pick(['火焰', '冻结']) });
  globalThis.canvasWidth = pick([300, 451, 600.5]); globalThis.cellSize = pick([30, 17]);
  globalThis.sight = (sx, sy, ex, ey, max) => { calls.push([sx, sy, ex, ey, max]); return ((sx * 7 + sy * 3 + ex * 5 + ey * 11) % 4) !== 0; };
`;

function sourceRun(seed: number) {
  const calls: unknown[][] = [];
  const context = vm.createContext({ calls });
  const declarations = [...new Set(GLOBALS.map(name => declaration(name)))].join('\n');
  new vm.Script(`${declarations}\n${FUNCTIONS.map(name => declaration(name)).join('\n')}
    const document = { getElementById(id) { calls.push(['dom', id]); return { getBoundingClientRect() { return { width: canvasWidth }; } }; } };
    let 单元格大小 = 0; function 检查视线(...args) { return sight(...args); }`).runInContext(context);
  new vm.Script(`${world(seed)}; 单元格大小 = cellSize;`).runInContext(context);
  return { calls, run: (code: string) => new vm.Script(code).runInContext(context) as unknown };
}

function rewriteRun(seed: number) {
  const calls: unknown[][] = [];
  const state = createWorldState();
  const context = vm.createContext({ calls, S: state });
  new vm.Script(`with (S) { ${world(seed)} }`).runInContext(context);
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const ports: LightingPorts = {
    lineOfSight: (...args) => g<(...a: unknown[]) => boolean>('sight')(...args),
    isTorch: item => item instanceof g<abstract new () => unknown>('火把'),
    canvasWidth: () => { calls.push(['dom', 'dungeonCanvas']); return g<number>('canvasWidth'); },
    cellSize: () => g<number>('cellSize'),
  };
  return { calls, state: state as WorldState, ports };
}

describe('world lighting and visibility', () => {
  const seeds = Array.from({ length: 120 }, (_, index) => index * 7919 + 13);
  it('sight range, visible room ids, light map (incl. insertion order) and lit tests match across 120 worlds', () => {
    let litChecks = 0; let lightCells = 0; let nights = 0;
    for (const seed of seeds) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(getPlayerSightRange(mine.state, mine.ports), `seed ${seed}`).toBe(source.run('获取玩家视野范围()'));
      for (const [cx, cy] of [[0, 0], [3, 2], [mine.state.地牢大小 - 1, 1], [-2, 4]] as [number, number][]) {
        expect([...getVisibleRoomIds(mine.state, mine.ports, cx, cy)]).toEqual([...source.run(`获取视野内房间ID(${cx}, ${cy})`) as Set<number>]);
      }
      updateLightMap(mine.state, mine.ports); source.run('更新光源地图()');
      const expectedLight = [...source.run('光源地图') as Set<string>];
      expect([...mine.state.光源地图], `seed ${seed}`).toEqual(expectedLight);
      lightCells += expectedLight.length; if (mine.state.当前天气效果.includes('深夜')) nights++;
      for (let y = -1; y <= mine.state.地牢大小; y++) for (let x = -1; x <= mine.state.地牢大小; x++) {
        expect(isLit(mine.state, x, y), `seed ${seed} ${x},${y}`).toBe(source.run(`是否在光源范围内(${x}, ${y})`));
        litChecks++;
      }
      expect(mine.calls).toEqual(source.calls);
    }
    // Guard against a vacuous harness: the worlds must exercise night, light sources and many checks.
    expect(nights).toBeGreaterThan(40); expect(lightCells).toBeGreaterThan(500); expect(litChecks).toBeGreaterThan(8000);
  });
  it('light map is cleared and refilled in place (same Set identity)', () => {
    const mine = rewriteRun(13); const map = mine.state.光源地图; map.add('stale');
    updateLightMap(mine.state, mine.ports);
    expect(mine.state.光源地图).toBe(map); expect(map.has('stale')).toBe(false);
  });
});
