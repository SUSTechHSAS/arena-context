import { 环境类型 } from './constants';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const NEIGHBOURS = [[0, 1], [0, -1], [1, 0], [-1, 0]] as const;

/** Shared BFS of both smoke networks: connected `烟雾`/`烟雾弹` items, deduplicated by `唯一标识`. */
function collectSmoke(state: WorldState, isSmoke: (item: unknown) => boolean, start: Loose): Loose[] {
  const S = state as Loose;
  const list = [start];
  const seen = new Set([start.唯一标识]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx >= 0 && nx < S.地牢大小 && ny >= 0 && ny < S.地牢大小) {
        // Source guards the cell but not the row.
        const neighbour = S.地牢[ny][nx]?.关联物品;
        if (isSmoke(neighbour) && !seen.has(neighbour.唯一标识)) {
          seen.add(neighbour.唯一标识);
          list.push(neighbour);
          queue.push(neighbour);
        }
      }
    }
  }
  return list;
}

export interface SmokePorts {
  isSmoke(item: unknown): boolean; // instanceof 烟雾 || instanceof 烟雾弹
  damagePlayer(amount: number, source: string): void; // 伤害玩家
  notify(message: string, type: string): void; // 显示通知
  scheduleCellEffect(cells: { x: number; y: number }[], color: string, duration: number): void; // 计划显示格子特效
}

export interface IgniteSmokePorts extends SmokePorts {
  createFire(options: { 强化: boolean; 倒计时: number; 火焰强度: number }): unknown; // new 火焰物品(...)
  placeItemAt(item: unknown, x: number, y: number): unknown; // 放置物品到单元格
  fireColor(): unknown; // 效果颜色编号映射[效果名称编号映射.火焰]
  createStatusEffect(...args: unknown[]): unknown; // new 状态效果(...)
}

/** Source `引燃烟雾网络(起始烟雾)` (HTML L53032): every connected smoke becomes a strong fire that burns whoever stands there. */
export function igniteSmokeNetwork(state: WorldState, ports: IgniteSmokePorts, start: Loose): void {
  if (!start) return;
  const S = state as Loose;
  const list = collectSmoke(state, ports.isSmoke, start);
  list.forEach((smoke) => {
    const x = smoke.x;
    const y = smoke.y;
    smoke.移除自身();
    const fire = ports.createFire({ 强化: true, 倒计时: 5, 火焰强度: 4 });
    if (ports.placeItemAt(fire, x, y)) {
      const cell = S.地牢[y]?.[x];
      if (cell && cell.关联怪物) {
        ports.createStatusEffect('火焰', ports.fireColor(), '火', 5, null, null, cell.关联怪物, 4);
        cell.关联怪物.受伤(5, '烈焰');
      }
      if (S.玩家.x === x && S.玩家.y === y) {
        ports.createStatusEffect('火焰', ports.fireColor(), '火', 5, null, null, null, 4);
        ports.damagePlayer(5, '烈焰');
      }
    }
  });
  if (list.length > 0) {
    ports.notify('烟雾被火焰点燃了！', '警告');
    ports.scheduleCellEffect(list.map((item) => ({ x: item.x, y: item.y })), 'FF4500', 20);
  }
}

export interface DetonateSmokePorts extends SmokePorts {
  /** `new 炸弹(...)`; the source builds a bomb per smoke and only sets its position. */
  createBomb(options: { 伤害: number; 爆炸范围: number; 强化: boolean; 能否拾起: boolean }): Loose;
  playSound(name: string): void; // 音效管理器.播放音效
}

/** Source `引爆烟雾网络(起始烟雾)` (HTML L36818): every connected smoke explodes for 15 damage on its own cell. */
export function detonateSmokeNetwork(state: WorldState, ports: DetonateSmokePorts, start: Loose): void {
  if (!start) return;
  const S = state as Loose;
  const list = collectSmoke(state, ports.isSmoke, start);
  list.forEach((smoke) => {
    const x = smoke.x;
    const y = smoke.y;
    smoke.移除自身();
    const bomb = ports.createBomb({ 伤害: 15, 爆炸范围: 1, 强化: true, 能否拾起: false });
    bomb.x = x;
    bomb.y = y;
    const cell = S.地牢[y]?.[x];
    if (cell && cell.关联怪物) cell.关联怪物.受伤(15, '燃气爆炸');
    if (S.玩家.x === x && S.玩家.y === y) ports.damagePlayer(15, '燃气爆炸');
    ports.scheduleCellEffect([{ x, y }], 'FF4500', 0);
  });
  if (list.length > 0) {
    ports.notify('烟雾被引爆了！', '错误');
    ports.playSound('武器命中');
  }
}

export interface PotionWaterPorts {
  isPet(entity: unknown): boolean; // instanceof 宠物
  isHazmatSuit(item: unknown): boolean; // instanceof 防化服
  destroyItem(id: unknown, silent: boolean): void; // 处理销毁物品
  notify(message: string, type: string): void; // 显示通知
  log(message: string, type: string): void; // 添加日志
  refreshEquipment(): void; // 更新装备显示
  lookupClass(name: unknown): (new (options: unknown) => Loose) | undefined; // window[药水名称]
  /** The source's fallback map `{治疗: 治疗药水, 腐蚀: 硫酸药水, ...}[药水效果]`. */
  potionForEffect(effect: unknown): (new (options: unknown) => Loose) | undefined;
  scheduleCellEffect(cells: { x: number; y: number }[], color: string, duration: number): void; // 计划显示格子特效
}

/**
 * Source `触发药水水域效果(实体, 单元格)` (HTML L53086): a hazmat suit (player equipment page or pet gear) absorbs the
 * pool at one durability; otherwise the pool's potion applies to the entity and the cell turns back into water.
 */
export function triggerPotionWater(state: WorldState, ports: PotionWaterPorts, entity: Loose, cell: Loose): void {
  if (!cell || cell.环境 !== 环境类型.药水水域 || !cell.药水数据) return;
  const S = state as Loose;
  let suit: Loose = null;
  if (entity === S.玩家) {
    suit = Array.from({ length: S.装备栏每页装备数 }, (_, i) => S.玩家装备.get(S.当前装备页 * S.装备栏每页装备数 + i + 1))
      .find((item) => ports.isHazmatSuit(item));
  } else if (ports.isPet(entity)) {
    const gear = entity.自定义数据.get('装备') || {};
    suit = Object.values(gear).find((item) => ports.isHazmatSuit(item));
  }
  if (suit) {
    if (!suit.自定义数据.get('不可破坏')) {
      const durability = suit.自定义数据.get('耐久') - 1;
      suit.自定义数据.set('耐久', durability);
      if (durability <= 0) {
        if (entity === S.玩家) {
          ports.destroyItem(suit.唯一标识, true);
          ports.notify('防化服在酸性环境中损坏了！', '错误');
        } else {
          const slots = entity.自定义数据.get('装备');
          for (const slot in slots) {
            if (slots[slot] === suit) {
              slots[slot] = null;
              entity.更新宠物管理窗口();
              break;
            }
          }
          ports.log(`${entity.名称} 的防化服损坏了！`, '警告');
        }
      } else if (entity === S.玩家) {
        ports.refreshEquipment();
      }
    }
    return;
  }
  const { 药水名称, 药水效果, 药水颜色, 药水持续, 药水强度 } = cell.药水数据;
  let PotionClass = ports.lookupClass(药水名称);
  if (!PotionClass) PotionClass = ports.potionForEffect(药水效果);
  if (PotionClass) {
    const potion = new PotionClass({});
    potion.自定义数据.set('效果类型', 药水效果);
    potion.对实体生效(entity, 药水强度, 药水持续);
  }
  cell.环境 = 环境类型.水;
  cell.药水数据 = null;
  ports.scheduleCellEffect([{ x: cell.x, y: cell.y }], 药水颜色 || '#FFFFFF', 0);
}
