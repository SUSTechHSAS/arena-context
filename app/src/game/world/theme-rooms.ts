import { 单元格类型 } from './constants';
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

/** Level returned by the packet-owned `推箱子关卡生成器#生成关卡` (packet `t10-sokoban-solver`). */
export interface SokobanLevelResult { 成功?: unknown; 关卡?: { board: string[][]; targets: { x: number; y: number }[]; boxes: { x: number; y: number }[] } }

export interface SokobanRoomPorts {
  /** Source `清空房间内容(room)` (`world/placement.ts#clearRoomContents`). */
  clearRoom(room: Loose): void;
  /** Page flag `isSifting` (seed search, packet `t10-seed-search`). */
  isSifting(): unknown;
  /** Fallback filler: source `生成罐子房间内容(room)` (`generateJarRoom`). */
  generateJarRoom(room: Loose): void;
  log(message: string, type: string): void;
  /** Source `new 推箱子关卡生成器(w, h, options)`. */
  createGenerator(width: number, height: number, options: { maxSolverIterations: number; maxNodesInMemory: number }): { 生成关卡(attempts: number): unknown };
  /** Source `生成墙壁()` (packet `t10-main-room-geometry`). */
  generateWalls(): void;
  placeItemAt(item: unknown, x: number, y: number): unknown;
  /** Source classes `推箱子目标` and `推箱子箱子` (packet `t10-display-logic-items`). */
  catalog: { 推箱子目标: new () => Loose; 推箱子箱子: new () => Loose };
  diagnostic(message: string, error: unknown): void;
  notify(message: string, type: string, flag: true): void;
}

/**
 * Source `async 生成推箱子谜题(目标房间, 编辑器模式 = false)`: clears and retypes the room, then carves the generated
 * level into the grid. Small rooms, editor mode and seed sifting fall back to jars, and so does any failure after the
 * generator starts (the whole carve runs inside the source try block).
 */
export async function generateSokobanRoom(state: WorldState, ports: SokobanRoomPorts, room: Loose, editorMode: Loose = false): Promise<void> {
  if (!room) return;
  ports.clearRoom(room);
  room.类型 = '隐藏推箱子房间';
  room.解谜已完成 = false;
  const width = room.w;
  const height = room.h;
  if (width < 5 || height < 5 || editorMode || ports.isSifting()) {
    ports.generateJarRoom(room);
    return;
  }
  ports.log('正在构建一个古老的谜题...', '信息');
  const generator = ports.createGenerator(width, height, { maxSolverIterations: 200, maxNodesInMemory: 20000 });
  try {
    const result = await generator.生成关卡(150) as SokobanLevelResult | null | undefined;
    if (result && result.成功 && result.关卡) {
      const level = result.关卡;
      const grid = state.地牢 as Loose[][];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (level.board[y]![x] === 'wall') {
            const cell = grid[room.y + y]?.[room.x + x];
            if (cell) cell.背景类型 = 单元格类型.墙壁;
          }
        }
      }
      ports.generateWalls();
      level.targets.forEach(pos => { ports.placeItemAt(new ports.catalog.推箱子目标(), room.x + pos.x, room.y + pos.y); });
      level.boxes.forEach(pos => { ports.placeItemAt(new ports.catalog.推箱子箱子(), room.x + pos.x, room.y + pos.y); });
      ports.log('古老的谜题形成了！', '成功');
    } else {
      throw new Error('生成器未能产出有效关卡。');
    }
  } catch (error) {
    ports.diagnostic('生成推箱子谜题时发生错误:', error);
    ports.notify('谜题构建失败，空间似乎不稳定。', '错误', true);
    ports.generateJarRoom(room);
  }
}
