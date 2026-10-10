import { 单元格类型 } from './constants';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface RespawnPorts {
  random(): number;
  refreshPhantomRooms(px: number, py: number, sx: number, sy: number): void; // 处理诡魅房间刷新
  notify(message: string, type: string): void;
  failChallenge(room: Loose): void; // 处理挑战失败
  /** Page globals `联机模式` and `socket` (`typeof socket !== 'undefined' && socket.connected`). */
  isOnline(): unknown;
  socketConnected(): unknown;
  emit(event: string, payload: unknown): void;
  restoreChallengeArea(): void; // 恢复挑战区域
  isChallengeStele(item: unknown): boolean; // instanceof 挑战石碑
  isThroneGuardian(monster: unknown): boolean; // instanceof 王座守护者 (t10-boss-throne)
  updateVictoryDisplay(): void; // 更新胜利条件显示
  applyPermanentBuffs(): void; // 应用永久Buffs
  isPositionFree(x: number, y: number, considerPlayer?: boolean): boolean; // 位置是否可用
  findPath(fromX: number, fromY: number, toX: number, toY: number, maxSteps: number): unknown; // 广度优先搜索路径
  refreshEquipment(): void; // 更新装备显示
  refreshInventory(): void; // 更新背包显示
  changeFloor(floor: number, fullRespawn: boolean, target: null, viaStairs: boolean, onComplete: () => void): unknown; // 切换楼层 (not awaited)
  enterTutorial(): void; // 进入教程层
  updateUiState(): void;
  updateObjectIndicators(): void;
  /** Source `document.getElementById("死亡遮罩")?.remove()`. */
  removeDeathMask(): void;
  updateViewport(): void;
  drawMinimap(): void;
  updateLightMap(): void;
}

/**
 * Source `处理重生(保留物品)` (HTML L41567): death bookkeeping, then either an in-place respawn (keeping items) or a
 * full reset to floor 0. Source quirks preserved (DEVIATIONS SRC-14): rooms are indexed by array position, and the
 * floor-5 / floor-15 position searches loop until they find a cell.
 */
export function handleRespawn(state: WorldState, ports: RespawnPorts, keepItems: unknown): void {
  const S = state as Loose;
  if (S.当前天气效果.includes('诡魅')) ports.refreshPhantomRooms(S.玩家.x, S.玩家.y, S.玩家初始位置.x, S.玩家初始位置.y);
  if (S.游戏状态 === '地图编辑器') {
    ports.notify('不支持在地图编辑器自杀', '错误');
    return;
  }
  if (S.游戏状态 === '地图编辑器' || S.游戏状态 === '胜利' || S.游戏状态 === '图鉴选择' || S.游戏状态 === '图鉴') return;
  const playerRoomId = S.房间地图[S.玩家.y]?.[S.玩家.x];
  const playerRoom = S.房间列表[playerRoomId];
  if (playerRoom && playerRoom.类型 === '挑战房间' && playerRoom.挑战状态?.进行中) ports.failChallenge(playerRoom);
  if (ports.isOnline() && ports.socketConnected()) ports.emit('playerRespawn', { x: S.玩家.x, y: S.玩家.y });
  if (S.生存挑战激活) {
    ports.restoreChallengeArea();
    S.生存挑战激活 = false;
    let stele: Loose = null;
    let steleRoom: Loose = null;
    for (const row of S.地牢) {
      for (const cell of row) {
        if (ports.isChallengeStele(cell.关联物品) && cell.关联物品.自定义数据.get('已激活')) {
          stele = cell.关联物品;
          const roomId = S.房间地图[cell.y]?.[cell.x];
          if (roomId !== undefined && roomId !== -1) steleRoom = S.房间列表[roomId];
          break;
        }
      }
      if (stele) break;
    }
    if (stele && steleRoom) {
      stele.发放奖励(steleRoom.survivalWave);
      stele.自定义数据.set('已激活', false);
    }
    S.房间列表.forEach((room: Loose) => { if (room && room.isSurvivalChallenge) room.isSurvivalChallenge = false; });
  }
  if (!S.是否为教程层 && S.当前层数 !== null) S.上次死亡地点 = { 层数: S.当前层数, x: S.玩家.x, y: S.玩家.y };

  S.玩家死亡次数++;
  ports.updateVictoryDisplay();
  S.玩家属性.当前生命值 = S.自定义全局设置.初始生命值;
  S.玩家属性.当前能量值 = S.自定义全局设置.初始能量值;
  S.玩家状态.forEach((m: Loose) => { m.移除状态(); });
  if (S.当前激活卷轴列表.size > 0) {
    S.当前激活卷轴列表.forEach((scroll: Loose) => {
      S.当前激活卷轴列表.delete(scroll);
      scroll.卸下();
    });
  }
  S.玩家属性.允许移动 = 0;
  ports.applyPermanentBuffs();
  S.玩家状态 = [];

  if (keepItems) {
    if (S.自定义游戏设置.洞穴随机重生 && (S.地牢生成方式 === 'cave' || S.地牢生成方式 === 'maze')) {
      let rx = S.玩家初始位置.x;
      let ry = S.玩家初始位置.y;
      let found = false;
      if (S.已使用存档点 && ports.isPositionFree(S.玩家初始位置.x, S.玩家初始位置.y)) {
        rx = S.玩家初始位置.x;
        ry = S.玩家初始位置.y;
        found = true;
      }
      if (!found && S.地牢生成方式 === 'cave') {
        const spots = Array.from(S.已揭示洞穴格子 as Set<string>);
        if (spots.length > 0) {
          for (let i = 0; i < spots.length * 2; i++) {
            const key = spots[Math.floor(ports.random() * spots.length)]!;
            const [x, y] = key.split(',').map(Number) as [number, number];
            if (ports.isPositionFree(x, y)) { rx = x; ry = y; found = true; break; }
          }
        }
      } else if (!found && S.地牢生成方式 === 'maze') {
        const visited = S.房间列表.filter((room: Loose) => room && S.已访问房间.has(room.id) && room.类型 === '房间');
        if (visited.length > 0) {
          for (let i = 0; i < 50; i++) {
            const room = visited[Math.floor(ports.random() * visited.length)];
            const x = room.x + Math.floor(ports.random() * room.w);
            const y = room.y + Math.floor(ports.random() * room.h);
            if (ports.isPositionFree(x, y)) { rx = x; ry = y; found = true; break; }
          }
        }
      }
      S.玩家.x = rx;
      S.玩家.y = ry;
    } else if (S.当前层数 === 5) {
      const mazeSize = 85;
      const offsetX = Math.floor((S.地牢大小 - mazeSize) / 2);
      const offsetY = Math.floor((S.地牢大小 - mazeSize) / 2);
      let rx: number; let ry: number;
      do {
        rx = offsetX + Math.floor(ports.random() * mazeSize);
        ry = offsetY + Math.floor(ports.random() * mazeSize);
      } while (S.地牢[ry]?.[rx]?.背景类型 !== 单元格类型.走廊);
      S.玩家.x = rx;
      S.玩家.y = ry;
    } else if (S.当前层数 === 15) {
      const roomId = S.房间地图[S.玩家.y][S.玩家.x];
      const room = S.房间列表.find((r: Loose) => r.id === roomId);
      let rx = S.玩家初始位置.x;
      let ry = S.玩家初始位置.y;
      let found = false;
      if (room) {
        for (let i = 0; i < 50;) {
          const x = room.x + Math.floor(ports.random() * room.w);
          const y = room.y + Math.floor(ports.random() * room.h);
          if (ports.isPositionFree(x, y, false)) {
            if (room.名称 === '最终秘室') {
              const boss = S.所有怪物.find((m: Loose) => ports.isThroneGuardian(m));
              if (boss && ports.findPath(x, y, boss.x, boss.y, 999)) { rx = x; ry = y; found = true; break; }
            } else {
              rx = x; ry = y; found = true; break;
            }
            i++;
          }
        }
      }
      if (!found && room) {
        rx = room.x + Math.floor(room.w / 2);
        ry = room.y + Math.floor(room.h / 2);
      }
      S.玩家.x = rx;
      S.玩家.y = ry;
    } else {
      S.玩家.x = S.玩家初始位置.x;
      S.玩家.y = S.玩家初始位置.y;
    }
    S.玩家背包.forEach((item: Loose) => {
      if (item.类型 === '武器' && item.自定义数据.get('冷却剩余') > 0) item.自定义数据.set('冷却剩余', 0);
    });
    ports.refreshEquipment();
  } else {
    S.上次死亡地点 = null;
    S.玩家背包.clear();
    S.玩家装备.clear();
    S.所有地牢层.clear();
    S.已访问房间.clear();
    S.玩家.x = S.玩家初始位置.x;
    S.玩家.y = S.玩家初始位置.y;
    S.地牢 = [];
    S.房间列表 = [];
    S.所有计时器 = [];
    if (S.当前层数 !== null) {
      ports.changeFloor(0, true, null, false, () => { ports.updateViewport(); ports.drawMinimap(); ports.updateLightMap(); });
    } else {
      ports.enterTutorial();
    }
    ports.refreshInventory();
    ports.refreshEquipment();
    ports.updateUiState();
    ports.updateObjectIndicators();
    ports.removeDeathMask();
    S.死亡界面已显示 = false;
    return;
  }
  ports.removeDeathMask();
  S.死亡界面已显示 = false;
  ports.updateViewport();
  ports.drawMinimap();
  ports.updateLightMap();
}
