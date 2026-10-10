import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorldState } from '../src/game/world/state';
import { handleCanvasClick, type ClickPorts, type ClickSession } from '../src/game/world/click';
import { declaration } from './oracle/source';
import { graphSnapshot } from './oracle/graph';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const snap = (value: unknown) => JSON.stringify(graphSnapshot(value));

const scenario = (seed: number) => `
  let s = ${seed}; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 5; i++) r();
  const pick = list => list[Math.floor(r() * list.length)];
  const N = 6; let uid = 0;
  class 物品 { constructor(n) { this.唯一标识 = 'id' + ++uid; this.堆叠数量 = n; } }
  class 便携障碍物 extends 物品 {} class 已放置的障碍物 extends 物品 { constructor(o) { super(0); calls.push(['new-obstacle', JSON.stringify(o)]); } }
  class Classes { constructor(open) { Object.defineProperty(this, 'open', { value: open }); } contains(c) { calls.push(['contains', c]); return this.open; } }
  Object.assign(globalThis, { 便携障碍物, 已放置的障碍物,
    canvas: new (class { getBoundingClientRect() { calls.push(['rect']); return { left: pick([0, 10.5]), top: pick([0, 7]) }; } })(),
    socket: new (class { emit(e, p) { calls.push(['emit', e, p]); } })(),
    document: new (class { getElementById(id) { calls.push(['byId', id]);
      return { classList: new Classes(r() < 0.1), style: { set display(v) { calls.push(['display', id, v]); }, get display() { return r() < 0.1 ? 'block' : 'none'; } } }; } })(),
    切换背包显示: () => calls.push(['toggle-backpack']), 关闭教程提示: () => calls.push(['close-tip']), 切换设置菜单: () => calls.push(['toggle-settings']),
    关闭教程回放窗口: () => calls.push(['close-replay']),
    位置是否可用: (x, y) => { const v = r() < 0.7; calls.push(['available', x, y, v]); return v; },
    放置物品到单元格: (item, x, y) => { const v = r() < 0.8; calls.push(['place', item.constructor.name, x, y, v]); return v; },
    处理销毁物品: (id, flag) => { calls.push(['destroy', id, flag]); for (const [k, v] of 玩家背包) if (v.唯一标识 === id) 玩家背包.delete(k); },
    更新背包显示: () => calls.push(['backpack-ui']), 更新装备显示: () => calls.push(['equip-ui']), 显示通知: (m, t) => calls.push(['notify', m, t]),
    广度优先搜索路径: (...a) => { calls.push(['bfs', ...a]);
      const len = Math.floor(r() * 9); const path = [{ x: 玩家.x, y: 玩家.y }];
      for (let i = 1; i < len; i++) path.push(r() < 0.02 ? { x: 2, y: 9 } : { x: Math.floor(r() * N), y: Math.floor(r() * N) });
      return len ? path : []; },
    startAutoMove: () => calls.push(['auto', JSON.stringify(moveQueue)]),
  });
  地牢 = Array.from({ length: N }, () => Array.from({ length: N }, () => ({ 类型: pick([1, 1, 6, 7, 2]) })));
  房间地图 = Array.from({ length: N }, () => Array.from({ length: N }, () => pick([-1, -1, 0, 1, 2, 3])));
  moveQueue = [];
  for (let click = 0; click < 14; click++) {
    游戏状态 = pick(['游戏中', '游戏中', '游戏中', '图鉴', '地图编辑器', '编辑器游玩', '主菜单']);
    玩家正在放置障碍物 = r() < 0.3; 待放置物品ID = pick([null, null, 'p1', 0]); 联机模式 = r() < 0.3;
    物品点击监听器 = r() < 0.1 ? (x, y) => calls.push(['listener', x, y]) : null;
    界面可见性 = { 背包: r() < 0.1 }; 教程提示已显示 = r() < 0.08; 游戏设置 = { 禁用点击移动: r() < 0.1 };
    视口偏移X = pick([0, 1, 2, 0.5]); 视口偏移Y = pick([0, 1, 2, 1.5]); 单元格大小 = pick([10, 16, 16, 0]);
    玩家 = { x: Math.floor(r() * N), y: Math.floor(r() * N) };
    已访问房间 = new Set([0, 1, 2, 3].filter(() => r() < 0.5));
    if (click % 5 === 0) 玩家背包 = new Map([1, 2, 3].map(i => [Symbol.for('k' + i), new (pick([物品, 便携障碍物]))(Math.floor(r() * 3) + 1)]));
    try { results.push(['ok', 处理点击(Math.floor(r() * 120) - 10, Math.floor(r() * 120) - 10)]); } catch (error) { results.push(['throw', error.constructor.name]); }
    results.push([玩家正在放置障碍物, 待放置物品ID, moveQueue, [...玩家背包.values()]]);
  }
`;

function sourceRun(seed: number) {
  const context = vm.createContext({ calls: [], results: [] });
  new vm.Script(`${declaration('单元格类型')}\n${declaration('处理点击')}\nvar 玩家背包 = new Map();`).runInContext(context);
  new vm.Script(scenario(seed)).runInContext(context);
  return new vm.Script('({ results, calls })').runInContext(context) as Record<string, unknown>;
}

function rewriteRun(seed: number) {
  const state = createWorldState();
  const context = vm.createContext({ calls: [], results: [], S: state }) as Record<string, unknown>;
  const g = <T,>(name: string) => new vm.Script(name).runInContext(context) as T;
  const fn = (name: string) => (...args: unknown[]) => g<(...a: unknown[]) => Loose>(name)(...args);
  const global = (name: string) => ({ get: () => context[name], set: (v: unknown) => { context[name] = v; }, enumerable: true });
  const session = Object.defineProperties({}, { 待放置物品ID: global('待放置物品ID'), 物品点击监听器: global('物品点击监听器'),
    界面可见性: global('界面可见性'), 教程提示已显示: global('教程提示已显示') }) as ClickSession;
  const move = Object.defineProperties({}, { moveQueue: global('moveQueue') }) as { moveQueue: unknown[] };
  const ports: ClickPorts = {
    canvasRect: () => g<Loose>('canvas').getBoundingClientRect(),
    view: () => ({ offsetX: g('视口偏移X'), offsetY: g('视口偏移Y'), cellSize: g('单元格大小') }),
    isOnline: () => g('联机模式'), emit: (e, p) => g<Loose>('socket').emit(e, p),
    toggleBackpack: fn('切换背包显示'), hideFloatingTip: () => { g<Loose>('document').getElementById('浮动提示框').style.display = 'none'; },
    closeTutorialTip: fn('关闭教程提示'), settingsMenuOpen: () => g<Loose>('document').getElementById('设置菜单').classList.contains('显示'),
    toggleSettingsMenu: fn('切换设置菜单'), tutorialReplayOpen: () => g<Loose>('document').getElementById('教程回放窗口').style.display === 'block',
    closeTutorialReplay: fn('关闭教程回放窗口'), isPositionAvailable: fn('位置是否可用'),
    createPlacedObstacle: () => new (g<new (o: unknown) => unknown>('已放置的障碍物'))({}), placeItemAtCell: fn('放置物品到单元格'),
    isPortableObstacle: (item) => item instanceof g<abstract new () => unknown>('便携障碍物'), destroyItem: fn('处理销毁物品'),
    updateBackpackDisplay: fn('更新背包显示'), updateEquipmentDisplay: fn('更新装备显示'), notify: fn('显示通知'),
    findPath: fn('广度优先搜索路径'), startAutoMove: fn('startAutoMove'),
  };
  context.处理点击 = (x: number, y: number) => handleCanvasClick(state, session, move, ports, x, y);
  new vm.Script(`with (S) { ${scenario(seed)} }`).runInContext(context);
  return g<Record<string, unknown>>('with (S) { ({ results, calls }) }');
}

describe('canvas click (处理点击)', () => {
  it('matches the source over 600 seeded runs', () => {
    const tally: Record<string, number> = {};
    for (let seed = 1; seed <= 600; seed++) {
      const source = sourceRun(seed); const mine = rewriteRun(seed);
      expect(snap(mine), `seed ${seed}`).toBe(snap(source));
      for (const call of source.calls as unknown[][]) {
        const key = call[0] === 'notify' ? `notify:${String(call[1]).slice(0, 2)}` : call[0] === 'place' ? `place:${String(call[4])}` : String(call[0]);
        tally[key] = (tally[key] ?? 0) + 1;
      }
      for (const entry of source.results as unknown[][]) if (entry?.[0] === 'throw') tally.throw = (tally.throw ?? 0) + 1;
    }
    for (const key of ['emit', 'listener', 'toggle-backpack', 'display', 'close-tip', 'toggle-settings', 'close-replay', 'available', 'new-obstacle',
      'place:true', 'place:false', 'notify:成功', 'notify:无法', 'destroy', 'backpack-ui', 'equip-ui', 'bfs', 'auto', 'throw'])
      expect(tally[key] ?? 0, key).toBeGreaterThan(5);
  }, 120_000);
});
