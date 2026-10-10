import { 数据完整性密钥 } from './constants';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Source `深度比较(a, b)` (HTML L38372): own-enumerable-key structural equality; uses `b.hasOwnProperty` as the source does. */
export function deepEqual(a: Loose, b: Loose): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!b.hasOwnProperty(key)) return false; // eslint-disable-line no-prototype-builtins
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

/** Source `获取方向中文(dx, dy)` (HTML L44936). */
export function directionName(dx: unknown, dy: unknown): string {
  if (dx === 1) return '东';
  if (dx === -1) return '西';
  if (dy === 1) return '南';
  if (dy === -1) return '北';
  return '原地';
}

/** Source `哈希字符串(str)` (HTML L47656): 32-bit Java-style string hash, made non-negative with `Math.abs`. */
export function hashString(str: Loose): number {
  let hash = 0;
  if (!str || str.length === 0) return hash;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Source `种子伪随机数(seed)` (HTML L47667): one mulberry32 step. */
export function seededRandom(seed: Loose): number {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const EXPLOSION_GRADIENTS = [
  'radial-gradient(circle, #ff0000 0%, #ff4500 70%, transparent 100%)',
  'radial-gradient(circle, #ff4500 0%, #ff8c00 70%, transparent 100%)',
  'radial-gradient(circle, #ff8c00 0%, #ffd700 70%, transparent 100%)',
];

/** Source `获取爆炸颜色(距离)` (HTML L53664). */
export function explosionColor(distance: Loose): string | undefined {
  return EXPLOSION_GRADIENTS[Math.min(distance, 2)];
}

/**
 * Source `净化HTML(文本)` (HTML L55796): escapes `<`/`>`. The pattern also matches `&`, `"` and `'`, which have no
 * replacement and therefore become the text `undefined` (source bug, preserved).
 */
export function sanitizeHtml(text: unknown): string {
  if (typeof text !== 'string') return '';
  const map: Record<string, string> = { '<': '&lt;', '>': '&gt;' };
  return text.replace(/[&<>"']/g, (match) => map[match] as string);
}

/** Source `生成签名(dataString)` (HTML L55513): SHA-256 hex of the data plus the integrity key. */
export async function createSignature(dataString: unknown, subtle: Pick<SubtleCrypto, 'digest'> = globalThis.crypto.subtle): Promise<string> {
  const data = new TextEncoder().encode(dataString + 数据完整性密钥);
  const hashBuffer = await subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Source `寻找最近的房间(x, y)` (HTML L57856): first room with the smallest Manhattan distance to its floored centre. */
export function findNearestRoom(state: WorldState, x: number, y: number): Loose {
  const S = state as Loose;
  let nearest: Loose = null;
  let best = Infinity;
  S.房间列表.forEach((room: Loose) => {
    if (!room) return;
    const cx = room.x + Math.floor(room.w / 2);
    const cy = room.y + Math.floor(room.h / 2);
    const distance = Math.abs(x - cx) + Math.abs(y - cy);
    if (distance < best) {
      best = distance;
      nearest = room;
    }
  });
  return nearest;
}

/** Source `处理房间状态()` (HTML L58899): in the map editor, syncs visited rooms with `已探索` and resets challenges. */
export function syncEditorRoomState(state: WorldState): void {
  const S = state as Loose;
  if (S.游戏状态 !== '地图编辑器') return;
  S.房间列表.forEach((room: Loose) => {
    if (!room) return;
    if (room.已探索) S.已访问房间.add(room.id);
    else S.已访问房间.delete(room.id);
    if (room.挑战状态) room.挑战状态.已完成 = false;
  });
}
