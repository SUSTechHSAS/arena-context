import type { EffectSource, ProgressView, StatusActor, StatusItem, StatusPorts } from './status-ports';

/** Full source status lifecycle, using explicit domain/UI ports instead of globals. */
export class StatusEffect {
  #ports: StatusPorts;
  declare 类型: string; declare 剩余回合: number; declare 来源: EffectSource | null;
  declare 持续时间: number; declare 关联怪物: StatusActor | null; declare 颜色: string; declare 图标: string;
  declare 强度: number; declare 进度条实例?: ProgressView | null; declare 强化?: number;

  constructor(ports: StatusPorts, type: string, color: string, icon: string, duration: number,
    remaining: number | null = null, source: EffectSource | null = null,
    actor: StatusActor | null = null, intensity = 1) {
    this.#ports = ports;
    this.类型 = type; this.剩余回合 = remaining || duration; this.来源 = source;
    this.持续时间 = duration; this.关联怪物 = actor; this.颜色 = color; this.图标 = icon; this.强度 = intensity;
    if (type === '火焰') {
      if (!actor) { if (ports.playerEffects.some(effect => effect.类型 === '抗火')) return; }
      else {
        if (actor.永久增益 && actor.永久增益.some(buff => buff.类型 === '永久抗火')) return;
        if (this.actorTable().get(actor)?.类型 === '抗火') return;
      }
    }
    if (type === '抗火') {
      if (!actor) {
        const fire = ports.playerEffects.find(effect => effect.类型 === '火焰');
        if (fire) { fire.移除状态(); ports.notify('抗火效果扑灭了你身上的火焰！', '成功'); }
      } else {
        const fire = this.actorTable().get(actor);
        if (fire?.类型 === '火焰') {
          fire.移除状态();
          if (actor instanceof ports.Pet) ports.notify(`抗火效果扑灭了 ${actor.名称} 身上的火焰！`, '成功');
        }
      }
    }
    if (!actor) {
      const existing = ports.playerEffects.find(effect => effect.类型 === type);
      if (existing) {
        this.stack(existing);
        existing.持续时间 = Math.max(existing.持续时间, this.持续时间);
        existing.进度条实例?.更新({ 数值: (existing.剩余回合 / existing.持续时间) * 100,
          标签: existing.label(existing.剩余回合) });
        return;
      }
      ports.playerEffects.push(this);
      this.进度条实例 = ports.progress({ 图标: icon, 颜色: color, 初始值: 100, 标签: this.label(this.剩余回合) });
      this.来源?.应用效果();
    } else {
      const table = this.actorTable();
      const existing = table.get(actor);
      if (existing && existing.类型 === type) {
        this.stack(existing);
        if (actor instanceof ports.Monster) actor.获得效果(existing);
        // Source ticks THIS newly allocated unregistered effect, then increments it.
        // Do not 'fix' that into ticking the existing instance or extending its duration.
        this.更新状态(); this.剩余回合++;
        return;
      }
      table.set(actor, this);
      if (actor instanceof ports.Monster) actor.获得效果(this);
    }
  }

  private label(remaining: number): string {
    return `${this.类型} ${remaining}回合` + (this.强度 > 1 ? ` (强度 ${this.强度})` : '');
  }
  private stack(existing: StatusEffect): void {
    existing.剩余回合 = Math.max(existing.剩余回合, this.剩余回合);
    existing.强度 = Math.min(5, (existing.强度 || 1) + (this.强度 || 1));
  }
  private actorTable(): Map<StatusActor, StatusEffect> {
    return this.关联怪物 instanceof this.#ports.Pet ? this.#ports.petEffects : this.#ports.monsterEffects;
  }

  更新状态(): void {
    const ports = this.#ports;
    let remaining = this.剩余回合;
    remaining = Math.max(0, remaining - 1); this.剩余回合 = remaining;
    const actor = this.关联怪物;
    if (this.类型 === '中毒') {
      if (!actor) { ports.damagePlayer(this.强度 || 1, '中毒'); ports.log(`你受到 ${this.强度 || 1} 点中毒伤害`, '错误'); }
      else if (actor instanceof ports.Pet) {
        actor.受伤(this.强度 || 1, '中毒'); ports.log(`${actor.名称} 受到了 ${this.强度 || 1} 点中毒伤害`, '警告');
      }
    } else if (this.类型 === '腐蚀' && actor instanceof ports.Pet) {
      const equipment = actor.自定义数据.get('装备') as Record<string, StatusItem | null> | undefined;
      if (equipment) {
        let corroded = false;
        for (const slot in equipment) {
          const item = equipment[slot];
          if (item && item.自定义数据?.has('耐久') && !item.自定义数据.get('不可破坏')) {
            const old = item.自定义数据.get('耐久') as number;
            const next = Math.max(0, old - this.强度);
            item.自定义数据.set('耐久', next); corroded = true;
            if (old > 0 && next <= 0) {
              ports.log(`${actor.名称}的${item.获取名称()}被腐蚀损坏了！`, '错误'); equipment[slot] = null;
            }
          }
        }
        if (corroded) { ports.log(`${actor.名称}的装备被腐蚀了！`, '警告'); actor.更新宠物管理窗口(); }
      }
    }
    if (this.类型 === '火焰') {
      const burning = actor || ports.player;
      if (burning) {
        const cell = ports.cells[burning.y]?.[burning.x];
        if (cell && cell.环境 === ports.grassEnvironment && ports.random() < 0.25) {
          const flame = ports.flame({ 强化: this.强化 });
          ports.placeItem(flame, burning.x, burning.y);
          ports.log(`${burning.名称 || (burning instanceof ports.Monster ? burning.类型 : '你')}点燃了脚下的草地！`, '警告');
        }
      }
      if (!actor) {
        const equipment = Array.from({ length: ports.equipmentPerPage }, (_, index) =>
          ports.equipment.get(ports.equipmentPage * ports.equipmentPerPage + index + 1)).filter(item => item != null);
        for (const item of equipment) {
          if (item.材质 === ports.woodMaterial && item.自定义数据?.has('耐久') && !item.自定义数据.get('不可破坏')) {
            ports.damagePlayer(this.强度 || 1, '火焰');
            const old = item.自定义数据.get('耐久') as number;
            const next = Math.max(0, old - 1); item.自定义数据.set('耐久', next);
            if (old > 0 && next === 0) { ports.destroyItem(item.唯一标识, true); ports.notify(`${item.获取名称()} 被火焰烧毁了！`, '错误'); }
          }
        }
        ports.burnWoodenScrolls();
        // Preserve duplicates when one item is referenced from both collections.
        const items = [...ports.inventory.values(), ...ports.equipment.values()].filter(item => item != null);
        for (const item of items) {
          if (item.自定义数据.has('静默回合') && (item.自定义数据.get('静默回合') as number) > 0) {
            const current = item.自定义数据.get('静默回合') as number;
            item.自定义数据.set('静默回合', Math.max(0, current - (3 + (this.强度 || 1))));
            if (item.自定义数据.get('静默回合') === 0) item.更新倒计时();
          }
        }
        ports.damagePlayer(this.强度 || 1, '火焰'); ports.log(`你被火焰灼烧，受到 ${this.强度 || 1} 点伤害`, '错误');
        ports.refreshEquipment();
      } else {
        actor.受伤(this.强度 || 1, '火焰');
        if (actor instanceof ports.Pet) ports.log(`${actor.名称} 被火焰灼烧，受到 ${this.强度 || 1} 点伤害`, '警告');
      }
    }
    if (this.类型 === '冻结' && ports.playerEffects.some(effect => effect.类型 === '火焰')) this.剩余回合--;
    // Source renders/expires using the local pre-extra-decrement value. Preserve it.
    if (!actor) this.进度条实例?.更新({ 数值: (remaining / this.持续时间) * 100, 标签: this.label(remaining) });
    if (remaining === 0) this.移除状态();
    else this.来源?.应用效果();
  }

  移除状态(): void {
    this.来源?.移除效果();
    if (!this.关联怪物) this.#ports.playerEffects = this.#ports.playerEffects.filter(effect => effect !== this);
    else {
      const table = this.actorTable();
      if (table.get(this.关联怪物) === this) table.delete(this.关联怪物);
    }
    if (this.进度条实例) { this.进度条实例.销毁(); this.进度条实例 = null; }
  }
}
