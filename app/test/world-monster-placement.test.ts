import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { clearRoomContents, placeGiant, placeMonsterAt, placeMonsterInRoom, type MonsterPlacementPorts } from '../src/game/world/placement';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['位置是否可用', '放置怪物到单元格', '放置巨人', '放置怪物到房间', '清空房间内容'];
const GLOBALS = ['单元格类型', 'prng', '地牢大小', '地牢', '玩家', '当前出战宠物列表', '房间地图', '所有怪物', '所有计时器'];

/** Seeded world plus a random operation script, shared verbatim by both realms. */
const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = ${seed * 13 + 5}; const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  class Monster { constructor(i) { this.名 = 'm' + i; this.类型 = pick(['史莱姆', undefined]); this.x = -1; this.y = -1; this.房间ID = null; } }
  class 巨人怪物 extends Monster { constructor(i) { super(i); this.部位列表 = [new Monster(i + 'a'), new Monster(i + 'b'), new Monster(i + 'c')];
    this.部位偏移 = [{ dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }]; }
    保存新位置类型(x, y) { calls.push(['save-footprint', this.名, x, y]); } }
  globalThis.巨人怪物 = 巨人怪物;
  地牢大小 = 6 + Math.floor(r() * 7);
  const item = i => ({ 唯一标识: Symbol('it' + i), 阻碍怪物: pick([true, false, undefined]) });
  所有怪物 = [];
  地牢 = Array.from({ length: 地牢大小 }, (_, y) => Array.from({ length: 地牢大小 }, (_, x) => {
    const cell = { x, y, 背景类型: pick([0, 1, 1, 1, 1, 2, 3, 4]), 类型: pick([null, null, 5, 1]), 关联物品: null, 关联怪物: null, 环境: pick([null, '水', '冰']) };
    if (r() < 0.15) cell.关联物品 = item(x + '_' + y);
    if (r() < 0.08) { cell.关联怪物 = new Monster(x + '-' + y); 所有怪物.push(cell.关联怪物); }
    return cell; }));
  const initialMonsters = 所有怪物;
  玩家 = { x: 0, y: 0 }; 当前出战宠物列表 = r() < 0.3 ? [{ x: 1, y: 1 }] : [];
  房间地图 = Array.from({ length: 地牢大小 }, () => Array.from({ length: 地牢大小 }, () => pick([-1, 0, 1, 2])));
  const placedItems = 地牢.flat().filter(cell => cell.关联物品).map(cell => cell.关联物品);
  所有计时器 = [{ 唯一标识: Symbol('free') }, ...placedItems.filter(() => r() < 0.5).map(it => ({ 唯一标识: it.唯一标识 }))];
  if (r() < 0.3 && placedItems.length) 所有计时器.push({ 唯一标识: placedItems[0].唯一标识 });
  const inside = () => Math.floor(r() * 地牢大小); const edge = () => r() < 0.15 ? pick([-1, 地牢大小]) : inside();
  const room = () => pick([null, undefined, 0, 1, 1, 1]) && { id: pick([0, 1, 2, 'x']), 类型: pick([undefined, '普通', '']),
    x: Math.floor(r() * (地牢大小 + 1)) - 1, y: Math.floor(r() * (地牢大小 + 1)) - 1, w: 1 + Math.floor(r() * 6), h: 1 + Math.floor(r() * 6) };
  for (let step = 0; step < 40; step++) {
    const op = Math.floor(r() * 4); const monster = r() < 0.3 ? new 巨人怪物('g' + step) : pick([new Monster('n' + step), null]);
    try {
      if (op === 0) results.push([op, 放置怪物到单元格(monster ?? new Monster('z'), edge(), edge())]);
      if (op === 1) results.push([op, 放置巨人(new 巨人怪物('G' + step), inside(), inside())]);
      if (op === 2) results.push([op, 放置怪物到房间(monster, room())]);
      if (op === 3) results.push([op, 清空房间内容(room())]);
    } catch (error) { results.push([op, 'throw', error.constructor.name]); }
  }
  globalThis.final = { results, calls, 地牢, 所有怪物, 所有计时器, replaced: 所有怪物 !== initialMonsters };
`;

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  const declarations = [...new Set([...GLOBALS, ...FUNCTIONS].map(name => declaration(name)))].join('\n');
  new vm.Script(`${declarations}
    function 绘制() { calls.push(['draw']); }
    const console = { error: message => calls.push(['error', message]), warn: message => calls.push(['warn', message]) };
    globalThis.__setPrng = f => { prng = f; };`).runInContext(context);
  new vm.Script(scenario(seed).replace('const pick', '__setPrng(rand); const pick')).runInContext(context);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  const calls: unknown[][] = [];
  const context = vm.createContext({ calls, results: [], S: state });
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const ports: MonsterPlacementPorts = {
    random: () => g<() => number>('__rand')(),
    requestDraw: () => { calls.push(['draw']); },
    isGiant: monster => monster instanceof g<abstract new () => unknown>('巨人怪物'),
    diagnostic: (level, message) => { calls.push([level, message]); },
  };
  const bind = (f: (...a: never[]) => unknown) => (...args: unknown[]) => (f as (...a: unknown[]) => unknown)(state, ports, ...args);
  Object.assign(context, { 放置怪物到单元格: bind(placeMonsterAt), 放置巨人: bind(placeGiant), 放置怪物到房间: bind(placeMonsterInRoom), 清空房间内容: bind(clearRoomContents) });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  return g<Record<string, unknown>>('final');
}

describe('world monster placement and room clearing', () => {
  it('matches the source over 200 seeded worlds: returns, draw/prng/diagnostic order and final graphs', () => {
    const tally = { cell: 0, giant: 0, roomGiant: 0, room: 0, roomFail: 0, invalid: 0, cleared: 0, throws: 0, replaced: 0 };
    for (let seed = 1; seed <= 200; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(JSON.stringify(graphSnapshot(mine)), `seed ${seed}`).toBe(JSON.stringify(graphSnapshot(source)));
      for (const [op, value] of source.results as unknown[][]) {
        if (value === 'throw') tally.throws++;
        else if (op === 0 && value) tally.cell++; else if (op === 1 && value) tally.giant++; else if (op === 2 && value) tally.room++; else if (op === 3) tally.cleared++;
      }
      for (const call of source.calls as unknown[][]) {
        if (call[0] === 'error') tally.invalid++;
        if (call[0] === 'warn') tally.roomFail++;
        if (call[0] === 'save-footprint') tally.roomGiant++;
      }
      tally.replaced += Number(source.replaced);
    }
    for (const [key, count] of Object.entries(tally)) expect(count, key).toBeGreaterThan(5);
  });
});
