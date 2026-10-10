import { 单元格类型, 大风吹动概率, 怪物状态, 颜色表 } from './constants';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const IMMOVABLE_TYPES = ['楼梯', '地形', '祭坛', '折跃门'];

export interface BlowPlan { 新X: number; 新Y: number; 旧X: number; 旧Y: number; 类型: '物品' | '怪物' | '玩家' }

export interface BlowPorts {
  canMoveStraight(x1: number, y1: number, x2: number, y2: number, flag: boolean): boolean; // 检查直线移动可行性
  isItem(value: unknown): boolean; // instanceof 物品
  isFireItem(value: unknown): boolean; // instanceof 火焰物品
  log(message: string, type: string): void; // 添加日志
  now(): number; // Date.now
  setMonsterAnimation(monster: unknown, animation: Record<string, unknown>): void; // 怪物动画状态.set
  error(message: string, error: unknown): void; // console.error
}

/** Source `尝试执行吹动(实例, 移动计划, 已执行, 风向DX, 风向DY)` (HTML L44309): executes one planned wind move, pushing planned occupants first. */
export function tryBlow(state: WorldState, ports: BlowPorts, instance: Loose, plan: Map<unknown, BlowPlan>, done: Set<unknown>, dx: number, dy: number): boolean {
  const S = state as Loose;
  if (done.has(instance)) return true;
  if (!plan.has(instance)) return true;
  const { 新X, 新Y, 旧X, 旧Y, 类型 } = plan.get(instance)!;
  if (新X < 0 || 新X >= S.地牢大小 || 新Y < 0 || 新Y >= S.地牢大小 || !ports.canMoveStraight(旧X, 旧Y, 新X, 新Y, true)
    || [单元格类型.墙壁, 单元格类型.上锁的门].includes(S.地牢[新Y][新X]?.背景类型)) {
    done.add(instance);
    return false;
  }
  const target = S.地牢[新Y]?.[新X];
  const occupant = target?.关联物品 || target?.关联怪物;
  if (occupant) {
    const immovable = ports.isItem(occupant) && IMMOVABLE_TYPES.includes(occupant.类型);
    if (immovable) {
      done.add(instance);
      if (ports.isFireItem(occupant)) {
        if (S.地牢[旧Y]?.[旧X]?.关联物品 === instance) {
          S.地牢[旧Y][旧X].关联物品 = null;
          if (S.地牢[旧Y]?.[旧X]?.类型 === 单元格类型.物品) S.地牢[旧Y][旧X].类型 = null;
          S.地牢[旧Y][旧X].颜色索引 = 颜色表.length;
        }
        ports.log(`${instance.名称} 被吹向火焰，烧毁了！`, '信息');
        return true;
      }
      return false;
    }
    if (plan.has(occupant) && !done.has(occupant)) {
      if (!tryBlow(state, ports, occupant, plan, done, dx, dy)) {
        done.add(instance);
        return false;
      }
    } else {
      done.add(instance);
      return false;
    }
  }
  try {
    if (类型 === '物品') {
      if (S.地牢[旧Y]?.[旧X]?.关联物品 === instance) {
        S.地牢[旧Y][旧X].关联物品 = null;
        if (S.地牢[旧Y]?.[旧X]?.类型 === 单元格类型.物品) S.地牢[旧Y][旧X].类型 = null;
        S.地牢[旧Y][旧X].颜色索引 = 颜色表.length;
      }
      instance.x = 新X;
      instance.y = 新Y;
      S.地牢[新Y][新X].类型 = 单元格类型.物品;
      S.地牢[新Y][新X].关联物品 = instance;
      S.地牢[新Y][新X].颜色索引 = instance.颜色索引;
      ports.log(`${instance.名称} 被大风吹到了 (${新X},${新Y})！`, '信息');
      done.add(instance);
      return true;
    } else if (类型 === '怪物') {
      const fromX = instance.x;
      const fromY = instance.y;
      instance.恢复背景类型();
      instance.x = 新X;
      instance.y = 新Y;
      instance.保存新位置类型(新X, 新Y);
      S.地牢[新Y][新X].类型 = 单元格类型.怪物;
      S.地牢[新Y][新X].关联怪物 = instance;
      ports.log(`${instance.类型} 被大风吹到了 (${新X},${新Y})！`, '信息');
      instance.处理地形效果();
      ports.setMonsterAnimation(instance, { 旧逻辑X: fromX, 旧逻辑Y: fromY, 目标逻辑X: 新X, 目标逻辑Y: 新Y, 视觉X: fromX, 视觉Y: fromY, 动画开始时间: ports.now(), 正在动画: true });
    }
    done.add(instance);
    return true;
  } catch (error) {
    ports.error(`执行移动实例 ${instance?.名称 || '未知'} 到 (${新X}, ${新Y}) 时出错: `, error);
    done.add(instance);
    return false;
  }
}

export interface WindPorts {
  random(): number;
  /** `document.getElementById('dungeonCanvas').getBoundingClientRect()`. */
  canvasRect(): { width: number; height: number };
  camera(): { x: number; y: number }; // 当前相机X/当前相机Y
  cellSize(): number; // 单元格大小
  canMoveStraight(x1: number, y1: number, x2: number, y2: number, flag: boolean): boolean; // 检查直线移动可行性
  isPoisonGasTrap(item: unknown): boolean; // instanceof 隐形毒气陷阱
  isItem(value: unknown): boolean; // instanceof 物品
  isMonster(value: unknown): boolean; // instanceof 怪物
  tryBlow(instance: unknown, plan: Map<unknown, BlowPlan>, done: Set<unknown>, dx: number, dy: number): boolean; // 尝试执行吹动
  now(): number; // Date.now
  setPlayerAnimation(animation: Record<string, unknown>): void; // 玩家动画状态 = ...
  landPlayer(oldX: number, oldY: number, x: number, y: number): void; // 处理玩家着陆效果
  log(message: string, type: string): void; // 添加日志
  updateIndicators(): void; // 更新物体指示器
}

/**
 * Source `处理大风效果()` (HTML L44434): one random wind direction; visible items (in visited rooms or corridors),
 * active monsters and the player in the camera viewport each get a 30% planned push, executed items first, then
 * monsters, then the player (blocked only by immovable or unpickable items).
 */
export function processWind(state: WorldState, ports: WindPorts): void {
  const S = state as Loose;
  const directions = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
  const { dx, dy } = directions[Math.floor(ports.random() * 4)]!;
  const rect = ports.canvasRect();
  const camera = ports.camera();
  const startX = Math.floor(camera.x);
  const startY = Math.floor(camera.y);
  const widthCells = Math.ceil(rect.width / ports.cellSize());
  const heightCells = Math.ceil(rect.height / ports.cellSize());
  const endX = Math.min(S.地牢大小 - 1, startX + widthCells);
  const endY = Math.min(S.地牢大小 - 1, startY + heightCells);
  const plan = new Map<unknown, BlowPlan>();
  const blocked = (x: number, y: number) => [单元格类型.墙壁, 单元格类型.上锁的门].includes(S.地牢[y][x]?.背景类型);
  const inBounds = (x: number, y: number) => x >= 0 && x < S.地牢大小 && y >= 0 && y < S.地牢大小;
  const visible = (x: number, y: number) => S.已访问房间.has(S.房间地图[y][x]) || S.房间地图[y][x] === -1;

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const item = S.地牢[y]?.[x]?.关联物品;
      if (item && !IMMOVABLE_TYPES.includes(item.类型) && visible(x, y)) {
        if (ports.random() < 大风吹动概率) {
          const nx = x + dx;
          const ny = y + dy;
          if (inBounds(nx, ny) && !blocked(nx, ny) && ports.canMoveStraight(x, y, nx, ny, true) && visible(x, y)
            && (!ports.isPoisonGasTrap(item) || !item.自定义数据.get('已触发'))) {
            plan.set(item, { 新X: nx, 新Y: ny, 旧X: x, 旧Y: y, 类型: '物品' });
          }
        }
      }
    }
  }

  S.所有怪物.forEach((monster: Loose) => {
    const { x, y } = monster;
    if (monster.状态 === 怪物状态.活跃 && x >= startX && x <= endX && y >= startY && y <= endY) {
      if (ports.random() < 大风吹动概率) {
        const nx = x + dx;
        const ny = y + dy;
        if (inBounds(nx, ny) && !blocked(nx, ny) && ports.canMoveStraight(x, y, nx, ny, true)) {
          plan.set(monster, { 新X: nx, 新Y: ny, 旧X: x, 旧Y: y, 类型: '怪物' });
        }
      }
    }
  });

  const player = S.玩家;
  if (player.x >= startX && player.x <= endX && player.y >= startY && player.y <= endY) {
    if (ports.random() < 大风吹动概率) {
      const nx = player.x + dx;
      const ny = player.y + dy;
      if (inBounds(nx, ny) && !blocked(nx, ny) && ports.canMoveStraight(player.x, player.y, nx, ny, true)) {
        plan.set(player, { 新X: nx, 新Y: ny, 旧X: player.x, 旧Y: player.y, 类型: '玩家' });
      }
    }
  }

  const done = new Set<unknown>();
  const pending = Array.from(plan.keys());
  pending.filter((instance) => ports.isItem(instance)).forEach((instance) => { ports.tryBlow(instance, plan, done, dx, dy); });
  pending.filter((instance) => ports.isMonster(instance)).forEach((instance) => { ports.tryBlow(instance, plan, done, dx, dy); });

  if (plan.has(player) && !done.has(player)) {
    const { 新X, 新Y } = plan.get(player)!;
    const occupant = S.地牢[新Y]?.[新X]?.关联物品;
    const occupantImmovable = occupant && (IMMOVABLE_TYPES.includes(occupant.类型) || occupant.能否拾起 === false);
    if (!occupantImmovable) {
      ports.setPlayerAnimation({ 正在动画: true, 旧逻辑X: player.x, 旧逻辑Y: player.y, 目标逻辑X: 新X, 目标逻辑Y: 新Y, 视觉X: player.x, 视觉Y: player.y, 动画开始时间: ports.now() });
      const oldX = player.x;
      const oldY = player.y;
      player.x = 新X;
      player.y = 新Y;
      ports.landPlayer(oldX, oldY, 新X, 新Y);
      ports.log('你被大风吹动了！', '警告');
      done.add(player);
    } else {
      ports.log('你试图被风吹动，但撞到了障碍物！', '信息');
    }
  }

  ports.updateIndicators();
  S.所有怪物.forEach((monster: Loose) => monster.绘制血条());
}
