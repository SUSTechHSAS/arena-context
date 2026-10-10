import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { canMoveStraight, getNearbyMonsters, type MovementPorts, type TargetingPorts } from '../src/game/world/targeting';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['获取周围怪物', '检查直线移动可行性'];
const GLOBALS = ['怪物状态', '地牢大小', '地牢', '玩家', '当前天气效果', '装备栏每页装备数', '玩家装备', '当前装备页', '怪物状态表'];

/** Seeded world, logged collaborator stubs and a random call script, shared verbatim by both realms. */
const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(r() * list.length)];
  class Monster { constructor(i) { this.名 = 'm' + i; this.状态 = pick([1, 1, 1, 0, 2]); } }
  class 骷髅仆从 extends Monster {} class 巡逻怪物 extends Monster {} class 远射陷阱 extends Monster {}
  class Weapon { constructor(i) { this.名 = 'w' + i; this.类型 = pick(['武器', '武器', '防具']); this.堆叠数量 = pick([1, 1, 0]);
    this.自定义数据 = new Map(r() < 0.8 ? [['冷却剩余', pick([0, 0, 1])]] : []); this.range = pick([1, 2, 3, 4]); }
    get 最终攻击范围() { calls.push(['range', this.名]); return this.range; } }
  const hash = (...a) => a.reduce((h, v) => (h * 31 + v + 7) % 1009, ${seed});
  Object.assign(globalThis, { 骷髅仆从, 巡逻怪物, 远射陷阱,
    检查视线: (...a) => { calls.push(['sight', ...a]); return hash(...a) % 5 !== 0; },
    快速直线检查: (...a) => { calls.push(['quick', ...a]); return hash(...a) % 2 === 0; },
    获取直线路径: (...a) => { calls.push(['line', ...a]); return [{ x: a[0], y: a[1] }, { x: a[2], y: a[3] }]; },
    广度优先搜索路径: (...a) => { calls.push(['bfs', ...a]); return hash(...a) % 3 === 0 ? null : [{ x: a[0], y: a[1] }, { x: 0, y: 0 }, { x: a[2], y: a[3] }]; },
    检查移动可行性: (...a) => { calls.push(['step', ...a]); return hash(a[0], a[1], a[2], a[3]) % 9 !== 0; } });
  const kinds = [Monster, Monster, Monster, 骷髅仆从, 巡逻怪物, 远射陷阱];
  地牢大小 = 5 + Math.floor(r() * 12); const density = pick([0.3, 0.3, 0.85]);
  怪物状态表 = new WeakMap();
  地牢 = Array.from({ length: 地牢大小 }, (_, y) => Array.from({ length: 地牢大小 }, (_, x) => {
    if (r() > density) return { x, y, 关联怪物: null };
    const monster = new (pick(kinds))(x + ',' + y); if (r() < 0.15) 怪物状态表.set(monster, { 类型: pick(['魅惑', '中毒']) });
    return { x, y, 关联怪物: monster }; }));
  玩家 = { x: Math.floor(r() * 地牢大小), y: Math.floor(r() * 地牢大小) };
  当前天气效果 = r() < 0.3 ? ['诡魅'] : pick([[], ['大风']]);
  装备栏每页装备数 = pick([3, 7]); 当前装备页 = pick([0, 1]);
  玩家装备 = new Map(); for (let slot = 1; slot <= 14; slot++) if (r() < 0.4) 玩家装备.set(slot, r() < 0.9 ? new Weapon(slot) : null);
  const coord = () => Math.floor(r() * (地牢大小 + 2)) - 1;
  for (let step = 0; step < 25; step++) {
    if (r() < 0.6) {
      const args = [pick([undefined, 1, 2, 3, 6, 40]), pick([undefined, null, 0, 1, 2, 3, 4, 7, 7]), pick([undefined, undefined, { x: coord(), y: coord() }])];
      while (args.length && args[args.length - 1] === undefined) args.pop();
      results.push(['near', 获取周围怪物(...args)]);
    } else {
      const fx = coord(), fy = coord(); const straight = r() < 0.8; const axis = r() < 0.5;
      const tx = straight && axis ? fx : coord(), ty = straight && !axis ? fy : coord();
      results.push(['line', 检查直线移动可行性(fx, fy, tx, ty, pick([undefined, true, false]))]);
    }
  }
  globalThis.final = { results, calls };
`;

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  const declarations = [...new Set([...GLOBALS, ...FUNCTIONS].map(name => declaration(name)))].join('\n');
  new vm.Script(declarations).runInContext(context);
  new vm.Script(scenario(seed)).runInContext(context);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state });
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const is = (monster: unknown, name: string) => monster instanceof g<abstract new () => unknown>(name);
  const ports: TargetingPorts & MovementPorts = {
    lineOfSight: fn('检查视线'), quickLineCheck: fn('快速直线检查'), straightPath: fn('获取直线路径'), searchPath: fn('广度优先搜索路径'),
    canStep: fn('检查移动可行性'), isSkeletonMinion: monster => is(monster, '骷髅仆从'),
    isLowPriorityTarget: monster => is(monster, '巡逻怪物') || is(monster, '远射陷阱'),
  };
  Object.assign(context, {
    获取周围怪物: (...args: unknown[]) => (getNearbyMonsters as (...a: unknown[]) => unknown)(state, ports, ...args),
    检查直线移动可行性: (...args: unknown[]) => (canMoveStraight as (...a: unknown[]) => unknown)(state, ports, ...args),
  });
  new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  return g<Record<string, unknown>>('final');
}

describe('world targeting (获取周围怪物 / 检查直线移动可行性)', () => {
  it('matches the source over 250 seeded worlds: results, path arrays, collaborator call order', () => {
    const tally = { hits: 0, multi: 0, empty: 0, weaponless: 0, lineTrue: 0, lineFalse: 0, bfsNull: 0, lowPriorityTie: 0 };
    for (let seed = 1; seed <= 250; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(JSON.stringify(graphSnapshot(mine)), `seed ${seed}`).toBe(JSON.stringify(graphSnapshot(source)));
      const calls = source.calls as unknown[][];
      for (const [kind, value] of source.results as [string, Record<string, unknown[] | null> | boolean][]) {
        if (kind === 'line') { if (value) tally.lineTrue++; else tally.lineFalse++; continue; }
        const near = value as Record<string, unknown[] | null>;
        if (near.怪物) { tally.hits++; if (near.怪物.length > 1) tally.multi++; } else tally.empty++;
      }
      tally.weaponless += Number(!calls.some(call => call[0] === 'range'));
      tally.bfsNull += calls.filter(call => call[0] === 'bfs').length;
      tally.lowPriorityTie += Number((source.results as unknown[][]).some(([kind, value]) => kind === 'near' &&
        ((value as { 怪物: unknown[] | null }).怪物 ?? []).some(monster => ['巡逻怪物', '远射陷阱'].includes((monster as object).constructor.name))));
    }
    for (const [key, count] of Object.entries(tally)) expect(count, key).toBeGreaterThan(5);
  });
});
