import { 单元格类型, 最大怪物数 } from './constants';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Ctor = new (options: Loose) => Loose;

/** Packet-owned class and icon data (`t10-monsters-hazards-patrol`, icon table). */
export interface MonsterCatalog {
  巡逻怪物: Ctor;
  图标映射: Readonly<Record<'飞毛腿' | '永久抗火' | '永久力量' | '永久抗毒' | '永久解冻' | '炸弹' | '隐身' | '矿工', unknown>>;
}

export interface MonsterGenerationPorts {
  random(): number;
  catalog: MonsterCatalog;
  /** Source `放置怪物到单元格` (`world/placement.ts#placeMonsterAt`). */
  placeMonsterAt(monster: Loose, x: number, y: number): unknown;
  /**
   * Source `生成成功 = true` assigns an undeclared name, so in the sloppy-mode page it creates a global that
   * nothing reads (DEVIATIONS SRC-10). The rewrite signals it here instead.
   */
  flagSpawnSuccess?(): void;
}

const potionPool = (icons: MonsterCatalog['图标映射']): Loose[] => [
  { 类型: '一次性治疗', 值: 50 }, { 类型: '永久隐身' }, { 类型: '永久速度', 值: 1, 图标: icons.飞毛腿 },
  { 类型: '永久抗火', 图标: icons.永久抗火 }, { 类型: '永久力量', 值: 5, 图标: icons.永久力量 }, { 类型: '永久强化', 值: 10 },
  { 类型: '永久抗毒', 图标: icons.永久抗毒 }, { 类型: '永久解冻', 图标: icons.永久解冻 }, { 类型: '自爆', 图标: icons.炸弹 },
  { 类型: '周期隐身', 图标: icons.隐身 }, { 类型: '矿工', 图标: icons.矿工 },
];

/**
 * Source `生成怪物()` (HTML L41328): room monsters drawn from the introduction schedule (patrol subclasses excluded),
 * then corridor patrols. Source quirks are preserved: the elite flag is computed but the monster gets `强化: 是否上锁`;
 * level and elite rolls are drawn even with levels disabled; a null pick throws only once a free cell is found.
 */
export function generateMonsters(state: WorldState, ports: MonsterGenerationPorts): void {
  const { catalog } = ports;
  const floor = state.当前层数;
  const settings = state.自定义游戏设置 as Loose;
  const grid = state.地牢 as Loose[][];
  const depthWeight = Math.floor(floor / 3);
  // eslint-disable-next-line eqeqeq
  const rooms = (state.房间列表 as Loose[]).filter(room => room.类型 == '房间' || room.类型 == '黑暗房间');
  const pool: { 普通房间: Loose[]; 上锁房间: Loose[] } = { 普通房间: [], 上锁房间: [] };
  const schedule = state.怪物引入计划 as Map<unknown, Loose[]>;
  for (let i = 0; i <= floor; i++) {
    if (schedule.has(i)) {
      schedule.get(i)!.forEach(definition => {
        if (!pool.普通房间.some(m => m.类.name === definition.类.name)) {
          pool.普通房间.push(definition);
          pool.上锁房间.push(definition);
        }
      });
    }
  }

  rooms.forEach(room => {
    if (room.id === 0) return;
    const locked = (state.上锁房间列表 as Loose[]).some(other => other.id === room.id);
    const candidates = pool[locked ? '上锁房间' : '普通房间'].filter(m => !(m.类.prototype instanceof catalog.巡逻怪物));
    if (candidates.length === 0) return;
    const maxCount = locked ? 最大怪物数 + 2 : 最大怪物数;
    let count = Math.round(ports.random() * ports.random() * maxCount + depthWeight);
    if (room.类型 === '黑暗房间') count = Math.max(2, count);
    for (let i = 0; i < count; i++) {
      const totalWeight = candidates.reduce((sum, m) => sum + m.权重, 0);
      let roll = ports.random() * totalWeight;
      let chosen: Loose = null;
      for (const m of candidates) {
        if (roll <= m.权重) { chosen = m; break; }
        roll -= m.权重;
      }
      const baseLevel = Math.max(1, floor);
      const levelShift = Math.floor(ports.random() * 4) - 1;
      const elite = ports.random() < 0.1 + floor * 0.005;
      let level = Math.max(1, baseLevel + levelShift);
      if (elite) level += 3; // the source also sets an unused `是否强化 = true` here
      if (!settings.开启怪物等级) level = 1;
      for (let attempt = 0; attempt < 10; attempt++) {
        const x = room.x + Math.floor(ports.random() * room.w);
        const y = room.y + Math.floor(ports.random() * room.h);
        if (grid[y]![x].背景类型 === 单元格类型.房间 && !grid[y]![x].关联怪物 && !grid[y]![x].关联物品) {
          const monster = new chosen.类({ x, y, 房间ID: room.id, 强化: locked, 等级: level, 基础攻击力: 3 + depthWeight });
          if (settings.开启药水增益怪物) {
            if (floor > 7 && ports.random() < 0.15 + (floor - 7) * 0.1) {
              const potions = potionPool(catalog.图标映射);
              monster.携带药水 = potions[Math.floor(ports.random() * potions.length)];
              if (monster.携带药水.类型 === '自爆') monster.永久增益.push(monster.携带药水);
              if (monster.携带药水.类型 === '周期隐身') monster.永久增益.push(monster.携带药水);
              if (monster.携带药水.类型 === '矿工') monster.永久增益.push(monster.携带药水);
            }
          }
          ports.placeMonsterAt(monster, x, y);
          ports.flagSpawnSuccess?.();
          break;
        }
      }
    }
  });

  const corridors: { x: number; y: number }[] = [];
  for (let y = 0; y < state.地牢大小; y++) {
    for (let x = 0; x < state.地牢大小; x++) {
      if (grid[y]?.[x]?.背景类型 === 单元格类型.走廊) corridors.push({ x, y });
    }
  }
  if (settings.开启巡逻怪物) {
    let patrolCount = Math.floor(corridors.length / 50);
    if (state.地牢生成方式 === 'maze') patrolCount = Math.floor(corridors.length / 125);
    if (corridors.length > 0 && patrolCount > 0) {
      for (let i = 0; i < patrolCount; i++) {
        for (let attempt = 0; attempt < 20; attempt++) {
          const index = Math.floor(ports.random() * corridors.length);
          const { x, y } = corridors[index]!;
          if (!grid[y]![x].关联怪物 && !grid[y]![x].关联物品) {
            const empowered = ports.random() < 0.1 + floor * 0.02;
            const patrol = new catalog.巡逻怪物({ x, y, 房间ID: -1, 强化: empowered, 随机游走: true });
            ports.placeMonsterAt(patrol, x, y);
            corridors.splice(index, 1);
            break;
          }
        }
      }
    }
  }
}
