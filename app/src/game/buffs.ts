/** Source-visible fusion tags; order and strings are format data. */
export const FUSION_BUFF_TYPES = {
  攻击加成: 'ATTACK_BONUS', 攻击倍率: 'ATTACK_MULTIPLIER', 冷却缩减: 'COOLDOWN_REDUCTION', 冷却倍率: 'COOLDOWN_MULTIPLIER',
  耐久加成: 'DURABILITY_BONUS', 耐久倍率: 'DURABILITY_MULTIPLIER', 范围加成: 'RANGE_BONUS', 中毒几率: 'POISON_CHANCE',
  火焰伤害: 'FIRE_DAMAGE_CHANCE', 冰冻几率: 'ICE_CHANCE', 生命偷取: 'LIFE_STEAL', 防御加成: 'DEFENSE_BONUS',
  防御倍率: 'DEFENSE_MULTIPLIER', 暴击几率: 'CRITICAL_CHANCE', 暴击伤害倍率: 'CRITICAL_DAMAGE_MULTIPLIER',
  击退几率: 'KNOCKBACK_CHANCE', 攻击吸能: 'ENERGY_STEAL_ON_HIT', 闪避几率: 'DODGE_CHANCE',
  固定伤害减免: 'FLAT_DAMAGE_REDUCTION', 受击回能: 'ENERGY_ON_DAMAGE_TAKEN', 幸运一击: 'LUCKY_STRIKE',
  协同效应: 'SYNERGY_EFFECT', 磨刀石攻击加成: 'SHARPEN_ATTACK_BONUS', 磨刀石冷却缩减: 'SHARPEN_COOLDOWN_REDUCTION',
} as const;
export interface FusionBuff { type: string; value: number }
export interface Enchantment { 种类: string; 等级: number }
