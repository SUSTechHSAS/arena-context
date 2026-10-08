import { ArmorItem, type ArmorConfig, type ArmorPorts, type ArmorAttacker } from './armor';
import type { ItemCore } from './item-core';
import type { EffectSource } from './status-ports';

export type DefensiveKind = '引雷针护符' | '守卫者盔甲' | '灌木丛' | '水鞋' | '秘银锁甲' | '防化服' | '钢制板甲' | '锅盖' | '冰盾' | '纵火狂' | '潜行靴子' | '灵能盾牌';
export interface DefensiveConfig extends ArmorConfig { 原耐久?: number }
export interface DefensivePorts extends ArmorPorts {
  icons: Record<DefensiveKind, string>;
  player: { 当前能量值: number; 攻击加成: number };
  playerEffects: { 来源: EffectSource | null; 类型: string; 剩余回合: number }[];
  chargeColor: unknown; itemCellType: unknown;
  cells: { 关联物品: ItemCore | null; 类型: unknown }[][];
  damagePlayer(amount: number, source: string): void; paint(): void;
}

/** Original constructor names are retained; script/v1 constructor port-binding remains separate. */
export class 引雷针护符 extends ArmorItem implements EffectSource {
  #world: DefensivePorts;
  constructor(world: DefensivePorts, config: DefensiveConfig = {}) {
    super(world, {
      名称: '引雷针护符', 图标: world.icons.引雷针护符, 品质: 2, 颜色索引: 3, 防御力: 1,
      耐久: config.耐久 || 35 + (config.强化 ? 10 : 0), 原耐久: config.原耐久 || 35 + (config.强化 ? 10 : 0),
      强化: config.强化 || false, 不可破坏: false, 效果描述: '拦截落雷，可能获得充能或恢复能量。',
      数据: { 充能概率: 0.6 + (config.强化 ? 0.15 : 0), 充能持续时间: 3 + (config.强化 ? 2 : 0),
        充能攻击加成值: 2 + (config.强化 ? 2 : 0), 能量恢复量: 15 + (config.强化 ? 15 : 0) }, ...config,
    }); this.#world = world;
  }
  override 当被攻击(amount: number, attacker: ArmorAttacker | string | null = null): number {
    const world = this.#world;
    if (attacker === '雷暴' && (this.自定义数据.get('耐久') as number) > 0) {
      super.当被攻击(amount, attacker); world.log(`${this.名称} 吸收了落雷！`, '成功');
      const existing = world.playerEffects.find(effect => effect.来源 === this && effect.类型 === '充能');
      if (world.random() < (this.自定义数据.get('充能概率') as number) && !existing) {
        const duration = this.自定义数据.get('充能持续时间') as number;
        const bonus = this.自定义数据.get('充能攻击加成值') as number;
        world.status('充能', world.chargeColor, '⚡', duration, null, this, null, bonus);
        world.player.攻击加成 += bonus; world.notify('你感到了电流的涌动，攻击力提升！', '成功');
      } else {
        const energy = this.自定义数据.get('能量恢复量') as number;
        world.player.当前能量值 = Math.min(100, world.player.当前能量值 + energy / world.initialEnergy * 100);
        world.notify(`护符转化雷电，恢复了 ${energy} 点能量！`, '成功'); world.hud();
      }
      return 0;
    }
    return super.当被攻击(amount, attacker);
  }
  应用效果(): void { return; }
  移除效果(): void {
    const bonus = this.自定义数据.get('充能攻击加成值') as number;
    const effect = this.#world.playerEffects.find(item => item.来源 === this && item.类型 === '充能');
    if (effect && bonus > 0) this.#world.player.攻击加成 -= bonus;
  }
  override 获取提示(): string {
    const lines = super.获取提示().split('\n'); const description = lines.findIndex(line => line.startsWith('效果描述：'));
    if (description !== -1) lines.splice(description, 1);
    const chance = ((this.自定义数据.get('充能概率') as number) * 100).toFixed(0);
    const bonus = this.自定义数据.get('充能攻击加成值'); const duration = this.自定义数据.get('充能持续时间');
    const energy = this.自定义数据.get('能量恢复量');
    const effect = this.#world.playerEffects.find(item => item.来源 === this && item.类型 === '充能');
    const remaining = effect ? effect.剩余回合 : 0;
    let text = `效果：拦截落雷消耗 1 耐久。\n`;
    text += ` ${chance}%几率获得[充能](${duration}回合, +${bonus}攻击力)。\n`;
    text += ` 否则恢复 ${energy} 能量。`;
    if (remaining > 0) text += `\n 充能剩余：${remaining}回合`;
    let index = lines.findIndex(line => line.startsWith('--- 强化效果 ---'));
    if (index === -1) index = lines.findIndex(line => line.startsWith('耐久：'));
    if (index === -1) index = lines.length;
    lines.splice(index, 0, text); return lines.filter(Boolean).join('\n');
  }
}
export class 守卫者盔甲 extends ArmorItem {
  constructor(world: DefensivePorts, config?: DefensiveConfig) {
    super(world, { 名称: '守卫者盔甲', 图标: world.icons.守卫者盔甲, 品质: 4, 防御力: 0,
      效果描述: `提供 ${config?.强化 ? '10%' : '5%'} 的伤害减免，可叠加，最高85%。`, 耐久: config?.耐久 || 200,
      强化: config?.强化 || false, ...config });
  }
}
export class 灌木丛 extends ArmorItem {
  #world: DefensivePorts;
  constructor(world: DefensivePorts, config: DefensiveConfig = {}) {
    super(world, { 类型: '地形', 名称: '灌木丛', 图标: world.icons.灌木丛, 品质: 1, 颜色索引: 0, 最大堆叠数量: 1,
      能否拾起: config.能否拾起 ?? false, 是否正常物品: false, 阻碍怪物: false,
      效果描述: '茂密的灌木。直接踩踏会受伤。只有用扫帚清理才可能获得。装备后获得荆棘效果。', 防御力: 1, 耐久: 40, 原耐久: 40,
      ...config, 数据: { 伤害: 2, 反伤: 3 + (config.强化 ? 2 : 0), ...config.数据 } });
    this.#world = world; this.类型 = !this.能否拾起 ? '地形' : '防御装备';
  }
  override 当被收集(actor: unknown): boolean {
    if (this.能否拾起) return super.当被收集(actor);
    if (actor === '玩家') { this.#world.damagePlayer(this.自定义数据.get('伤害') as number, this.名称); this.#world.log('你被灌木丛划伤了！', '错误'); }
    return false;
  }
  override 当被攻击(amount: number, attacker: ArmorAttacker | string | null = null): number {
    const damage = super.当被攻击(amount, attacker);
    if (attacker instanceof this.#world.Monster) {
      const thorn = this.自定义数据.get('反伤') as number; attacker.受伤(thorn, '荆棘');
      this.#world.log(`${this.名称} 的荆棘对 ${attacker.类型} 造成了 ${thorn} 点伤害！`, '成功');
    }
    return damage;
  }
  override 移除自身(): void {
    const cells = this.#world.cells;
    if (this.x !== null && this.y !== null && cells[this.y]?.[this.x]?.关联物品 === this) {
      cells[this.y]![this.x]!.关联物品 = null;
      if (cells[this.y]![this.x]!.类型 === this.#world.itemCellType) cells[this.y]![this.x]!.类型 = null;
    }
    this.#world.paint();
  }
}
export class 水鞋 extends ArmorItem {
  constructor(world: DefensivePorts, config: DefensiveConfig = {}) {
    super(world, { 名称: '水鞋', 图标: world.icons.水鞋, 品质: 2, 颜色索引: 1, 防御力: 1,
      效果描述: `在水中时，你的移动步数增加 ${1 + (config.强化 ? 1 : 0)}。`, 耐久: 100, 强化: config.强化 || false, ...config });
  }
}
export class 秘银锁甲 extends ArmorItem {
  constructor(world: DefensivePorts, config: DefensiveConfig) {
    super(world, { 名称: '秘银锁甲', 图标: world.icons.秘银锁甲, 品质: 3, 防御力: 3, 效果描述: '轻盈而坚固的锁甲。',
      耐久: config.耐久 || 150, 强化: config.强化 || false, 不可破坏: config.不可破坏 || false });
  }
  override 获取提示(): string { return super.获取提示(); }
}
export class 防化服 extends ArmorItem {
  constructor(world: DefensivePorts, config: DefensiveConfig = {}) {
    super(world, { 名称: '防化服', 图标: world.icons.防化服, 品质: 3, 颜色索引: 2, 防御力: 1,
      效果描述: '免疫药水弹爆炸和药水水域产生的药水效果。', 耐久: config.耐久 || 100, 强化: config.强化 || false, ...config });
  }
}
export class 钢制板甲 extends ArmorItem {
  constructor(world: DefensivePorts, config: DefensiveConfig) {
    super(world, { 名称: '钢制板甲', 图标: world.icons.钢制板甲, 品质: 2, 强化: config.强化 || false, 防御力: 1,
      效果描述: '沉重的钢制板甲，提供基础防护。', 耐久: config.耐久 || 200, 不可破坏: config.不可破坏 || false });
  }
  override 获取提示(): string { return super.获取提示(); }
}
export class 锅盖 extends ArmorItem {
  constructor(world: DefensivePorts, config: DefensiveConfig) {
    super(world, { 名称: '锅盖', 图标: world.icons.锅盖, 品质: 2, 强化: config.强化 || false, 防御力: 2,
      效果描述: '笨重的锅盖，似乎可以用于防御。', 耐久: config.耐久 || 150, 不可破坏: config.不可破坏 || false });
  }
  override 获取提示(): string { return super.获取提示(); }
}
export class 冰盾 extends ArmorItem {
  #world: DefensivePorts;
  constructor(world: DefensivePorts, config: DefensiveConfig) {
    super(world, { 名称: '冰盾', 图标: world.icons.冰盾, 效果描述: `受击时有 ${(0.8 * 100).toFixed(0)}% 概率冻结攻击者 ${3} 回合。`,
      品质: 3, 强化: config.强化 || false, 防御力: 2, 耐久: config.耐久 || 100, 不可破坏: config.不可破坏 || false,
      数据: { 冻结概率: 0.8, 冻结回合: 3 } }); this.#world = world;
  }
  override 当被攻击(amount: number, attacker: ArmorAttacker | string | null = null): number {
    const damage = super.当被攻击(amount, attacker);
    if (this.#world.random() < (this.自定义数据.get('冻结概率') as number) && attacker instanceof this.#world.Monster) {
      if (attacker) this.#world.status('冻结', '#2196F3', '冻', this.自定义数据.get('冻结回合') as number, null, null, attacker);
    }
    return damage;
  }
  override 获取提示(): string { return super.获取提示(); }
}
export class 纵火狂 extends ArmorItem {
  constructor(world: DefensivePorts, config: DefensiveConfig = {}) {
    super(world, { 名称: '纵火狂', 图标: world.icons.纵火狂, 品质: 3, 颜色索引: 2,
      效果描述: '免疫爆炸伤害，并将爆炸伤害转化为生命值。', 耐久: config.耐久 || 50, 强化: config.强化 || false, 防御力: 0, ...config });
  }
}
export class 潜行靴子 extends ArmorItem {
  constructor(world: DefensivePorts, config: DefensiveConfig = {}) {
    super(world, { 名称: '潜行靴子', 图标: world.icons.潜行靴子, 品质: 3, 防御力: 1, 效果描述: '装备后，只有在敌人视线内才会被追踪。',
      耐久: config.耐久 || 120, 强化: config.强化 || false });
  }
}
export class 灵能盾牌 extends ArmorItem {
  #world: DefensivePorts;
  constructor(world: DefensivePorts, config: DefensiveConfig = {}) {
    super(world, { 名称: '灵能盾牌', 图标: world.icons.灵能盾牌, 品质: 3, 颜色索引: 4, 防御力: 1 + (config.强化 ? 1 : 0),
      耐久: config.耐久 || 80 + (config.强化 ? 40 : 0), 原耐久: config.原耐久 || 80 + (config.强化 ? 40 : 0),
      强化: config.强化 || false, 效果描述: '受击时概率恢复能量或闪避攻击。', 不可破坏: config.不可破坏 || false, 附魔: config.附魔 || [],
      数据: { 能量恢复概率: 0.25 + (config.强化 ? 0.1 : 0), 能量恢复量: 10 + (config.强化 ? 5 : 0), 闪避触发概率: 0.15 + (config.强化 ? 0.1 : 0) }, ...config });
    this.#world = world;
  }
  override 当被攻击(amount: number, attacker: ArmorAttacker | string | null = null): number {
    const damage = super.当被攻击(amount, attacker); const world = this.#world;
    if (world.random() < (this.自定义数据.get('能量恢复概率') as number)) {
      const restored = this.自定义数据.get('能量恢复量') as number;
      world.player.当前能量值 = Math.min(100, world.player.当前能量值 + restored / world.initialEnergy * 100); world.hud();
    }
    if (world.random() < (this.自定义数据.get('闪避触发概率') as number)) {
      world.notify('灵能盾牌闪避！', '成功');
      world.log(`成功闪避了来自 ${attacker instanceof world.Monster ? attacker.类型 : attacker || '未知来源'} 的攻击！`, '成功');
      world.hud(); return 0;
    }
    return damage;
  }
  override 获取提示(): string {
    const lines = super.获取提示().split('\n'); const description = lines.findIndex(line => line.startsWith('效果描述：'));
    if (description !== -1) lines.splice(description, 1);
    const energyChance = ((this.自定义数据.get('能量恢复概率') as number) * 100).toFixed(0);
    const energy = this.自定义数据.get('能量恢复量'); const dodge = ((this.自定义数据.get('闪避触发概率') as number) * 100).toFixed(0);
    const special = ['--- 特殊效果 ---', `能量恢复：${energyChance}%几率恢复 ${energy} 点`, `灵体闪避：${dodge}%几率完全闪避攻击`];
    let index = lines.findIndex(line => line.startsWith('--- 强化效果 ---'));
    if (index === -1) index = lines.findIndex(line => line.startsWith('耐久：'));
    if (index === -1) index = lines.length;
    lines.splice(index, 0, ...special); return lines.filter(Boolean).join('\n');
  }
}
export const DEFENSIVE_CLASSES = { 引雷针护符, 守卫者盔甲, 灌木丛, 水鞋, 秘银锁甲, 防化服, 钢制板甲, 锅盖, 冰盾, 纵火狂, 潜行靴子, 灵能盾牌 };
