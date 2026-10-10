import { 单元格类型, 颜色表 } from './constants';
import { isPositionFree } from './placement';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Ctor = new (options: Loose) => Loose;
export interface ContentRoom { id: Loose; x: number; y: number; w: number; h: number; 类型?: unknown }

export interface RoomTrapPorts {
  random(): number;
  /** Trap classes (packets `t10-monsters-hazards-patrol` and trap packets). */
  traps: { 隐形落石陷阱: Ctor; 隐形地刺陷阱: Ctor; 远射陷阱: Ctor; 隐形失明陷阱: Ctor; 召唤怪物陷阱: Ctor; 烈焰触发陷阱: Ctor; 隐形虫洞陷阱: Ctor };
  /** Source `加权随机选择(选项列表)` (packet `t10-spawn-selection`). */
  weightedPick(options: { 值: unknown; 权重: number }[]): Loose;
  /** Source `生成毒气陷阱群(房间)` (`world/features.ts`). */
  generatePoisonTrapCluster(room: ContentRoom): void;
  placeMonsterAt(monster: unknown, x: number, y: number): boolean;
  placeItemAt(item: unknown, x: number, y: number): boolean;
}

/**
 * Source `生成陷阱(房间)`. Quirks preserved: the free-cell list is shuffled with a random comparator
 * (`sort(() => prng() - 0.5)`, engine-defined draw count), and the density lookup uses `|| 1`, so
 * `陷阱密度 = '无'` still yields density 1 here (DEVIATIONS SRC-07).
 */
export function generateRoomTraps(state: WorldState, ports: RoomTrapPorts, room: ContentRoom): void {
  if (room.id === 0 || room.类型 !== '房间') return;
  const t = ports.traps;
  const pool = [
    { 类: t.隐形落石陷阱, 权重: 20 }, { 类: t.隐形地刺陷阱, 权重: 20 }, { 类: t.远射陷阱, 权重: 8 }, { 类: t.隐形失明陷阱, 权重: 12 },
    { 类: t.召唤怪物陷阱, 权重: 10 }, { 类: t.烈焰触发陷阱, 权重: 5 }, { 类: t.隐形虫洞陷阱, 权重: 10 },
  ];
  const locked = (state.上锁房间列表 as Loose[]).some(other => other.id === room.id);
  if (ports.random() < 0.15) ports.generatePoisonTrapCluster(room);
  const grid = state.地牢 as unknown as ({ 背景类型: number; 关联物品: unknown; 关联怪物: unknown } | undefined)[][];
  const free: { x: number; y: number }[] = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const cell = grid[y]?.[x];
      if (cell && (cell.背景类型 === 单元格类型.房间 || cell.背景类型 === 单元格类型.走廊) && !cell.关联物品 && !cell.关联怪物) free.push({ x, y });
    }
  }
  free.sort(() => ports.random() - 0.5);
  const density = ({ 无: 0, 稀少: 0.3, 普通: 1, 致命: 2.5 } as Record<string, Loose>)[(state.自定义游戏设置 as Loose).陷阱密度] || 1;
  const count = ports.random() < (0.5 * density) ? Math.ceil(ports.random() * 5 * density) : 0;
  for (let i = 0; i < count; i++) {
    if (free.length === 0) break;
    const { x, y } = free.pop()!;
    const config = ports.weightedPick(pool.map(entry => ({ 值: entry, 权重: entry.权重 })));
    if (config) {
      const empowered = locked || (ports.random() < 0.1 + state.当前层数 * 0.025);
      const trap = new config.类({ 强化: empowered });
      if (config.类 === t.远射陷阱) ports.placeMonsterAt(trap, x, y);
      else ports.placeItemAt(trap, x, y);
    }
  }
}

export interface RoomRefreshPorts {
  random(): number;
  log(message: string, type: string): void;
  /** Source `instanceof 钥匙` (packet `t10-keys-coins`). */
  isKey(item: unknown): boolean;
  /** Source `处理销毁物品(id, true)` (packet `t10-inventory-actions-audit`). */
  destroyInventoryItem(id: unknown, silent: true): void;
  createCoin(options: { 数量: number }): unknown;
  /** Source `放置物品到房间(item, room)` and `放置怪物到单元格`. */
  placeItemInRoom(item: unknown, room: ContentRoom): boolean;
  placeMonsterAt(monster: unknown, x: number, y: number): boolean;
  /** Source `生成物品([房间])` (orchestrator, wired at integration). */
  generateItems(rooms: ContentRoom[]): void;
}

/** Source `刷新房间内容(房间)` (eerie-weather reroll): clears non-key, non-stair items and monsters, then respawns. */
export function refreshRoomContents(state: WorldState, ports: RoomRefreshPorts, room: ContentRoom): void {
  ports.log(`房间 ${room.id} 的气息变得混乱不清...`, '警告');
  state.已访问房间.delete(room.id);
  const grid = state.地牢 as unknown as (Loose | undefined)[][];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const cell = grid[y]?.[x];
      if (!cell) continue;
      if (cell.关联物品) {
        const item = cell.关联物品;
        if (ports.isKey(item) || item.类型 === '楼梯') continue;
        state.所有计时器 = (state.所有计时器 as Loose[]).filter(timer => timer.唯一标识 !== item.唯一标识);
        if (state.玩家背包.has(item.唯一标识)) ports.destroyInventoryItem(item.唯一标识, true);
        cell.关联物品 = null; cell.类型 = null; cell.颜色索引 = 颜色表.length;
      }
      if (cell.关联怪物) {
        const monster = cell.关联怪物;
        state.所有怪物 = (state.所有怪物 as unknown[]).filter(other => other !== monster) as typeof state.所有怪物;
        state.怪物状态表.delete(monster);
        monster.血条元素?.remove();
        cell.关联怪物 = null;
      }
    }
  }
  const global = state.自定义全局设置 as Loose;
  const spawnFloor = (state.游戏状态 === '地图编辑器' || state.游戏状态 === '编辑器游玩' || state.是否是自定义关卡)
    ? (global.诡魅天气怪物层级 ?? 1) : state.当前层数;
  const monsterCount = Math.floor(ports.random() * 3) + 1;
  const pool: Loose[] = [];
  const plan = state.怪物引入计划 as Map<unknown, Loose[]>;
  for (let i = 0; i <= spawnFloor; i++) {
    if (plan.has(i)) plan.get(i)!.forEach(definition => { if (!pool.some(entry => entry.类.name === definition.类.name)) pool.push(definition); });
  }
  const candidates = pool.filter(entry => entry.类.name !== '大魔法师');
  if (candidates.length > 0) {
    for (let i = 0; i < monsterCount; i++) {
      const total = candidates.reduce((sum, entry) => sum + entry.权重, 0);
      let roll = ports.random() * total;
      let chosen = candidates[0];
      for (const entry of candidates) {
        if (roll <= entry.权重) { chosen = entry; break; }
        roll -= entry.权重;
      }
      for (let attempt = 0; attempt < 10; attempt++) {
        const x = room.x + Math.floor(ports.random() * room.w);
        const y = room.y + Math.floor(ports.random() * room.h);
        if (isPositionFree(state, x, y, false)) {
          const monster = new chosen.类({ x, y, 房间ID: room.id, 强化: ports.random() < 0.1 });
          ports.placeMonsterAt(monster, x, y);
          break;
        }
      }
    }
  }
  if (ports.random() < 0.5) {
    const amount = Math.floor(ports.random() * (5 + state.当前层数)) + 1;
    ports.placeItemInRoom(ports.createCoin({ 数量: amount }), room);
  } else if (ports.random() < 0.3) {
    ports.generateItems([room]);
  }
}
