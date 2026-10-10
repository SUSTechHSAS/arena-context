import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { generateJarRoom, generateLibraryRoom, generatePlantRoom, generatePotionRoom, type ThemeRoomCatalog, type ThemeRoomPorts } from '../src/game/world/theme-rooms';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['生成罐子房间内容', '生成植物房间内容', '生成药水房内容', '生成书库房间内容'];
const GLOBALS = ['prng', '物品池'];
const CLASSES = ['罐子', '空罐子', '泉水', '荆棘种子', '护卫种子', '远射种子', '吸能种子', '书架', '伪装怪物'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let p = Number((BigInt(${seed}) * 2654435761n) % 4294967296n); for (let w = 0; w < 3; w++) p = (p * 69069 + 1) % 4294967296;
  const rand = () => { calls.push(['prng']); return (p = (p * 69069 + 1) % 4294967296) / 4294967296; };
  const pick = list => list[Math.floor(r() * list.length)];
  class Thing { constructor(options) { calls.push(['new', this.constructor.name, options]); this.opts = options; } }
  const named = name => ({ [name]: class extends Thing {} })[name];
  for (const name of ${JSON.stringify(CLASSES)}) globalThis[name] = named(name);
  Object.assign(globalThis, {
    加权随机选择: options => { calls.push(['weighted', options.map(o => [o.值.类.name, o.权重, o.值.权重])]); return r() < 0.1 ? null : pick(options).值; },
    放置物品到单元格: (item, x, y) => calls.push(['item-at', item, x, y]),
    放置物品到房间: (item, room) => calls.push(['item-in', item, room.id]),
    放置怪物到房间: (monster, room) => calls.push(['monster-in', monster, room.id]),
  });
  const potions = [named('治疗药水'), named('力量药水'), named('隐身药水')];
  物品池 = { 药水: pick([[], [{ 类: potions[0] }], potions.map(类 => ({ 类 })), [, { 类: potions[1] }, , { 类: potions[2] }]]) };
  for (let step = 0; step < 8; step++) {
    const room = { id: step, x: Math.floor(r() * 10) - 3, y: Math.floor(r() * 10) - 3, w: 1 + Math.floor(r() * 9), h: 1 + Math.floor(r() * 9) };
    const name = pick(${JSON.stringify(FUNCTIONS)});
    try { results.push([name, globalThis[name](room)]); } catch (error) { results.push([name, 'throw', error.constructor.name]); }
  }
  globalThis.final = { results, calls };
`;

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${[...new Set([...GLOBALS, ...FUNCTIONS].map(name => declaration(name)))].join('\n')}
    globalThis.__setPrng = f => { prng = f; };
    ${FUNCTIONS.map(name => `globalThis[${JSON.stringify(name)}] = ${name};`).join('\n')}`).runInContext(context);
  new vm.Script(scenario(seed).replace('const pick', '__setPrng(rand); const pick')).runInContext(context);
  return new vm.Script('final').runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state });
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  const catalog = Object.defineProperties({}, Object.fromEntries(CLASSES.map(name => [name, { get: () => g(name), enumerable: true }]))) as ThemeRoomCatalog;
  const ports: ThemeRoomPorts = { random: () => g<() => number>('__rand')(), catalog, weightedPick: fn('加权随机选择'),
    placeItemAt: fn('放置物品到单元格'), placeItemInRoom: fn('放置物品到房间'), placeMonsterInRoom: fn('放置怪物到房间') };
  Object.assign(context, {
    生成罐子房间内容: (room: unknown) => generateJarRoom(state, ports, room),
    生成植物房间内容: (room: unknown) => generatePlantRoom(state, ports, room),
    生成药水房内容: (room: unknown) => generatePotionRoom(state, ports, room),
    生成书库房间内容: (room: unknown) => generateLibraryRoom(state, ports, room),
  });
  new vm.Script(`with (S) { ${scenario(seed).replace('const pick', 'globalThis.__rand = rand; const pick')} }`).runInContext(context);
  return g<Record<string, unknown>>('final');
}

describe('theme-room content (罐子 / 植物 / 药水 / 书库)', () => {
  it('matches the source over 300 seeded rooms sets', () => {
    const counts: Record<string, number> = {};
    let nullPicks = 0; let skippedPotions = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) if (call[0] === 'new') counts[call[1] as string] = (counts[call[1] as string] ?? 0) + 1;
      const calls = source.calls as unknown[][];
      nullPicks += calls.filter((call, i) => call[0] === 'weighted' && calls[i + 1]?.[0] !== 'prng').length;
      skippedPotions += Number((source.results as unknown[][]).some(entry => entry[0] === '生成药水房内容') && !calls.some(call => call[0] === 'new' && String(call[1]).endsWith('药水')));
    }
    for (const name of [...CLASSES, '治疗药水', '力量药水', '隐身药水']) expect(counts[name] ?? 0, name).toBeGreaterThan(5);
    expect(nullPicks).toBeGreaterThan(5);
    expect(skippedPotions).toBeGreaterThan(5);
  });
});
