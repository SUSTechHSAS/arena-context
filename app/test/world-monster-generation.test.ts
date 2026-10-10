import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 单元格类型 } from '../src/game/world/constants';
import { generateMonsters, type MonsterCatalog, type MonsterGenerationPorts } from '../src/game/world/monster-generation';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['生成怪物'];
const GLOBALS = ['单元格类型', '最大怪物数', 'prng', '地牢大小', '地牢', '当前层数', '房间列表', '上锁房间列表', '怪物引入计划', '自定义游戏设置', '地牢生成方式'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  class Monster { constructor(options) { calls.push(['new', this.constructor.name, options]); this.永久增益 = []; this.opts = options; } }
  class 巡逻怪物 extends Monster {}
  const named = (name, Base) => ({ [name]: class extends Base {} })[name];
  const kinds = [named('史莱姆', Monster), named('骷髅', Monster), named('史莱姆', Monster), named('巡逻兵', 巡逻怪物), named('蝙蝠', Monster)];
  Object.assign(globalThis, { 巡逻怪物,
    图标映射: { 飞毛腿: 'i-speed', 永久抗火: 'i-fire', 永久力量: 'i-str', 永久抗毒: 'i-poison', 永久解冻: 'i-thaw', 炸弹: 'i-bomb', 隐身: 'i-hide', 矿工: 'i-mine' },
    放置怪物到单元格: (monster, x, y) => { calls.push(['place', monster.constructor.name, x, y]); 地牢[y][x].关联怪物 = monster; return true; },
  });
  地牢大小 = pick([12, 20, 30]);
  const corridorShare = pick([0.1, 0.4, 0.7]);
  const crowd = pick([0.05, 0.05, 0.9]);
  地牢 = Array.from({ length: 地牢大小 }, (_, y) => Array.from({ length: 地牢大小 }, (_, x) => ({ x, y,
    背景类型: r() < corridorShare ? 单元格类型.走廊 : pick([单元格类型.房间, 单元格类型.房间, 单元格类型.墙壁]), 关联怪物: r() < crowd ? { blocker: 1 } : null, 关联物品: r() < 0.05 ? { item: 1 } : null })));
  当前层数 = Math.floor(r() * 15);
  自定义游戏设置 = { 开启怪物等级: r() < 0.7, 开启药水增益怪物: r() < 0.7, 开启巡逻怪物: r() < 0.7 };
  地牢生成方式 = pick(['maze', 'rooms', 'cave']);
  怪物引入计划 = new Map(); for (let floor = 0; floor < 12; floor++) if (r() < 0.4)
    怪物引入计划.set(pick([floor, floor, String(floor)]), Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({ 类: pick(kinds), 权重: pick([1, 3, 10, 0, r() < 0.2 ? NaN : 5]) })));
  房间列表 = Array.from({ length: Math.floor(r() * 7) }, (_, id) => { const w = 2 + Math.floor(r() * 5);
    return { id: pick([id, id, 0]), 类型: pick(['房间', '房间', '黑暗房间', '宝藏房间']), x: Math.floor(r() * (地牢大小 - w + (r() < 0.05 ? 4 : 0))), y: Math.floor(r() * (地牢大小 - w)), w, h: w }; });
  上锁房间列表 = 房间列表.filter(() => r() < 0.3);
  try { results.push(['ok', 生成怪物()]); } catch (error) { results.push(['throw', error.constructor.name]); }
  results.push(['spawn-flag', typeof 生成成功 === 'undefined' ? 'unset' : 生成成功]);
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
  const context = vm.createContext({ calls: [], results: [], S: state, 单元格类型 });
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const catalog = { get 巡逻怪物() { return g('巡逻怪物'); }, get 图标映射() { return g('图标映射'); } } as unknown as MonsterCatalog;
  const ports: MonsterGenerationPorts = {
    random: () => g<() => number>('__rand')(), catalog,
    placeMonsterAt: (...args) => g<(...a: unknown[]) => unknown>('放置怪物到单元格')(...args),
    flagSpawnSuccess: () => { (context as Record<string, unknown>).生成成功 = true; },
  };
  Object.assign(context, { 生成怪物: () => generateMonsters(state, ports) });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  return g<Record<string, unknown>>('final');
}

describe('monster generation (生成怪物)', () => {
  it('matches the source over 250 seeded worlds', () => {
    const tally = { roomMonsters: 0, patrols: 0, potions: 0, darkRooms: 0, throws: 0, flagged: 0, unflagged: 0 };
    for (let seed = 1; seed <= 250; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      const calls = source.calls as unknown[][];
      tally.roomMonsters += calls.filter(call => call[0] === 'new' && (call[2] as { 房间ID: number }).房间ID !== -1).length;
      tally.patrols += calls.filter(call => call[0] === 'new' && (call[2] as { 房间ID: number }).房间ID === -1).length;
      const results = source.results as unknown[][];
      tally.throws += results.filter(entry => entry[0] === 'throw').length;
      tally.flagged += results.filter(entry => entry[0] === 'spawn-flag' && entry[1] === true).length;
      tally.unflagged += results.filter(entry => entry[0] === 'spawn-flag' && entry[1] === 'unset').length;
      tally.potions += Number(JSON.stringify(graphSnapshot(source.地牢)).includes('携带药水'));
      tally.darkRooms += Number(calls.filter(call => call[0] === 'new').length >= 2);
    }
    for (const [key, count] of Object.entries(tally)) expect(count, key).toBeGreaterThan(5);
  });
});
