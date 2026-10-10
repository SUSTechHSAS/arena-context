import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { nextTutorialStage, previousTutorialStage } from '../src/game/world/tutorial-nav';
import { applyWrenchRules } from '../src/game/world/wrench';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const FUNCTIONS = ['获取上一个有效阶段', '获取下一个有效阶段', '应用扳手规则'];
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 5; i++) r();
  const pick = list => list[Math.floor(r() * list.length)];
  let known = new Set();
  Object.assign(globalThis, {
    获取教程文本: stage => { calls.push(['text', stage]); return known.has(stage) ? '教程' + stage : pick(['未知教程阶段', '未知教程阶段', undefined]) === undefined && r() < 0.3 ? undefined : (known.has(stage) ? 'x' : '未知教程阶段'); },
    显示通知: (m, t) => calls.push(['notify', m, t]), 应用单个扳手规则: (target, rule) => calls.push(['rule', target?.名称 ?? null, rule]), 绘制: () => calls.push(['draw']) });
  for (let round = 0; round < 12; round++) {
    known = new Set([0, 1, 2, 2.5, 3, 4, 5, 6, 7, 31].filter(() => r() < 0.6));
    const stage = pick([-1, 0, 0.5, 1, 2, 2.5, 3, 3.7, 5, 6, 7, NaN, '2', '3', 2.4]);
    for (const name of ['获取上一个有效阶段', '获取下一个有效阶段']) {
      try { results.push([name, stage, globalThis[name](stage)]); } catch (error) { results.push(['throw', name, error.constructor.name]); }
    }
    const target = pick([{ 名称: '箱子' }, { 类型: '墙' }, { 名称: '', 类型: 0 }, {}, null]);
    const rules = pick([null, undefined, [], ['a'], ['a', { 键: 'b' }], { length: 1 }, 'xy']);
    try { results.push(['wrench', 应用扳手规则(target, rules)]); } catch (error) { results.push(['throw', 'wrench', error.constructor.name]); }
  }
`;

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(FUNCTIONS.map(name => declaration(name)).join('\n')).runInContext(context);
  new vm.Script(scenario(seed)).runInContext(context);
  return new vm.Script('({ results, calls })').runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = <T,>(name: string) => (...args: unknown[]) => g<(...a: unknown[]) => T>(name)(...args);
  const nav = { tutorialText: fn('获取教程文本') };
  Object.assign(context, {
    获取上一个有效阶段: (stage: number) => previousTutorialStage(nav, stage),
    获取下一个有效阶段: (stage: number) => nextTutorialStage(nav, stage),
    应用扳手规则: (target: unknown, rules: unknown) => applyWrenchRules({ notify: fn('显示通知'), applyRule: fn('应用单个扳手规则'), draw: fn('绘制') }, target, rules),
  });
  new vm.Script(scenario(seed)).runInContext(context);
  return g<Record<string, unknown>>('({ results, calls })');
}

describe('tutorial replay navigation and editor wrench (获取上一个/下一个有效阶段, 应用扳手规则)', () => {
  it('matches the source over 600 seeded runs', () => {
    const tally: Record<string, number> = {};
    for (let seed = 1; seed <= 600; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const entry of source.results as unknown[][]) {
        const key = entry[0] === 'throw' ? `throw:${String(entry[1])}` : entry[0] === 'wrench' ? 'wrench' : `${String(entry[0])}:${entry[2] === null ? 'null' : Number.isNaN(entry[2]) ? 'NaN' : entry[2] === 0 ? '0' : 'stage'}`;
        tally[key] = (tally[key] ?? 0) + 1;
      }
      for (const call of source.calls as unknown[][]) tally[String(call[0])] = (tally[String(call[0])] ?? 0) + 1;
    }
    for (const key of ['获取上一个有效阶段:0', '获取上一个有效阶段:stage', '获取上一个有效阶段:NaN', '获取下一个有效阶段:null', '获取下一个有效阶段:stage',
      'wrench', 'throw:wrench', 'rule', 'draw', 'notify', 'text'])
      expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  });
});
