import { 单元格类型 } from './constants';
import type { EditorClickSession } from './editor-click';
import type { MoveSession } from './move';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Map-editor UI globals used by `编辑器画布事件处理`. */
export type EditorCanvasSession = EditorClickSession & Pick<MoveSession, '玩家动画状态'>;

export interface EditorCanvasEvent {
  buttons?: number;
  touches?: unknown;
  target: { closest(selector: string): unknown };
  preventDefault(): void;
}

export interface EditorCanvasPorts {
  getElementById(id: string): Loose; // document.getElementById (overlay hit test)
  canvasRect(): { left: number; top: number }; // canvas.getBoundingClientRect()
  view(): { cameraX: number; cameraY: number; cellSize: number }; // 当前相机X/Y, 单元格大小 (audit t10-minimap-camera-audit)
  now(): number; // Date.now
  performanceNow(): number; // performance.now
  requestAnimationFrame(callback: (t: number) => void): unknown;
  cancelAnimationFrame(handle: unknown): void;
  isMonster(entity: unknown): boolean; // instanceof 怪物
  isItem(entity: unknown): boolean; // instanceof 物品
  placeMonsterAtCell(monster: unknown, x: number, y: number): unknown; // 放置怪物到单元格 (world/placement.ts)
  placeItemAtCell(item: unknown, x: number, y: number): unknown; // 放置物品到单元格 (world/placement.ts)
  isPositionAvailable(x: number, y: number, a: false, b: true): unknown; // 位置是否可用 (world/placement.ts)
  updateViewport(): void; // 更新视口
  drawMinimap(): void; // 绘制小地图
  draw(): void; // 绘制
  saveEditorStateAsync(): void; // 异步保存编辑器状态
  brushPaint(x: number, y: number): void; // 笔刷绘制 (audit t10-editor-tools-audit)
  placeAt(x: number, y: number): void; // 编辑器放置逻辑 (audit t10-editor-tools-audit)
  copySelection(x1: number, y1: number, x2: number, y2: number): void; // 编辑器复制选区 (audit t10-editor-tools-audit)
  updateAllDoorOrientations(): void; // 更新所有门朝向 (audit t10-editor-tools-audit)
  generateWalls(): void; // 生成墙壁 (packet t10-main-room-geometry)
  createRoom(x1: number, y1: number, x2: number, y2: number): void; // 创建并放置房间 (audit t10-editor-tools-audit)
  applyWrenchRules(entity: unknown, rules: unknown): void; // 应用扳手规则 (world/wrench.ts)
  notify(message: string, type: string): void; // 显示通知
  resetCell(x: number, y: number, flag: false): void; // 重置单元格 (audit t10-editor-ui-import-audit)
  cloneItemForEditor(item: unknown): unknown; // 克隆物品编辑器 (audit t10-editor-tools-audit)
  editorClick(x: number, y: number): void; // 编辑器单击处理 (world/editor-click.ts)
}

const OVERLAYS = ['编辑器属性面板遮罩', '背包弹窗', '编辑器工具栏', '笔刷工具容器', '扳手工具菜单', '全局设置窗口'];

/**
 * Source `编辑器画布事件处理(clientX, clientY, eventType, originalEvent)` (HTML L58411): pointer start/move/end on the
 * map-editor canvas. Covers overlay pass-through, out-of-map cancellation (dragged entities return to their start cell),
 * double-tap area selection for single backgrounds, room/wrench/copy area selection, a rAF-driven constant-speed player
 * drag, entity drag-and-drop with stack merging and "set as drop" on monsters, brush/placement painting while moving,
 * area wrench and background fills on release, and single clicks forwarded to `编辑器单击处理`.
 */
export function handleEditorCanvasEvent(
  state: WorldState, session: EditorCanvasSession, ports: EditorCanvasPorts,
  clientX: number, clientY: number, eventType: string, originalEvent: EditorCanvasEvent,
): void {
  const S = state as Loose;
  if (S.游戏状态 !== '地图编辑器') return;
  if (originalEvent.buttons === 2 && eventType !== 'end') return;
  const E = session.编辑器状态 as Loose;

  if (OVERLAYS.some((id) => {
    const elem = ports.getElementById(id);
    return elem && (elem.style.display !== 'none' || elem.classList.contains('显示')) && originalEvent.target.closest(`#${id}`);
  })) {
    if (eventType === 'start' || eventType === 'move') {
      E.正在拖拽 = false;
      E.正在划区 = false;
      E.正在复制选区 = false;
      E.正在拖拽玩家 = false;
      if (E.玩家拖拽RAF) {
        ports.cancelAnimationFrame(E.玩家拖拽RAF);
        E.玩家拖拽RAF = 0;
      }
    }
    return;
  }
  originalEvent.preventDefault();

  const rect = ports.canvasRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const view = ports.view();
  const gridX = Math.floor(view.cameraX + x / view.cellSize);
  const gridY = Math.floor(view.cameraY + y / view.cellSize);

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const LEN = (dx: number, dy: number) => Math.hypot(dx, dy);
  const DOUBLE_CLICK_TIME = 300;
  const now = ports.now();

  const speedFromPx = (distPx: number) => {
    if (distPx < 6) return 0;
    return Math.min((50 * ports.view().cellSize) / S.游戏设置.移动速度, distPx / 5);
  };

  const startOrKeepPlayerLoop = (): void => {
    if (E.玩家拖拽RAF) return;
    E.玩家拖拽世界坐标F = { x: S.玩家.x, y: S.玩家.y };
    let last = ports.performanceNow();

    const step = (t: number): void => {
      if (!E.正在拖拽玩家) {
        E.玩家拖拽RAF = 0;
        return;
      }
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;

      const startPx = E.玩家拖拽起始屏幕坐标;
      const curPx = E.玩家拖拽当前屏幕坐标 || startPx;
      const ddx = curPx.x - startPx.x;
      const ddy = curPx.y - startPx.y;
      const dlen = LEN(ddx, ddy);
      let dirx = 0;
      let diry = 0;
      if (dlen > 0) {
        dirx = ddx / dlen;
        diry = ddy / dlen;
      }
      E.玩家拖拽方向.x = dirx;
      E.玩家拖拽方向.y = diry;

      const speed = E.玩家拖拽速度CPS;
      const vx = dirx * speed;
      const vy = diry * speed;

      E.玩家拖拽世界坐标F.x = clamp(E.玩家拖拽世界坐标F.x + vx * dt, 0, S.地牢大小 - 1);
      E.玩家拖拽世界坐标F.y = clamp(E.玩家拖拽世界坐标F.y + vy * dt, 0, S.地牢大小 - 1);

      const nx = Math.round(E.玩家拖拽世界坐标F.x);
      const ny = Math.round(E.玩家拖拽世界坐标F.y);

      if (nx !== S.玩家.x || ny !== S.玩家.y) {
        session.玩家动画状态 = {
          正在动画: true, 旧逻辑X: S.玩家.x, 旧逻辑Y: S.玩家.y, 目标逻辑X: nx, 目标逻辑Y: ny, 视觉X: S.玩家.x, 视觉Y: S.玩家.y,
          动画开始时间: ports.now(),
        };
        S.玩家.x = nx;
        S.玩家.y = ny;
        ports.updateViewport();
        ports.drawMinimap();
        ports.draw();
      }

      E.玩家拖拽RAF = ports.requestAnimationFrame(step);
    };
    E.玩家拖拽RAF = ports.requestAnimationFrame(step);
  };

  const returnToStart = (entity: unknown, start: { x: number; y: number }) => {
    if (ports.isMonster(entity)) ports.placeMonsterAtCell(entity, start.x, start.y);
    else if (ports.isItem(entity)) ports.placeItemAtCell(entity, start.x, start.y);
  };

  if (!E.正在拖拽玩家 && (gridX < 0 || gridX >= S.地牢大小 || gridY < 0 || gridY >= S.地牢大小)) {
    if (E.正在拖拽) {
      const dragged = E.拖拽对象;
      const start = E.拖拽起始坐标;
      if (dragged && start) returnToStart(dragged, start);
    }
    E.正在拖拽 = false;
    E.拖拽对象 = null;
    E.正在拖拽玩家 = false;
    if (E.玩家拖拽RAF) {
      ports.cancelAnimationFrame(E.玩家拖拽RAF);
      E.玩家拖拽RAF = 0;
    }
    ports.draw();
    return;
  }

  if (eventType === 'start') {
    if (now - (E.上次点击时间 || 0) < DOUBLE_CLICK_TIME &&
      E.上次点击格子?.x === gridX && E.上次点击格子?.y === gridY &&
      E.当前选中?.类型 === '背景' &&
      E.笔刷模式 === '单个') {
      E.正在划区 = true;
      E.划区起点 = { x: gridX, y: gridY };
      originalEvent.preventDefault();
      return;
    }

    if (E.当前选中?.名称 === '房间工具' || E.当前选中?.名称 === '扳手') {
      E.正在划区 = true;
      E.划区起点 = { x: gridX, y: gridY };
      S.玩家.x = gridX;
      S.玩家.y = gridY;
      return;
    }

    E.拖拽起始坐标 = { x: gridX, y: gridY };
    const cell = S.地牢[gridY]?.[gridX];

    if (gridX === S.玩家.x && gridY === S.玩家.y && E.当前选中?.名称 == null) {
      E.正在拖拽玩家 = true;
      E.玩家拖拽起始屏幕坐标 = { x: clientX, y: clientY };
      E.玩家拖拽当前屏幕坐标 = { x: clientX, y: clientY };
      E.玩家拖拽速度已锁定 = false;
      E.玩家拖拽速度CPS = 0;
      E.玩家拖拽方向 = { x: 0, y: 0 };
      startOrKeepPlayerLoop();
      return;
    }

    const dragTarget = cell?.关联怪物 || cell?.关联物品;

    if (E.当前选中?.名称 === '复制工具' && !session.编辑器剪贴板) {
      E.正在复制选区 = true;
      E.复制起点 = { x: gridX, y: gridY };
      S.玩家.x = gridX;
      S.玩家.y = gridY;
      return;
    }

    if (dragTarget && (!E.当前选中 || E.当前选中.名称 === '手形/编辑')) E.拖拽对象 = dragTarget;
  } else if (eventType === 'move') {
    if (E.正在拖拽玩家) {
      E.玩家拖拽当前屏幕坐标 = { x: clientX, y: clientY };
      const s = E.玩家拖拽起始屏幕坐标;
      const dist = LEN(clientX - s.x, clientY - s.y);
      E.玩家拖拽速度CPS = speedFromPx(dist);
      return;
    }

    if (E.拖拽对象 && !E.正在拖拽) {
      const movedDistance = Math.abs(gridX - E.拖拽起始坐标.x) + Math.abs(gridY - E.拖拽起始坐标.y);
      if (movedDistance > 0) {
        E.正在拖拽 = true;
        const dragged = E.拖拽对象;
        const start = E.拖拽起始坐标;
        const startCell = S.地牢[start.y]?.[start.x];
        if (startCell) {
          if (ports.isMonster(dragged)) {
            S.所有怪物 = S.所有怪物.filter((m: unknown) => m !== dragged);
            startCell.关联怪物 = null;
          } else if (ports.isItem(dragged)) {
            startCell.关联物品 = null;
          }
          if (startCell.类型 === 单元格类型.物品 || startCell.类型 === 单元格类型.怪物) startCell.类型 = null;
        }
        ports.saveEditorStateAsync();
      }
    }
    if (E.正在拖拽) {
      E.拖拽当前坐标 = { x: gridX, y: gridY };
    } else if (E.正在划区 || E.正在复制选区) {
      S.玩家.x = gridX;
      S.玩家.y = gridY;
    } else if ((originalEvent.buttons === 1 || originalEvent.touches) && E.当前选中) {
      if (E.当前选中.类型 === '背景' && E.笔刷模式 === '笔刷') {
        ports.brushPaint(gridX, gridY);
        ports.saveEditorStateAsync();
      } else if (E.当前选中 && E.当前选中.名称 !== '房间工具' && E.当前选中.名称 !== '复制工具') {
        ports.placeAt(gridX, gridY);
        ports.saveEditorStateAsync();
      }
    }
  } else if (eventType === 'end') {
    if (E.正在拖拽玩家) {
      E.正在拖拽玩家 = false;
      E.玩家拖拽起始屏幕坐标 = null;
      E.玩家拖拽当前屏幕坐标 = null;
      E.玩家拖拽速度CPS = 0;
      E.玩家拖拽速度已锁定 = false;
      E.玩家拖拽方向 = { x: 0, y: 0 };
      E.玩家拖拽世界坐标F = null;
      if (E.玩家拖拽RAF) {
        ports.cancelAnimationFrame(E.玩家拖拽RAF);
        E.玩家拖拽RAF = 0;
      }
      ports.updateViewport();
      ports.drawMinimap();
      ports.draw();
      return;
    }

    const isDragEnd = E.正在拖拽;
    const startCoords = E.拖拽起始坐标 || { x: -1, y: -1 };
    const movedDistance = Math.abs(gridX - startCoords.x) + Math.abs(gridY - startCoords.y);

    if (E.正在复制选区) {
      E.正在复制选区 = false;
      ports.copySelection(E.复制起点.x, E.复制起点.y, gridX, gridY);
      ports.updateAllDoorOrientations();
      ports.generateWalls();
      ports.updateViewport();
      ports.saveEditorStateAsync();
    } else if (E.正在划区) {
      E.正在划区 = false;
      if (E.当前选中?.名称 === '房间工具') {
        ports.createRoom(E.划区起点.x, E.划区起点.y, gridX, gridY);
        ports.updateViewport();
      } else if (E.当前选中?.名称 === '扳手') {
        const rules = S.扳手规则集[S.当前扳手快捷槽];
        if (!rules || rules.length === 0) {
          ports.notify('当前快捷槽没有规则可应用。', '警告');
        } else {
          const left = Math.min(E.划区起点.x, gridX);
          const top = Math.min(E.划区起点.y, gridY);
          const right = Math.max(E.划区起点.x, gridX);
          const bottom = Math.max(E.划区起点.y, gridY);
          let affected = 0;
          for (let yy = top; yy <= bottom; yy++) {
            for (let xx = left; xx <= right; xx++) {
              const cell = S.地牢[yy]?.[xx];
              if (cell) {
                const entity = cell.关联怪物 || cell.关联物品;
                if (entity) {
                  ports.applyWrenchRules(entity, rules);
                  affected++;
                }
              }
            }
          }
          ports.notify(`已对 ${affected} 个实体应用了规则。`, '成功');
        }
        ports.updateViewport();
      } else if (E.当前选中?.类型 === '背景') {
        const newBackground = E.当前选中.绘制类型;
        const newEnvironment = E.当前选中.绘制环境;
        const left = Math.min(E.划区起点.x, gridX);
        const top = Math.min(E.划区起点.y, gridY);
        const right = Math.max(E.划区起点.x, gridX);
        const bottom = Math.max(E.划区起点.y, gridY);
        for (let yy = top; yy <= bottom; yy++) {
          for (let xx = left; xx <= right; xx++) {
            if (newEnvironment) {
              S.地牢[yy][xx].环境 = newEnvironment;
            } else {
              if (newBackground === 单元格类型.墙壁) ports.resetCell(xx, yy, false);
              S.地牢[yy][xx].背景类型 = newBackground;
            }
          }
        }
        ports.generateWalls();
        ports.updateViewport();
      }
    } else if (isDragEnd) {
      const dragged = E.拖拽对象;
      const targetCell = S.地牢[gridY]?.[gridX];
      const targetItem = targetCell?.关联物品;

      if (dragged && targetItem && dragged.可堆叠于 && dragged.可堆叠于(targetItem) && targetItem.最大堆叠数量 > 1) {
        const transferable = Math.min(dragged.堆叠数量, targetItem.最大堆叠数量 - targetItem.堆叠数量);
        if (transferable > 0) {
          targetItem.堆叠数量 += transferable;
          dragged.堆叠数量 -= transferable;
          ports.notify(`合并了 ${transferable} 个 ${targetItem.名称}。`, '成功');
          if (dragged.堆叠数量 <= 0) E.拖拽对象 = null;
          ports.saveEditorStateAsync();
        }
      }

      if (E.拖拽对象) {
        if (targetCell && targetCell.关联怪物 && ports.isItem(dragged)) {
          targetCell.关联怪物.掉落物 = ports.cloneItemForEditor(dragged);
          ports.notify(`已将 ${dragged.名称} 设置为 ${targetCell.关联怪物.类型} 的掉落物。`, '成功');
          ports.placeItemAtCell(dragged, E.拖拽起始坐标.x, E.拖拽起始坐标.y);
        } else if (ports.isPositionAvailable(gridX, gridY, false, true)) {
          if (ports.isMonster(dragged)) ports.placeMonsterAtCell(dragged, gridX, gridY);
          else if (ports.isItem(dragged)) ports.placeItemAtCell(dragged, gridX, gridY);
        } else {
          ports.notify('目标位置不可用，操作已取消。', '警告');
          returnToStart(dragged, E.拖拽起始坐标);
        }
      }
      ports.saveEditorStateAsync();
    } else {
      if (movedDistance < 1 && now - (E.上次点击时间 || 0) < DOUBLE_CLICK_TIME &&
        E.上次点击格子?.x === gridX && E.上次点击格子?.y === gridY) {
        E.上次点击时间 = 0;
      } else if (movedDistance < 2) {
        ports.editorClick(gridX, gridY);
      }
    }
    if (E.当前选中?.类型 === '背景') ports.generateWalls();

    E.正在拖拽 = false;
    E.拖拽对象 = null;
    E.拖拽当前坐标 = null;
    E.上次点击时间 = now;
    E.上次点击格子 = { x: gridX, y: gridY };
  }

  ports.drawMinimap();
  ports.draw();
}
