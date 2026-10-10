import { 单元格类型, 房间尺寸范围 } from './constants';
import { createGrid } from './helpers';
import { createRoomMap, type WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface TreasureRingPorts {
  random(): number;
  /** `new 寻宝戒指(options)` (packet `t10-map-quest-items`). */
  createTreasureRing(options: { 生效层数: number }): unknown;
  placeItemInRoom(item: unknown, room: unknown): unknown; // 放置物品到房间
}

/** Source `生成寻宝戒指()` (HTML L40458): one ring for this floor in a random plain `房间`. */
export function generateTreasureRing(state: WorldState, ports: TreasureRingPorts): void {
  const available = (state.房间列表 as Loose[]).filter((room) => room.类型 == '房间'); // eslint-disable-line eqeqeq
  if (available.length === 0) return;
  const target = available[Math.floor(ports.random() * available.length)];
  ports.placeItemInRoom(ports.createTreasureRing({ 生效层数: state.当前层数 }), target);
}

/** Every callee of the source `生成地牢`; most are ported world functions or packet-owned classes. */
export interface DungeonPorts {
  random(): number;
  generateCaveDungeon(): unknown; // 生成洞穴地牢 (world/cave-dungeon.ts)
  generateMazeDungeon(editorMode: unknown): unknown; // 生成迷宫地牢 (t10-special-floors-audit)
  placeRoom(room: unknown): void; // 放置房间
  isAreaFree(x: number, y: number, w: number, h: number): unknown; // 区域是否空闲
  connectRooms(a: unknown, b: unknown): unknown; // 连接房间
  generateCorridor(path: unknown): void; // 生成走廊
  addExtraCorridors(rooms: unknown[], count: number, connected: Set<string>): void; // 添加额外走廊
  /** `生成特殊房间(编辑器模式)` — async, deliberately not awaited by the source. */
  generateSpecialRoom(editorMode: unknown): unknown;
  generateWalls(): void; // 生成墙壁
  handleLockedDoors(): void; // 处理上锁的门
  generateKeys(): void; // 生成钥匙
  generateBarricades(): void; // 生成路障
  generateTreasureRing(): void; // 生成寻宝戒指
  generateCoins(): void; // 生成金币
  generateItems(): void; // 生成物品
  generateRedBluePuzzle(distanceMap: unknown): void; // 生成红蓝开关谜题
  distanceMap(x: number, y: number): Loose; // 计算距离图
  generateMonsters(): void; // 生成怪物
  placeRecipeScrolls(floor: number): void; // 生成并放置随机配方卷轴
  createStarterWeapon(): unknown; // new 钢制长剑({ 不可破坏: true })
  placeItemInRoom(item: unknown, room: unknown): unknown; // 放置物品到房间
  updateViewport(): void;
  updateRoomWalls(room: unknown): void; // 更新房间墙壁
  generateEnvironment(): void; // 全局生成环境
  generateWaterMonsters(): void; // 生成水怪
  generateTraps(room: unknown): void; // 生成陷阱
  /** Page global `楼梯图标`, read at each stairs placement. */
  stairIcons(): { 下楼: unknown; 上楼: unknown };
  placeStairs(room: unknown, icon: unknown, kind: number): void; // 放置楼梯
  isPatrolMonster(monster: unknown): boolean; // instanceof 巡逻怪物
  showWaiting(message: string): void; // 显示等待界面
  hideWaiting(): void; // 隐藏等待界面
  updateUi(): void; // 更新界面状态
  log(message: string): void; // console.log
  warn(message: string): void; // console.warn
}

const roomSize = (random: () => number) => 房间尺寸范围[0] + 2 * Math.floor((random() * (房间尺寸范围[1] - 房间尺寸范围[0])) / 2);

/**
 * Source `async 生成地牢(编辑器模式 = false)` (HTML L38592): default room-chain generator. It appends to the existing
 * `房间列表` (callers reset it), so with stale rooms the indices and the `回溯` branch behave as in the source.
 */
export async function generateDungeon(state: WorldState, ports: DungeonPorts, editorMode: unknown = false): Promise<unknown> {
  const S = state as Loose;
  if (S.地牢生成方式 === 'cave') return ports.generateCaveDungeon();
  if (S.地牢生成方式 === 'maze') return await ports.generateMazeDungeon(editorMode);
  S.地牢大小 = S.自定义游戏设置.地牢初始大小 + S.当前层数 * 2;
  S.最大房间数 = S.自定义游戏设置.初始房间数量;
  S.地牢 = createGrid(S.地牢大小);
  S.房间地图 = createRoomMap(S.地牢大小);
  const connected = new Set<string>();
  const random = () => ports.random();

  let width = roomSize(random);
  let height = roomSize(random);
  let startX = Math.floor(S.地牢大小 / 2 - width / 2);
  let startY = Math.floor(S.地牢大小 / 2 - height / 2);
  S.房间列表.push({ x: startX, y: startY, w: width, h: height, id: 0, 名称: '房间_0', 门: [] });
  ports.placeRoom(S.房间列表[0]);
  let backtrack = false;
  for (let i = 1; i < S.最大房间数 + S.当前层数; i++) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 300) {
      attempts++;
      let previous = S.房间列表[i - 1];
      if (!previous) break;
      if (backtrack) {
        previous = S.房间列表[i - Math.floor((Math.max(0, attempts - 10) / 40) * (S.房间列表.length - 2)) - 2];
        if (!previous) break;
      }
      width = roomSize(random);
      height = roomSize(random);
      const direction = Math.floor(ports.random() * 4);
      const distance = Math.floor(ports.random() * Math.max(0, attempts - 10)) + 房间尺寸范围[1] + 2;
      switch (direction) {
        case 0:
          startX = previous.x + Math.floor((previous.w - width) / 2);
          startY = previous.y - height - distance;
          break;
        case 1:
          startX = previous.x + previous.w + distance;
          startY = previous.y + Math.floor((previous.h - height) / 2);
          break;
        case 2:
          startX = previous.x + Math.floor((previous.w - width) / 2);
          startY = previous.y + previous.h + distance;
          break;
        case 3:
          startX = previous.x - width - distance;
          startY = previous.y + Math.floor((previous.h - height) / 2);
          break;
      }
      startX = Math.max(5, Math.min(startX, S.地牢大小 - width - 5));
      startY = Math.max(5, Math.min(startY, S.地牢大小 - height - 5));
      if (ports.isAreaFree(startX, startY, width, height)) {
        let kind = '房间';
        if (S.房间列表.length > 2 && ports.random() < 0.12) kind = '挑战房间';
        else if (S.房间列表.length > 2 && ports.random() < 0.15) kind = '单向房间';
        else if (S.房间列表.length > 2 && ports.random() < 0.1) kind = '黑暗房间';
        const room: Loose = { x: startX, y: startY, w: width, h: height, id: i, 名称: `房间_${i}`, 门: [], 类型: kind, 已连接: true };
        if (kind === '挑战房间') {
          room.挑战状态 = {
            进行中: false, 已完成: false, 当前波次: 0,
            总波次: 4 + Math.round(ports.random() * Math.floor(S.当前层数 / 2)) + (S.玩家属性.挑战波数增加 || 0),
            波次最大回合数: 30 + S.当前层数 * 3, 波次当前回合数: 0, 波次内怪物: [], 原始门数据: [], 挑战怪物层级: S.当前层数,
          };
        }
        S.房间列表.push(room);
        ports.placeRoom(room);
        // Source uses the default (string) sort, so e.g. [9, 10] becomes "10-9".
        const pairId = [S.房间列表[i - 1].id, room.id].sort().join('-');
        if (!connected.has(pairId)) {
          const path = ports.connectRooms(S.房间列表[i - 1], room);
          if (path) {
            ports.generateCorridor(path);
            connected.add(pairId);
          }
        }
        placed = true;
      }
    }
    backtrack = false;
    if (!placed) {
      ports.log(`第${i}个房间多次尝试后仍然放置失败`);
      backtrack = true;
    }
  }
  ports.addExtraCorridors(S.房间列表, 5 + S.当前层数, connected);
  let hasSpecialRoom = false;
  if (ports.random() < 0.5) {
    S.推箱子任务列表 = [];
    ports.generateSpecialRoom(editorMode);
    hasSpecialRoom = true;
  }
  ports.generateWalls();

  const first = S.房间列表[0];
  S.房间列表[1].类型 = '房间';
  S.玩家初始位置.x = first.x + Math.floor(first.w / 2);
  S.玩家初始位置.y = first.y + Math.floor(first.h / 2);
  S.玩家.x = S.玩家初始位置.x;
  S.玩家.y = S.玩家初始位置.y;
  if (S.房间列表.length > 4) {
    ports.handleLockedDoors();
    ports.generateKeys();
  }
  ports.generateBarricades();
  if (hasSpecialRoom) ports.generateTreasureRing();
  ports.generateCoins();
  ports.generateItems();
  if (S.当前层数 >= 7 && S.当前层数 % 5 !== 0) {
    if (S.自定义游戏设置.开启红蓝砖块谜题) {
      for (let i = 0; i <= S.当前层数 - 5; i++) ports.generateRedBluePuzzle(ports.distanceMap(S.玩家初始位置.x, S.玩家初始位置.y));
    }
  }
  ports.generateMonsters();
  ports.placeRecipeScrolls(S.当前层数);
  if (S.当前层数 === 0) ports.placeItemInRoom(ports.createStarterWeapon(), S.房间列表[0]);
  ports.updateViewport();
  S.已访问房间.add(first.id);
  S.房间列表.forEach((room: Loose) => ports.updateRoomWalls(room));
  const distances = ports.distanceMap(S.玩家初始位置.x, S.玩家初始位置.y);
  ports.generateEnvironment();
  if (S.当前层数 >= 10) ports.generateWaterMonsters();

  let farthestDistance = -1;
  let farthest: Loose = null;
  const candidates = S.房间列表.filter((room: Loose) => room.id !== 0 && room.类型 === '房间');
  candidates.forEach((room: Loose) => {
    const cx = room.x + Math.floor(room.w / 2);
    const cy = room.y + Math.floor(room.h / 2);
    const distance = distances[cy]?.[cx];
    ports.generateTraps(room);
    if (distance !== undefined && distance !== Infinity && distance > farthestDistance && !S.上锁房间列表.some((r: Loose) => r.id === room.id)) {
      farthestDistance = distance;
      farthest = room;
    }
  });
  if (!farthest) {
    farthest = candidates[Math.floor(ports.random() * candidates.length)];
    ports.warn('未能通过距离找到最远房间放置楼梯，已随机选择。');
  }
  ports.placeStairs(farthest, ports.stairIcons().下楼, 单元格类型.楼梯下楼);
  if (S.当前层数 > 0) ports.placeStairs(first, ports.stairIcons().上楼, 单元格类型.楼梯上楼);
  S.所有怪物.forEach((monster: Loose) => {
    if (ports.isPatrolMonster(monster)) monster.初始巡逻();
  });
  if (S.推箱子任务列表.length > 0) {
    ports.showWaiting('正在构建复杂的推箱子谜题...');
    await Promise.all(S.推箱子任务列表);
    ports.hideWaiting();
  }
  ports.updateUi();
  return undefined;
}
