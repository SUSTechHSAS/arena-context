import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Ctor = new (options: Loose) => Loose;

/** Packet-owned classes (`t10-containers`, plant/seed, furniture and mimic packets). */
export interface ThemeRoomCatalog {
  罐子: Ctor; 空罐子: Ctor; 泉水: Ctor;
  荆棘种子: Ctor; 护卫种子: Ctor; 远射种子: Ctor; 吸能种子: Ctor;
  书架: Ctor; 伪装怪物: Ctor;
}

export interface ThemeRoomPorts {
  random(): number;
  catalog: ThemeRoomCatalog;
  /** Source `加权随机选择` (packet `t10-spawn-selection`). */
  weightedPick(options: readonly Loose[]): Loose;
  /** Source `放置物品到单元格(item, x, y)`, `放置物品到房间(item, room)`, `放置怪物到房间(monster, room)` (`world/placement.ts`). */
  placeItemAt(item: unknown, x: number, y: number): unknown;
  placeItemInRoom(item: unknown, room: Loose): unknown;
  placeMonsterInRoom(monster: unknown, room: Loose): unknown;
}

/** Source `生成罐子房间内容(房间)`: a jar on every cell with even x + y (30% empty). */
export function generateJarRoom(_state: WorldState, ports: ThemeRoomPorts, room: Loose): void {
  const { catalog } = ports;
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if ((x + y) % 2 === 0) {
        if (ports.random() < 0.3) ports.placeItemAt(new catalog.空罐子({}), x, y);
        else ports.placeItemAt(new catalog.罐子({}), x, y);
      }
    }
  }
}

/** Source `生成植物房间内容(房间)`: one spring, then six weighted seed stacks of 2–3. */
export function generatePlantRoom(_state: WorldState, ports: ThemeRoomPorts, room: Loose): void {
  const { catalog } = ports;
  ports.placeItemInRoom(new catalog.泉水({}), room);
  const seeds = [
    { 类: catalog.荆棘种子, 权重: 35 },
    { 类: catalog.护卫种子, 权重: 30 },
    { 类: catalog.远射种子, 权重: 25 },
    { 类: catalog.吸能种子, 权重: 10 },
  ];
  for (let i = 0; i < 6; i++) {
    const chosen = ports.weightedPick(seeds.map(seed => ({ 值: seed, 权重: seed.权重 })));
    if (chosen) {
      const count = 2 + Math.floor(ports.random() * 2);
      ports.placeItemInRoom(new chosen.类({ 数量: count }), room);
    }
  }
}

/** Source `生成药水房内容(房间)`: 3–5 potions from `物品池.药水` (30% empowered), then 3–5 potion mimics. */
export function generatePotionRoom(state: WorldState, ports: ThemeRoomPorts, room: Loose): void {
  const pool = (state.物品池 as Record<string, Loose[]>)['药水'] as Loose[];
  const potionCount = 3 + Math.floor(ports.random() * 3);
  for (let i = 0; i < potionCount; i++) {
    const chosen = pool[Math.floor(ports.random() * pool.length)];
    if (chosen) ports.placeItemInRoom(new chosen.类({ 强化: ports.random() < 0.3 }), room);
  }
  const monsterCount = 3 + Math.floor(ports.random() * 3);
  for (let i = 0; i < monsterCount; i++) ports.placeMonsterInRoom(new ports.catalog.伪装怪物({ 伪装成: '药水' }), room);
}

/** Source `生成书库房间内容(房间)`: shelves on 15–35% of the area (20% with content), mimics on 10–30%. */
export function generateLibraryRoom(_state: WorldState, ports: ThemeRoomPorts, room: Loose): void {
  const { catalog } = ports;
  const shelfCount = Math.floor(room.w * room.h * (0.15 + ports.random() * 0.2));
  for (let i = 0; i < shelfCount; i++) ports.placeItemInRoom(new catalog.书架({ 有内容: ports.random() < 0.2 }), room);
  const monsterCount = Math.floor(room.w * room.h * (0.1 + ports.random() * 0.2));
  for (let i = 0; i < monsterCount; i++) ports.placeMonsterInRoom(new catalog.伪装怪物({ 伪装成: '书架' }), room);
}
