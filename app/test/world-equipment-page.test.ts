import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { switchEquipmentPage } from '../src/game/world/equipment-page';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(r() * list.length)];
  const timers = [];
  const bar = { style: { transform: 'init' } };
  Object.assign(globalThis, { socket: { emit: (...a) => calls.push(['emit', ...a]) }, 更新装备显示: () => calls.push(['refresh', 当前装备页]),
    document: { querySelector: q => { calls.push(['query', q]); return r() < 0.8 ? bar : null; } },
    setTimeout: (f, ms) => { calls.push(['timeout', ms]); timers.push(f); } });
  for (let session = 0; session < 4; session++) {
    联机模式 = r() < 0.3; 最大背包容量 = pick([0, 5, 12, 13, 30]); 最大装备页 = pick([1, 3, 5]); 装备栏每页装备数 = pick([4, 6]);
    当前装备页 = pick([0, 1, 2, 7, -1, '1']);
    for (let step = 0; step < 6; step++) {
      try { results.push(['switch', 切换装备页(pick([1, -1, 2, -3, 0, '1', 0.5])), 当前装备页, { ...bar.style }]); } catch (error) { results.push(['throw', error.constructor.name]); }
      if (r() < 0.5) while (timers.length) timers.shift()();
    }
  }
`;

const final = 'globalThis.final = { results, calls }';

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(declaration('切换装备页')).runInContext(context);
  new vm.Script(scenario(seed)).runInContext(context);
  return new vm.Script(`${final}; final`).runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  context.切换装备页 = (direction: unknown) => switchEquipmentPage(state, {
    isOnline: () => g<boolean>('联机模式'), emit: (event, payload) => g<{ emit(...a: unknown[]): void }>('socket').emit(event, payload),
    refreshEquipment: fn('更新装备显示'), equipmentBar: () => g<{ querySelector(q: string): never }>('document').querySelector('.装备栏'), schedule: fn('setTimeout'),
  }, direction);
  new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  return g<Record<string, unknown>>(`with (S) { ${final} }; final`);
}

describe('equipment page switching (切换装备页)', () => {
  it('matches the source over 1500 seeded sessions', () => {
    const tally: Record<string, number> = {};
    for (let seed = 1; seed <= 1500; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) tally[String(call[0])] = (tally[String(call[0])] ?? 0) + 1;
    }
    for (const key of ['emit', 'refresh', 'query', 'timeout']) expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
