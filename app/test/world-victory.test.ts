import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { checkVictoryConditions } from '../src/game/world/victory';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(r() * list.length)];
  const stub = name => (...a) => { calls.push([name, ...a]); };
  Object.assign(globalThis, { 显示通知: stub('显示通知'), 显示胜利界面: stub('显示胜利界面') });
  for (let step = 0; step < 12; step++) {
    自定义全局设置 = { 胜利条件: { 死亡次数限制: pick([0, -1, 1, 2, 3, '2', undefined]), 回合数限制: pick([0, 10, 50, '20', null]),
      伤害限制: pick([0, 5, 12.5, 30]), 生命下限: pick([0, 20, 50, 100]) } };
    玩家属性 = { 当前生命值: pick([-3, 0, 12.34, 20, 49.95, 50, 100]) };
    玩家死亡次数 = pick([0, 1, 2, 3]); 玩家总移动回合数 = pick([0, 10, 11, 20, 21, 60]); 玩家总受到伤害 = pick([0, 5, 5.05, 12.5, 12.56, 31]);
    try { results.push(检查胜利条件()); } catch (error) { results.push(['throw', error.constructor.name]); }
  }
`;

const final = 'globalThis.final = { results, calls }';

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(declaration('检查胜利条件')).runInContext(context);
  new vm.Script(scenario(seed)).runInContext(context);
  return new vm.Script(`${final}; final`).runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => never>(name)(...args);
  context.检查胜利条件 = () => checkVictoryConditions(state, { notify: fn('显示通知'), showVictory: fn('显示胜利界面') });
  new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  return g<Record<string, unknown>>(`with (S) { ${final} }; final`);
}

describe('creative victory conditions (检查胜利条件)', () => {
  it('matches the source over 1500 seeded runs', () => {
    const tally: Record<string, number> = {};
    for (let seed = 1; seed <= 1500; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as string[][]) for (const key of [call[0]!, ...['死亡次数', '回合数', '伤害过多', '生命值过低'].filter(k => String(call[1]).includes(k))]) tally[key] = (tally[key] ?? 0) + 1;
    }
    for (const key of ['显示通知', '显示胜利界面', '死亡次数', '回合数', '伤害过多', '生命值过低']) expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
