import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { enterMapEditor, handleEditorContextMenu, returnToEditorMode, type EditorModePorts, type EditorModeSession } from '../src/game/world/editor-mode';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 5; i++) r();
  const pick = list => list[Math.floor(r() * list.length)];
  class 单元格 { constructor(x, y) { this.x = x; this.y = y; this.类型 = 0; } }
  class Style { constructor(id) { Object.defineProperty(this, 'id', { value: id }); } set display(v) { calls.push(['display', this.id, v]); } get display() { return ''; } }
  class Elem { constructor(id) { this.style = new Style(id); } }
  class ClassList { add(...t) { calls.push(['add', ...t]); } remove(...t) { calls.push(['remove', ...t]); } }
  class Body { constructor() { this.classList = new ClassList(); } }
  const log = name => (...a) => { calls.push([name, ...a]); };
  const handlers = {};
  for (const name of ['处理地图单击', '编辑器鼠标按下处理', '编辑器鼠标移动处理', '编辑器鼠标抬起处理', '编辑器触摸开始处理', '编辑器触摸移动处理', '编辑器触摸结束处理', '编辑器右键处理'])
    if (typeof globalThis[name] !== 'function') globalThis[name] = { [name]: () => {} }[name];
  class Ev { constructor(x, y) { this.clientX = x; this.clientY = y; } preventDefault() { calls.push(['preventDefault']); } }
  Object.assign(globalThis, { 单元格,
    document: new (class { constructor() { this.body = new Body(); } getElementById(id) { calls.push(['byId', id]); return id === '背包搜索栏' && r() < 0.3 ? null : new Elem(id); } })(),
    canvas: new (class { removeEventListener(t, f) { calls.push(['off', t, f.name]); } addEventListener(t, f) { calls.push(['on', t, f.name]); }
      getBoundingClientRect() { calls.push(['rect']); return { left: pick([0, 4]), top: pick([0, 2]) }; } })(),
    隐藏主菜单: log('hideMenu'), 重置所有游戏状态: () => { calls.push(['reset']); 房间列表 = pick([[], [{ id: 3 }, { id: -1 }], [{ id: 1 }]]); 游戏状态 = '主菜单'; },
    初始化canvas: log('initCanvas'), 初始化装备系统: log('initEquip'), 初始化背包事件监听: log('initBackpack'), 初始化编辑器工具栏: log('initToolbar'),
    应用编辑器工具栏模式: log('applyToolbar'), 获取所有可用的定义: log('defs'), 填充编辑器背包: () => calls.push(['fillBackpack', 玩家背包.size]),
    更新视口: () => calls.push(['viewport', 玩家.x, 玩家.y]), 生成怪物引入计划: log('introPlan'), 放置房间: rm => calls.push(['placeRoom', JSON.stringify(rm)]),
    生成墙壁: log('walls'), 绘制小地图: log('minimap'), 动画帧: log('frame'), 保存编辑器状态: log('save'), updateUndoRedoButtons: log('undoRedo'),
    显示通知: log('notify'), 显示编辑器教程: log('tutorial'),
    导入地图: snap => { calls.push(['import', snap]); if (r() < 0.5) 玩家 = { x: 1, y: 1, hp: 3 }; else { 玩家.x = 2; 玩家.y = 3; } },
    位置是否可用: (x, y, f) => { const v = r() < 0.6; calls.push(['available', x, y, f, v]); return v; },
    更新编辑器快速访问栏: log('quickbar'), 绘制: log('draw'), 打开属性编辑器: (cell, x, y) => calls.push(['props', cell && cell.x, cell && cell.y, x, y]),
  });
  for (let session = 0; session < 10; session++) {
    地牢大小 = pick([4, 5, 7]); 已初始化 = pick([0, 1, 2]); 玩家 = { x: Math.floor(r() * 6), y: Math.floor(r() * 6), name: 'p' };
    玩家背包 = new Map([[1, 'a'], [2, 'b']]); 编辑器状态 = { 模式: pick(['传送', '设置起点', '编辑']) }; 临时测试 = pick([true, 1]);
    编辑器状态备份 = pick([null, null, { map: session }, '']); 当前相机X = pick([0, -1, 0.5]); 当前相机Y = pick([0, 2, 0.5]); 单元格大小 = pick([10, 16]);
    const which = pick(['enter', 'return', 'return', 'context', 'context']);
    try {
      if (which === 'enter') 进入地图编辑器();
      else if (which === 'return') 返回编辑器模式();
      else 编辑器右键处理(new Ev(Math.floor(r() * 100) - 10, Math.floor(r() * 100) - 10));
      results.push(['ok', which]);
    } catch (error) { results.push(['throw', which, error.constructor.name]); }
    results.push([游戏状态, 地牢生成方式, 最高教程阶段, 当前层数, 玩家初始位置, 玩家, [...玩家背包], 房间列表, 地牢, 编辑器状态, 编辑器状态备份, 临时测试,
      typeof 编辑器玩家 === 'undefined' ? null : 编辑器玩家]);
  }
`;

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${declaration('进入地图编辑器')}\n${declaration('返回编辑器模式')}\n${declaration('编辑器右键处理')}
    var 地牢 = [], 当前层数 = 0, 玩家初始位置 = { x: 0, y: 0 }, 地牢生成方式 = 'x', 最高教程阶段 = 0, 房间列表 = [], 游戏状态 = '主菜单';`).runInContext(context);
  new vm.Script(scenario(seed)).runInContext(context);
  return new vm.Script('({ results, calls })').runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  Object.assign(state, { 地牢: [], 当前层数: 0, 玩家初始位置: { x: 0, y: 0 }, 地牢生成方式: 'x', 最高教程阶段: 0, 房间列表: [], 游戏状态: '主菜单' });
  const context = vm.createContext({ calls: [], results: [], S: state }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => Loose>(name)(...args);
  const global = (name: string) => ({ get: () => context[name], set: (v: unknown) => { context[name] = v; }, enumerable: true });
  const session = Object.defineProperties({}, { 编辑器状态: global('编辑器状态'), 旧编辑器状态: global('旧编辑器状态'), 编辑器状态备份: global('编辑器状态备份'),
    临时测试: global('临时测试'), 已初始化: global('已初始化'), 编辑器玩家: global('编辑器玩家') }) as EditorModeSession;
  const ports: EditorModePorts = {
    dom: { getElementById: (id) => g<Loose>('document').getElementById(id),
      bodyClassList: { add: (...t) => g<Loose>('document').body.classList.add(...t), remove: (...t) => g<Loose>('document').body.classList.remove(...t) } },
    hideMainMenu: fn('隐藏主菜单'), resetAll: fn('重置所有游戏状态'), createCell: (x, y) => new (g<new (x: number, y: number) => unknown>('单元格'))(x, y),
    initCanvas: fn('初始化canvas'), initEquipment: fn('初始化装备系统'), initBackpackListeners: fn('初始化背包事件监听'), initEditorToolbar: fn('初始化编辑器工具栏'),
    applyEditorToolbarMode: fn('应用编辑器工具栏模式'), collectDefinitions: fn('获取所有可用的定义'), fillEditorBackpack: fn('填充编辑器背包'),
    bindEditorInput: () => {
      const canvas = g<Loose>('canvas');
      canvas.removeEventListener('click', g('处理地图单击'));
      for (const [type, name] of [['mousedown', '编辑器鼠标按下处理'], ['mousemove', '编辑器鼠标移动处理'], ['mouseup', '编辑器鼠标抬起处理'], ['touchstart', '编辑器触摸开始处理'],
        ['touchmove', '编辑器触摸移动处理'], ['touchend', '编辑器触摸结束处理'], ['contextmenu', '编辑器右键处理']] as const) canvas.addEventListener(type, g(name));
    },
    updateViewport: fn('更新视口'), generateMonsterIntroPlan: fn('生成怪物引入计划'), placeRoom: fn('放置房间'), generateWalls: fn('生成墙壁'),
    drawMinimap: fn('绘制小地图'), animationFrame: fn('动画帧'), saveEditorState: fn('保存编辑器状态'), updateUndoRedoButtons: fn('updateUndoRedoButtons'),
    notify: fn('显示通知'), showEditorTutorial: fn('显示编辑器教程'), importMap: fn('导入地图'), isPositionAvailable: fn('位置是否可用'),
    updateEditorQuickBar: fn('更新编辑器快速访问栏'), draw: fn('绘制'), canvasRect: () => g<Loose>('canvas').getBoundingClientRect(),
    view: () => ({ cameraX: g('当前相机X'), cameraY: g('当前相机Y'), cellSize: g('单元格大小') }), openPropertyEditor: fn('打开属性编辑器'),
  };
  context.进入地图编辑器 = () => enterMapEditor(state, session, ports);
  context.返回编辑器模式 = () => returnToEditorMode(state, session, ports);
  context.编辑器右键处理 = function 编辑器右键处理(e: Loose) { handleEditorContextMenu(state, ports, e); };
  new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  return g<Record<string, unknown>>('with (S) { ({ results, calls }) }');
}

describe('map editor mode transitions (进入地图编辑器, 返回编辑器模式, 编辑器右键处理)', () => {
  it('matches the source over 500 seeded runs', () => {
    const tally: Record<string, number> = {};
    for (let seed = 1; seed <= 500; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) tally[String(call[0])] = (tally[String(call[0])] ?? 0) + 1;
    }
    for (const key of ['hideMenu', 'reset', 'initEquip', 'initBackpack', 'frame', 'placeRoom', 'import', 'available', 'quickbar', 'props', 'preventDefault', 'on', 'off'])
      expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
