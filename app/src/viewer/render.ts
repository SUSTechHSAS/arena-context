import { CellType } from '../domain/distance-map';
import { LOCK_COLORS, type ViewerSnapshot } from './model';

export type ViewerPainter = Pick<CanvasRenderingContext2D, 'canvas' | 'fillStyle' | 'strokeStyle' | 'font' |
  'textAlign' | 'textBaseline' | 'clearRect' | 'fillRect' | 'strokeRect' | 'beginPath' | 'arc' | 'fill' | 'fillText'>;

/** Deterministic original viewer drawing order and coordinates, testable without DOM. */
export function drawViewer(context: ViewerPainter, snapshot: ViewerSnapshot): void {
  const width = context.canvas.width; const height = context.canvas.height;
  context.clearRect(0, 0, width, height);
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const room of snapshot.房间列表) {
    minX = Math.min(minX, room.x); minY = Math.min(minY, room.y);
    maxX = Math.max(maxX, room.x + room.w); maxY = Math.max(maxY, room.y + room.h);
  }
  if (minX === Infinity) return;
  const mapWidth = maxX - minX; const mapHeight = maxY - minY;
  const scale = Math.min((width - 20) / mapWidth, (height - 20) / mapHeight);
  const offsetX = (width - mapWidth * scale) / 2 - minX * scale;
  const offsetY = (height - mapHeight * scale) / 2 - minY * scale;
  context.fillStyle = '#1a1a1a'; context.fillRect(0, 0, width, height);
  context.fillStyle = '#2b2d42';
  for (let y = 0; y < snapshot.地牢.length; y++) for (let x = 0; x < snapshot.地牢[y]!.length; x++) {
    if (snapshot.地牢[y]![x]!.背景类型 === CellType.Corridor) context.fillRect(x * scale + offsetX, y * scale + offsetY, scale, scale);
  }
  context.fillStyle = '#3a506b'; context.strokeStyle = '#4caf50';
  for (const room of snapshot.房间列表) {
    context.fillRect(room.x * scale + offsetX, room.y * scale + offsetY, room.w * scale, room.h * scale);
    context.strokeRect(room.x * scale + offsetX, room.y * scale + offsetY, room.w * scale, room.h * scale);
  }
  context.fillStyle = '#8b4513';
  for (let y = 0; y < snapshot.地牢.length; y++) for (let x = 0; x < snapshot.地牢[y]!.length; x++) {
    const cell = snapshot.地牢[y]![x]!;
    if (cell.背景类型 === CellType.Door) context.fillRect(x * scale + offsetX, y * scale + offsetY, scale, scale);
    else if (cell.背景类型 === CellType.LockedDoor) {
      context.fillStyle = LOCK_COLORS[cell.颜色索引] || '#FFD700';
      context.fillRect(x * scale + offsetX, y * scale + offsetY, scale, scale);
      context.fillStyle = '#8b4513';
    }
  }
  const start = snapshot.玩家初始位置;
  context.fillStyle = 'red'; context.beginPath();
  context.arc(start.x * scale + offsetX + scale / 2, start.y * scale + offsetY + scale / 2, scale * 1.5, 0, 2 * Math.PI);
  context.fill();
  context.font = `${scale * 2.5}px sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle';
  if (snapshot.下楼楼梯位置) {
    const stairs = snapshot.下楼楼梯位置;
    context.fillText('⬇️', stairs.x * scale + offsetX + scale / 2, stairs.y * scale + offsetY + scale / 2);
  }
  if (snapshot.上楼楼梯位置) {
    const stairs = snapshot.上楼楼梯位置;
    context.fillText('⬆️', stairs.x * scale + offsetX + scale / 2, stairs.y * scale + offsetY + scale / 2);
  }
}
