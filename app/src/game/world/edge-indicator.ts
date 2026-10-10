/** Camera/canvas inputs of `计算精确边缘位置`. In the source `画布缓存Rect` is captured once at page load (never refreshed). */
export interface EdgeView {
  cameraX: number; // 当前相机X
  cameraY: number; // 当前相机Y
  cellSize: number; // 单元格大小
  rect: { width: number; height: number; left: number; top: number }; // 画布缓存Rect
  player: { x: number; y: number }; // 玩家
}

/**
 * Source `计算精确边缘位置(怪物)` (HTML L51548): for a monster outside the viewport, the page position where the ray from
 * the player's cell centre towards the monster's cell centre leaves the canvas; `null` when the monster is in view, on
 * the player's centre, or no edge is hit.
 */
export function edgeIndicatorPosition(view: EdgeView, monster: { x: number; y: number }): { x: number; y: number } | null {
  const { cameraX, cameraY, cellSize, rect, player } = view;
  const left = cameraX;
  const right = cameraX + Math.floor(rect.width / cellSize) - 1;
  const top = cameraY;
  const bottom = cameraY + Math.floor(rect.height / cellSize) - 1;
  if (monster.x >= left && monster.x <= right && monster.y >= top && monster.y <= bottom) return null;

  const playerX = (player.x - cameraX) * cellSize + cellSize / 2;
  const playerY = (player.y - cameraY) * cellSize + cellSize / 2;
  const dx = (monster.x - cameraX) * cellSize + cellSize / 2 - playerX;
  const dy = (monster.y - cameraY) * cellSize + cellSize / 2 - playerY;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return null;
  const dirX = dx / length;
  const dirY = dy / length;

  const canvasLeft = 0;
  const canvasRight = rect.width;
  const canvasTop = 0;
  const canvasBottom = rect.height;
  let t = Infinity;
  if (dirX < 0) {
    const tLeft = (canvasLeft - playerX) / dirX;
    const y = playerY + dirY * tLeft;
    if (y >= canvasTop && y <= canvasBottom) t = tLeft;
  }
  if (dirX > 0) {
    const tRight = (canvasRight - playerX) / dirX;
    const y = playerY + dirY * tRight;
    if (y >= canvasTop && y <= canvasBottom) t = Math.min(t, tRight);
  }
  if (dirY < 0) {
    const tTop = (canvasTop - playerY) / dirY;
    const x = playerX + dirX * tTop;
    if (x >= canvasLeft && x <= canvasRight) t = Math.min(t, tTop);
  }
  if (dirY > 0) {
    const tBottom = (canvasBottom - playerY) / dirY;
    const x = playerX + dirX * tBottom;
    if (x >= canvasLeft && x <= canvasRight) t = Math.min(t, tBottom);
  }
  if (t === Infinity) return null;
  return { x: playerX + dirX * t + rect.left, y: playerY + dirY * t + rect.top };
}
