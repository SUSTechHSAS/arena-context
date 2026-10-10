/** Minimal canvas surface used by the path overlay. */
export interface PathCanvas {
  save(): void;
  beginPath(): void;
  setLineDash(segments: number[]): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  restore(): void;
  strokeStyle: unknown;
  lineWidth: number;
  lineJoin: unknown;
  lineCap: unknown;
}

export interface PathView {
  cameraX: number; // 当前相机X (audit t10-minimap-camera-audit)
  cameraY: number; // 当前相机Y
  cellSize: number; // 单元格大小
  devicePixelRatio: number; // window.devicePixelRatio
  player: { x: number; y: number }; // 玩家
}

/**
 * Source `drawPath(path)` (HTML L38178): dashed red line through the click-move path. The line starts at the player's
 * cell centre and `path[0]` is never drawn (it is the player's own cell); paths shorter than two points draw nothing.
 */
export function drawPath(ctx: PathCanvas, view: PathView, path: ArrayLike<{ x: number; y: number }>): void {
  if (path.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255, 50, 50, 0.5)';
  ctx.lineWidth = 2 * view.devicePixelRatio;
  ctx.setLineDash([5, 15]);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const startX = (view.player.x - view.cameraX + 0.5) * view.cellSize;
  const startY = (view.player.y - view.cameraY + 0.5) * view.cellSize;
  ctx.moveTo(startX, startY);
  for (let i = 1; i < path.length; i++) {
    const { x, y } = path[i]!;
    const pointX = (x - view.cameraX + 0.5) * view.cellSize;
    const pointY = (y - view.cameraY + 0.5) * view.cellSize;
    ctx.lineTo(pointX, pointY);
  }
  ctx.stroke();
  ctx.restore();
}
