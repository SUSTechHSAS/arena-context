import { FUSION_BUFF_TYPES } from '../buffs';
import { MATERIALS } from '../item-core';
import { 融合配方列表 } from './constants';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Source classes tested with `instanceof` by `检查融合配方`. */
export type FusionCheckClass = '金币' | '磨刀石' | '武器类' | '防御装备类' | '岩浆桶' | '水桶' | '冰桶' | '空桶' | '血水桶' | '药水类'
  | '炸弹' | '药水弹' | '附魔卷轴' | '治疗药水' | '狂暴药水' | '隐身药水' | '硫酸药水' | '中毒药水' | '冰冻药水' | '抗火药水' | '失明药水';

export interface FusionCheckPorts {
  isA(item: unknown, className: FusionCheckClass): boolean; // item instanceof <class>
  getElement(id: string): Loose; // document.getElementById
  createElement(tag: string): Loose; // document.createElement
  cloneItem(item: unknown): Loose; // 克隆物品
  construct(className: '药水桶' | '药水弹', config: unknown): Loose;
  windowLookup(name: string): Loose; // window[配方.输出类]
  now(): number; // Date.now
  schedule(callback: () => void, delay: number): unknown; // setTimeout
  fuse(): void; // 执行融合
  mergeBuffs(a: unknown, b: unknown): Loose[]; // 合并Buff列表 (packet t10-fusion-list-helpers)
  mergeEnchantments(a: unknown, b: unknown): unknown; // 合并附魔列表 (packet t10-fusion-list-helpers)
  computeBuffs(weapon: unknown, materials: unknown[], gold: number): Loose[]; // 计算融合Buff (packet t10-fusion-buff-engine)
  isFusionWeapon(item: unknown): boolean; // 是否为有效融合武器
  isFusionMaterial(item: unknown): boolean; // 是否为有效融合材料
}

const SUPPORTED_POTIONS: FusionCheckClass[] = ['治疗药水', '狂暴药水', '隐身药水', '硫酸药水', '中毒药水', '冰冻药水', '抗火药水', '失明药水'];
const ENCHANT_COMPATIBILITY: Record<string, string[]> = {
  火焰附魔: ['武器', '防御装备'], 保护附魔: ['防御装备'], 耐久附魔: ['武器', '防御装备'], 锋利附魔: ['武器'],
  爆炸保护附魔: ['防御装备'], 连锁附魔: ['武器'], 荆棘附魔: ['防御装备'],
};
const FUSION_BASES: FusionCheckClass[] = ['武器类', '防御装备类', '空桶', '水桶', '岩浆桶', '冰桶', '血水桶'];

/**
 * Source `检查融合配方()` (HTML L46887): recomputes the fusion preview from the four fusion slots. The first matching rule
 * wins: whetstone sharpening, lava quench, potion dilution, potion bucket, iron rusting, potion bomb, glass/rusted-iron
 * conversion, scroll enchanting, potion + gold extension, named recipes (discovered procedural ones first), same-class
 * equipment merge, buff fusion (`计算融合Buff`) and wood conversion. The preview element is placed in `融合输出格子`, whose
 * click schedules `执行融合`. All checks, clones, constructions and DOM writes happen in source order.
 */
export function checkFusionRecipes(state: WorldState, ports: FusionCheckPorts): void {
  const S = state as Loose;
  const is = (item: unknown, name: FusionCheckClass) => ports.isA(item, name);
  S.当前匹配的融合配方 = null;
  const output = ports.getElement('融合输出格子');
  output.innerHTML = '';
  S.融合结果 = null;
  output.onclick = null;
  const show = (preview: Loose) => {
    output.appendChild(preview);
    output.onclick = () => ports.schedule(() => ports.fuse(), 0);
  };
  const showPointer = (preview: Loose) => { preview.style.cursor = 'pointer'; show(preview); };

  const entries: { item: Loose; quantityInSlot: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const item = S.融合区物品[i];
    if (item) {
      if (is(item, '金币')) {
        if (S.fusionGoldQuantities[i] > 0) entries.push({ item, quantityInSlot: S.fusionGoldQuantities[i] });
      } else {
        entries.push({ item, quantityInSlot: item.堆叠数量 });
      }
    }
  }
  if (entries.length === 0) return;

  const items = entries.map(entry => entry.item);
  const sortedNames = items.map(item => item.名称).sort();

  const whetstone = items.find(item => is(item, '磨刀石'));
  const sharpenWeapon = items.find(item => is(item, '武器类'));
  const firstIsWhetstone = is(S.融合区物品[0], '磨刀石');
  if (items.length === 2 && whetstone && sharpenWeapon && firstIsWhetstone) {
    if (whetstone.自定义数据.get('耐久') > 0) {
      S.当前匹配的融合配方 = '磨刀石打磨';
      S.融合结果 = ports.cloneItem(sharpenWeapon);
      S.融合结果.唯一标识 = Symbol('SharpenPreview_' + ports.now());
      showPointer(S.融合结果.生成显示元素('融合'));
      return;
    }
  }
  const isSupportedPotion = (potion: unknown) => SUPPORTED_POTIONS.some(cls => is(potion, cls));
  if (items.length === 2) {
    const lavaBucket = items.find(item => is(item, '岩浆桶'));
    const weapon = items.find(item => is(item, '武器类'));
    if (lavaBucket && weapon) {
      S.当前匹配的融合配方 = '岩浆淬火';
      S.融合结果 = ports.cloneItem(weapon);
      const buffs = S.融合结果.自定义数据.get('fusedBuffs') || [];
      const uses = 10 + (weapon.强化 ? 5 : 0);
      const existingBuff = buffs.find((b: Loose) => b.type === FUSION_BUFF_TYPES.火焰伤害);
      if (existingBuff) {
        existingBuff.value = Math.min(0.9, existingBuff.value + 0.5);
        existingBuff.usesLeft = (existingBuff.usesLeft || 0) + uses;
      } else {
        buffs.push({ type: FUSION_BUFF_TYPES.火焰伤害, value: 0.5 + (weapon.强化 ? 0.2 : 0), usesLeft: uses });
      }
      S.融合结果.自定义数据.set('fusedBuffs', buffs);
      showPointer(S.融合结果.生成显示元素('融合'));
      return;
    }

    const waterBucket = items.find(item => is(item, '水桶'));
    const potion = items.find(item => is(item, '药水类'));
    if (waterBucket && potion) {
      S.当前匹配的融合配方 = '药水稀释';
      S.融合结果 = ports.cloneItem(potion);
      const quality = Math.max(1, potion.品质 - 1);
      S.融合结果.品质 = quality;
      S.融合结果.颜色索引 = quality - 1;
      S.融合结果.自定义数据.set('效果强度', Math.max(S.融合结果.自定义数据.get('效果强度') - 1, 1));
      S.融合结果.强化 = false;
      const baseDuration = potion.自定义数据.get('基础持续时间') || 3;
      S.融合结果.自定义数据.set('基础持续时间', baseDuration + 5 + (potion.强化 ? 3 : 0));
      showPointer(S.融合结果.生成显示元素('融合'));
      return;
    }

    const bloodBucket = items.find(item => is(item, '血水桶'));
    if (bloodBucket && potion && isSupportedPotion(potion)) {
      S.当前匹配的融合配方 = '药水桶融合';
      S.融合结果 = ports.construct('药水桶', {
        药水名称: potion.名称,
        药水效果: potion.自定义数据.get('效果类型'),
        药水颜色: potion.获取药水颜色(),
        药水图标: potion.图标,
        药水持续: potion.持续时间,
        药水强度: potion.强度,
        品质: Math.max(bloodBucket.品质, potion.品质),
        强化: bloodBucket.强化 || potion.强化,
        颜色索引: potion.颜色索引,
        数据: { 耐久: bloodBucket.自定义数据.get('耐久'), 原耐久: bloodBucket.自定义数据.get('原耐久') },
      });
      S.融合结果.唯一标识 = Symbol('PotionBucketPreview_' + ports.now());
      showPointer(S.融合结果.生成显示元素('融合'));
      return;
    }

    const ironWeapon = items.find(item => is(item, '武器类') && item.材质 === MATERIALS.铁质);
    if (waterBucket && ironWeapon) {
      S.当前匹配的融合配方 = '铁器生锈';
      S.融合结果 = ports.cloneItem(ironWeapon);
      const rust = S.融合结果.自定义数据.get('锈蚀度') || 0;
      const added = Math.ceil(ironWeapon.攻击力 * 0.2);
      S.融合结果.自定义数据.set('锈蚀度', rust + added);
      const preview = S.融合结果.生成显示元素('融合');
      const hint = ports.createElement('div');
      hint.textContent = `锈蚀度 +${added}`;
      hint.style.cssText = 'color: #8B4513; font-size: 0.8em; text-align: center;';
      preview.appendChild(hint);
      showPointer(preview);
      return;
    }
  }
  if (items.length === 2) {
    const bomb = items.find(item => is(item, '炸弹') && !is(item, '药水弹'));
    const potion = items.find(item => is(item, '药水类'));
    if (bomb && potion && isSupportedPotion(potion)) {
      S.当前匹配的融合配方 = '药水弹融合';
      S.融合结果 = ports.construct('药水弹', {
        药水名称: potion.名称,
        药水效果: potion.自定义数据.get('效果类型'),
        药水颜色: potion.获取药水颜色(),
        药水图标: potion.图标,
        药水持续: potion.持续时间,
        药水强度: potion.强度,
        品质: Math.max(bomb.品质, potion.品质),
        强化: bomb.强化 || potion.强化,
        颜色索引: potion.颜色索引,
      });
      S.融合结果.唯一标识 = Symbol('PotionBombPreview_' + ports.now());
      showPointer(S.融合结果.生成显示元素('融合'));
      return;
    }

    const item1 = items[0];
    const item2 = items[1];
    let glassItem = null;
    let rustedIronItem = null;
    if (item1.材质 === MATERIALS.玻璃 && item2.材质 === MATERIALS.铁质 && item2.自定义数据.get('锈蚀度') > 0) {
      glassItem = item1;
      rustedIronItem = item2;
    } else if (item2.材质 === MATERIALS.玻璃 && item1.材质 === MATERIALS.铁质 && item1.自定义数据.get('锈蚀度') > 0) {
      glassItem = item2;
      rustedIronItem = item1;
    }
    if (glassItem && rustedIronItem) {
      S.当前匹配的融合配方 = '玻璃铁器转化融合';
      S.融合结果 = ports.cloneItem(glassItem);
      S.融合结果.材质 = MATERIALS.铁质;
      S.融合结果.唯一标识 = Symbol('GlassToIronPreview_' + ports.now());
      showPointer(S.融合结果.生成显示元素('融合'));
      return;
    }
  }
  const scroll = items.find(item => is(item, '附魔卷轴') && item.自定义数据.get('已解锁'));
  const others = items.filter(item => !is(item, '附魔卷轴'));
  if (scroll && others.length === 1) {
    const target = others[0];
    if (is(target, '武器类') || is(target, '防御装备类')) {
      const kind = scroll.当前附魔效果名;
      const allowed = ENCHANT_COMPATIBILITY[kind];
      let compatible = allowed && allowed.includes(target.类型);
      if (compatible && target.自定义数据.get('附魔')?.some((e: Loose) => e.种类 === kind && e.等级 >= scroll.品质)) compatible = false;
      if (compatible) {
        S.当前匹配的融合配方 = '卷轴附魔融合';
        S.融合结果 = ports.cloneItem(target);
        const unbreakable = [scroll, target].some(item => item.自定义数据?.get('不可破坏'));
        if (unbreakable) S.融合结果.自定义数据.set('不可破坏', true);
        const preview = S.融合结果.生成显示元素('融合');
        const hint = ports.createElement('div');
        hint.textContent = `将被附魔: ${kind} (${scroll.品质}级)`;
        hint.style.color = 'cyan';
        hint.style.fontSize = '0.8em';
        hint.style.textAlign = 'center';
        preview.appendChild(hint);
        show(preview);
        return;
      }
    }
  }

  const firstSlotItem = S.融合区物品[0];
  if (firstSlotItem && is(firstSlotItem, '药水类')) {
    let onlyPotionAndGold = true;
    let totalGold = 0;
    if (entries.length > 1) {
      for (let i = 1; i < 4; i++) {
        const item = S.融合区物品[i];
        if (item) {
          if (is(item, '金币') && S.fusionGoldQuantities[i] > 0) {
            totalGold += S.fusionGoldQuantities[i];
          } else {
            onlyPotionAndGold = false;
            break;
          }
        }
      }
    } else {
      onlyPotionAndGold = false;
    }
    if (onlyPotionAndGold && totalGold > 0) {
      const potion = ports.cloneItem(firstSlotItem);
      const baseDuration = potion.自定义数据.get('基础持续时间') || 3;
      potion.自定义数据.set('基础持续时间', baseDuration + totalGold);
      potion.效果描述 = (potion.效果描述 || '').replace(/持续\s*\d+\s*回合/g, `持续 ${potion.持续时间} 回合`);
      potion.唯一标识 = Symbol('FusionPotionExtendPreview_' + ports.now());
      S.融合结果 = potion;
      S.当前匹配的融合配方 = '药水金币延长';
      showPointer(S.融合结果.生成显示元素('融合'));
      return;
    }
  }

  const recipes = [...S.已发现的程序生成配方, ...融合配方列表];
  for (const recipe of recipes) {
    const sortedInputs = [...recipe.输入].sort();
    if (sortedNames.length === sortedInputs.length && sortedNames.every((name, index) => name === sortedInputs[index])) {
      const OutputClass = ports.windowLookup(recipe.输出类);
      if (OutputClass) {
        const config = recipe.输出配置 ? { ...recipe.输出配置 } : {};
        const unbreakable = items.some(item => item.自定义数据?.get('不可破坏'));
        S.融合结果 = new OutputClass(config);
        S.融合结果.堆叠数量 = recipe.输出数量 || 1;
        S.融合结果.唯一标识 = Symbol('FusionRecipePreview_' + ports.now());
        if (unbreakable) S.融合结果.自定义数据.set('不可破坏', true);
        S.当前匹配的融合配方 = recipe;
        showPointer(S.融合结果.生成显示元素('融合'));
        return;
      }
    }
  }

  if (entries.length === 2) {
    const item1 = entries[0]!.item;
    const item2 = entries[1]!.item;
    if (item1 && item2 && item1.名称 === item2.名称 &&
        FUSION_BASES.some(cls => is(item1, cls)) && FUSION_BASES.some(cls => is(item2, cls)) &&
        item1.constructor.name === item2.constructor.name) {
      S.融合结果 = ports.cloneItem(item1);
      S.融合结果.唯一标识 = Symbol('FusionEquipPreview_' + ports.now());
      S.当前匹配的融合配方 = '装备融合';
      const mergedBuffs = ports.mergeBuffs(item1.自定义数据.get('fusedBuffs'), item2.自定义数据.get('fusedBuffs'));
      if (mergedBuffs.length > 0) S.融合结果.自定义数据.set('fusedBuffs', mergedBuffs);
      else S.融合结果.自定义数据.delete('fusedBuffs');
      const mergedEnchantments = ports.mergeEnchantments(item1.自定义数据.get('附魔'), item2.自定义数据.get('附魔'));
      S.融合结果.自定义数据.set('附魔', mergedEnchantments);
      const item1Dur = item1.自定义数据.get('耐久') || 0;
      const item1MaxDur = item1.自定义数据.get('原耐久') || item1Dur;
      const item2Dur = item2.自定义数据.get('耐久') || 0;
      const item2MaxDur = item2.自定义数据.get('原耐久') || item2Dur;
      const newMaxDur = item1MaxDur + Math.floor(item2MaxDur * 0.3);
      const newCurrDur = Math.min(newMaxDur, item1Dur + Math.floor(item2Dur * 0.7));
      S.融合结果.自定义数据.set('耐久', newCurrDur);
      S.融合结果.自定义数据.set('原耐久', newMaxDur);
      S.融合结果.强化 = item1.强化 || item2.强化;
      if (item1.自定义数据.get('不可破坏') || item2.自定义数据.get('不可破坏')) S.融合结果.自定义数据.set('不可破坏', true);
      else S.融合结果.自定义数据.delete('不可破坏');
      S.融合结果.品质 = Math.max(item1.品质, item2.品质);
      S.融合结果.颜色索引 = S.融合结果.品质 - 1;
      showPointer(S.融合结果.生成显示元素('融合'));
      return;
    }
  }

  const baseItem = S.融合区物品[0];
  if (baseItem && ports.isFusionWeapon(baseItem)) {
    const materials: unknown[] = [];
    let gold = 0;
    for (let i = 1; i < 4; i++) {
      const item = S.融合区物品[i];
      if (item) {
        if (is(item, '金币')) gold += S.fusionGoldQuantities[i];
        else if (ports.isFusionMaterial(item)) materials.push(item);
      }
    }
    if (materials.length > 0 || gold > 0) {
      const buffs = ports.computeBuffs(baseItem, materials, gold);
      S.融合结果 = ports.cloneItem(baseItem);
      S.融合结果.唯一标识 = Symbol('FusionBuffPreview_' + ports.now());
      S.当前匹配的融合配方 = '词条融合';
      const unbreakable = [baseItem, ...materials].some((item: Loose) => item.自定义数据?.get('不可破坏'));
      if (unbreakable) S.融合结果.自定义数据.set('不可破坏', true);
      if (buffs.length > 0) S.融合结果.自定义数据.set('fusedBuffs', buffs);
      else S.融合结果.自定义数据.delete('fusedBuffs');
      showPointer(S.融合结果.生成显示元素('融合'));
      return;
    }
  }
  if (S.融合区物品[0] && S.融合区物品[1] && S.融合区物品[0].材质 === MATERIALS.木质 && is(S.融合区物品[1], '药水类')) {
    S.当前匹配的融合配方 = '木材转化融合';
    S.融合结果 = ports.cloneItem(S.融合区物品[0]);
    S.融合结果.唯一标识 = Symbol('MaterialChangePreview_' + ports.now());
    S.融合结果.材质 = MATERIALS.普通;
    showPointer(S.融合结果.生成显示元素('融合'));
  }
}
