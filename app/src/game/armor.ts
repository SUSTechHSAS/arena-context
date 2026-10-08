import type { EffectSource } from './status-ports';
import { ItemCore, type ItemConfig, type ItemPorts } from './item-core';
import type { Enchantment, FusionBuff, FUSION_BUFF_TYPES } from './buffs';

export interface ArmorConfig extends ItemConfig {
  防御力?: number; 耐久?: number; 不可破坏?: boolean; 附魔?: Enchantment[]; fusedBuffs?: FusionBuff[];
}
export interface ArmorAttacker { 当前生命值: number; 类型: string; 受伤(amount: number, source: string): unknown }
export interface ArmorPorts extends ItemPorts {
  buffTypes: Record<keyof typeof FUSION_BUFF_TYPES, string>;
  Monster: abstract new (...args: never[]) => ArmorAttacker;
  Cactus: abstract new (...args: never[]) => ArmorAttacker;
  player: { 当前能量值: number }; initialEnergy: number; poisonColor: unknown;
  status(type: string, color: unknown, icon: string, duration: number, remaining: null, source: EffectSource | null,
    target: ArmorAttacker | null, strength?: number): unknown;
  destroy(identity: symbol | null, automatic: boolean): void; notify(message: string, type: string): void; hud(): void;
}

// Boolean helper prevents structural ctor typing from erasing the non-cactus branch.
function isCactus(value: ArmorAttacker, world: ArmorPorts): boolean { return value instanceof world.Cactus; }

/** Defensive-equipment contract; base item React rendering and concrete actors remain separate. */
export class ArmorItem extends ItemCore {
  #armor: ArmorPorts;
  constructor(ports: ArmorPorts, config: ArmorConfig = {}) {
    super(ports, {
      类型: '防御装备', 名称: config.名称 || '护甲模板', 图标: config.图标 || '🛡️', 品质: config.品质 || 2,
      颜色索引: (config.品质! - 1) || 1, 最大堆叠数量: 1, 堆叠数量: config.堆叠数量 || 1,
      效果描述: config.效果描述 || null, 强化: config.强化 || false, ...config,
      数据: { 防御力: config.防御力 || 1, 耐久: config.耐久 || 100, 原耐久: config.耐久 || 100,
        不可破坏: config.不可破坏 || false, 附魔: config.附魔 || [], fusedBuffs: config.fusedBuffs || [], ...config.数据 },
    });
    this.#armor = ports;
  }
  get 最终防御力(): number {
    let defense = ((this.自定义数据.get('防御力') || 0) as number) + (this.强化 ? 2 : 0);
    const buffs = (this.自定义数据.get('fusedBuffs') || []) as FusionBuff[];
    buffs.forEach(buff => {
      if (buff.type === this.#armor.buffTypes.防御加成) defense += buff.value;
      else if (buff.type === this.#armor.buffTypes.防御倍率) defense *= 1 + buff.value;
    });
    const synergy = buffs.find(buff => buff.type === this.#armor.buffTypes.协同效应);
    if (synergy) defense += synergy.value;
    defense += (this.自定义数据.get('附魔') as Enchantment[] | undefined)?.find(item => item.种类 === '保护附魔')?.等级 || 0;
    return Math.max(0, defense);
  }
  get 耐久消耗(): number {
    if (this.自定义数据.get('不可破坏')) return 0;
    const level = (this.自定义数据.get('附魔') as Enchantment[] | undefined)?.find(item => item.种类 === '耐久附魔')?.等级 || 0;
    let coefficient = 1;
    if (level > 0) coefficient = 1 / (level + 1);
    if (this.强化) coefficient *= 0.5;
    return Math.max(0.1, coefficient);
  }
  get 反伤(): number {
    const level = (this.自定义数据.get('附魔') as Enchantment[] | undefined)?.find(item => item.种类 === '荆棘附魔')?.等级 || 0;
    return level > 0 ? level * 1.5 : 0;
  }

  当被攻击(originalDamage: number, attacker: ArmorAttacker | string | null = null): number {
    let damage = originalDamage; const world = this.#armor;
    const buffs = (this.自定义数据.get('fusedBuffs') || []) as FusionBuff[];
    const flat = buffs.find(buff => buff.type === world.buffTypes.固定伤害减免);
    if (flat) damage = Math.max(0, damage - flat.value);
    damage = Math.max(0, damage - this.最终防御力);
    if (attacker === '炸弹' && (this.自定义数据.get('附魔') as Enchantment[]).some(item => item.种类 === '爆炸保护附魔' && item.等级 > 0)) {
      damage = Math.max(0, damage - (this.自定义数据.get('附魔') as Enchantment[]).find(item => item.种类 === '爆炸保护附魔')!.等级 * 5);
    }
    if (attacker instanceof world.Monster && (this.自定义数据.get('附魔') as Enchantment[]).some(item => item.种类 === '火焰附魔' && item.等级 > 0)) {
      const level = (this.自定义数据.get('附魔') as Enchantment[]).find(item => item.种类 === '火焰附魔')!.等级;
      world.status('火焰', '#CC5500', '火', level, null, null, attacker);
    }
    const dodge = buffs.find(buff => buff.type === world.buffTypes.闪避几率);
    if (dodge && world.random() < dodge.value) { world.log(`${this.获取名称()} 触发闪避！`, '成功'); damage = 0; }
    const poison = buffs.find(buff => buff.type === world.buffTypes.中毒几率);
    if (poison && attacker instanceof world.Monster && attacker.当前生命值 > 0 && world.random() < poison.value) {
      world.status('中毒', world.poisonColor, '☠️', 3, null, null, attacker, 1 + Math.floor(this.品质 / 2));
      world.log(`${this.获取名称()} 使 ${attacker.类型} 中毒了！`, '成功');
    }
    if (damage <= 0 && originalDamage > 0) damage = Math.round(world.random() * 100) / 100;
    if (damage > 0) {
      this.自定义数据.set('耐久', ((this.自定义数据.get('耐久') as number) - this.耐久消耗).toFixed(2));
      if (this.反伤 > 0 && attacker instanceof world.Monster && !isCactus(attacker, world)) {
        attacker.受伤(this.反伤, '荆棘'); world.log(`${this.名称} 因荆棘造成了 ${this.反伤} 点伤害！`, '成功');
      }
      const energy = buffs.find(buff => buff.type === world.buffTypes.受击回能);
      if (energy) {
        const restored = Math.ceil(energy.value);
        world.player.当前能量值 = Math.min(100, world.player.当前能量值 + restored / world.initialEnergy * 100);
        world.log(`${this.获取名称()} 受到攻击，恢复了 ${restored} 点能量！`, '信息'); world.hud();
      }
    }
    if ((this.自定义数据.get('耐久') as number) <= 0) { world.destroy(this.唯一标识, true); world.notify(`${this.名称} 已损坏！`, '警告'); }
    world.refreshEquipment();
    return damage;
  }
  override 获取提示(): string {
    const lines = super.获取提示().split('\n');
    const stats = [`防御力：${this.最终防御力.toFixed(1)}`];
    let index = lines.findIndex(line => line.startsWith('品质：'));
    if (index === -1) index = lines.findIndex(line => line.startsWith('类型：'));
    if (index === -1) index = lines.findIndex(line => line.startsWith(this.获取名称()));
    if (index !== -1) lines.splice(index + 1, 0, ...stats); else lines.unshift(...stats);
    return lines.filter(Boolean).join('\n');
  }
  override 使用(): boolean { this.#armor.notify('装备不能被主动使用！', '错误'); return false; }
}
