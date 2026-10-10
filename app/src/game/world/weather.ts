import { 所有天气列表, 环境类型 } from './constants';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface WeatherDispatchPorts {
  thunderstorm(): void; // 处理雷暴效果
  wind(): void; // 处理大风效果
  cold(): void; // 处理严寒效果
  thaw(): void; // 解冻药水
}

/** Source `处理天气效果()` (HTML L46024): per-turn weather dispatch; without `严寒` potions thaw. */
export function processWeather(state: WorldState, ports: WeatherDispatchPorts): void {
  if (state.当前天气效果.includes('雷暴')) ports.thunderstorm();
  if (state.当前天气效果.includes('大风')) ports.wind();
  if (state.当前天气效果.includes('严寒')) ports.cold();
  else ports.thaw();
}

/** Source `生成天气效果()` (HTML L51119): picks one or two weathers; `严寒` freezes all water. */
export function generateWeather(state: WorldState, ports: { random(): number; notify(message: string, type: string): void }): void {
  const S = state as Loose;
  S.当前天气效果 = [];
  if (S.自定义游戏设置.天气系统 === '关闭') return;
  // Source shuffles with a random comparator; the draw count follows the engine's sort, so keep Array#sort.
  const shuffled = [...所有天气列表].sort(() => ports.random() - 0.5);
  const count = ports.random() < 0.5 ? 1 : Math.min(2, shuffled.length);
  S.当前天气效果 = shuffled.slice(0, count);
  if (S.当前天气效果.includes('深夜')) ports.notify('夜幕降临，周围变得一片漆黑...', '警告');
  if (S.当前天气效果.includes('雷暴')) ports.notify('乌云密布，雷声滚滚...', '警告');
  if (S.当前天气效果.includes('大风')) ports.notify('狂风呼啸，站稳脚跟！', '警告');
  if (S.当前天气效果.includes('严寒')) {
    ports.notify('严冬将至...', '警告');
    // Source repeats the same check and notification inside the branch.
    if (S.当前天气效果.includes('严寒')) {
      ports.notify('严冬将至...', '警告');
      for (let y = 0; y < S.地牢大小; y++) {
        for (let x = 0; x < S.地牢大小; x++) {
          const cell = S.地牢[y]?.[x];
          if (cell && cell.环境 === 环境类型.水) cell.环境 = 环境类型.冰;
        }
      }
    }
  }
  if (S.当前天气效果.includes('诡魅')) ports.notify('空气中弥漫着诡异的气息，你的感知似乎受到了干扰...', '警告');
}

export interface FireCheckPorts {
  isTorch(item: unknown): boolean; // instanceof 火把
  isFireItem(item: unknown): boolean; // instanceof 火焰物品
}

/** Source `是否靠近火源(目标X, 目标Y)` (HTML L46037): burning player/torch, or fire, a dropped lit torch or a burning monster in the 3×3 area. */
export function isNearFire(state: WorldState, ports: FireCheckPorts, x: number, y: number): boolean {
  const S = state as Loose;
  if (x === S.玩家.x && y === S.玩家.y) {
    if (S.玩家状态.some((s: Loose) => s.类型 === '火焰')) return true;
    if (Array.from({ length: S.装备栏每页装备数 }, (_, i) => S.玩家装备.get(S.当前装备页 * S.装备栏每页装备数 + i + 1))
      .filter((v) => v != null)
      .some((gear: Loose) => ports.isTorch(gear) && gear.自定义数据?.get('耐久') > 0)) return true;
  }
  const offsets = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const;
  for (const [dx, dy] of offsets) {
    const cx = x + dx;
    const cy = y + dy;
    if (cx >= 0 && cx < S.地牢大小 && cy >= 0 && cy < S.地牢大小) {
      const cell = S.地牢[cy]?.[cx];
      const monster = cell?.关联怪物;
      if (ports.isFireItem(cell?.关联物品) && cell.关联物品.自定义数据.get('倒计时') > 0) return true;
      else if (ports.isTorch(cell?.关联物品) && cell.关联物品.自定义数据.get('耐久') > 0 && cell.关联物品.是否被丢弃) return true;
      else if (monster && S.怪物状态表.get(monster)?.类型 === '火焰') return true;
    }
  }
  return false;
}

export interface ColdPorts {
  random(): number;
  isPotion(item: unknown): boolean; // instanceof 药水类
  nearFire(x: number, y: number): boolean; // 是否靠近火源
  /** `new 状态效果(...)` with the source arguments; `icon` reads `图标映射[name]`. */
  createStatusEffect(...args: unknown[]): unknown;
  icon(name: string): unknown;
  log(message: string, type: string): void; // 添加日志
  refreshInventory(): void; // 更新背包显示
  thaw(): void; // 解冻药水
}

/** Source `解冻药水()` (HTML L46097). */
export function thawPotions(state: WorldState, ports: Pick<ColdPorts, 'isPotion' | 'log' | 'refreshInventory'>): void {
  let thawed = false;
  (state.玩家背包 as Map<unknown, Loose>).forEach((item) => {
    if (ports.isPotion(item) && item.自定义数据.get('是否冻结')) {
      item.自定义数据.set('是否冻结', false);
      thawed = true;
    }
  });
  if (thawed) {
    ports.log('背包里的药水解冻了。', '信息');
    ports.refreshInventory();
  }
}

/** Source `处理严寒效果()` (HTML L46115): may freeze the player and freezes carried potions unless near fire. */
export function processCold(state: WorldState, ports: ColdPorts): void {
  const S = state as Loose;
  if (!S.玩家状态.some((s: Loose) => s.类型 === '冻结') && !ports.nearFire(S.玩家.x, S.玩家.y)) {
    if (ports.random() < 0.1) {
      ports.createStatusEffect('冻结', '#2196F3', ports.icon('冰冻怪物'), 2, null, null, null, 1);
      ports.log('你被严寒冻结了！', '错误');
    }
  }
  let frozen = false;
  (S.玩家背包 as Map<unknown, Loose>).forEach((item) => {
    if (ports.isPotion(item) && !item.自定义数据.get('是否冻结')) {
      if (!ports.nearFire(S.玩家.x, S.玩家.y)) {
        item.自定义数据.set('是否冻结', true);
        frozen = true;
        ports.log(`${item.获取名称()} 被冻结了！`, '警告');
      }
    }
  });
  if (frozen) ports.refreshInventory();
  if (ports.nearFire(S.玩家.x, S.玩家.y)) ports.thaw();
}
