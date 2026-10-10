import { 单元格类型 } from './constants';
import type { MoveSession } from './move';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Page-level click/UI globals that are runtime state, not saved world state. */
export interface ClickSession {
  待放置物品ID: unknown;
  /** One-shot item targeting callback installed by item use (e.g. aiming); takes over the click. */
  物品点击监听器: ((clientX: number, clientY: number) => unknown) | null;
  界面可见性: { 背包: unknown } & Record<string, unknown>;
  教程提示已显示: unknown;
}

export const createClickSession = (): ClickSession => ({ 待放置物品ID: null, 物品点击监听器: null, 界面可见性: { 背包: false }, 教程提示已显示: false });

export interface ClickPorts {
  canvasRect(): { left: number; top: number }; // canvas.getBoundingClientRect()
  view(): { offsetX: number; offsetY: number; cellSize: number }; // 视口偏移X/Y, 单元格大小
  isOnline(): unknown; // 联机模式
  emit(event: string, payload: unknown): void; // socket.emit
  toggleBackpack(): void; // 切换背包显示
  hideFloatingTip(): void; // #浮动提示框 display none
  closeTutorialTip(): void; // 关闭教程提示
  settingsMenuOpen(): boolean; // #设置菜单 has class 显示
  toggleSettingsMenu(): void; // 切换设置菜单
  tutorialReplayOpen(): boolean; // #教程回放窗口 display === 'block'
  closeTutorialReplay(): void; // 关闭教程回放窗口
  isPositionAvailable(x: number, y: number): unknown; // 位置是否可用 (world/placement.ts)
  createPlacedObstacle(): unknown; // new 已放置的障碍物({}) (packet t10-obstacles-obsidian)
  placeItemAtCell(item: unknown, x: number, y: number): unknown; // 放置物品到单元格 (world/placement.ts)
  isPortableObstacle(item: unknown): boolean; // instanceof 便携障碍物 (packet t10-obstacles-obsidian)
  destroyItem(id: unknown, silent: true): void; // 处理销毁物品 (audit t10-inventory-actions-audit)
  updateBackpackDisplay(): void; // 更新背包显示
  updateEquipmentDisplay(): void; // 更新装备显示
  notify(message: string, type: string): void; // 显示通知
  findPath(sx: number, sy: number, tx: number, ty: number, maxSteps: number, a: boolean, b: boolean, c: boolean, d: boolean): Iterable<{ x: number; y: number }>; // 广度优先搜索路径 (packet t10-path-search)
  startAutoMove(): void; // startAutoMove (audit t10-input-hud-audit)
}

/**
 * Source `处理点击(clientX, clientY)` (HTML L9717): canvas click. In order: online obstacle placement (sends the action
 * to the server), state gate, item targeting listener, closing an open backpack / tutorial tip / settings menu /
 * tutorial replay, local obstacle placement (consumes one portable obstacle), and otherwise click-to-move: a BFS path
 * of at most 50 steps, cut just after the first step into an unvisited room, minus the start cell.
 */
export function handleCanvasClick(
  state: WorldState, session: ClickSession, move: Pick<MoveSession, 'moveQueue'>, ports: ClickPorts, clientX: number, clientY: number,
): void {
  const S = state as Loose;
  if (S.玩家正在放置障碍物 && session.待放置物品ID && ports.isOnline()) {
    const rect = ports.canvasRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const view = ports.view();
    const gridX = Math.floor(view.offsetX + x / view.cellSize);
    const gridY = Math.floor(view.offsetY + y / view.cellSize);
    ports.emit('playerAction', { type: 'placeItemAction', id: session.待放置物品ID, x: gridX, y: gridY });
    S.玩家正在放置障碍物 = false;
    session.待放置物品ID = null;
    return;
  }
  if (S.游戏状态 !== '游戏中' && S.游戏状态 !== '图鉴' && S.游戏状态 !== '地图编辑器' && S.游戏状态 !== '编辑器游玩') return;

  if (session.物品点击监听器) {
    session.物品点击监听器(clientX, clientY);
    return;
  }

  if (session.界面可见性.背包) {
    ports.toggleBackpack();
    ports.hideFloatingTip();
    return;
  } else if (session.教程提示已显示) {
    ports.closeTutorialTip();
    return;
  } else if (ports.settingsMenuOpen()) {
    ports.toggleSettingsMenu();
    return;
  } else if (ports.tutorialReplayOpen()) {
    ports.closeTutorialReplay();
    return;
  }

  if (S.玩家正在放置障碍物) {
    const rect = ports.canvasRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const view = ports.view();
    const gridX = view.offsetX + Math.floor(x / view.cellSize);
    const gridY = view.offsetY + Math.floor(y / view.cellSize);
    if (ports.isPositionAvailable(gridX, gridY)) {
      const obstacle = ports.createPlacedObstacle();
      if (ports.placeItemAtCell(obstacle, gridX, gridY)) {
        ports.notify('成功放置障碍物！', '成功');
        const source = [...S.玩家背包.values()].find((i: unknown) => ports.isPortableObstacle(i));
        if (source) {
          source.堆叠数量--;
          if (source.堆叠数量 <= 0) ports.destroyItem(source.唯一标识, true);
          ports.updateBackpackDisplay();
          ports.updateEquipmentDisplay();
        }
      } else {
        ports.notify('无法在此处放置障碍物！', '错误');
      }
    } else {
      ports.notify('无法在此处放置障碍物！', '错误');
    }
    S.玩家正在放置障碍物 = false;
    return;
  }
  if (S.游戏状态 === '地图编辑器') return;
  if (S.游戏设置.禁用点击移动) return;
  const rect = ports.canvasRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const view = ports.view();
  const gridX = view.offsetX + Math.floor(x / view.cellSize);
  const gridY = view.offsetY + Math.floor(y / view.cellSize);

  const target = S.地牢[gridY]?.[gridX];
  const isStairs = target && (target.类型 === 单元格类型.楼梯下楼 || target.类型 === 单元格类型.楼梯上楼);

  const fullPath = ports.findPath(S.玩家.x, S.玩家.y, gridX, gridY, 50, true, false, false, !isStairs);
  const cut: { x: number; y: number }[] = [];
  for (const node of fullPath) {
    const roomId = S.房间地图[node.y][node.x];
    if (roomId !== -1 && !S.已访问房间.has(roomId)) {
      cut.push(node);
      break;
    }
    cut.push(node);
  }
  cut.shift();
  if (cut.length > 0) {
    move.moveQueue = cut;
    ports.startAutoMove();
  }
}
