import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { 单元格类型 } from '../src/game/world/constants';
import { generateDungeonTemplate, type EditorTemplatePorts } from '../src/game/world/editor-template';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 5; i++) r();
  const pick = list => list[Math.floor(r() * list.length)];
  let uid = 0;
  class 物品 { constructor() { this.id = new.target.name + ++uid; this.自定义数据 = new Map([['x', 1]]); } }
  class 寻宝戒指 extends 物品 {} class 隐形虫洞陷阱 extends 物品 {} class 召唤怪物陷阱 extends 物品 {} class 钥匙 extends 物品 {}
  class 神秘商人 extends 物品 { 生成库存(n) { calls.push(['stock', this.id, n]); } }
  class 探险家 extends 物品 { 生成收购需求(n) { calls.push(['demand', this.id, n]); } }
  class 旗帜 extends 物品 { constructor() { super(); calls.push(['flag-new', this.id]); } }
  const kinds = [物品, 寻宝戒指, 隐形虫洞陷阱, 召唤怪物陷阱, 钥匙, 神秘商人, 探险家];
  const build = () => {
    地牢 = Array.from({ length: 地牢大小 }, () => Array.from({ length: 地牢大小 }, () => r() < 0.01 ? null : ({
      类型: pick([null, 1, 2, 5, 6, 6, 7]), 关联物品: r() < 0.5 ? null : new (pick(kinds))() })));
    房间列表 = [0, 1, 2].map(i => ({ id: pick([0, i, i + 5]), 已探索: false }));
  };
  const log = name => (...a) => { calls.push([name, ...a]); };
  Object.assign(globalThis, { 寻宝戒指, 隐形虫洞陷阱, 召唤怪物陷阱, 钥匙, 神秘商人, 探险家, 旗帜,
    prompt: (m, d) => { const v = pick([null, '3', '5', '10', '15', '0', '-1', 'abc', '7x', ' 2', '2.9']); calls.push(['prompt', m, d, v]); return v; },
    confirm: m => { const v = r() < 0.85; calls.push(['confirm', m, v]); return v; },
    显示通知: log('显示通知'), 保存编辑器状态: log('保存编辑器状态'), 重置所有游戏状态: log('重置所有游戏状态'),
    生成迷宫关卡: () => { calls.push(['maze', 当前层数, 游戏状态]); build(); }, 生成法师图书馆: () => { calls.push(['library', 当前层数]); build(); },
    生成最终首领楼层: () => { calls.push(['boss', 当前层数]); build(); },
    生成地牢: async flag => { calls.push(['gen', flag, 当前层数]); await null; build(); if (r() < 0.25) 当前层数 = -2; calls.push(['gen-done']); },
    放置物品到单元格: (item, x, y) => calls.push(['place', item.id, x, y]), 处理房间状态: () => calls.push(['rooms', 游戏状态, 当前层数]),
    更新编辑器快速访问栏: log('quickbar'), 填充编辑器背包: log('backpack'), 绘制小地图: log('minimap'), 更新视口: log('viewport') });
  globalThis.done = (async () => {
    for (let session = 0; session < 6; session++) {
      地牢大小 = pick([3, 4, 5]); 游戏状态 = '地图编辑器'; 当前层数 = -1; build();
      try { results.push(['ok', await generateDungeonTemplate()]); } catch (error) { results.push(['throw', error.constructor.name]); }
      results.push([游戏状态, 当前层数, 地牢, 房间列表]);
    }
  })();
`;

async function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${declaration('单元格类型')}\n${declaration('generateDungeonTemplate')}`).runInContext(context);
  new vm.Script(scenario(seed)).runInContext(context);
  await (context as { done: Promise<void> }).done;
  return new vm.Script('({ results, calls })').runInContext(context) as Record<string, unknown>;
}

async function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state, 单元格类型 }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = <T,>(name: string) => (...args: unknown[]) => g<(...a: unknown[]) => T>(name)(...args);
  const ports: EditorTemplatePorts = {
    prompt: fn('prompt'), confirm: fn('confirm'), notify: fn('显示通知'), saveEditorState: fn('保存编辑器状态'), resetAll: fn('重置所有游戏状态'),
    generateMaze: fn('生成迷宫关卡'), generateLibrary: fn('生成法师图书馆'), generateFinalBoss: fn('生成最终首领楼层'), generateDungeon: fn('生成地牢'),
    isA: (item, name) => item instanceof g<abstract new () => unknown>(name), createFlag: () => new (g<new () => unknown>('旗帜'))(),
    placeItemAtCell: fn('放置物品到单元格'), syncRoomState: fn('处理房间状态'), refreshQuickBar: fn('更新编辑器快速访问栏'),
    fillEditorBackpack: fn('填充编辑器背包'), drawMinimap: fn('绘制小地图'), updateViewport: fn('更新视口'),
  };
  context.generateDungeonTemplate = () => generateDungeonTemplate(state, ports);
  new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  await (context as { done: Promise<void> }).done;
  return g<Record<string, unknown>>('with (S) { ({ results, calls }) }');
}

describe('editor dungeon template (generateDungeonTemplate)', () => {
  it('matches the source over 400 seeded runs', async () => {
    const tally: Record<string, number> = {};
    for (let seed = 1; seed <= 400; seed++) {
      const source = await sourceRun(seed); const mine = await rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) {
        const key = call[0] === '显示通知' ? `notify:${String(call[1]).slice(0, 4)}` : String(call[0]);
        tally[key] = (tally[key] ?? 0) + 1;
      }
      for (const entry of source.results as unknown[][]) if (entry[0] === 'throw') tally.throw = (tally.throw ?? 0) + 1;
    }
    for (const key of ['prompt', 'confirm', 'maze', 'library', 'boss', 'gen', 'gen-done', 'flag-new', 'place', 'stock', 'demand', 'rooms', 'quickbar',
      'viewport', '保存编辑器状态', 'notify:请输入一', 'notify:已生成第', 'throw'])
      expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
