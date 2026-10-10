import { FUSION_BUFF_TYPES } from '../buffs';
import { MATERIALS } from '../item-core';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Source classes tested with `instanceof` by `执行融合`. */
export type FusionExecClass = '金币' | '磨刀石' | '武器类' | '防御装备类' | '岩浆桶' | '水桶' | '冰桶' | '空桶' | '血水桶' | '药水类'
  | '炸弹' | '药水弹' | '附魔卷轴';

export interface FusionExecPorts {
  isOnline(): boolean; // 联机模式
  emit(event: string, payload: unknown): void; // socket.emit
  isA(item: unknown, className: FusionExecClass): boolean;
  notify(message: string, type: string): void; // 显示通知
  log(message: string, type: string): void; // 添加日志
  spendEnergy(amount: number): boolean; // 扣除能量
  cloneItem(item: unknown): Loose; // 克隆物品
  tryCollect(item: unknown, silent: boolean): boolean; // 尝试收集物品
  destroyItem(id: unknown, silent: boolean): void; // 处理销毁物品
  createEmptyBucket(config: { 强化: unknown }): Loose; // new 空桶(config)
  placeItemAtCell(item: unknown, x: number, y: number): void; // 放置物品到单元格
  random(): number; // prng
  now(): number; // Date.now
  removeFromFusion(index: number): void; // 从融合区移除
  mergeBuffs(a: unknown, b: unknown): unknown; // 合并Buff列表 (packet t10-fusion-list-helpers)
  isFusionWeapon(item: unknown): boolean; // 是否为有效融合武器
  isFusionMaterial(item: unknown): boolean; // 是否为有效融合材料
  checkRecipes(): void; // 检查融合配方
  refreshFusionWindow(): void; // 更新融合窗口
  refreshInventory(): void; // 更新背包显示
  refreshEquipment(): void; // 更新装备显示
}

const FUSION_BASES: FusionExecClass[] = ['武器类', '防御装备类', '空桶', '水桶', '岩浆桶', '冰桶', '血水桶'];
const COLLECT_FAILED = '融合失败：无法将产物放入背包！';

/**
 * Source `执行融合()` (HTML L46439): commits the previewed fusion. Each recipe spends energy (`扣除能量`) and collects a
 * clone of `融合结果`; a failed collection refunds the energy (except for the equipment merge) and keeps the inputs.
 * Buff fusion and sharpening modify the slot-0 original in place. Consumed inputs are destroyed (gold only zeroed) and
 * cleared from their slots, then the preview is recomputed and the windows refreshed. Online play only emits `fuseExec`.
 */
export function executeFusion(state: WorldState, ports: FusionExecPorts): void {
  const S = state as Loose;
  const is = (item: unknown, name: FusionExecClass) => ports.isA(item, name);
  if (ports.isOnline()) {
    ports.emit('playerAction', { type: 'fuseExec' });
    return;
  }
  if (!S.融合结果) {
    ports.notify('没有有效的融合结果！', '错误');
    return;
  }

  const originals: Loose[] = [...S.融合区物品];
  const consumed = new Set<unknown>();
  const consumedGold = [0, 0, 0, 0];
  const recipe = S.当前匹配的融合配方;
  const refund = (cost: number) => {
    S.玩家属性.当前能量值 = Math.min(100, S.玩家属性.当前能量值 + cost / S.自定义全局设置.初始能量值 * 100);
  };
  /** Shared "spend energy" step; false when the source returns after its notification. */
  const spend = (cost: number) => {
    if (!ports.spendEnergy(cost)) {
      ports.notify(`能量不足！需要 ${cost} 点能量。`, '错误');
      return false;
    }
    return true;
  };
  const failCollect = (cost: number) => { ports.notify(COLLECT_FAILED, '错误'); refund(cost); };

  if (recipe === '药水桶融合' || recipe === '药水弹融合') {
    const bucket = recipe === '药水桶融合';
    const container = bucket ? originals.find(item => is(item, '血水桶')) : originals.find(item => is(item, '炸弹') && !is(item, '药水弹'));
    const potion = originals.find(item => is(item, '药水类'));
    if (!container || !potion) {
      ports.notify(bucket ? '融合错误：找不到血水桶或药水！' : '融合错误：找不到炸弹或药水！', '错误');
      return;
    }
    const cost = bucket ? 15 : 10;
    if (!spend(cost)) return;
    const product = ports.cloneItem(S.融合结果);
    if (ports.tryCollect(product, true)) {
      consumed.add(container.唯一标识);
      consumed.add(potion.唯一标识);
      ports.notify(`成功融合出 ${product.获取名称()}！`, '成功');
    } else {
      failCollect(cost);
      return;
    }
  } else if (recipe === '卷轴附魔融合') {
    const scroll = originals.find(item => is(item, '附魔卷轴') && item.自定义数据.get('已解锁'));
    const target = originals.find(item => item && (is(item, '武器类') || is(item, '防御装备类')));
    if (!scroll || !target) {
      ports.notify('融合错误：找不到卷轴或目标物品！', '错误');
      return;
    }
    const output = ports.cloneItem(target);
    const enchanted = scroll.附魔效果.call(scroll, output);
    if (enchanted) {
      S.融合结果 = output;
      consumed.add(scroll.唯一标识);
      consumed.add(target.唯一标识);
      output.是否隐藏 = false;
      ports.tryCollect(output, true);
      scroll.可用次数 = (scroll.可用次数 === undefined ? 1 : scroll.可用次数) - 1;
      if (scroll.可用次数 <= 0) ports.destroyItem(scroll.唯一标识, true);
      ports.notify(`${output.获取名称()} 附魔成功！`, '成功');
    } else {
      ports.notify('附魔失败！(能量不足或不兼容)', '错误');
      return;
    }
  } else if (recipe === '药水金币延长') {
    const potion = originals.find(item => is(item, '药水类'));
    if (!potion) {
      ports.notify('融合错误：找不到药水！', '错误');
      return;
    }
    let gold = 0;
    originals.forEach((item, index) => {
      if (is(item, '金币') && S.fusionGoldQuantities[index] > 0) {
        gold += S.fusionGoldQuantities[index];
        consumedGold[index] = S.fusionGoldQuantities[index];
      }
    });
    const cost = 2 * gold;
    if (!spend(cost)) return;
    consumed.add(potion.唯一标识);
    originals.forEach((item, index) => {
      if (is(item, '金币') && consumedGold[index]! > 0) consumed.add(item.唯一标识);
    });
    const extended = ports.cloneItem(S.融合结果);
    extended.唯一标识 = Symbol('ExtendedPotion_' + ports.now());
    extended.是否隐藏 = false;
    if (ports.tryCollect(extended, true)) {
      ports.notify(`${extended.名称} 持续时间已延长！`, '成功');
    } else {
      failCollect(cost);
      return;
    }
  } else if (recipe === '玻璃铁器转化融合') {
    const glassItem = originals.find(item => item && item.材质 === MATERIALS.玻璃);
    const rustedIronItem = originals.find(item => item && item.材质 === MATERIALS.铁质 && item.自定义数据.get('锈蚀度') > 0);
    if (!glassItem || !rustedIronItem) {
      ports.notify('融合错误：找不到所需材料！', '错误');
      return;
    }
    const cost = 15;
    if (!spend(cost)) return;
    const product = ports.cloneItem(glassItem);
    product.材质 = MATERIALS.铁质;
    product.是否隐藏 = false;
    if (ports.tryCollect(product, true)) {
      consumed.add(glassItem.唯一标识);
      consumed.add(rustedIronItem.唯一标识);
      ports.notify(`${glassItem.获取名称()} 成功转化为铁质！`, '成功');
    } else {
      failCollect(cost);
      return;
    }
  } else if (recipe === '木材转化融合' || recipe === '铁器锈蚀融合') {
    const cost = 10;
    if (!spend(cost)) return;
    const product = ports.cloneItem(S.融合结果);
    if (ports.tryCollect(product, true)) {
      originals.forEach(item => { if (item) consumed.add(item.唯一标识); });
      ports.notify(`${product.获取名称()} 转化成功！`, '成功');
    } else {
      failCollect(cost);
      return;
    }
  } else if (recipe === '岩浆淬火' || recipe === '铁器生锈' || recipe === '药水稀释') {
    // The three bucket recipes: find both inputs (silent return if missing), spend, collect, return an empty bucket.
    const lava = recipe === '岩浆淬火';
    const rust = recipe === '铁器生锈';
    const main = originals.find(item => is(item, lava || rust ? '武器类' : '药水类'));
    const bucket = originals.find(item => is(item, lava ? '岩浆桶' : '水桶'));
    if (!main || !bucket) return;
    const cost = lava ? 20 : 10;
    if (!spend(cost)) return;
    const product = ports.cloneItem(S.融合结果);
    if (ports.tryCollect(product, true)) {
      consumed.add(main.唯一标识);
      consumed.add(bucket.唯一标识);
      const newBucket = ports.createEmptyBucket({ 强化: bucket.强化 });
      if (rust) {
        if (!ports.tryCollect(newBucket, true)) {
          ports.placeItemAtCell(newBucket, S.玩家.x, S.玩家.y);
          ports.notify('背包已满，空桶掉在了地上。', '信息');
        }
        ports.notify(`${main.获取名称()} 遇水生锈了！`, '成功');
        ports.log(`${main.获取名称()} 的锈蚀度增加了。`, '信息');
      } else {
        ports.tryCollect(newBucket, true);
        ports.notify(lava ? `${main.获取名称()} 已被岩浆淬火！` : `${main.名称} 已被稀释！`, '成功');
      }
    } else {
      failCollect(cost);
      return;
    }
  } else if (recipe && typeof recipe === 'object') {
    const cost = 5 * recipe.输入.length;
    if (!spend(cost)) return;
    const output = ports.cloneItem(S.融合结果);
    if (ports.tryCollect(output, true)) {
      const remaining = [...originals];
      recipe.输入.forEach((requiredName: unknown) => {
        const found = remaining.findIndex(item => item && item.名称 === requiredName);
        if (found !== -1) {
          const item = remaining.splice(found, 1)[0];
          consumed.add(item.唯一标识);
        }
      });
      ports.notify(`成功融合出 ${output.获取名称()}！`, '成功');
    } else {
      failCollect(cost);
      return;
    }
  } else if (recipe === '磨刀石打磨') {
    const whetstone = originals.find(item => is(item, '磨刀石'));
    const weapon = originals.find(item => is(item, '武器类'));
    if (!spend(15)) return;
    const buffs = weapon.自定义数据.get('fusedBuffs') || [];
    const buffUses = 20 + Math.floor(ports.random() * 11);
    const attackBuff = buffs.find((b: Loose) => b.type === FUSION_BUFF_TYPES.磨刀石攻击加成);
    if (attackBuff) {
      attackBuff.value += 1;
      attackBuff.usesLeft = (attackBuff.usesLeft || 0) + buffUses;
    } else {
      buffs.push({ type: FUSION_BUFF_TYPES.磨刀石攻击加成, value: 1, usesLeft: buffUses });
    }
    const cooldownBuff = buffs.find((b: Loose) => b.type === FUSION_BUFF_TYPES.磨刀石冷却缩减);
    if (cooldownBuff) {
      cooldownBuff.value += 1;
      cooldownBuff.usesLeft = (cooldownBuff.usesLeft || 0) + buffUses;
    } else {
      buffs.push({ type: FUSION_BUFF_TYPES.磨刀石冷却缩减, value: 1, usesLeft: buffUses });
    }
    weapon.自定义数据.set('fusedBuffs', buffs);
    if (weapon.自定义数据.has('锈蚀度')) {
      weapon.自定义数据.set('锈蚀度', 0);
      ports.notify(`${weapon.获取名称()} 被成功打磨，锈迹斑斑的表面焕然一新！`, '成功');
    } else {
      ports.notify(`${weapon.获取名称()} 被成功打磨！`, '成功');
    }
    whetstone.自定义数据.set('耐久', whetstone.自定义数据.get('耐久') - 1);
    if (whetstone.自定义数据.get('耐久') <= 0) consumed.add(whetstone.唯一标识);
    else ports.removeFromFusion(0);
    ports.removeFromFusion(1);
    ports.removeFromFusion(2);
    ports.removeFromFusion(3);
  } else if (recipe === '装备融合') {
    const item1 = originals[0];
    const item2 = originals[1];
    if (!item1 || !item2 || !FUSION_BASES.some(cls => is(item1, cls)) || !FUSION_BASES.some(cls => is(item2, cls))) {
      ports.notify('融合错误：只有武器、装备或桶类道具才能进行此类融合！', '错误');
      return;
    }
    if (!spend(20 + (item1.品质 + item2.品质) * 5)) return;
    const merged = ports.cloneItem(S.融合结果);
    merged.唯一标识 = Symbol('MergedEquip_' + ports.now());
    merged.是否隐藏 = false;
    consumed.add(item1.唯一标识);
    consumed.add(item2.唯一标识);
    if (ports.tryCollect(merged, true)) {
      ports.notify(`${merged.获取名称()} 融合成功！`, '成功');
    } else {
      ports.notify(COLLECT_FAILED, '错误'); // no energy refund here (source)
      return;
    }
  } else if (recipe === '词条融合') {
    const weapon = originals[0];
    if (!weapon || !ports.isFusionWeapon(weapon)) {
      ports.notify('融合错误：原始武器无效！', '错误');
      return;
    }
    const materials: Loose[] = [];
    let gold = 0;
    for (let i = 1; i <= 3; i++) {
      const item = originals[i];
      if (item) {
        if (is(item, '金币') && S.fusionGoldQuantities[i] > 0) gold += S.fusionGoldQuantities[i];
        else if (!is(item, '金币') && ports.isFusionMaterial(item)) materials.push(item);
      }
    }
    if (!spend(10 + materials.length * 3 + gold * 0.5)) return;
    materials.forEach(material => consumed.add(material.唯一标识));
    if (gold > 0) {
      originals.forEach((item, index) => {
        if (is(item, '金币') && S.fusionGoldQuantities[index] > 0) {
          consumed.add(item.唯一标识);
          consumedGold[index] = S.fusionGoldQuantities[index];
        }
      });
    }
    const applied = S.融合结果.自定义数据.get('fusedBuffs');
    if (applied && applied.length > 0) {
      const old = weapon.自定义数据.get('fusedBuffs') || [];
      weapon.自定义数据.set('fusedBuffs', ports.mergeBuffs(old, applied));
      const materialChange = applied.find((b: Loose) => b.type === 'MATERIAL_CHANGE');
      if (materialChange) weapon.材质 = materialChange.value;
      const rustIncrease = applied.find((b: Loose) => b.type === 'RUST_INCREASE');
      if (rustIncrease) {
        const rust = weapon.自定义数据.get('锈蚀度') || 0;
        weapon.自定义数据.set('锈蚀度', rust + rustIncrease.value);
      }
      const durabilityMultiplier = applied.find((b: Loose) => b.type === 'DURABILITY_MULTIPLIER');
      if (durabilityMultiplier) {
        weapon.自定义数据.set('原耐久', Math.round(weapon.自定义数据.get('原耐久') * (1 + durabilityMultiplier.value) * 10) / 10);
        weapon.自定义数据.set('耐久', Math.round(weapon.自定义数据.get('耐久') * (1 + durabilityMultiplier.value) * 10) / 10);
      }
      const durabilityBonus = applied.find((b: Loose) => b.type === 'DURABILITY_BONUS');
      if (durabilityBonus) {
        weapon.自定义数据.set('原耐久', weapon.自定义数据.get('原耐久') + durabilityBonus.value);
        weapon.自定义数据.set('耐久', weapon.自定义数据.get('耐久') + durabilityBonus.value);
      }
      ports.notify(`${weapon.获取名称()} 强化成功！`, '成功');
    } else {
      ports.notify(`${weapon.获取名称()} 没有获得强化效果。`, '信息');
    }
  }

  for (let i = 0; i < 4; i++) {
    const item = originals[i];
    if (item && consumed.has(item.唯一标识)) {
      if (!is(item, '金币')) ports.destroyItem(item.唯一标识, true);
      S.融合区物品[i] = null;
      if (is(item, '金币')) S.fusionGoldQuantities[i] = 0;
    }
  }
  S.融合结果 = null;
  S.当前匹配的融合配方 = null;
  ports.checkRecipes();
  ports.refreshFusionWindow();
  ports.refreshInventory();
  ports.refreshEquipment();
}
