import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Source `物品生成配置` (HTML L6629): spawn chances, quality weights `[base, per-depth]`, type weights per room kind. */
export const 物品生成配置 = {
  基础概率: { 普通房间: 0.4, 上锁房间: 0.7 },
  品质权重: { 1: [60, 0], 2: [25, 20], 3: [10, 30], 4: [5, 40], 5: [0, 10] } as Record<string, [number, number]>,
  类型分布: {
    普通房间: [
      { 类型: '武器', 权重: 40 }, { 类型: '防具', 权重: 30 }, { 类型: '药水', 权重: 20 }, { 类型: '卷轴', 权重: 10 },
      { 类型: '工具', 权重: 25 }, { 类型: '宠物', 权重: 10 }, { 类型: '饰品', 权重: 8 },
    ],
    上锁房间: [
      { 类型: '卷轴', 权重: 30 }, { 类型: '武器', 权重: 30 }, { 类型: '药水', 权重: 25 }, { 类型: '防具', 权重: 15 },
      { 类型: '工具', 权重: 25 }, { 类型: '宠物', 权重: 10 }, { 类型: '饰品', 权重: 10 },
    ],
  },
};

export interface ItemGenerationPorts {
  random(): number;
  /** Source `加权随机选择(选项列表)` (packet `t10-spawn-selection`). */
  weightedPick(options: readonly Loose[]): Loose;
  /** Source `放置物品到房间(item, room)`. */
  placeItemInRoom(item: unknown, room: Loose): boolean;
  /** Source `console.log("物品放置失败，位置被占用")`. */
  diagnostic(message: string): void;
  /** Spawn configuration; defaults to the source table above. */
  config?: typeof 物品生成配置;
}

/**
 * Source `生成物品(生成房间 = null)`. Quirks preserved: a `return` inside the per-room callback abandons the
 * room's remaining items, and `Math.round(prng() * (n - 1))` gives the first and last candidates half weight.
 */
export function generateItems(state: WorldState, ports: ItemGenerationPorts, rooms: Loose = null): void {
  const config = ports.config ?? 物品生成配置;
  const floor = state.当前层数;
  const depthWeight = Math.min(Math.floor(floor / 2), 1);
  // eslint-disable-next-line eqeqeq
  let available: Loose[] = (state.房间列表 as Loose[]).filter(room => room.类型 == '房间');
  if (rooms) available = rooms;
  available.forEach(room => {
    const locked = (state.上锁房间列表 as Loose[]).some(other => other.id === room.id);
    const roomKind = locked ? '上锁房间' : '普通房间';
    const base = (locked ? config.基础概率.上锁房间 : config.基础概率.普通房间) * (state.自定义游戏设置 as Loose).物品掉落率;
    let chance = base;
    if (locked) chance += 0.1 + floor * 0.05;
    chance = Math.min(chance, 0.85);
    if (ports.random() > chance) return;
    let count = 1;
    if (locked) {
      while (ports.random() < 0.8 + 0.1 * chance && count <= 5) count++;
      count = Math.min(count, 5);
    }
    for (let i = 0; i < count; i++) {
      const qualities = Object.entries(config.品质权重).reduce((acc: { 品质: number; 权重: number }[], [quality, weights]) => {
        const total = weights[0] + weights[1] * depthWeight;
        if (total > 0) acc.push({ 品质: parseInt(quality), 权重: total });
        return acc;
      }, []);
      const chosenType = ports.weightedPick(config.类型分布[roomKind]);
      const candidates = ((state.物品池 as Record<string, Loose[]>)[chosenType['类型']] as Loose[]).filter(item => floor >= item.最小层 && qualities.some(q => q.品质 >= item.品质));
      if (candidates.length === 0) return;
      const targetQuality = ports.weightedPick(qualities.map(q => ({ 值: q.品质, 权重: q.权重 })));
      const finalists = candidates.filter(item => item.品质 >= targetQuality);
      if (finalists.length === 0) return;
      const chosen = finalists[Math.round(ports.random() * (finalists.length - 1))];
      const item = new chosen.类({});
      if (locked) item.强化 = true;
      if (!ports.placeItemInRoom(item, room)) ports.diagnostic('物品放置失败，位置被占用');
    }
  });
}

export interface HazmatPorts {
  /** Source `instanceof 防化服` (`app/src/game/armor-items.ts`) and `instanceof 宠物` (packet `t10-pet-core`). */
  isHazmatSuit(item: unknown): boolean;
  isPet(entity: unknown): boolean;
  destroyInventoryItem(id: unknown, silent: true): void;
  notify(message: string, type: string): void;
  log(message: string, type: string): void;
  /** Source `更新装备显示()`. */
  refreshEquipment(): void;
}

/** Source `检查防化服防护(实体)`: true while a worn suit absorbs the hit (durability −1 unless unbreakable). */
export function checkHazmatProtection(state: WorldState, ports: HazmatPorts, entity: Loose): boolean {
  let suit: Loose = null;
  if (entity === state.玩家) {
    const perPage = state.装备栏每页装备数;
    suit = Array.from({ length: perPage }, (_, i) => state.玩家装备.get(state.当前装备页 * perPage + i + 1)).find(item => ports.isHazmatSuit(item));
  } else if (ports.isPet(entity)) {
    const equipment = entity.自定义数据.get('装备') || {};
    suit = Object.values(equipment).find(item => ports.isHazmatSuit(item));
  }
  if (suit) {
    if (!suit.自定义数据.get('不可破坏')) {
      const durability = suit.自定义数据.get('耐久') - 1;
      suit.自定义数据.set('耐久', durability);
      if (durability <= 0) {
        if (entity === state.玩家) {
          ports.destroyInventoryItem(suit.唯一标识, true);
          ports.notify('防化服不堪重负损坏了！', '错误');
        } else {
          const slots = entity.自定义数据.get('装备');
          for (const slot in slots) {
            if (slots[slot] === suit) { slots[slot] = null; entity.更新宠物管理窗口(); break; }
          }
          ports.log(`${entity.名称} 的防化服损坏了！`, '警告');
        }
        return false;
      } else if (entity === state.玩家) {
        ports.refreshEquipment();
      }
    }
    return true;
  }
  return false;
}
