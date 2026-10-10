import { isPositionFree } from './placement';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface CloneItemPorts {
  random(): number;
  /** Source `Date.now()` used in the clone's unique id. */
  now(): number;
  /** Source `console.error("无法克隆无效的物品:", 原始物品)`. */
  diagnostic(message: string, value: unknown): void;
}

/**
 * Source `克隆物品(原始物品, 附加配置 = {})`: rebuild through the constructor from a base config, then copy
 * own enumerable fields (the `自定义数据` Map is copied shallowly), reset equipment/display fields and assign
 * `Symbol.for(Date.now() + prng())` as the new id.
 */
export function cloneItem<T>(ports: CloneItemPorts, original: T, extra: Loose = {}): T {
  const source = original as Loose;
  if (!source || typeof source.constructor !== 'function') { ports.diagnostic('无法克隆无效的物品:', original); return original; }
  const base: Loose = {
    类型: source.类型, 名称: source.名称, 图标: source.图标, 品质: source.品质, 堆叠数量: source.堆叠数量, 最大堆叠数量: source.最大堆叠数量,
    颜色索引: source.颜色索引, 强化: source.强化, 能否拾起: source.能否拾起, 是否正常物品: source.是否正常物品, 是否隐藏: source.是否隐藏,
    是否为隐藏物品: source.是否为隐藏物品, 效果描述: source.效果描述, 阻碍怪物: source.阻碍怪物,
    数据: source.自定义数据 ? Object.fromEntries(source.自定义数据) : {},
  };
  const config = { ...base, ...extra };
  if (base.数据 && extra.数据) config.数据 = { ...base.数据, ...extra.数据 };
  const clone = new source.constructor(config);
  for (const key in source) {
    if (Object.hasOwnProperty.call(source, key)) {
      if (key === '自定义数据' && source.自定义数据 instanceof Map) clone.自定义数据 = new Map(source.自定义数据);
      else clone[key] = source[key];
    }
  }
  clone.isActive = false; clone.显示元素 = null; clone.已装备 = false; clone.装备槽位 = null;
  clone.唯一标识 = Symbol.for(ports.now().toString() + ports.random().toString());
  return clone;
}

const PRIMARY = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const;
const SECONDARY = [[1, -1], [1, 1], [-1, 1], [-1, -1]] as const;

/** Shared search of `怪物放置物品` / `玩家放置物品`: centre (player ignored), then 4 then diagonal neighbours (player considered). */
function findDropSpot(state: WorldState, x: number, y: number): { x: number; y: number } | null {
  if (isPositionFree(state, x, y, false)) return { x, y };
  for (const directions of [PRIMARY, SECONDARY]) {
    for (const [dx, dy] of directions) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || nx >= state.地牢大小 || ny < 0 || ny >= state.地牢大小) continue;
      if (isPositionFree(state, nx, ny)) return { x: nx, y: ny };
    }
  }
  return null;
}

export type DropResult = { x: number; y: number; 新物品: Loose } | { x: null; y: null; 新物品: null };

/** Source `怪物放置物品(物品, x, y, 能否拾起 = false)`: places the item itself through `放置怪物到单元格`. */
export function monsterDropItem(state: WorldState, ports: { log(message: string): void; placeMonsterAt(entity: unknown, x: number, y: number): boolean },
  item: Loose, x: number, y: number, canPickUp: unknown = false): DropResult {
  const spot = findDropSpot(state, x, y);
  if (!spot) { ports.log('怪物放置物品：没有可放置的位置'); return { x: null, y: null, 新物品: null }; }
  item.堆叠数量 = 1; item.能否拾起 = canPickUp;
  ports.placeMonsterAt(item, spot.x, spot.y);
  return { x: spot.x, y: spot.y, 新物品: item };
}

/** Source `玩家放置物品(物品, 能否拾起 = false)`: drops a single-stack clone next to the player. */
export function playerDropItem(state: WorldState, ports: CloneItemPorts & { log(message: string): void; placeItemAt(item: unknown, x: number, y: number): boolean },
  item: Loose, canPickUp: unknown = false): DropResult {
  const spot = findDropSpot(state, state.玩家.x, state.玩家.y);
  if (!spot) { ports.log('玩家放置物品：没有可放置的位置'); return { x: null, y: null, 新物品: null }; }
  const dropped: Loose = cloneItem(ports, item);
  dropped.堆叠数量 = 1; dropped.能否拾起 = canPickUp;
  ports.placeItemAt(dropped, spot.x, spot.y);
  return { x: spot.x, y: spot.y, 新物品: dropped };
}
