import { sourceDeepEqual } from '../domain/source-deep-equal';

export const MATERIALS = { 木质: '木质', 铁质: '铁质', 玻璃: '玻璃', 铜质: '铜质', 金质: '金质', 普通: '普通' } as const;
export interface ItemConfig {
  类型?: string; 名称?: string; 图标?: string; 品质?: number; 堆叠数量?: number; 材质?: string | null;
  最大堆叠数量?: number; 颜色索引?: number | null; 数据?: Map<unknown, unknown> | Record<string, unknown>;
  唯一标识?: symbol | null; 已装备?: boolean | number; x?: number | null; y?: number | null;
  强化?: boolean; 能否拾起?: boolean; 是否正常物品?: boolean; 效果描述?: string;
  是否隐藏?: boolean; 是否为隐藏物品?: boolean; 阻碍怪物?: boolean; 是否被丢弃?: boolean | null;
}
export interface ItemPorts {
  materials: Record<string, string>; colors: string[]; maxStack: number;
  equipment: Map<number | boolean | null, ItemCore | null>;
  equipmentPage: number; equipmentPerPage: number;
  timers: { 唯一标识: symbol | null }[];
  cells: { 关联物品: ItemCore | null }[][];
  Weapon: abstract new (...args: never[]) => object;
  random(): number; now(): number; date(): unknown;
  log(message: string, type: string): void; refreshInventory(): void; refreshEquipment(): void;
  formatBuff(buff: unknown): string | false | null | undefined;
  describeEnchantments(enchantments: unknown): string | false | null | undefined;
}

/** Base item DATA/lifecycle contract. Legacy DOM rendering methods are not ported here. */
export class ItemCore {
  #ports: ItemPorts;
  declare 类型: string; declare 名称: string; declare 图标: string; declare 品质: number; declare 堆叠数量: number;
  declare 材质: string | undefined; declare 最大堆叠数量: number; declare 颜色索引: number;
  declare 自定义数据: Map<unknown, unknown>; declare 唯一标识: symbol | null;
  declare 已装备: boolean | number; declare 装备槽位: boolean | number | null;
  declare x: number | null; declare y: number | null; declare 显示元素: HTMLElement | null;
  declare isActive: boolean; declare 强化: boolean; declare 能否拾起: boolean; declare 是否正常物品: boolean;
  declare 效果描述: string | null; declare 是否隐藏: boolean; declare 是否为隐藏物品: boolean;
  declare 阻碍怪物: boolean; declare 是否被丢弃: boolean; declare 最终冷却回合?: number;

  constructor(ports: ItemPorts, config: ItemConfig = {}) {
    this.#ports = ports;
    this.类型 = config.类型 || '其他物品'; this.名称 = config.名称 || '未命名物品'; this.图标 = config.图标 || '◎';
    this.品质 = config.品质 || 1; this.堆叠数量 = config.堆叠数量 || 1;
    const materials = Object.values(ports.materials);
    this.材质 = config.材质 ?? materials[Math.floor(ports.random() * materials.length)];
    this.最大堆叠数量 = config.最大堆叠数量 || ports.maxStack;
    this.颜色索引 = config.颜色索引 ?? ((config.品质! - 1) || 0);
    if (config.数据 instanceof Map) this.自定义数据 = new Map([...config.数据]);
    else this.自定义数据 = new Map(Object.entries(config.数据 || {}));
    ports.date(); // Source constructs an unused Date even when an identity is supplied.
    this.唯一标识 = config.唯一标识 || Symbol.for(ports.now().toString() + ports.random().toString());
    this.已装备 = config.已装备 || false; this.装备槽位 = config.已装备 || null;
    this.x = config.x || null; this.y = config.y || null; this.显示元素 = null; this.isActive = false;
    this.强化 = config.强化 || false;
    this.能否拾起 = config.能否拾起 === undefined ? true : config.能否拾起;
    this.是否正常物品 = config.是否正常物品 === undefined ? true : config.是否正常物品;
    this.效果描述 = config.效果描述 || null; this.是否隐藏 = config.是否隐藏 || false;
    this.是否为隐藏物品 = config.是否为隐藏物品 || false;
    this.阻碍怪物 = config.阻碍怪物 !== undefined ? config.阻碍怪物 : true;
    this.是否被丢弃 = config.是否被丢弃 ?? false;
  }

  装备(): boolean {
    if (this.已装备) return false;
    const ports = this.#ports;
    const slot = (Array.from({ length: ports.equipmentPerPage }, (_, index) => index + 1).find(id =>
      !ports.equipment.has(id + ports.equipmentPage * ports.equipmentPerPage)) as number) + ports.equipmentPage * ports.equipmentPerPage;
    if (slot) { this.已装备 = true; this.装备槽位 = slot; ports.equipment.set(slot, this); return true; }
    return false;
  }
  取消装备(): boolean {
    if (!this.已装备) return false;
    this.#ports.equipment.delete(this.装备槽位); this.已装备 = false; this.装备槽位 = null;
    return true;
  }
  获取名称(): string { return `${this.显示名称} [${this.品质} 级]` + (this.强化 ? ' [强化]' : ''); }
  使用(): boolean { this.堆叠数量 -= 1; return true; }
  当被收集(_actor: unknown): boolean { return true; }
  当被丢弃(_x: number, _y: number): boolean { return true; }
  可交互目标(_target: unknown): boolean { return false; }

  更新倒计时(): boolean {
    if (this.自定义数据.has('静默回合')) {
      const remaining = this.自定义数据.get('静默回合') as number;
      if (remaining > 0) this.自定义数据.set('静默回合', remaining - 1);
      else {
        this.自定义数据.delete('静默回合');
        let otherTimedEffect = false;
        if (this.自定义数据.has('倒计时') && this.自定义数据.get('倒计时') !== -1) otherTimedEffect = true;
        if (this instanceof this.#ports.Weapon && this.自定义数据.has('冷却剩余') &&
          (this.自定义数据.get('冷却剩余') as number) > 0) otherTimedEffect = true;
        if (!otherTimedEffect) this.#ports.timers = this.#ports.timers.filter(timer => timer.唯一标识 !== this.唯一标识);
        this.#ports.log(`${this.获取名称()} 已经晾干了。`, '成功');
        this.#ports.refreshInventory(); this.#ports.refreshEquipment();
      }
      return false;
    }
    return true;
  }

  获取提示(): string {
    const lines: (string | false | null | undefined)[] = [];
    lines.push(`${this.获取名称()} `, `类型：${this.类型} `, `品质：${'★'.repeat(this.品质)} `, `材质：${this.材质}`);
    if (this.最大堆叠数量 > 1) lines.push(`堆叠：${this.堆叠数量} / ${this.最大堆叠数量}`);
    if (this.效果描述) lines.push(`效果描述：${this.效果描述} `);
    const buffs = this.自定义数据?.get('fusedBuffs') as { length: number; forEach(callback: (buff: unknown) => void): void } | undefined;
    if (buffs && buffs.length > 0) {
      lines.push('--- 强化效果 ---'); buffs.forEach(buff => { const formatted = this.#ports.formatBuff(buff); if (formatted) lines.push(formatted); });
    }
    if (this.自定义数据?.has('附魔') && (this.自定义数据.get('附魔') as { length: number }).length > 0) {
      const description = this.#ports.describeEnchantments(this.自定义数据.get('附魔'));
      if (description) lines.push(description);
    }
    if (this.自定义数据?.has('耐久') && this.自定义数据?.has('原耐久')) lines.push(`耐久：${this.自定义数据.get('耐久')} / ${this.自定义数据.get('原耐久')}`);
    if (this.自定义数据?.has('冷却剩余') && this.自定义数据?.has('冷却回合') && (this.自定义数据.get('冷却回合') as number) > 0) {
      lines.push(`冷却：${this.自定义数据.get('冷却剩余')} / ${this.最终冷却回合 || this.自定义数据.get('冷却回合')}回合`);
    }
    if (this.自定义数据?.get('不可破坏')) lines.push('[不可破坏]');
    return lines.filter((line): line is string => !!line && line.trim() !== '').join('\n');
  }
  安全销毁(): boolean { this.取消装备(); this.自定义数据.clear(); this.唯一标识 = null; return true; }
  移除自身(): void {
    const cells = this.#ports.cells;
    if (this.x !== null && this.y !== null && cells[this.y]?.[this.x]?.关联物品 === this) cells[this.y]![this.x]!.关联物品 = null;
    this.#ports.timers = this.#ports.timers.filter(timer => timer.唯一标识 !== this.唯一标识);
  }
  get 显示图标(): string { return this.图标; }
  get 显示名称(): string { return this.名称; }
  get 颜色表(): string[] { return this.#ports.colors; }

  可堆叠于(other: ItemCore): boolean {
    if (this.堆叠数量 >= this.最大堆叠数量 || this.堆叠数量 >= this.#ports.maxStack) return false;
    const sameBase = this.类型 === other.类型 && this.名称 === other.名称 && this.图标 === other.图标 &&
      this.品质 === other.品质 && this.强化 === other.强化 && this.获取名称() === other.获取名称();
    const sameData = this.比较自定义数据(other.自定义数据);
    return sameBase && sameData;
  }
  比较自定义数据(other: Map<unknown, unknown>): boolean {
    if (this.自定义数据.size !== other.size) return false;
    for (const [key, value] of this.自定义数据) {
      if (!other.has(key)) return false;
      const next = other.get(key);
      if (typeof value === 'object' && value !== null) { if (!sourceDeepEqual(value, next)) return false; }
      else if (value !== next) return false;
    }
    return true;
  }
}
