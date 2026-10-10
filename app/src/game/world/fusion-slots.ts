import { 最大堆叠数 } from './constants';
import { MATERIALS } from '../item-core';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface FusionRefreshPorts {
  refreshFusionWindow(): void; // 更新融合窗口
  checkRecipes(): void; // 检查融合配方 (t10-fusion-engine-audit)
  refreshInventory(): void; // 更新背包显示
  refreshEquipment(): void; // 更新装备显示
}

export interface FusionSlotPorts extends FusionRefreshPorts {
  isOnline(): boolean; // 联机模式
  emit(event: string, payload: unknown): void; // socket.emit
  isGold(item: unknown): boolean; // instanceof 金币
  createGold(options: { 数量: number }): unknown; // new 金币(...)
  tryCollect(item: unknown, silent: boolean): unknown; // 尝试收集物品
  notify(message: string, type: string): void; // 显示通知
  cloneItem(item: unknown): Loose; // 克隆物品
  animate(start: unknown, target: () => unknown): void; // 创建并播放物品移动动画
  getElement(id: string): Loose; // document.getElementById
  gsapMissing(): boolean; // typeof gsap === 'undefined'
  schedule(callback: () => void, ms: number): void; // setTimeout
}

/**
 * Source `添加到融合区(物品实例, 起始元素)` (HTML L46326): moves one unit of an item (gold stacks into gold slots of the
 * first four) into the fusion area. SRC-31 fixed (owner rule 2026-10-10): the online emit is skipped for a missing item
 * (source emitted before its null check and threw).
 */
export function addToFusion(state: WorldState, ports: FusionSlotPorts, item: Loose, startElement: unknown): void {
  const S = state as Loose;
  if (ports.isOnline() && item) ports.emit('playerAction', { type: 'fuseAdd', id: item.唯一标识.toString() });
  if (!item) return;
  const target = S.融合区物品.findIndex((slot: unknown) => slot === null);
  if (target === -1) {
    ports.notify('融合区已满！', '错误');
    return;
  }
  if (ports.isGold(item)) {
    let goldSlot = -1;
    for (let i = 0; i < 4; i++) {
      const inSlot = S.融合区物品[i];
      if (inSlot === null || (ports.isGold(inSlot) && S.fusionGoldQuantities[i] < 最大堆叠数)) {
        goldSlot = i;
        break;
      }
    }
    if (goldSlot === -1) {
      ports.notify('融合区已满或无合适槽位！', '错误');
      return;
    }
    item.堆叠数量--;
    if (S.融合区物品[goldSlot] === null) S.融合区物品[goldSlot] = item;
    S.fusionGoldQuantities[goldSlot]++;
    if (item.堆叠数量 <= 0) {
      S.玩家背包.delete(item.唯一标识);
      if (item.装备槽位) item.取消装备();
    }
    ports.animate(startElement, () => ports.getElement(`融合区格子${goldSlot + 1}`));
  } else {
    if (item.堆叠数量 > 1) {
      item.堆叠数量--;
      const moved = ports.cloneItem(item);
      moved.堆叠数量 = 1;
      moved.实际唯一标识 = item.唯一标识;
      S.融合区物品[target] = moved;
    } else {
      S.玩家背包.delete(item.唯一标识);
      if (item.装备槽位) item.取消装备();
      item.实际唯一标识 = item.唯一标识;
      S.融合区物品[target] = item;
    }
    ports.animate(startElement, () => ports.getElement(`融合区格子${target + 1}`));
  }
  item.isActive = false;
  if (item.显示元素) item.显示元素.classList.remove('active');
  ports.getElement('浮动提示框').style.display = 'none';
  const refresh = () => {
    ports.refreshFusionWindow();
    ports.checkRecipes();
    ports.refreshInventory();
    ports.refreshEquipment();
  };
  if (ports.gsapMissing() && S.命令行模式开启) ports.schedule(refresh, 320);
  else refresh();
}

/**
 * Source `从融合区移除(格子索引)` (HTML L46404): returns a slot to the backpack (gold as a fresh 金币 stack). Empty (`null`)
 * and out-of-range (`undefined`) slots are skipped (SRC-31 fixed).
 */
export function removeFromFusion(state: WorldState, ports: FusionSlotPorts, index: Loose): void {
  const S = state as Loose;
  if (ports.isOnline()) ports.emit('playerAction', { type: 'fuseRemove', index });
  const item = S.融合区物品[index];
  if (item == null) return; // SRC-31 fixed: source skipped only null, not out-of-range (undefined) slots
  ports.getElement('浮动提示框').style.display = 'none';
  if (ports.isGold(item)) {
    const amount = S.fusionGoldQuantities[index] || 0;
    if (amount > 0) {
      S.fusionGoldQuantities[index] = 0;
      S.融合区物品[index] = null;
      ports.tryCollect(ports.createGold({ 数量: amount }), true);
    } else {
      S.融合区物品[index] = null;
    }
  } else {
    S.融合区物品[index] = null;
    if (!ports.tryCollect(item, true)) {
      S.融合区物品[index] = item;
      ports.notify('背包已满，无法取回！', '错误');
    }
  }
  ports.checkRecipes();
  ports.refreshFusionWindow();
  ports.refreshInventory();
  ports.refreshEquipment();
}

/**
 * Source `清空融合区()` (HTML L47337): empties every slot. The gold branch looks the slot's item up in the backpack by
 * the item object (the backpack is keyed by id), so it never matches and gold also goes through `从融合区移除`.
 */
export function clearFusion(state: WorldState, ports: Pick<FusionSlotPorts, 'isGold' | 'createGold' | 'tryCollect' | 'refreshFusionWindow' | 'refreshInventory'> & { remove(index: number): void }): void {
  const S = state as Loose;
  for (let i = 0; i < S.融合区物品.length; i++) {
    if (S.融合区物品[i] !== null && ports.isGold(S.玩家背包.get(S.融合区物品[i]))) {
      const amount = S.fusionGoldQuantities[i];
      if (amount > 0) ports.tryCollect(ports.createGold({ 数量: amount }), true);
      S.玩家背包.get(S.融合区物品[i]).是否隐藏 = false;
      S.fusionGoldQuantities[i] = 0;
      S.融合区物品[i] = null;
    } else if (S.融合区物品[i] !== null) {
      ports.remove(i);
    }
  }
  S.融合结果 = null;
  ports.refreshFusionWindow();
  ports.refreshInventory();
}

export interface BurnScrollPorts {
  isScroll(item: unknown): boolean; // instanceof 卷轴类
  notify(message: string, type: string): void; // 显示通知
  destroyItem(id: unknown, silent: boolean): void; // 处理销毁物品
  refreshInventory(): void; // 更新背包显示
  refreshEquipment(): void; // 更新装备显示
}

/**
 * Source `处理燃烧木质卷轴()` (HTML L66467): burns wooden scrolls. Equipped scrolls are listed too, but only ids still
 * found in the backpack are destroyed; any listed scroll still refreshes both displays and returns `true`.
 */
export function burnWoodenScrolls(state: WorldState, ports: BurnScrollPorts): boolean {
  const S = state as Loose;
  const toBurn: unknown[] = [];
  [...S.玩家背包.values(), ...S.玩家装备.values()].forEach((item: Loose) => {
    if (ports.isScroll(item) && item.材质 === MATERIALS.木质) toBurn.push(item.唯一标识);
  });
  if (toBurn.length > 0) {
    toBurn.forEach((id) => {
      const item = S.玩家背包.get(id);
      if (item) {
        ports.notify(`${item.获取名称()} 被火焰烧毁了！`, '错误');
        ports.destroyItem(id, true);
      }
    });
    ports.refreshInventory();
    ports.refreshEquipment();
    return true;
  }
  return false;
}
