import { 单元格类型, 环境类型, 调试序列, 颜色表 } from './constants';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type ItemClass = new (options: { 数量: number }) => unknown;

/** Page-level movement/camera/animation globals that are UI runtime, not saved world state. */
export interface MoveSession {
  相机目标X: number;
  相机目标Y: number;
  编辑器状态: { 相机速度: number } & Record<string, unknown>;
  玩家动画状态: Record<string, unknown>;
  上次移动: number;
  相机锁定: boolean;
  钩索移动定时器: unknown;
  /** Owned by the transition animation; read only here. */
  切换动画: unknown;
  moveQueue: unknown[];
  isAutoMoving: boolean;
}

export const createMoveSession = (): MoveSession => ({
  相机目标X: 0, 相机目标Y: 0, 编辑器状态: { 相机速度: 1 }, 玩家动画状态: { 正在动画: false }, 上次移动: 0, 相机锁定: false,
  钩索移动定时器: null, 切换动画: false, moveQueue: [], isAutoMoving: false,
});

export interface MovePorts {
  now(): number; // Date.now
  random(): number;
  isOnline(): unknown; // 联机模式
  emit(event: string, payload: unknown): void; // socket.emit
  clearTimeout(handle: unknown): void;
  isFence(item: unknown): boolean; // instanceof 栅栏
  isSokobanBox(item: unknown): boolean; // instanceof 推箱子箱子
  isPressurePlate(item: unknown): boolean; // instanceof 压感开关
  isSokobanTarget(item: unknown): boolean; // instanceof 推箱子目标
  isWarpGate(item: unknown): boolean; // instanceof 折跃门
  isTreasureRing(item: unknown): boolean; // instanceof 寻宝戒指
  log(message: string, type: string): void; // 添加日志
  notify(message: string, type: string, flag?: boolean): void; // 显示通知
  canMove(fromX: number, fromY: number, toX: number, toY: number): boolean; // 检查移动可行性
  deductEnergy(amount: number): unknown; // 扣除能量
  generateWalls(): void; // 生成墙壁
  getMoveDirection(fromX: number, fromY: number, toX: number, toY: number): unknown;
  isPositionFree(x: number, y: number, considerPlayer: boolean): boolean; // 位置是否可用
  checkSokobanSolved(roomId: unknown): void; // 检查推箱子解谜完成
  handleLanding(oldX: number, oldY: number, newX: number, newY: number): unknown; // 处理玩家着陆效果
  playSound(name: string): void; // 音效管理器.播放音效
  triggerEvent(name: string, payload: unknown): void; // 触发游戏事件
  buildDistanceMap(x: number, y: number): number[][]; // 生成玩家距离图
  tryEnterSpecialRoom(x: number, y: number): void; // 尝试进入特殊房间
  processTurn(): void; // 处理回合逻辑
  /** The literal debug item class list of the source, in order, plus the `金币` class. */
  debugItemClasses(): { classes: ItemClass[]; gold: ItemClass };
  placeItemInRoom(item: unknown, room: unknown): unknown; // 放置物品到房间
  dropItem(id: unknown): unknown; // 处理丢弃物品
  refreshPhantomRooms(px: number, py: number, sx: number, sy: number): void; // 处理诡魅房间刷新
  updateViewport(): void;
  updateLightMap(): void;
  drawMinimap(): void;
  draw(): void; // 绘制
  updateUiState(): void;
}

const isIce = (cell: Loose) => cell?.环境 === 环境类型.冰 || cell?.环境 === 环境类型.血冰;

/**
 * Source `async 移动玩家(dx, dy, 冷却 = false, 剩余步数 = 1)` (HTML L45494). The function never awaits; keeping it
 * `async` preserves the source contract that a throw becomes a rejected promise.
 */
export async function movePlayer(state: WorldState, session: MoveSession, ports: MovePorts, dx: number, dy: number, cooldown: unknown = false, remaining: number = 1): Promise<false | undefined> {
  const S = state as Loose;
  if (S.游戏状态 === '地图编辑器') {
    session.相机目标X += dx * session.编辑器状态.相机速度;
    session.相机目标Y += dy * session.编辑器状态.相机速度;
    const nx = S.玩家.x + dx;
    const ny = S.玩家.y + dy;
    if (nx < 0 || nx >= S.地牢大小 || ny < 0 || ny >= S.地牢大小) return undefined;
    session.玩家动画状态 = { 正在动画: true, 旧逻辑X: S.玩家.x, 旧逻辑Y: S.玩家.y, 目标逻辑X: nx, 目标逻辑Y: ny, 视觉X: S.玩家.x, 视觉Y: S.玩家.y, 动画开始时间: ports.now() };
    S.玩家.x = nx;
    S.玩家.y = ny;
    ports.drawMinimap();
    ports.updateViewport();
    return undefined;
  }
  if (S.玩家属性.允许移动 > 0 || (S.游戏状态 !== '游戏中' && S.游戏状态 !== '图鉴' && S.游戏状态 !== '编辑器游玩')) return false;
  if (cooldown) {
    const now = ports.now();
    if (now - session.上次移动 < S.游戏设置.移动速度) return undefined;
    session.上次移动 = now;
  }
  if (ports.isOnline()) ports.emit('playerAction', { type: 'move', dx, dy });
  const fenceX = S.玩家.x + Math.sign(dx);
  const fenceY = S.玩家.y + Math.sign(dy);
  if (fenceX >= 0 && fenceX < S.地牢大小 && fenceY >= 0 && fenceY < S.地牢大小) {
    const cell = S.地牢[fenceY][fenceX];
    if (ports.isFence(cell?.关联物品)) {
      cell.关联物品.尝试互动();
      return undefined;
    }
  }
  const statuses = S.玩家状态 as Loose[];
  const stunned = statuses.some((s) => s.类型 === '眩晕');
  const frozen = statuses.some((s) => s.类型 === '冻结');
  const slowed = statuses.some((s) => s.类型 === '缓慢');
  const pinned = statuses.some((s) => s.类型 === '牵制');

  if (stunned && (dx !== 0 || dy !== 0)) {
    ports.log('你晕头转向，胡乱移动！', '警告');
    const directions = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
    const open = directions.filter((dir) => ports.canMove(S.玩家.x, S.玩家.y, S.玩家.x + dir.dx, S.玩家.y + dir.dy));
    if (open.length > 0) {
      const dir = open[Math.floor(ports.random() * open.length)]!;
      dx = dir.dx;
      dy = dir.dy;
    } else {
      dx = 0;
      dy = 0;
    }
    dx *= S.玩家属性.移动步数;
    dy *= S.玩家属性.移动步数;
    if (slowed) { dx = Math.sign(dx); dy = Math.sign(dy); }
  } else if (slowed) {
    dx = Math.sign(dx);
    dy = Math.sign(dy);
  }

  const here = S.地牢[S.玩家.y]?.[S.玩家.x];
  if (isIce(here) && !frozen && !pinned && (dx !== 0 || dy !== 0)) {
    let slide = 0;
    let cx = S.玩家.x;
    let cy = S.玩家.y;
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    const maxSlide = here?.环境 === 环境类型.冰 ? 1 : 2;
    for (let i = 1; i <= maxSlide; i++) {
      const nx = cx + sx;
      const ny = cy + sy;
      if (ports.canMove(cx, cy, nx, ny) && isIce(S.地牢[ny]?.[nx])) {
        slide++;
        cx = nx;
        cy = ny;
      } else {
        break;
      }
    }
    remaining += slide;
  }

  dx = Math.sign(dx) * remaining;
  dy = Math.sign(dy) * remaining;
  const newX = S.玩家.x + dx;
  const newY = S.玩家.y + dy;
  if (newX < 0 || newX >= S.地牢大小 || newY < 0 || newY >= S.地牢大小) return undefined;
  session.相机锁定 = false;
  if (S.玩家正在钩索) {
    S.玩家正在钩索 = false;
    ports.clearTimeout(session.钩索移动定时器);
  }
  const digX = S.玩家.x + Math.sign(dx);
  const digY = S.玩家.y + Math.sign(dy);
  if (S.玩家属性.能挖掘墙壁 && (dx !== 0 || dy !== 0) && !S.生存挑战激活) {
    if (digX >= 0 && digX < S.地牢大小 && digY >= 0 && digY < S.地牢大小) {
      const target = S.地牢[digY]?.[digX];
      if (target && target.背景类型 === 单元格类型.墙壁) {
        if (ports.deductEnergy(5)) {
          target.背景类型 = S.地牢[S.玩家.y][S.玩家.x].背景类型;
          ports.generateWalls();
        } else {
          ports.notify('能量不足，无法挖掘！', '错误');
          return false;
        }
      }
    }
  }

  let moved = 0;
  let targetX: number;
  let targetY = 0;
  const startX = S.玩家.x;
  const startY = S.玩家.y;
  while (remaining > 0 && !(frozen || pinned) && (S.玩家.x !== newX || S.玩家.y !== newY)) {
    targetX = S.玩家.x + Math.sign(dx);
    targetY = S.玩家.y + Math.sign(dy);
    const target = S.地牢[targetY]?.[targetX];
    if (!ports.canMove(S.玩家.x, S.玩家.y, targetX, targetY)) break;
    if (!target) {
      ports.updateViewport();
      ports.draw();
      return undefined;
    }
    if (target.isOneWay && [单元格类型.门, 单元格类型.上锁的门].includes(target.背景类型)) {
      if (ports.getMoveDirection(S.玩家.x, S.玩家.y, targetX, targetY) !== target.oneWayAllowedDirection) break;
    }
    const oldX = S.玩家.x;
    const oldY = S.玩家.y;
    const boxCell = S.地牢[targetY]?.[targetX];
    if (ports.isSokobanBox(boxCell?.关联物品)) {
      const pushX = targetX + (targetX - S.玩家.x);
      const pushY = targetY + (targetY - S.玩家.y);
      if (ports.isPositionFree(pushX, pushY, false)) {
        const box = boxCell.关联物品;
        const covered = box.自定义数据.get('被压物品');
        if (covered) {
          boxCell.关联物品 = covered;
          boxCell.类型 = 单元格类型.物品;
          if (ports.isPressurePlate(covered)) covered.触发(false);
          box.自定义数据.set('被压物品', null);
        } else {
          boxCell.关联物品 = null;
          if (boxCell.类型 === 单元格类型.物品) boxCell.类型 = null;
        }
        const destination = S.地牢[pushY][pushX];
        const existing = destination.关联物品;
        if (ports.isPressurePlate(existing)) {
          box.自定义数据.set('被压物品', existing);
          destination.关联物品 = box;
          destination.类型 = 单元格类型.物品;
          existing.触发(true);
        } else if (ports.isSokobanTarget(existing)) {
          destination.关联物品 = null;
          if (destination.类型 === 单元格类型.物品) destination.类型 = null;
          destination.颜色索引 = boxCell.颜色索引;
        } else {
          destination.关联物品 = box;
          destination.类型 = 单元格类型.物品;
          destination.颜色索引 = boxCell.颜色索引;
        }
        boxCell.颜色索引 = 颜色表.length;
        box.x = pushX;
        box.y = pushY;
        // Source reads the room at the move's final target (新X, 新Y), not at the box.
        const roomId = S.房间地图[newY]?.[newX];
        if (roomId !== -1) ports.checkSokobanSolved(roomId);
      }
    }
    S.玩家.x = targetX;
    S.玩家.y = targetY;
    if (ports.handleLanding(oldX, oldY, targetX, targetY)) break;
    moved++;
    remaining--;
    if (S.当前激活卷轴列表.size > 0 && moved > 0) {
      S.当前激活卷轴列表.forEach((scroll: Loose) => { scroll.消耗能量(); });
    }
    if (moved > 0) {
      ports.playSound('玩家移动');
      ports.triggerEvent('玩家移动', { x: S.玩家.x, y: S.玩家.y });
    }
  }
  session.玩家动画状态 = { 正在动画: true, 旧逻辑X: startX, 旧逻辑Y: startY, 目标逻辑X: S.玩家.x, 目标逻辑Y: S.玩家.y, 视觉X: startX, 视觉Y: startY, 动画开始时间: ports.now() };
  S.玩家距离图 = ports.buildDistanceMap(S.玩家.x, S.玩家.y);
  if (S.地牢生成方式 === 'default') ports.tryEnterSpecialRoom(S.玩家.x, S.玩家.y);
  if (!session.切换动画 && (frozen || pinned || moved > 0)) ports.processTurn();
  if (ports.isWarpGate(S.地牢[S.玩家.y][S.玩家.x].关联物品)) S.地牢[S.玩家.y][S.玩家.x].关联物品.使用();

  if (moved > 0 || frozen) {
    const direction = Math.sign(dy) === -1 ? '上' : Math.sign(dy) === 1 ? '下' : Math.sign(dx) === -1 ? '左' : Math.sign(dx) === 1 ? '右' : '';
    if ((!S.是否是自定义关卡 && S.游戏状态 !== '编辑器游玩') || S.开发者模式) S.移动历史.push(direction);
    if (S.移动历史.length > 调试序列.length) S.移动历史 = S.移动历史.slice(-调试序列.length);
    Array.from({ length: S.装备栏每页装备数 }, (_, i) => S.玩家装备.get(S.当前装备页 * S.装备栏每页装备数 + i + 1))
      .filter((v) => v != null)
      .forEach((item: Loose) => {
        if (ports.isTreasureRing(item)) {
          if (item.自定义数据.get('生效层数') === S.当前层数 && !item.自定义数据.get('已生成折跃门')) item.尝试生成折跃门();
        }
      });
    if (S.移动历史.join(',') === 调试序列.join(',')) {
      const roomId = S.房间地图[S.玩家.y][S.玩家.x];
      if (roomId !== -1) {
        const { classes, gold } = ports.debugItemClasses();
        classes.forEach((cls) => ports.placeItemInRoom(new cls({ 数量: cls === gold ? 64 : 1 }), S.房间列表[roomId]));
        if (!S.彩蛋3触发) {
          ports.notify('你被加强了，快上！', '信息', true);
          S.彩蛋3触发 = true;
        }
      }
      S.移动历史 = [];
    }
    ports.updateViewport();
    if (ports.isOnline()) ports.updateLightMap();
    if (S.当前天气效果.includes('诡魅')) ports.refreshPhantomRooms(S.玩家.x - dx, S.玩家.y - dy, S.玩家.x, S.玩家.y);
  }
  if (session.isAutoMoving && (S.玩家.x !== newX || S.玩家.y !== newY) && S.游戏设置.自动移动可打断) {
    session.moveQueue = [];
    session.isAutoMoving = false;
  }
  if (S.玩家属性.随机掉落 && ports.random() < 0.09) {
    const droppable = [...S.玩家背包.values()].filter((item: Loose) => !item.是否隐藏 && !item.已装备);
    if (droppable.length > 0) {
      const item = droppable[Math.floor(ports.random() * droppable.length)];
      if (ports.dropItem(item.唯一标识)) ports.notify(`【诅咒】你的 ${item.获取名称()} 不小心掉了出来！`, '警告');
    }
  }
  ports.updateUiState();
  ports.draw();
  return undefined;
}
