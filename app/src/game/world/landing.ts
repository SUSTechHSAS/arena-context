import { MATERIALS } from '../item-core';
import { 单元格类型, 效果名称编号映射, 效果颜色编号映射, 环境类型 } from './constants';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** `instanceof` checks against packet-owned classes. */
export interface LandingKinds {
  isWaterShoes(item: unknown): boolean; // 水鞋 (app/src/game/armor-items.ts)
  isScroll(item: unknown): boolean; // 卷轴类 (t10-scroll-core)
  isTorch(item: unknown): boolean; // 火把 (t10-torch-fire)
  isCustomNpc(item: unknown): boolean; // 自定义NPC (t10-npc-contract-item)
  isSignboard(item: unknown): boolean; // 告示牌 (t10-display-logic-items)
  isWarpGate(item: unknown): boolean; // 折跃门 (t10-portal-items)
}

export interface LandingPorts {
  kinds: LandingKinds;
  random(): number;
  damagePlayer(amount: number, source: string): void; // 伤害玩家
  /** Source `new 状态效果(type, colour, icon, duration, null, null, null, level)` (app/src/game/status-effect.ts). */
  createStatusEffect(...args: unknown[]): void;
  log(message: string, type: string): void;
  notify(message: string, type: string): void;
  destroyInventoryItem(id: unknown, silent: true): void; // 处理销毁物品
  refreshEquipment(): void; // 更新装备显示
  triggerPotionWater(player: unknown, cell: unknown): void; // 触发药水水域效果
  /** Source `document.querySelector('.galgame-overlay')` is present. */
  isDialogueOpen(): boolean;
  failChallenge(room: Loose): void; // 处理挑战失败
  tryCollectItem(item: unknown): unknown; // 尝试收集物品
  /** Source `document.getElementById("跳过教程按钮").style.display = "none"`. */
  hideSkipTutorialButton(): void;
  resetPlayerState(): void; // 重置玩家状态
  changeFloor(...args: unknown[]): unknown; // 切换楼层
  handleOneWayRoom(oldX: number, oldY: number, newX: number, newY: number): void; // world/special-rooms.ts
  /** Source `moveQueue = []; isAutoMoving = false;` (input layer). */
  cancelAutoMove(): void;
  startChallenge(room: Loose): void; // 开始挑战
  /** Source `教程提示已显示 = false; 显示教程提示();` (tutorial UI). */
  resetTutorialHint(): void;
  showTutorialHint(): void;
  updateCaveVision(): void; // 更新洞穴视野
  tryEnterSpecialRoom(x: number, y: number): void; // world/special-rooms.ts
}

const equippedPage = (state: WorldState) => {
  const perPage = state.装备栏每页装备数;
  return Array.from({ length: perPage }, (_, i) => state.玩家装备.get(state.当前装备页 * perPage + i + 1)) as Loose[];
};

/**
 * Source `处理玩家着陆效果(旧X, 旧Y, 新X, 新Y)` (HTML L45173): terrain, forced dialogue, challenge exit, hidden
 * items, pickup/stairs/warp, room entry. Returns true when the landing ended the move (floor change or used gate).
 */
export function handlePlayerLanding(state: WorldState, ports: LandingPorts, oldX: number, oldY: number, newX: number, newY: number): boolean {
  const grid = state.地牢 as Loose[][];
  const roomMap = state.房间地图 as Loose;
  const attributes = state.玩家属性 as Loose;
  const { kinds } = ports;
  const cell = grid[newY]?.[newX];
  if (!cell) return false;
  const oldRoomId = roomMap[oldY][oldX];
  if (cell.环境 === 环境类型.岩浆) {
    const fireResistant = (state.玩家状态 as Loose[]).some(s => s.类型 === '抗火');
    const waterShoes = equippedPage(state).some(item => kinds.isWaterShoes(item));
    if (!fireResistant && !waterShoes) {
      ports.damagePlayer(10, '岩浆');
      ports.createStatusEffect('火焰', 效果颜色编号映射[效果名称编号映射.火焰], '火', 3, null, null, null, 3);
      ports.log('你踩进了灼热的岩浆！', '错误');
    }
  }
  if (cell.环境 === 环境类型.水) {
    let soaked = false;
    const timers = state.所有计时器 as Loose[];
    const soak = (item: Loose) => {
      if (!item) return;
      if ((kinds.isScroll(item) && !(state.当前激活卷轴列表 as Loose).has(item)) || item.材质 === MATERIALS.木质 || kinds.isTorch(item)) {
        if (!item.自定义数据.has('静默回合') || item.自定义数据.get('静默回合') <= 0) {
          if (!timers.some(t => t.唯一标识 === item.唯一标识) || kinds.isTorch(item)) {
            item.自定义数据.set('静默回合', 30);
            timers.push(item);
            soaked = true;
          }
        }
      }
    };
    // eslint-disable-next-line eqeqeq
    equippedPage(state).filter(v => v != null).forEach(equipment => {
      soak(equipment);
      if (equipment.材质 === MATERIALS.铁质 && !equipment.自定义数据.get('不可破坏')) {
        if (ports.random() < 0.15) {
          const rust = equipment.自定义数据.get('锈蚀度') || 0;
          equipment.自定义数据.set('锈蚀度', rust + 1);
          if (equipment.自定义数据.has('耐久')) {
            const durability = Math.max(0, equipment.自定义数据.get('耐久') - 2);
            equipment.自定义数据.set('耐久', durability);
            if (durability <= 0) {
              ports.destroyInventoryItem(equipment.唯一标识, true);
              ports.notify(`你的 ${equipment.获取名称()} 在水中彻底锈蚀损坏了！`, '错误');
            } else {
              ports.notify(`你的 ${equipment.获取名称()} 在水中生锈了！`, '警告');
            }
          }
          soaked = true;
        }
      }
    });
    if (soaked) ports.notify('你的背包进水了！', '警告');
    const burning = (state.玩家状态 as Loose[]).find(s => s.类型 === '火焰');
    if (burning) {
      burning.移除状态();
      ports.notify('你在水中熄灭了火焰！', '成功');
    }
  }
  if (cell.环境 === 环境类型.血水) {
    const maxHealth = 100 + (attributes.最大生命值加成 || 0);
    const heal = Math.floor(maxHealth * 0.05);
    const health = (attributes.当前生命值 / 100) * maxHealth;
    if (health < maxHealth) {
      const next = Math.min(maxHealth, health + heal);
      attributes.当前生命值 = (next / maxHealth) * 100;
      cell.环境 = 环境类型.水;
      ports.notify(`血水滋养了你，恢复了 ${heal} 点生命！`, '成功');
      ports.refreshEquipment();
    }
  }
  if (cell.环境 === 环境类型.药水水域) ports.triggerPotionWater(state.玩家, cell);
  if (!ports.isDialogueOpen()) {
    const player = state.玩家 as Loose;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const neighbour = grid[player.y + dy]?.[player.x + dx];
      if (kinds.isCustomNpc(neighbour?.关联物品) && neighbour.关联物品.自定义数据.get('强制对话')) {
        neighbour.关联物品.尝试互动();
        break;
      }
    }
  }
  const rooms = state.房间列表 as Loose[];
  if (oldRoomId !== -1) {
    // eslint-disable-next-line eqeqeq
    const oldRoom = rooms.find(t => t.id == oldRoomId);
    if (oldRoom && oldRoom.类型 === '挑战房间' && oldRoom.挑战状态 && oldRoom.挑战状态.进行中 && roomMap[newY][newX] !== oldRoomId) ports.failChallenge(oldRoom);
  }
  if (kinds.isSignboard(cell.关联物品) && cell.关联物品.自定义数据.get('隐藏')) {
    const sign = cell.关联物品;
    sign.自定义数据.set('隐藏', false);
    sign.显示内容();
  }
  if (cell.关联物品?.自定义数据?.get('隐藏')) {
    cell.关联物品.使用();
    cell.关联物品.自定义数据.set('隐藏', false);
    ports.notify(`你踩到了一个隐藏的 ${cell.关联物品.名称}！`, '警告');
  }
  if (cell.关联物品 && cell.类型 === 单元格类型.物品 && !cell.关联物品.是否被丢弃) {
    if (ports.tryCollectItem(cell.关联物品)) {
      cell.类型 = null;
      cell.关联物品 = null;
    }
  } else if (([单元格类型.楼梯下楼, 单元格类型.楼梯上楼] as unknown[]).includes(cell.类型)) {
    if (state.是否为教程层 && cell.类型 === 单元格类型.楼梯下楼) {
      state.是否为教程层 = false;
      (state.所有怪物 as Loose[]).forEach(m => {
        m.绘制血条(true);
        if (grid[m.y] && grid[m.y]![m.x]) grid[m.y]![m.x].关联怪物 = null;
      });
      state.所有怪物 = [];
      ports.hideSkipTutorialButton();
      ports.resetPlayerState();
      ports.changeFloor(0);
      return true;
    } else if (cell.关联物品?.使用) {
      cell.关联物品.使用();
      return true;
    } else {
      const target = cell.类型 === 单元格类型.楼梯下楼 ? state.当前层数 + 1 : state.当前层数 - 1;
      ports.changeFloor(target, false, null, true);
    }
  } else if (kinds.isWarpGate(cell.关联物品)) {
    if (cell.关联物品.使用()) return true;
  }

  const targetRoomId = roomMap[newY][newX];
  ports.handleOneWayRoom(oldX, oldY, newX, newY);
  const visited = state.已访问房间 as Set<unknown>;
  if (targetRoomId !== -1 && !visited.has(targetRoomId)) {
    ports.cancelAutoMove();
    visited.add(targetRoomId);
    attributes.当前能量值 = Math.min(100, attributes.当前能量值 + 1.5 / (state.自定义全局设置 as Loose).初始能量值 * 100);
    // eslint-disable-next-line eqeqeq
    const entered = rooms.find(t => t.id == targetRoomId);
    if (entered && entered.类型 === '挑战房间' && entered.挑战状态 && !entered.挑战状态.进行中 && !entered.挑战状态.已完成) ports.startChallenge(entered);
    if (state.是否为教程层) {
      state.教程阶段 = targetRoomId;
      ports.resetTutorialHint();
      ports.showTutorialHint();
    }
  }
  ports.updateCaveVision();
  if (state.地牢生成方式 === 'default') ports.tryEnterSpecialRoom(newX, newY);
  return false;
}

export interface CaveVisionPorts {
  /** Source `广度优先搜索路径(sx, sy, tx, ty, maxSteps, false, false, false)` (packet `t10-path-search`). */
  findPath(fromX: number, fromY: number, toX: number, toY: number, maxSteps: number, a: false, b: false, c: false): unknown;
}

/** Source `更新洞穴视野()`: reveal cave cells within radius 5 that a short BFS path reaches. */
export function updateCaveVision(state: WorldState, ports: CaveVisionPorts): void {
  if (state.地牢生成方式 !== 'cave' || state.游戏状态 === '地图编辑器') return;
  const radius = 5;
  const player = state.玩家 as Loose;
  const grid = state.地牢 as Loose[][];
  for (let y = player.y - radius; y <= player.y + radius; y++) {
    for (let x = player.x - radius; x <= player.x + radius; x++) {
      if (x < 0 || x >= state.地牢大小 || y < 0 || y >= state.地牢大小) continue;
      if (Math.pow(x - player.x, 2) + Math.pow(y - player.y, 2) <= radius * radius) {
        if (ports.findPath(player.x, player.y, x, y, radius, false, false, false)) {
          grid[y]![x].已揭示 = true;
          (state.已揭示洞穴格子 as Set<string>).add(`${x},${y}`);
        }
      }
    }
  }
}
