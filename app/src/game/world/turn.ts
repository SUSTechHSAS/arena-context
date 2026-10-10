import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Input-layer globals `休息定时器` and `移动间隔` (source L7484/L7503); excluded from WorldState by design. */
export interface RestSession { 休息定时器: unknown; 移动间隔: number }
export const createRestSession = (): RestSession => ({ 休息定时器: null, 移动间隔: 100 });

export interface TimerPorts {
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface VitalBar { width: string; low: boolean }

export interface TurnPorts {
  /** Page global `联机模式`. */
  isOnline(): unknown;
  /** Packet-owned or UI collaborators, called in source order. */
  updateVictoryDisplay(): void; // 更新胜利条件显示
  processConveyors(): void; // 处理传送带效果
  updateWeaponCooldowns(): void; // 更新武器冷却
  updateLightMap(): void; // 更新光源地图 (world/lighting.ts)
  log(message: string, type: string): void;
  processMonsterTurn(): void; // 处理怪物回合
  drawMinimap(): void; // 绘制小地图
  /** Source `.health-bar` / `.power-bar` DOM writes; each warning follows its own value (SRC-11 fixed). */
  renderVitalBars(health: VitalBar, power: VitalBar): void;
  processWeather(): void; // 处理天气效果
  updateObjectIndicators(): void; // 更新物体指示器
  spawnMazeMonsters(count: number): void; // 生成迷宫怪物
  random(): number;
  isChallengeStele(item: unknown): boolean; // instanceof 挑战石碑
  isPet(item: unknown): boolean; // instanceof 宠物
  updateUiState(): void; // 更新界面状态
  refreshChallengeWave(room: Loose): void; // 刷新挑战房间下一波
}

/** Source `处理回合逻辑()` (HTML L45025): one world turn after a player action. */
export function processTurn(state: WorldState, ports: TurnPorts): void {
  if (ports.isOnline()) return;
  const attributes = state.玩家属性 as Loose;
  if (attributes.允许移动 > 0) return;
  const grid = state.地牢 as Loose[][];
  if (grid.length !== state.地牢大小) return;

  state.玩家总移动回合数++;
  ports.updateVictoryDisplay();
  ports.processConveyors();
  ports.updateWeaponCooldowns();
  const pets = state.当前出战宠物列表 as Loose[];
  // eslint-disable-next-line eqeqeq
  if (pets.length > 0) pets.forEach(pet => { if (pet.层数 == state.当前层数) pet.执行回合AI(); });
  const maxEnergy = (state.自定义全局设置 as Loose).初始能量值 || 100;
  const maxHealth = 100 + (attributes.最大生命值加成 || 0);
  if (attributes.当前能量值 === undefined) attributes.当前能量值 = maxEnergy;
  if (attributes.当前生命值 === undefined) attributes.当前生命值 = maxHealth;

  let energyDelta = 0;
  if ((attributes.能量自然恢复 || 0) > 0) energyDelta += (attributes.能量自然恢复 / maxEnergy * 100);
  if ((attributes.生命自然恢复 || 0) > 0) {
    const percent = (attributes.生命自然恢复 / maxHealth) * 100;
    attributes.当前生命值 = Math.min(maxHealth, attributes.当前生命值 + (maxHealth * percent / 100));
  }
  const player = state.玩家 as Loose;
  if ((state.当前天气效果 as Loose).includes('深夜')) ports.updateLightMap();
  // eslint-disable-next-line eqeqeq
  if ((state.房间列表 as Loose[]).find(item => item.id == (state.房间地图 as Loose)[player.y][player.x])?.类型 === '黑暗房间') ports.updateLightMap();

  if (state.跳过怪物回合剩余次数 > 0) {
    state.跳过怪物回合剩余次数--;
    ports.log(`时空扭曲，怪物们停止了行动... (剩余 ${state.跳过怪物回合剩余次数} 回合)`, '信息');
  } else {
    ports.processMonsterTurn();
  }
  ports.drawMinimap();
  const monsters = state.所有怪物 as Loose[];
  monsters.forEach(m => { m.绘制血条(); });
  pets.forEach(pet => {
    const petState = (state.宠物状态表 as Loose).get(pet);
    if (petState) petState.更新状态();
  });
  // SRC-11 fixed (owner rule 2026-10-10): source toggled the health warning from energy.
  ports.renderVitalBars(
    { width: `${Math.max(0, Math.min(100, attributes.当前生命值))}%`, low: attributes.当前生命值 <= 20 },
    { width: `${Math.max(0, Math.min(100, attributes.当前能量值))}%`, low: attributes.当前能量值 <= 20 },
  );
  ports.processWeather();
  ports.updateObjectIndicators();
  if (state.当前层数 === 5) {
    const minimum = 10;
    if (monsters.length < minimum) ports.spawnMazeMonsters(minimum - monsters.length);
  }
  if (attributes.当前能量值 < 70) energyDelta += (Math.round(ports.random() * 5) / 5) / maxEnergy * 100;
  if (attributes.能量流失 > 0) energyDelta -= attributes.能量流失 / maxEnergy * 100;
  if (energyDelta !== 0) attributes.当前能量值 = Math.max(0, Math.min(100, attributes.当前能量值 + energyDelta));

  (state.玩家状态 as Loose[]).forEach(item => { item.更新状态(); });
  (state.所有计时器 as Loose).forEach((item: Loose) => { if (item?.更新倒计时) item?.更新倒计时(); });
  const rooms = state.房间列表 as Loose[];
  const roomMap = state.房间地图 as Loose;
  if (rooms.length > 0) {
    rooms.forEach(room => {
      if (room?.isSurvivalChallenge) {
        const inRoom = monsters.filter(m => m.房间ID === room.id);
        if (inRoom.length === 0) {
          let stele: Loose = null;
          for (const row of grid) {
            for (const cell of row) {
              if (ports.isChallengeStele(cell.关联物品) && cell.关联物品.自定义数据.get('已激活') && roomMap[cell.y][cell.x] === room.id) {
                stele = cell.关联物品;
                break;
              }
            }
            if (stele) break;
          }
          if (stele) stele.刷新生存挑战下一波(room);
        }
      }
    });
  }
  const perPage = state.装备栏每页装备数;
  // eslint-disable-next-line eqeqeq
  Array.from({ length: perPage }, (_, i) => state.玩家装备.get(state.当前装备页 * perPage + i + 1)).filter(v => v != null)
    .forEach(equipment => { if (ports.isPet(equipment)) (equipment as Loose).恢复生命值(); });
  pets.forEach(pet => pet.恢复生命值());

  ports.updateUiState();
  if (rooms.length > 0) {
    rooms.forEach(room => {
      if (room.类型 === '挑战房间' && room.挑战状态 && room.挑战状态.进行中) {
        const challenge = room.挑战状态;
        challenge.波次当前回合数--;
        challenge.波次内怪物 = challenge.波次内怪物.filter((m: Loose) => m.当前生命值 > 0 && monsters.includes(m));
        if (challenge.波次内怪物.length === 0) {
          ports.log(`房间 ${room.id} 第 ${challenge.当前波次} 波怪物已清除！`, '成功');
          ports.refreshChallengeWave(room);
        } else if (challenge.当前波次 < challenge.总波次) {
          if (challenge.波次当前回合数 <= 0) {
            ports.log(`房间 ${room.id} 第 ${challenge.当前波次} 波时间到！`, '警告');
            ports.refreshChallengeWave(room);
          }
        }
      }
    });
  }
}

export interface WaitPorts {
  stopRest(): void;
  processTurn(): void;
  updateViewport(): void; // 更新视口()
}

/** Source `玩家等待(是否由休息调用 = false)`. */
export function playerWait(state: WorldState, ports: WaitPorts, fromRest: Loose = false): void {
  if ((state.玩家属性 as Loose).允许移动 > 0 || state.死亡界面已显示) {
    if (fromRest) ports.stopRest();
    return;
  }
  if (!fromRest) (state.移动历史 as unknown[]).push('等待');
  ports.processTurn();
  ports.updateViewport();
}

/** Source `停止休息()`. */
export function stopRest(state: WorldState, session: RestSession, timers: Pick<TimerPorts, 'clearTimeout'>): void {
  if (session.休息定时器) {
    timers.clearTimeout(session.休息定时器);
    session.休息定时器 = null;
  }
  state.玩家正在休息 = false;
}

export interface RestPorts extends TimerPorts {
  isOnline(): unknown;
  notify(message: string, type: string): void;
  /** Source `玩家等待(true)`. */
  playerWait(fromRest: true): void;
}

/** Source `开始休息()`: repeats `玩家等待(true)` every `移动间隔` ms until resting stops. */
export function startRest(state: WorldState, session: RestSession, ports: RestPorts): void {
  if (ports.isOnline()) {
    ports.notify('联机模式禁止休息', '错误');
    return;
  }
  if (state.玩家正在休息 || (state.玩家属性 as Loose).允许移动 > 0 || state.死亡界面已显示) return;
  if ((state.玩家状态 as unknown[]).length > 0) {
    ports.notify('你身中药水效果，无法静心休息。', '警告');
    return;
  }
  if ((state.自定义全局设置 as Loose).禁用休息) {
    ports.notify('这个关卡禁用了休息功能。', '警告');
    return;
  }
  state.玩家正在休息 = true;
  ports.notify('开始休息...', '信息');
  const tick = () => {
    if (!state.玩家正在休息) return;
    ports.playerWait(true);
    session.休息定时器 = ports.setTimeout(tick, session.移动间隔);
  };
  tick();
}
