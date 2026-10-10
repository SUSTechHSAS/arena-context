import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { handleEditorClick, type EditorClickPorts, type EditorClickSession } from '../src/game/world/editor-click';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 5; i++) r();
  const pick = list => list[Math.floor(r() * list.length)];
  const N = 5;
  class Entity { constructor(n) { this.n = n; } }
  const log = name => (...a) => { calls.push([name, ...a]); };
  Object.assign(globalThis, {
    计划显示格子特效: log('effect'), 更新视口: () => calls.push(['viewport', 玩家.x, 玩家.y]), 绘制: log('draw'), 绘制小地图: () => calls.push(['minimap', 编辑器状态.模式]),
    显示通知: log('notify'), 异步保存编辑器状态: log('save'), 编辑器粘贴选区: log('paste'), 应用扳手规则: (t, rules) => calls.push(['wrench', t.n, rules]),
    油漆桶填充: log('bucket'), 笔刷绘制: log('brush'), 编辑器放置逻辑: log('place'),
  });
  地牢 = Array.from({ length: N }, (_, y) => r() < 0.1 ? undefined : Array.from({ length: N }, (_, x) => r() < 0.1 ? null : ({
    关联怪物: r() < 0.3 ? new Entity('m' + x + y) : pick([null, undefined, 0]), 关联物品: r() < 0.4 ? new Entity('i' + x + y) : null })));
  房间地图 = Array.from({ length: N }, () => Array.from({ length: N }, () => pick([-1, 0, 1, undefined])));
  扳手规则集 = { '1': ['a'], '2': [], '3': null }; 当前扳手快捷槽 = '1'; 玩家 = { x: 0, y: 0 }; 玩家初始位置 = { x: 9, y: 9 };
  for (let click = 0; click < 20; click++) {
    编辑器状态 = { 模式: pick(['编辑', '传送', '设置起点', '编辑', undefined]), 笔刷模式: pick(['油漆桶', '笔刷', '其他']),
      当前选中: pick([null, undefined, { 名称: '复制工具' }, { 名称: '扳手' }, { 类型: '背景', 绘制类型: 'grass' }, { 类型: '背景', 绘制类型: 3 }, { 名称: 'x', 类型: '物品' }]) };
    旧编辑器状态 = pick(['编辑', '传送', null]); 编辑器剪贴板 = pick([null, { w: 1 }, '']); 当前扳手快捷槽 = pick(['1', '2', '3', '4']);
    try { results.push(['ok', 编辑器单击处理(Math.floor(r() * (N + 2)) - 1, Math.floor(r() * (N + 2)) - 1)]); } catch (error) { results.push(['throw', error.constructor.name]); }
    results.push([玩家, 玩家初始位置, 编辑器状态]);
  }
`;

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(declaration('编辑器单击处理')).runInContext(context);
  new vm.Script(scenario(seed)).runInContext(context);
  return new vm.Script('({ results, calls })').runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => Loose>(name)(...args);
  const global = (name: string) => ({ get: () => context[name], set: (v: unknown) => { context[name] = v; }, enumerable: true });
  const session = Object.defineProperties({}, { 编辑器状态: global('编辑器状态'), 旧编辑器状态: global('旧编辑器状态'), 编辑器剪贴板: global('编辑器剪贴板') }) as EditorClickSession;
  const ports: EditorClickPorts = {
    scheduleCellEffect: fn('计划显示格子特效'), updateViewport: fn('更新视口'), draw: fn('绘制'), drawMinimap: fn('绘制小地图'), notify: fn('显示通知'),
    saveEditorStateAsync: fn('异步保存编辑器状态'), pasteSelection: fn('编辑器粘贴选区'), applyWrenchRules: fn('应用扳手规则'),
    bucketFill: fn('油漆桶填充'), brushPaint: fn('笔刷绘制'), placeAt: fn('编辑器放置逻辑'),
  };
  context.编辑器单击处理 = (x: number, y: number) => handleEditorClick(state, session, ports, x, y);
  new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  return g<Record<string, unknown>>('with (S) { ({ results, calls }) }');
}

describe('map editor click (编辑器单击处理)', () => {
  it('matches the source over 600 seeded runs', () => {
    const tally: Record<string, number> = {};
    for (let seed = 1; seed <= 600; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) {
        const key = call[0] === 'notify' ? `notify:${String(call[1]).slice(0, 5)}` : String(call[0]);
        tally[key] = (tally[key] ?? 0) + 1;
      }
      for (const entry of source.results as unknown[][]) if (entry?.[0] === 'throw') tally.throw = (tally.throw ?? 0) + 1;
    }
    for (const key of ['effect', 'viewport', 'draw', 'minimap', 'save', 'paste', 'wrench', 'bucket', 'brush', 'place', 'notify:玩家起点必', 'notify:玩家起点已',
      'notify:这里没有可'])
      expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
