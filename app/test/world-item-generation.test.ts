import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { checkHazmatProtection, generateItems, 物品生成配置, type HazmatPorts, type ItemGenerationPorts } from '../src/game/world/item-generation';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['物品生成配置', '生成物品', '检查防化服防护'];
const GLOBALS = ['prng', '当前层数', '房间列表', '上锁房间列表', '自定义游戏设置', '物品池', '玩家', '装备栏每页装备数', '当前装备页', '玩家装备'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  class Thing { constructor(options) { calls.push(['new', this.constructor.name, options]); } }
  const named = name => ({ [name]: class extends Thing {} })[name];
  class 防化服 { constructor(durability, unbreakable) { this.唯一标识 = Symbol('suit'); this.自定义数据 = new Map([['耐久', durability]]); if (unbreakable) this.自定义数据.set('不可破坏', true); } }
  class 宠物 { constructor(name) { this.名称 = name; this.自定义数据 = new Map(); } 更新宠物管理窗口() { calls.push(['pet-window', this.名称]); } }
  Object.assign(globalThis, { 防化服, 宠物,
    加权随机选择: options => { calls.push(['weighted', options.length]); const total = options.reduce((a, o) => a + o.权重, 0); let roll = rand() * total;
      for (const o of options) { if (roll < o.权重) return o.值 ?? o; roll -= o.权重; } return options[0].值 ?? options[0]; },
    放置物品到房间: (item, room) => { calls.push(['place', room.id, item]); return r() < 0.8; },
    console: { log: (...a) => calls.push(['console', ...a]) },
    处理销毁物品: (...a) => calls.push(['destroy', ...a]), 显示通知: (...a) => calls.push(['notify', ...a]), 添加日志: (...a) => calls.push(['log', ...a]),
    更新装备显示: () => calls.push(['equip-ui']) });
  当前层数 = Math.floor(r() * 12);
  自定义游戏设置 = { 物品掉落率: pick([0.5, 1, 1, 2]) };
  const kinds = Array.from({ length: 10 }, (_, i) => named('物品' + i));
  物品池 = {}; for (const type of ['武器', '防具', '药水', '卷轴', '工具', '宠物', '饰品'])
    物品池[type] = r() < 0.1 ? [] : Array.from({ length: 1 + Math.floor(r() * 4) }, () => ({ 类: pick(kinds), 品质: 1 + Math.floor(r() * 5), 最小层: pick([0, 1, 3, 8]) }));
  房间列表 = Array.from({ length: 1 + Math.floor(r() * 8) }, (_, id) => ({ id, 类型: pick(['房间', '房间', '宝藏房间']) }));
  上锁房间列表 = 房间列表.filter(() => r() < 0.35);
  玩家 = { x: 1, y: 1 }; 装备栏每页装备数 = pick([3, 7]); 当前装备页 = pick([0, 1]);
  玩家装备 = new Map(); for (let slot = 1; slot <= 14; slot++) if (r() < 0.25) 玩家装备.set(slot, r() < 0.5 ? new 防化服(pick([1, 2, 3]), r() < 0.2) : { 名: 'other' });
  const pets = Array.from({ length: 2 }, (_, i) => { const pet = new 宠物('宠' + i); if (r() < 0.8) pet.自定义数据.set('装备', { 头: null, 身: r() < 0.7 ? new 防化服(pick([1, 2]), r() < 0.2) : null }); const gear = pet.自定义数据.get('装备'); if (gear && r() < 0.4) gear.头 = gear.身; return pet; });
  for (let step = 0; step < 6; step++) results.push(['items', pick([() => 生成物品(), () => 生成物品(null), () => 生成物品([pick(房间列表)]), () => 生成物品([])])()]);
  for (let step = 0; step < 10; step++) results.push(['hazmat', 检查防化服防护(pick([玩家, 玩家, ...pets, { 名: 'stranger' }]))]);
  globalThis.final = { results, calls, 玩家装备, pets };
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
  const itemPorts: ItemGenerationPorts = { random: () => g<() => number>('__rand')(), weightedPick: fn('加权随机选择'), placeItemInRoom: fn('放置物品到房间'),
    diagnostic: message => { g<{ log(...a: unknown[]): void }>('console').log(message); } };
  const hazmatPorts: HazmatPorts = { isHazmatSuit: item => item instanceof g<abstract new () => unknown>('防化服'), isPet: entity => entity instanceof g<abstract new () => unknown>('宠物'),
    destroyInventoryItem: fn('处理销毁物品'), notify: fn('显示通知'), log: fn('添加日志'), refreshEquipment: fn('更新装备显示') };
  Object.assign(context, {
    生成物品: (...args: unknown[]) => generateItems(state, itemPorts, ...args),
    检查防化服防护: (entity: unknown) => checkHazmatProtection(state, hazmatPorts, entity),
  });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  return g<Record<string, unknown>>('final');
}

describe('item generation and hazmat protection', () => {
  it('物品生成配置 is graph-equal to the source declaration', () => {
    const context = vm.createContext({});
    expect(snap(物品生成配置)).toBe(snap(new vm.Script(`${declaration('物品生成配置')}; 物品生成配置`).runInContext(context)));
  });
  it('生成物品 and 检查防化服防护 match the source over 300 seeded worlds', () => {
    const tally = { spawned: 0, placeFail: 0, lockedMulti: 0, protect: 0, broken: 0, petBroken: 0, equipUi: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      const calls = source.calls as unknown[][];
      for (const call of calls) {
        if (call[0] === 'new') tally.spawned++; if (call[0] === 'console') tally.placeFail++; if (call[0] === 'notify') tally.broken++;
        if (call[0] === 'pet-window') tally.petBroken++; if (call[0] === 'equip-ui') tally.equipUi++;
      }
      tally.protect += (source.results as unknown[][]).filter(entry => entry[0] === 'hazmat' && entry[1] === true).length;
      tally.lockedMulti += Number(calls.filter(call => call[0] === 'place').length > 3);
    }
    for (const [key, count] of Object.entries(tally)) expect(count, key).toBeGreaterThan(5);
  });
});
