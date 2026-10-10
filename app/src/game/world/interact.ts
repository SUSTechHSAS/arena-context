import { 单元格类型, 环境类型 } from './constants';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type ItemClass = new (options: { 数量: number }) => Loose;

/** Map-editor UI globals touched by `尝试互动`. */
export interface InteractSession {
  编辑器状态: { 模式: unknown; 当前选中: unknown } & Record<string, unknown>;
  旧编辑器状态: unknown;
}

export interface InteractDom {
  getElementById(id: string): Loose;
  querySelectorAll(selector: string): { forEach(callback: (element: Loose) => void): void };
}

export interface InteractPorts {
  random(): number;
  isOnline(): unknown; // 联机模式
  emit(event: string, payload: unknown): void; // socket.emit
  dom: InteractDom;
  stopAutoMove(): void; // 停止自动移动
  notify(message: string, type: string, flag?: boolean): void; // 显示通知
  draw(): void; // 绘制
  updateEditorQuickBar(): void; // 更新编辑器快速访问栏
  isTrap(item: unknown): boolean; // instanceof 陷阱基类
  isInvisibleGasTrap(item: unknown): boolean; // instanceof 隐形毒气陷阱
  isAltar(item: unknown): boolean; // instanceof 祭坛类
  isChargedWand(item: unknown): boolean; // instanceof 充能魔杖
  isGoldPistol(item: unknown): boolean; // instanceof 金币手枪
  isPet(item: unknown): boolean; // instanceof 宠物
  deductEnergy(amount: number): unknown; // 扣除能量
  handleLanding(oldX: number, oldY: number, newX: number, newY: number): unknown; // 处理玩家着陆效果
  updateViewport(force?: boolean): void; // 更新视口
  seedClasses(): ItemClass[]; // [荆棘种子, 护卫种子, 远射种子, 吸能种子]
  tryCollect(item: unknown, flag?: boolean): unknown; // 尝试收集物品
  updateLightMap(): void; // 更新光源地图
  triggerEvent(name: string, payload: unknown): void; // 触发游戏事件
  destroyItem(id: unknown, flag: boolean): void; // 处理销毁物品
  refreshEquipment(): void; // 更新装备显示
  straightLineCheck(fromX: number, fromY: number, toX: number, toY: number, range: number): unknown; // 快速直线检查
  nearbyMonsters(count: number, range: number): Loose; // 获取周围怪物
  burstAttack(weapon: unknown, times: number): void; // 执行连发攻击
}

const equippedOnPage = (S: Loose): Loose[] =>
  Array.from({ length: S.装备栏每页装备数 }, (_, i) => S.玩家装备.get(S.当前装备页 * S.装备栏每页装备数 + i + 1)).filter((v) => v != null);

/** Source `尝试互动()` (HTML L43346): trap search, water/grass search, pickups, NPCs, pets, doors, altars, then attacks. */
export function tryInteract(state: WorldState, session: InteractSession, ports: InteractPorts): void {
  const S = state as Loose;
  if (S.死亡界面已显示) return;
  if (ports.isOnline()) ports.emit('playerAction', { type: 'interact' });
  if (S.游戏设置.自动移动可打断) ports.stopAutoMove();
  if (S.游戏状态 === '地图编辑器') {
    const button = ports.dom.getElementById('互动按钮');
    if (session.编辑器状态.模式 === '传送') {
      session.编辑器状态.模式 = '编辑';
      ports.notify('已切换到编辑模式', '信息');
      button.style.background = '';
    } else {
      session.旧编辑器状态 = session.编辑器状态.模式;
      session.编辑器状态.模式 = '传送';
      ports.dom.getElementById('笔刷工具容器').style.display = 'none';
      ports.dom.getElementById('扳手工具菜单').style.display = 'none';
      ports.notify('传送模式已开启：点击地图进行传送', '信息');
      button.style.background = '#2196F3';
    }
    session.编辑器状态.当前选中 = null;
    ports.dom.querySelectorAll('#背包物品栏 .物品条目').forEach((el) => el.classList.remove('active'));
    ports.draw();
    ports.updateEditorQuickBar();
    return;
  }

  const traps: Loose[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = S.玩家.x + dx;
      const y = S.玩家.y + dy;
      if (x < 0 || x >= S.地牢大小 || y < 0 || y >= S.地牢大小) continue;
      const cell = S.地牢[y][x];
      if (cell && cell.关联物品 && (ports.isTrap(cell.关联物品) || ports.isInvisibleGasTrap(cell.关联物品)) && cell.关联物品.是否为隐藏物品) traps.push(cell.关联物品);
    }
  }
  if (traps.length > 0) {
    const cost = 5;
    if (ports.deductEnergy(cost)) {
      traps.forEach((trap) => {
        trap.是否为隐藏物品 = false;
        trap.自定义数据.set('已触发', true);
        trap.自定义数据.set('已发现', true);
        trap.图标 = trap.自定义数据.get('激活后图标');
      });
      ports.notify(`你仔细探查后，发现了 ${traps.length} 个陷阱！`, '成功');
    } else {
      ports.notify(`能量不足，无法侦测陷阱！(需要 ${cost} 能量)`, '错误');
    }
  }

  let interacted: unknown = false;
  const here = S.地牢[S.玩家.y][S.玩家.x];
  if (!interacted && here.环境 === 环境类型.水) {
    if (here.已探索暗河) {
      ports.notify('这片水域似乎很平静，没有什么特别的。', '信息');
      interacted = true;
    } else {
      here.已探索暗河 = true;
      if (ports.deductEnergy(10)) {
        if (ports.random() < 0.1) {
          const water: { x: number; y: number }[] = [];
          for (let y = 0; y < S.地牢大小; y++) {
            for (let x = 0; x < S.地牢大小; x++) {
              if (S.地牢[y]?.[x]?.环境 === 环境类型.水 && (x !== S.玩家.x || y !== S.玩家.y)) water.push({ x, y });
            }
          }
          if (water.length > 0) {
            const target = water[Math.floor(ports.random() * water.length)]!;
            const oldX = S.玩家.x;
            const oldY = S.玩家.y;
            S.玩家.x = target.x;
            S.玩家.y = target.y;
            ports.handleLanding(oldX, oldY, S.玩家.x, S.玩家.y);
            ports.updateViewport(true);
            ports.notify('你发现了地下暗河，被水流卷到了另一片水域！', '成功', true);
            interacted = true;
          } else {
            ports.notify('你感觉到水下有股暗流，但它无处可去。', '信息');
          }
        } else {
          ports.notify('你在水中摸索了一番，什么也没发现。', '信息');
        }
      } else {
        ports.notify('能量不足，无法探索水下！', '错误');
      }
      interacted = true;
    }
  } else if (!interacted && here.环境 === 环境类型.草地) {
    if (ports.deductEnergy(2)) {
      if (ports.random() < 0.15) {
        const pool = ports.seedClasses();
        const SeedClass = pool[Math.floor(ports.random() * pool.length)]!;
        const seed = new SeedClass({ 数量: 1 });
        if (ports.tryCollect(seed, true)) {
          ports.notify(`你在草地里找到了一个 ${seed.名称}！`, '成功');
        } else {
          S.玩家属性.当前能量值 = Math.min(100, S.玩家属性.当前能量值 + 2 / S.自定义全局设置.初始能量值 * 100);
          ports.notify('你在草地里发现了一些东西，但背包满了！', '警告');
        }
      } else {
        ports.notify('你在草地里仔细搜索了一番，但什么也没找到。', '信息');
      }
      interacted = true;
      here.环境 = null;
    } else {
      ports.notify('能量不足，无法搜索草地！', '错误');
      interacted = true;
    }
  }
  if (here.关联物品) {
    if (here.关联物品?.类型 === '棋子') {
      here.关联物品.能否拾起 = true;
      if (ports.tryCollect(here.关联物品)) {
        here.类型 = null;
        here.关联物品 = null;
        ports.draw();
        interacted = true;
      }
    } else if (ports.tryCollect(here.关联物品)) {
      here.类型 = null;
      here.关联物品 = null;
      ports.updateLightMap();
      ports.draw();
      interacted = true;
    } else if (here.关联物品?.类型 === 'NPC' && !S.NPC互动中) {
      here.关联物品.使用();
      S.NPC互动中 = true;
      interacted = true;
    }
    if (here.关联物品?.尝试互动?.()) interacted = true;
  }
  S.当前出战宠物列表.forEach((pet: Loose) => {
    if (!pet || !pet.是否已放置) return;
    if (pet?.x === S.玩家.x && pet?.y === S.玩家.y && pet.层数 == S.当前层数) { // eslint-disable-line eqeqeq
      pet.尝试互动();
      interacted = true;
    }
  });
  if (interacted) ports.triggerEvent('玩家互动成功', { x: S.玩家.x, y: S.玩家.y });
  if (interacted) return;

  const directions = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
  for (const { dx, dy } of directions) {
    const x = S.玩家.x + dx;
    const y = S.玩家.y + dy;
    if (x < 0 || x >= S.地牢大小 || y < 0 || y >= S.地牢大小) continue;
    const cell = S.地牢[y][x];
    if (ports.isAltar(cell.关联物品) && cell.关联物品.自定义数据.get('激活条件') === '力量考验') {
      const weapon = equippedOnPage(S).find((i) => i?.类型 === '武器' && i?.堆叠数量 > 0 && i?.自定义数据.get('冷却剩余') == 0); // eslint-disable-line eqeqeq
      if (weapon) {
        cell.关联物品.当被攻击(weapon.攻击力, S.玩家);
        weapon.自定义数据.set('耐久', weapon.自定义数据.get('耐久') - weapon.耐久消耗);
        if (weapon.自定义数据.get('耐久') <= 0) ports.destroyItem(weapon.唯一标识, true);
        weapon.自定义数据.set('冷却剩余', weapon.最终冷却回合);
        ports.refreshEquipment();
        interacted = true;
        break;
      }
    }
    if (cell.背景类型 === 单元格类型.上锁的门) {
      const door = S.门实例列表.get(cell.标识);
      const key = [...S.玩家背包.values()].find((item: Loose) => item.可交互目标(door));
      if (key) {
        S.房间列表.find((room: Loose) => room.id === door.房间ID)?.门?.forEach((item: Loose) => {
          const roomDoor = S.门实例列表.get(S.地牢[item.y][item.x].标识);
          interacted = roomDoor.尝试解锁(S.玩家背包);
          if (interacted) {
            S.地牢[item.y][item.x].背景类型 = 单元格类型.门;
            if (S.地牢[item.y][item.x].配对单元格位置) {
              const pair = S.地牢[item.y][item.x].配对单元格位置;
              S.地牢[pair.y][pair.x].背景类型 = 单元格类型.门;
            }
          }
        });
        ports.draw();
      }
      if (interacted) {
        ports.triggerEvent('玩家解锁门', { x: door.所在位置.x, y: door.所在位置.y });
        ports.destroyItem(key.唯一标识, true);
        ports.notify('解锁成功！', '成功');
        break;
      }
    } else if (ports.straightLineCheck(S.玩家.x, S.玩家.y, x, y, 1)) {
      if (cell.关联物品) {
        if (cell.关联物品?.类型 === '棋子') {
          cell.关联物品.能否拾起 = true;
          cell.关联物品.isActive = false;
          if (ports.tryCollect(cell.关联物品)) {
            cell.类型 = null;
            cell.关联物品 = null;
            ports.draw();
            interacted = true;
          }
        } else if (ports.tryCollect(cell.关联物品)) {
          cell.类型 = null;
          cell.关联物品 = null;
          ports.updateLightMap();
          ports.draw();
          interacted = true;
        } else if (cell.关联物品?.类型 === 'NPC' && !S.NPC互动中) {
          cell.关联物品.使用();
          S.NPC互动中 = true;
          interacted = true;
          break;
        } else if (cell.关联物品?.尝试互动?.()) {
          interacted = true;
          break;
        }
      }
    }
  }
  if (interacted) {
    ports.refreshEquipment();
    if (interacted) ports.triggerEvent('玩家互动成功', { x: S.玩家.x, y: S.玩家.y });
    return;
  }
  // Source quirk: `武器` is a filtered array, so this block always runs (even with no usable weapon).
  const weapons = equippedOnPage(S).filter((i) => i?.类型 === '武器' && i?.堆叠数量 > 0 && i?.自定义数据.get('冷却剩余') == 0 // eslint-disable-line eqeqeq
    && i?.自定义数据.get('攻击目标数') > 0 && !ports.isChargedWand(i));
  if (weapons) {
    let maxCount = 0;
    let maxRange = 0;
    let targets: Loose[];
    let validPaths: Loose[] = [];
    weapons.forEach((weapon) => {
      maxCount = Math.max(maxCount, weapon.自定义数据.get('攻击目标数'));
      if (!ports.isGoldPistol(weapon)) maxRange = Math.max(maxRange, weapon.最终攻击范围);
    });
    let { 怪物: monsters, 路径: paths } = ports.nearbyMonsters(maxCount, maxRange);
    if (monsters && paths) {
      weapons.forEach((weapon) => {
        paths = paths.filter((_item: unknown, index: number) => monsters[index].当前生命值 > 0);
        monsters = monsters.filter((item: Loose) => item.当前生命值 > 0);
        validPaths = [];
        targets = [];
        paths.forEach((item: Loose, index: number) => {
          if (item.length <= weapon.最终攻击范围 + 1) {
            validPaths.push(item);
            targets.push(monsters[index]);
          }
        });
        if (targets.length > 0) {
          const burst = weapon.自定义数据.get('附魔')?.find((e: Loose) => e.种类 === '连发附魔');
          if (burst && burst.等级 > 0) {
            interacted = true;
            ports.burstAttack(weapon, burst.等级 + 1);
          } else if (weapon.使用(targets, validPaths, S.玩家)) {
            equippedOnPage(S).forEach((gear) => {
              if (ports.isPet(gear) && !gear.自定义数据.get('休眠中')) gear.当玩家攻击(targets);
            });
            interacted = true;
          }
        }
      });
    }
  }
  if (interacted) ports.triggerEvent('玩家互动成功', { x: S.玩家.x, y: S.玩家.y });
  ports.triggerEvent('玩家互动', { x: S.玩家.x, y: S.玩家.y });
  if (!interacted) ports.notify('周围没有可互动物体了...', '信息');
  ports.refreshEquipment();
  ports.draw();
}
