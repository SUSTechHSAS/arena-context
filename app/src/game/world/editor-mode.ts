import type { InteractSession } from './interact';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Map-editor UI globals used by the editor mode transitions. */
export interface EditorModeSession extends InteractSession {
  编辑器状态备份: unknown; // map snapshot taken when test-playing from the editor
  临时测试: unknown;
  已初始化: number;
  编辑器玩家: unknown;
}

export interface EditorModeDom {
  getElementById(id: string): Loose;
  bodyClassList: { add(...tokens: string[]): void; remove(...tokens: string[]): void };
}

export interface EditorModePorts {
  dom: EditorModeDom;
  hideMainMenu(): void; // 隐藏主菜单
  resetAll(): void; // 重置所有游戏状态 (world/reset.ts)
  createCell(x: number, y: number): unknown; // new 单元格(x, y) (world/cell.ts)
  initCanvas(): void; // 初始化canvas
  initEquipment(): void; // 初始化装备系统 (audit t10-menus-inventory-ui-audit)
  initBackpackListeners(): void; // 初始化背包事件监听
  initEditorToolbar(): void; // 初始化编辑器工具栏
  applyEditorToolbarMode(): void; // 应用编辑器工具栏模式
  collectDefinitions(): void; // 获取所有可用的定义 (audit t10-script-facade-audit)
  fillEditorBackpack(): void; // 填充编辑器背包
  /** `canvas.removeEventListener('click', 处理地图单击)` then add the seven editor mouse/touch/contextmenu listeners. */
  bindEditorInput(): void;
  updateViewport(): void; // 更新视口
  generateMonsterIntroPlan(): void; // 生成怪物引入计划 (packet t10-spawn-selection)
  placeRoom(room: unknown): void; // 放置房间 (packet t10-main-room-geometry)
  generateWalls(): void; // 生成墙壁 (packet t10-main-room-geometry)
  drawMinimap(): void; // 绘制小地图
  animationFrame(): void; // 动画帧 (audit t10-main-canvas-audit)
  saveEditorState(): void; // 保存编辑器状态 (packet t10-editor-history)
  updateUndoRedoButtons(): void; // updateUndoRedoButtons
  notify(message: string, type: string): void; // 显示通知
  showEditorTutorial(): void; // 显示编辑器教程
  importMap(snapshot: unknown): void; // 导入地图 (audit t10-editor-ui-import-audit)
  isPositionAvailable(x: number, y: number, flag: false): unknown; // 位置是否可用 (world/placement.ts)
  updateEditorQuickBar(): void; // 更新编辑器快速访问栏
  draw(): void; // 绘制
  canvasRect(): { left: number; top: number }; // canvas.getBoundingClientRect()
  view(): { cameraX: number; cameraY: number; cellSize: number }; // 当前相机X/Y, 单元格大小 (audit t10-minimap-camera-audit)
  openPropertyEditor(cell: unknown, x: number, y: number): void; // 打开属性编辑器 (audit t10-editor-ui-import-audit)
}

/**
 * Source `进入地图编辑器()` (HTML L56612): resets the game into an empty map editor: a blank `地牢大小`² grid, floor -1,
 * player and start at the centre, a 10×10 explored start room (id 0) around it, editor UI/listeners, and an initial
 * editor save.
 */
export function enterMapEditor(state: WorldState, session: EditorModeSession, ports: EditorModePorts): void {
  const S = state as Loose;
  ports.dom.getElementById('全局设置窗口').style.display = 'none';
  S.游戏状态 = '地图编辑器';
  ports.dom.bodyClassList.add('地图编辑器模式');
  ports.dom.bodyClassList.remove('游戏进行中', '编辑器游玩模式');
  ports.hideMainMenu();

  ports.resetAll();

  S.游戏状态 = '地图编辑器';
  S.地牢生成方式 = 'default';
  S.最高教程阶段 = 6;
  ports.dom.bodyClassList.add('地图编辑器模式');

  S.地牢 = Array(S.地牢大小).fill(undefined).map((_: unknown, y: number) =>
    Array(S.地牢大小).fill(undefined).map((__: unknown, x: number) => ports.createCell(x, y)));

  S.当前层数 = -1;
  S.玩家初始位置 = { x: Math.floor(S.地牢大小 / 2), y: Math.floor(S.地牢大小 / 2) };
  S.玩家.x = S.玩家初始位置.x;
  S.玩家.y = S.玩家初始位置.y;

  ports.initCanvas();
  if (session.已初始化 > 0) ports.initEquipment();
  if (session.已初始化 > 0) ports.initBackpackListeners();
  ports.initEditorToolbar();
  ports.applyEditorToolbarMode();

  ports.collectDefinitions();

  S.玩家背包.clear();
  ports.fillEditorBackpack();

  ports.dom.getElementById('dungeonCanvas');
  ports.bindEditorInput();

  ports.updateViewport();
  ports.generateMonsterIntroPlan();
  const size = 10;
  const startX = Math.floor(S.玩家初始位置.x - size / 2);
  const startY = Math.floor(S.玩家初始位置.y - size / 2);
  const room = { x: startX, y: startY, w: size, h: size, id: 0, 名称: '房间_0', 类型: '房间', 已探索: true, 门: [] };
  S.房间列表.push(room);
  S.房间列表.sort((a: Loose, b: Loose) => a.id - b.id);
  ports.placeRoom(room);
  ports.generateWalls();
  ports.drawMinimap();
  if (session.已初始化 > 0) ports.animationFrame();

  ports.saveEditorState();
  ports.updateUndoRedoButtons();
  ports.notify('已进入地图编辑器', '信息');
  ports.showEditorTutorial();
}

/**
 * Source `返回编辑器模式()` (HTML L56981): leave editor test-play. Restores the backed-up map (keeping the test-play
 * player position when it is free there), resets editor mode to 编辑, and rewires the editor UI and inventory.
 */
export function returnToEditorMode(state: WorldState, session: EditorModeSession, ports: EditorModePorts): void {
  const S = state as Loose;
  const searchBar = ports.dom.getElementById('背包搜索栏');
  if (searchBar) searchBar.style.display = 'block';
  S.游戏状态 = '地图编辑器';
  if (session.编辑器状态备份) {
    session.编辑器玩家 = { ...S.玩家 };
    ports.importMap(session.编辑器状态备份);
    if (ports.isPositionAvailable((session.编辑器玩家 as Loose).x, (session.编辑器玩家 as Loose).y, false)) {
      S.玩家.x = (session.编辑器玩家 as Loose).x;
      S.玩家.y = (session.编辑器玩家 as Loose).y;
    }
    ports.updateViewport();
    session.编辑器状态备份 = null;
  }
  session.临时测试 = false;

  (session.编辑器状态 as Loose).模式 = '编辑';
  ports.dom.bodyClassList.add('地图编辑器模式');
  ports.dom.bodyClassList.remove('游戏进行中');
  ports.dom.bodyClassList.remove('编辑器游玩模式');
  ports.dom.getElementById('编辑器工具栏').style.display = 'flex';
  ports.dom.getElementById('返回编辑器按钮').style.display = 'none';
  ports.applyEditorToolbarMode();

  ports.bindEditorInput();

  S.玩家背包.clear();
  ports.fillEditorBackpack();
  ports.updateEditorQuickBar();
  ports.draw();
}

/** Source `编辑器右键处理(e)` (HTML L58160): right-click on the editor canvas opens the property editor for that cell. */
export function handleEditorContextMenu(
  state: WorldState, ports: EditorModePorts, e: { clientX: number; clientY: number; preventDefault(): void },
): void {
  const S = state as Loose;
  e.preventDefault();
  const rect = ports.canvasRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const view = ports.view();
  const gridX = Math.floor(view.cameraX + x / view.cellSize);
  const gridY = Math.floor(view.cameraY + y / view.cellSize);
  if (gridX < 0 || gridX >= S.地牢大小 || gridY < 0 || gridY >= S.地牢大小) return;
  ports.openPropertyEditor(S.地牢[gridY][gridX], gridX, gridY);
}
