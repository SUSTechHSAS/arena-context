import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { handleEditorCanvasEvent, type EditorCanvasPorts, type EditorCanvasSession } from '../src/game/world/editor-canvas';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 5; i++) r();
  const pick = list => list[Math.floor(r() * list.length)];
  const N = 6; let uid = 0; let clock = 10000; let perf = 500; let rafId = 0; const frames = [];
  class 怪物 { constructor() { this.id = 'm' + ++uid; this.类型 = pick(['史莱姆', '骷髅']); this.掉落物 = null; } }
  class 物品 { constructor() { this.id = 'i' + ++uid; this.名称 = pick(['药水', '药水', '箭']); this.堆叠数量 = Math.floor(r() * 5); this.最大堆叠数量 = pick([1, 5, 9]); }
    可堆叠于(other) { calls.push(['stackable?', this.id, other.id]); return this.名称 === other.名称; } }
  class Plain {}
  Date.now = () => clock;
  const log = name => (...a) => { calls.push([name, ...a.map(v => v && v.id ? v.id : v)]); };
  class Elem { constructor(display, cls) { this.style = { display }; Object.defineProperty(this, 'cls', { value: cls }); } }
  Elem.prototype.classList = null;
  class Classes { constructor(v) { Object.defineProperty(this, 'v', { value: v }); } contains(c) { calls.push(['contains', c]); return this.v; } }
  class Target { closest(sel) { const v = r() < 0.06; calls.push(['closest', sel, v]); return v ? {} : null; } }
  class Ev { constructor(buttons, touches) { this.buttons = buttons; this.touches = touches; this.target = new Target(); } preventDefault() { calls.push(['preventDefault']); } }
  Object.assign(globalThis, { 怪物, 物品,
    performance: new (class { now() { return perf; } })(),
    requestAnimationFrame: cb => { const id = ++rafId; calls.push(['raf', id]); frames.push([id, cb]); return id; },
    cancelAnimationFrame: id => { calls.push(['cancel', id]); const k = frames.findIndex(f => f[0] === id); if (k >= 0) frames.splice(k, 1); },
    document: new (class { getElementById(id) { calls.push(['byId', id]); if (r() < 0.7) return null;
      const e = { style: { display: pick(['none', 'block', '']) }, classList: new Classes(r() < 0.3) }; return e; } })(),
    canvas: new (class { getBoundingClientRect() { calls.push(['rect']); return { left: pick([0, 5]), top: pick([0, 3]) }; } })(),
    放置怪物到单元格: (m, x, y) => { calls.push(['placeMonster', m.id, x, y]); const c = 地牢[y]?.[x]; if (c) c.关联怪物 = m; return true; },
    放置物品到单元格: (i, x, y) => { calls.push(['placeItem', i.id, x, y]); const c = 地牢[y]?.[x]; if (c) c.关联物品 = i; return true; },
    位置是否可用: (x, y, a, b) => { const v = r() < 0.6; calls.push(['available', x, y, a, b, v]); return v; },
    更新视口: log('viewport'), 绘制小地图: log('minimap'), 绘制: log('draw'), 异步保存编辑器状态: log('save'), 笔刷绘制: log('brush'),
    编辑器放置逻辑: log('placeAt'), 编辑器复制选区: log('copy'), 更新所有门朝向: log('doors'), 生成墙壁: log('walls'), 创建并放置房间: log('room'),
    应用扳手规则: log('wrench'), 显示通知: log('notify'), 重置单元格: log('resetCell'), 克隆物品编辑器: i => { calls.push(['clone', i.id]); return { cloneOf: i.id }; },
    编辑器单击处理: log('click'),
  });
  地牢大小 = N;
  地牢 = Array.from({ length: N }, () => Array.from({ length: N }, () => {
    const k = r() * 0.8; const cell = { 类型: pick([1, 5, 8, 2]), 背景类型: 1, 环境: null, 关联怪物: null, 关联物品: null };
    if (k < 0.05) { cell.关联怪物 = new 怪物(); cell.关联物品 = new 物品(); } else if (k < 0.2) cell.关联怪物 = new 怪物(); else if (k < 0.5) cell.关联物品 = new 物品(); else if (k < 0.52) cell.关联物品 = new Plain();
    return cell; }));
  所有怪物 = 地牢.flat().map(c => c.关联怪物).filter(Boolean);
  玩家 = { x: 2, y: 2 }; 游戏设置 = { 移动速度: pick([100, 250]) }; 扳手规则集 = { '1': ['r'], '2': [], '3': null }; 当前扳手快捷槽 = '1';
  编辑器状态 = { 模式: '编辑', 当前选中: null, 笔刷模式: '笔刷' }; 编辑器剪贴板 = null; 玩家动画状态 = { 正在动画: false };
  const choices = [null, null, { 名称: '手形/编辑' }, { 名称: '房间工具' }, { 名称: '扳手' }, { 名称: '复制工具' }, { 类型: '背景', 绘制类型: 0 }, { 类型: '背景', 绘制类型: 0 },
    { 类型: '背景', 绘制类型: 1 }, { 类型: '背景', 绘制类型: 2, 绘制环境: '水' }, { 名称: '墙', 类型: '物品' }];
  let lastX = 30, lastY = 30, prev = 'end';
  for (let step = 0; step < 40; step++) {
    if (r() < 0.1) 编辑器状态.当前选中 = pick(choices);
    if (r() < 0.1) 编辑器状态.笔刷模式 = pick(['笔刷', '单个', '油漆桶']);
    if (r() < 0.05) 编辑器剪贴板 = pick([null, { a: 1 }]);
    if (r() < 0.05) 当前扳手快捷槽 = pick(['1', '2', '3']);
    游戏状态 = r() < 0.04 ? '游戏中' : '地图编辑器';
    if (step === 0 || r() < 0.2) { 当前相机X = pick([0, 0, -1, 0.5]); 当前相机Y = pick([0, 0, 1, 0.5]); 单元格大小 = pick([10, 16]); }
    const onPlayer = r() < 0.12; const reuse = r() < 0.5;
    const cx = onPlayer ? (玩家.x - 当前相机X) * 单元格大小 + 2 : reuse ? lastX + pick([0, 0, 单元格大小, -单元格大小, 6]) : Math.floor(r() * (N * 单元格大小 + 30)) - 15 + pick([0, 5, 3]);
    const cy = onPlayer ? (玩家.y - 当前相机Y) * 单元格大小 + 2 : reuse ? lastY + pick([0, 0, 单元格大小, -单元格大小]) : Math.floor(r() * (N * 单元格大小 + 30)) - 15;
    lastX = cx; lastY = cy;
    const type = prev === 'end' ? pick(['start', 'start', 'start', 'move', 'end']) : prev === 'start' ? pick(['move', 'move', 'end']) : pick(['move', 'end', 'end', 'start']);
    prev = type;
    clock += pick([30, 30, 120, 250, 300, 600]);
    try { results.push(['ok', 编辑器画布事件处理(cx, cy, type, new Ev(pick([0, 1, 1, 2]), r() < 0.1 ? [1] : undefined))]); }
    catch (error) { results.push(['throw', error.constructor.name]); }
    let n = Math.floor(r() * 3);
    while (n-- > 0 && frames.length) { perf += pick([8, 16, 40, 120]); clock += 16; const [, cb] = frames.shift(); cb(perf); }
    results.push([JSON.stringify(编辑器状态, (k, v) => (v && v.id ? v.id : v)), 玩家, 玩家动画状态]);
  }
  results.push([地牢, 所有怪物]);
`;

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${declaration('单元格类型')}\n${declaration('编辑器画布事件处理')}`).runInContext(context);
  new vm.Script(scenario(seed)).runInContext(context);
  return new vm.Script('({ results, calls })').runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => Loose>(name)(...args);
  const global = (name: string) => ({ get: () => context[name], set: (v: unknown) => { context[name] = v; }, enumerable: true });
  const session = Object.defineProperties({}, { 编辑器状态: global('编辑器状态'), 旧编辑器状态: global('旧编辑器状态'), 编辑器剪贴板: global('编辑器剪贴板'),
    玩家动画状态: global('玩家动画状态') }) as EditorCanvasSession;
  const ports: EditorCanvasPorts = {
    getElementById: (id) => g<Loose>('document').getElementById(id), canvasRect: () => g<Loose>('canvas').getBoundingClientRect(),
    view: () => ({ cameraX: g('当前相机X'), cameraY: g('当前相机Y'), cellSize: g('单元格大小') }),
    now: () => g<DateConstructor>('Date').now(), performanceNow: () => g<Loose>('performance').now(),
    requestAnimationFrame: fn('requestAnimationFrame'), cancelAnimationFrame: fn('cancelAnimationFrame'),
    isMonster: (e) => e instanceof g<abstract new () => unknown>('怪物'), isItem: (e) => e instanceof g<abstract new () => unknown>('物品'),
    placeMonsterAtCell: fn('放置怪物到单元格'), placeItemAtCell: fn('放置物品到单元格'), isPositionAvailable: fn('位置是否可用'),
    updateViewport: fn('更新视口'), drawMinimap: fn('绘制小地图'), draw: fn('绘制'), saveEditorStateAsync: fn('异步保存编辑器状态'),
    brushPaint: fn('笔刷绘制'), placeAt: fn('编辑器放置逻辑'), copySelection: fn('编辑器复制选区'), updateAllDoorOrientations: fn('更新所有门朝向'),
    generateWalls: fn('生成墙壁'), createRoom: fn('创建并放置房间'), applyWrenchRules: fn('应用扳手规则'), notify: fn('显示通知'),
    resetCell: fn('重置单元格'), cloneItemForEditor: fn('克隆物品编辑器'), editorClick: fn('编辑器单击处理'),
  };
  context.编辑器画布事件处理 = (x: number, y: number, type: string, ev: Loose) => handleEditorCanvasEvent(state, session, ports, x, y, type, ev);
  new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  return g<Record<string, unknown>>('with (S) { ({ results, calls }) }');
}

describe('map editor canvas pointer events (编辑器画布事件处理)', () => {
  it('matches the source over 800 seeded runs', () => {
    const tally: Record<string, number> = {};
    for (let seed = 1; seed <= 800; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) {
        const key = call[0] === 'notify' ? `notify:${String(call[1]).slice(0, 3)}` : String(call[0]);
        tally[key] = (tally[key] ?? 0) + 1;
      }
      for (const entry of source.results as unknown[][]) if (entry?.[0] === 'throw') tally.throw = (tally.throw ?? 0) + 1;
    }
    for (const key of ['closest', 'cancel', 'raf', 'rect', 'placeMonster', 'placeItem', 'available', 'viewport', 'minimap', 'save', 'brush', 'placeAt',
      'copy', 'doors', 'walls', 'room', 'wrench', 'resetCell', 'clone', 'click', 'stackable?', 'notify:当前快', 'notify:已对 ', 'notify:合并了',
      'notify:已将 ', 'notify:目标位'])
      expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 300_000);
});
