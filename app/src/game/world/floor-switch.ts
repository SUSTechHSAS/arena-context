import { 单元格类型 } from './constants';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface FloorSwitchPorts {
  /** Page global `联机模式` and `socket.emit(event, payload)`. */
  isOnline(): unknown;
  emit(event: string, payload: unknown): void;
  /** Source `document.getElementById(id)` for `transitionMask` / `floorTitle` (style + textContent writes). */
  getElement(id: string): Loose;
  setTimeout(callback: () => unknown, delay: number): unknown;
  /** `instanceof` checks: 定位器地图 (t10-map-quest-items), 佣兵单位 (t10-monsters-summoners), 瞬间移动饰品. */
  isLocatorMap(item: unknown): boolean;
  isMercenary(unit: unknown): boolean;
  isBlinkCharm(item: unknown): boolean;
  log(message: string, type: string): void;
  notify(message: string, type: string): void;
  destroyInventoryItem(id: unknown, silent: true): void;
  refreshInventory(): void; // 更新背包显示
  refreshEquipment(): void; // 更新装备显示
  /** Source `deepClone` (`world/helpers.ts#deepClone`). */
  deepClone<T>(value: T): T;
  findPlacement(x: number, y: number): { x: number; y: number } | null | undefined; // 寻找可放置位置
  updateObjectIndicators(): void; // 更新物体指示器
  isPositionFree(x: number, y: number, considerPlayer: false): boolean; // 位置是否可用
  seedRng(seed: unknown): void; // 初始化随机数生成器 (t10-seed-search)
  generateMazeLevel(): void; // 生成迷宫关卡
  generateMageLibrary(): void; // 生成法师图书馆
  generateFinalBossFloor(): void; // 生成最终首领楼层
  generateSunkenMaze(): void; // 生成沉没的迷宫
  playSound(name: string): void; // 音效管理器.播放音效
  random(): number;
  generateWeather(): void; // 生成天气效果
  generateDungeon(): unknown; // 生成地牢 (awaited)
  draw(): void; // 绘制
  updateViewport(): void;
  drawMinimap(): void;
  updateUiState(): void;
  updateCaveVision(): void;
  movePlayer(dx: number, dy: number): unknown; // 移动玩家(0, 0)
  showLevelUp(): unknown; // 显示升级界面 (awaited)
}

/**
 * Source `async 切换楼层(新层数, 完全重生 = false, 目标坐标 = null, 通过楼梯切换 = false, onCompleteCallback = null)`.
 * The transition runs inside a 1200 ms timer; as in the source, a throw inside that callback leaves the returned
 * promise pending forever (resolve is never reached).
 */
export async function switchFloor(state: WorldState, ports: FloorSwitchPorts, newFloor: Loose, fullRespawn: Loose = false,
  target: Loose = null, viaStairs: Loose = false, onComplete: Loose = null): Promise<void> {
  const S = state as Loose;
  if (ports.isOnline()) {
    if (fullRespawn) {
      ports.emit('playerAction', { type: 'requestFloor', targetFloor: newFloor });
      return;
    }
    const mask = ports.getElement('transitionMask');
    const title = ports.getElement('floorTitle');
    if (mask && title) {
      mask.style.opacity = 1;
      title.textContent = '等待队友...';
      title.style.opacity = 1;
      title.style.transform = 'scale(1)';
    }
    ports.emit('playerAction', { type: 'requestFloor', targetFloor: newFloor });
    return;
  }

  const mask = ports.getElement('transitionMask');
  const title = ports.getElement('floorTitle');
  mask.style.opacity = 1;
  if (newFloor === 5 && S.当前层数 !== 5) title.textContent = '米诺陶的迷宫';
  else if (newFloor === 10 && S.当前层数 !== 10) title.textContent = '法师图书馆';
  else if (newFloor === 15 && S.当前层数 !== 15) title.textContent = '最终战场';
  else title.textContent = `地牢 ${newFloor < 0 ? S.当前层数 - 1 : newFloor}`;
  if (newFloor > S.当前层数 && !S.所有地牢层.has(newFloor)) {
    const locator = [...S.玩家装备.values()].find(item => ports.isLocatorMap(item)) || [...S.玩家背包.values()].find(item => ports.isLocatorMap(item));
    if (locator) {
      if (locator.堆叠数量 > 1) {
        locator.堆叠数量--;
        ports.log('消耗了一张定位器地图。', '信息');
      } else {
        ports.destroyInventoryItem(locator.唯一标识, true);
        ports.log('消耗了最后一张定位器地图！', '警告');
      }
      ports.refreshInventory();
      ports.refreshEquipment();
    }
  }
  ports.setTimeout(() => {
    title.style.opacity = 1;
    title.style.transform = 'scale(1)';
  }, 200);

  await new Promise<void>(resolve => ports.setTimeout(async () => {
    void S.所有地牢层.get(S.当前层数); // source `旧楼层数据` (unused)
    const carried: Loose[] = [];
    if (S.玩家仆从列表.length > 0) {
      for (let i = S.玩家仆从列表.length - 1; i >= 0; i--) {
        const minion = S.玩家仆从列表[i];
        if (ports.isMercenary(minion)) {
          if (minion.跟随层数 > 0) {
            minion.跟随层数--;
            carried.push(minion);
            S.所有怪物 = S.所有怪物.filter((m: Loose) => m !== minion);
            if (S.地牢[minion.y][minion.x].关联怪物 === minion) {
              S.地牢[minion.y][minion.x].关联怪物 = null;
              S.地牢[minion.y][minion.x].类型 = null;
            }
            S.玩家仆从列表.splice(i, 1);
          } else {
            ports.notify('佣兵的契约已结束，离开了队伍。', '信息');
          }
        }
      }
    }
    // Source builds an unused `当前数据` snapshot here; its reads (deepClone, spreads) are kept for fidelity.
    void { 玩家位置: { x: S.玩家.x, y: S.玩家.y }, 已揭示洞穴格子: ports.deepClone(S.已揭示洞穴格子),
      玩家初始位置: { x: S.玩家初始位置.x, y: S.玩家初始位置.y }, 当前天气效果: [...S.当前天气效果] };

    S.所有怪物.forEach((m: Loose) => { m.绘制血条(true); });
    S.玩家仆从列表 = [];

    if (S.当前层数 !== null && !fullRespawn) {
      const saved = S.所有地牢层.get(S.当前层数) || {};
      saved.地牢数组 = S.地牢;
      saved.房间列表 = S.房间列表;
      saved.门实例列表 = S.门实例列表;
      if (viaStairs) saved.玩家位置 = { x: S.玩家.x, y: S.玩家.y };
      else if (!saved.玩家位置) saved.玩家位置 = { x: S.玩家初始位置.x, y: S.玩家初始位置.y };
      saved.上锁房间列表 = S.上锁房间列表;
      saved.已访问房间 = S.已访问房间;
      saved.地牢生成方式 = S.地牢生成方式;
      saved.已揭示洞穴格子 = ports.deepClone(S.已揭示洞穴格子);
      saved.房间地图 = S.房间地图;
      saved.所有怪物 = S.所有怪物;
      saved.玩家初始位置 = { x: S.玩家初始位置.x, y: S.玩家初始位置.y };
      saved.所有计时器 = S.所有计时器;
      saved.当前天气效果 = [...S.当前天气效果];
      S.所有地牢层.set(S.当前层数, saved);
    } else {
      S.传送点列表 = [];
    }

    const oldFloor = S.当前层数;
    S.当前层数 = newFloor;
    S.已揭示洞穴格子 = new Set();
    let isNewFloor = false;

    if (S.所有地牢层.has(newFloor)) {
      const data = S.所有地牢层.get(newFloor);
      S.地牢 = data.地牢数组;
      S.地牢大小 = S.地牢.length;
      S.房间列表 = data.房间列表;
      S.门实例列表 = data.门实例列表;
      S.上锁房间列表 = data.上锁房间列表;
      S.已访问房间 = data.已访问房间;
      S.已揭示洞穴格子 = ports.deepClone(data.已揭示洞穴格子);
      S.地牢生成方式 = data.地牢生成方式;
      S.房间地图 = data.房间地图;
      S.所有怪物 = data.所有怪物;
      if (carried.length > 0) {
        ports.setTimeout(() => {
          carried.forEach(mercenary => {
            const spot = ports.findPlacement(S.玩家.x, S.玩家.y);
            if (spot) {
              mercenary.x = spot.x;
              mercenary.y = spot.y;
              mercenary.房间ID = S.房间地图[spot.y][spot.x];
              S.所有怪物.push(mercenary);
              S.玩家仆从列表.push(mercenary);
              S.地牢[spot.y][spot.x].类型 = 单元格类型.怪物;
              S.地牢[spot.y][spot.x].关联怪物 = mercenary;
            }
          });
          ports.updateObjectIndicators();
        }, 500);
      }
      S.所有计时器 = data.所有计时器;
      S.玩家初始位置 = data.玩家初始位置;
      S.当前天气效果 = data.当前天气效果 || [];
      if (target && ports.isPositionFree(target.x, target.y, false)) {
        S.玩家.x = target.x;
        S.玩家.y = target.y;
      } else {
        S.玩家.x = data.玩家位置.x;
        S.玩家.y = data.玩家位置.y;
      }
    } else {
      isNewFloor = true;
      const settings = S.自定义游戏设置;
      if (settings.开启Boss战 && S.当前层数 === 5) {
        ports.seedRng(S.当前游戏种子);
        ports.generateMazeLevel();
      } else if (settings.开启Boss战 && S.当前层数 === 10) {
        ports.seedRng(S.当前游戏种子);
        ports.generateMageLibrary();
      } else if (S.当前层数 === 15) {
        ports.seedRng(S.当前游戏种子);
        ports.generateFinalBossFloor();
      } else if (S.当前层数 > 15) {
        ports.seedRng(S.当前游戏种子);
        ports.generateSunkenMaze();
        ports.notify('喜悦...或是不甘？', '信息');
        S.彩蛋1触发 = true;
      } else {
        ports.playSound('下楼');
        ports.seedRng(S.当前游戏种子);
        for (let i = 0; i < S.当前层数; i++) ports.random();
        if (S.当前层数 === 0) S.当前出战宠物列表 = [];
        if (S.玩家属性.初始能量加成 > 0) {
          S.玩家属性.当前能量值 = Math.min(100, S.玩家属性.当前能量值 + S.玩家属性.初始能量加成 / S.自定义全局设置.初始能量值 * 100);
        }
        S.房间列表 = [];
        S.上锁房间列表 = [];
        S.所有怪物 = [];
        S.所有计时器 = [];
        S.已访问房间 = new Set();
        S.房间地图 = Array(S.地牢大小).fill(undefined).map(() => Array(S.地牢大小).fill(-1));
        S.门实例列表 = new Map();
        const weather = settings.天气系统;
        let makeWeather = false;
        if (S.当前层数 > 0) {
          switch (weather) {
            case '五层一次': if (S.当前层数 % 5 === 0) makeWeather = true; break;
            case '三层一次': if (S.当前层数 % 3 === 0) makeWeather = true; break;
            case '两层一次': if (S.当前层数 % 2 === 0) makeWeather = true; break;
            case '大概率随机': if (ports.random() < 0.6) makeWeather = true; break;
            case '低概率随机': if (ports.random() < 0.2) makeWeather = true; break;
          }
        }
        if (makeWeather) ports.generateWeather();
        else S.当前天气效果 = [];
        await ports.generateDungeon();
        S.玩家.x = S.玩家初始位置.x;
        S.玩家.y = S.玩家初始位置.y;
        ports.draw();
      }
    }
    S.当前出战宠物列表.forEach((pet: Loose) => {
      if (!pet || !pet.是否已放置) return;
      const blink = Object.values(pet.自定义数据.get('装备') || {}).find(item => ports.isBlinkCharm(item));
      if (blink) pet.瞬移到玩家身旁();
    });

    ports.updateViewport();
    ports.drawMinimap();
    ports.updateUiState();
    ports.updateObjectIndicators();
    ports.updateCaveVision();
    S.所有怪物.forEach((m: Loose) => { m.绘制血条(true); });
    ports.movePlayer(0, 0);
    if (typeof onComplete === 'function') onComplete();

    title.style.opacity = 0;
    title.style.transform = 'scale(0.5)';
    mask.style.opacity = 0;
    if (newFloor > oldFloor && newFloor > 0 && S.游戏状态 !== '编辑器游玩' && S.游戏状态 !== '地图编辑器' && !S.是否是自定义关卡
      && S.自定义游戏设置.开启升级奖励 && viaStairs && isNewFloor) {
      await ports.showLevelUp();
    }
    resolve();
  }, 1200));
}

