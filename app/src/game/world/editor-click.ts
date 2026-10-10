import type { InteractSession } from './interact';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Map-editor UI globals read by `编辑器单击处理` (shares `编辑器状态`/`旧编辑器状态` with `InteractSession`). */
export interface EditorClickSession extends InteractSession {
  编辑器剪贴板: unknown;
}

export interface EditorClickPorts {
  scheduleCellEffect(cells: { x: number; y: number }[], color: string, delay: number): void; // 计划显示格子特效
  updateViewport(): void; // 更新视口
  draw(): void; // 绘制
  drawMinimap(): void; // 绘制小地图
  notify(message: string, type: string): void; // 显示通知
  saveEditorStateAsync(): void; // 异步保存编辑器状态
  pasteSelection(x: number, y: number): void; // 编辑器粘贴选区 (audit t10-editor-tools-audit)
  applyWrenchRules(target: unknown, rules: unknown): void; // 应用扳手规则 (world/wrench.ts)
  bucketFill(x: number, y: number, drawType: unknown): void; // 油漆桶填充 (audit t10-editor-tools-audit)
  brushPaint(x: number, y: number): void; // 笔刷绘制 (audit t10-editor-tools-audit)
  placeAt(x: number, y: number): void; // 编辑器放置逻辑 (audit t10-editor-tools-audit)
}

/**
 * Source `编辑器单击处理(横坐标, 纵坐标)` (HTML L58770): map-editor click dispatch. Flashes the clicked cell, then by mode
 * or selected tool: teleport the player, set the start position (inside the room map only; restores the previous
 * mode), paste the clipboard, apply the active wrench rule set, bucket-fill or brush a background, or place the
 * selected entry. Every branch except teleport, paste and placement autosaves.
 */
export function handleEditorClick(state: WorldState, session: EditorClickSession, ports: EditorClickPorts, x: number, y: number): void {
  const S = state as Loose;
  const editor = session.编辑器状态 as Loose;
  ports.scheduleCellEffect([{ x, y }], 'FFFFFF', 0);
  if (editor.模式 === '传送') {
    S.玩家.x = x;
    S.玩家.y = y;
    ports.updateViewport();
    ports.draw();
  } else if (editor.模式 === '设置起点') {
    const roomId = S.房间地图[y]?.[x];
    if (roomId === undefined) {
      ports.notify('玩家起点必须设置在地牢内！', '错误');
      return;
    }
    S.玩家初始位置.x = x;
    S.玩家初始位置.y = y;
    ports.notify(`玩家起点已设置为 (${x}, ${y})`, '成功');
    editor.模式 = session.旧编辑器状态;
    ports.drawMinimap();
    ports.saveEditorStateAsync();
  } else if (editor.当前选中?.名称 === '复制工具') {
    if (session.编辑器剪贴板) ports.pasteSelection(x, y);
  } else if (editor.当前选中?.名称 === '扳手') {
    const cell = S.地牢[y]?.[x];
    if (cell) {
      const target = cell.关联怪物 || cell.关联物品;
      if (target) ports.applyWrenchRules(target, S.扳手规则集[S.当前扳手快捷槽]);
      else ports.notify('这里没有可以修改的物品或怪物。', '警告');
    }
    ports.saveEditorStateAsync();
  } else if (editor.当前选中?.类型 === '背景' && editor.笔刷模式 === '油漆桶') {
    ports.bucketFill(x, y, editor.当前选中.绘制类型);
    ports.saveEditorStateAsync();
  } else if (editor.当前选中?.类型 === '背景' && editor.笔刷模式 === '笔刷') {
    ports.brushPaint(x, y);
    ports.saveEditorStateAsync();
  } else {
    ports.placeAt(x, y);
  }
}
