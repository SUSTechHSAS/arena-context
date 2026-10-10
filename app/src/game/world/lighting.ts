import type { WorldState } from './state';

/** Collaborators owned by other contracts (path search, torch item, canvas layer). */
export interface LightingPorts {
  /** Source `检查视线(startX, startY, endX, endY, maxSteps)` (path-search contract). */
  lineOfSight(startX: number, startY: number, endX: number, endY: number, maxSteps: number): boolean;
  /** Source `物品 instanceof 火把` (torch item contract). */
  isTorch(item: unknown): boolean;
  /** Source `document.getElementById("dungeonCanvas").getBoundingClientRect().width`. */
  canvasWidth(): number;
  /** Source `单元格大小` (render tunable owned by the camera/zoom layer). */
  cellSize(): number;
}

type Light = { x: number; y: number; 自定义数据?: Map<unknown, unknown> };
type Status = { 类型?: unknown };
type Room = { 类型?: unknown } | null | undefined;
// Source arithmetic runs on loosely typed globals; keep JS operators (no coercion/clamping).
type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const roomAt = (state: WorldState, id: unknown): Room => (state.房间列表 as Room[])[id as number];

/** Source `获取玩家视野范围`. The canvas is queried before the night check, as in the source. */
export function getPlayerSightRange(state: WorldState, ports: LightingPorts): number {
  if ((state.玩家状态 as Status[]).some(status => status.类型 === '失明')) return 0;
  const playerRoomId = state.房间地图[state.玩家.y]?.[state.玩家.x];
  const playerRoom = playerRoomId !== undefined && playerRoomId !== -1 ? roomAt(state, playerRoomId) : null;
  if (playerRoom?.类型 === '黑暗房间') return 1;
  const width = ports.canvasWidth();
  if (!state.当前天气效果.includes('深夜')) return Math.floor(width / ports.cellSize() / 2);
  const base = 3;
  let bonus: Loose = (state.玩家属性 as Loose).视野加成 || 0;
  Array.from({ length: state.装备栏每页装备数 }, (_, index) =>
    state.玩家装备.get(state.当前装备页 * state.装备栏每页装备数 + index + 1),
  ).filter(item => item != null).forEach(item => {
    if (ports.isTorch(item)) bonus += (item as Light).自定义数据!.get('视野加成') || 0;
  });
  return base + bonus;
}

/** Source `是否在光源范围内`: reads the precomputed light map only at night or in dark rooms. */
export function isLit(state: WorldState, targetX: number, targetY: number): boolean {
  const playerRoomId = state.房间地图[state.玩家.y]?.[state.玩家.x];
  const playerRoom = playerRoomId !== undefined && playerRoomId !== -1 ? roomAt(state, playerRoomId) : null;
  if ((state.玩家状态 as Status[]).some(status => status.类型 === '失明')) return false;
  const targetRoomId = state.房间地图[targetY]?.[targetX];
  if (targetRoomId !== -1) {
    const targetRoom = roomAt(state, targetRoomId);
    if (targetRoom && targetRoom.类型 === '黑暗房间' && playerRoomId !== targetRoomId) return false;
  }
  if (!state.当前天气效果.includes('深夜') && (!playerRoom || playerRoom.类型 !== '黑暗房间')) return true;
  return state.光源地图.has(`${targetX},${targetY}`);
}

/** Source `更新光源地图`: clears and refills the session's light-map Set in place. */
export function updateLightMap(state: WorldState, ports: LightingPorts): void {
  const map = state.光源地图; const size = state.地牢大小; const player = state.玩家;
  map.clear();
  const sight = getPlayerSightRange(state, ports);
  if (sight > 0) {
    for (let y = player.y - sight; y <= player.y + sight; y++) {
      for (let x = player.x - sight; x <= player.x + sight; x++) {
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        if (Math.abs(x - player.x) + Math.abs(y - player.y) <= sight) {
          if (ports.lineOfSight(player.x, player.y, x, y, sight + 1)) map.add(`${x},${y}`);
        }
      }
    }
  }
  const addLight = (light: Light) => {
    const range: Loose = light.自定义数据?.get('光照范围');
    if (range > 0 && light.x >= 0 && light.y >= 0) {
      for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
          const targetX = light.x + dx; const targetY = light.y + dy;
          if (targetX < 0 || targetX >= size || targetY < 0 || targetY >= size) continue;
          if (Math.abs(dx) + Math.abs(dy) <= range) {
            if (ports.lineOfSight(light.x, light.y, targetX, targetY, range + 1)) map.add(`${targetX},${targetY}`);
          }
        }
      }
    }
  };
  // SRC-03 fixed (owner rule 2026-10-10): source tested `计时器?.x` for truthiness and skipped x = 0.
  (state.所有计时器 as unknown as (Light | null | undefined)[]).forEach(timer => {
    if (timer && timer.自定义数据?.has('光照范围') && timer?.x != null) addLight(timer);
  });
  if (state.地牢.length >= size) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cell = state.地牢[y]![x] as { 关联物品?: Light | null } | undefined;
        if (cell?.关联物品?.自定义数据?.has('光照范围')) addLight(cell.关联物品);
      }
    }
  }
  (state.所有怪物 as Light[]).forEach(monster => {
    if ((state.怪物状态表.get(monster as object) as Status | undefined)?.类型 === '火焰') {
      addLight({ x: monster.x, y: monster.y, 自定义数据: new Map([['光照范围', 2]]) });
    }
  });
}

/** Source `获取视野内房间ID`: room ids within (sight + 2) Manhattan range, in scan order. */
export function getVisibleRoomIds(state: WorldState, ports: LightingPorts, centerX: number, centerY: number): Set<number> {
  const range = getPlayerSightRange(state, ports) + 2;
  const ids = new Set<number>(); const size = state.地牢大小;
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      const x = centerX + dx; const y = centerY + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) {
        if (Math.abs(dx) + Math.abs(dy) <= range) {
          const id = state.房间地图[y]![x]!;
          if (id !== -1) ids.add(id);
        }
      }
    }
  }
  return ids;
}
