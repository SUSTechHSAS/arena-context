/**
 * Session-owned replacement for the main game's `window[类名]` class globals and for
 * `实例.constructor.name` (integration phase P1, PLAN.md; constraints K1/K2).
 *
 * Source: top-level `class` declarations of a classic script are NOT window properties, so
 * `注册全局类()` (called once at boot, JS L62865) copies an explicit list onto `window`.
 * Saves (`恢复物品`, `恢复怪物`), revivals, spawners, altars, potions, fusion recipes and
 * the editor then resolve constructors with `window[类名]`; unlisted classes (e.g. `栅栏`,
 * `追踪风弹弹头`) are unreachable by name. Persisted names come from `constructor.name`.
 *
 * Rewrite: one registry per session. Packet classes keep their ports-first constructors;
 * a definition binds them to the session's ports so lookups keep the source one-argument
 * shape (`new 类构造器(配置)`). Lookup is limited to the source's registered names, so a
 * name the source cannot resolve stays unresolvable. Names never depend on
 * `Function.prototype.name` (minifiers rename classes); the registry records them.
 *
 * Boundary: `window[类名]` also reaches unrelated browser globals (`Object`, `Map`,
 * `toString` …), so a tampered save naming them is "restored" by the source. `lookup` only
 * answers source class names; consumers record that guard where it is observable (P2).
 */

/** Exact key order of the `window` assignments in source `注册全局类` (JS L3205–3470; `太阳卷轴` is assigned twice). */
export const SOURCE_GLOBAL_CLASS_NAMES = [
  '门', '物品', '怪物', '单元格', '状态效果', '红蓝开关', '红砖块', '蓝砖块',
  '刷怪笼', '传送带', '箭头', '巡逻怪物', '同步怪物', '绿紫开关', '绿砖块', '紫砖块',
  '沉浸式传送门', '卷轴滚动墙', '发生器', '侦测器', '垃圾桶', '钥匙', '金币',
  '武器类', '卷轴类', '防御装备类', '棋子', '药水类', '宠物', '重铸台', '神秘商人',
  '探险家', '祭坛类', '物品祭坛', '耐久祭坛', '背包扩容祭坛', '寻宝戒指', '折跃门',
  '传送门', '炸弹', '旋风物品', '火焰物品', '火把', '毒液物品', '罐子', '空罐子',
  '泉水', '书架', '神龛', '照明弹光源', '挑战石碑', '洗身砚', '陷阱基类',
  '隐形落石陷阱', '隐形地刺陷阱', '隐形毒气陷阱', '远射陷阱', '隐形失明陷阱',
  '召唤怪物陷阱', '烈焰触发陷阱', '隐形虫洞陷阱', '便携障碍物', '已放置的障碍物',
  '旗帜', '临时墙壁计时器', '告示牌', '存档点', '磨刀石', '急救绷带', '照明弹',
  '万能钥匙', '奖杯物品', '开关脉冲器', '磁铁', '蛛网', '烟雾弹', '烟雾',
  '定位器地图', '时空罗盘', '文本展示框', '推箱子箱子', '推箱子目标', '马', '空桶',
  '水桶', '水鞋', '药水弹', '岩浆桶', '岩浆', '黑曜石', '冰桶', '血水桶', '药水桶',
  '药水液', '赌徒', '佣兵契约', '佣兵单位', '自定义NPC', '许愿井', '木栅栏', '石栅栏',
  '铁栅栏', '压感开关', '吸血剑', '冰霜法杖', '重力锤', '剧毒匕首', '荆棘鞭',
  '回旋镖', '闪电链法杖', '大地猛击锤', '穿云箭', '钢制长剑', '橡木法杖',
  '金币手枪', '狙击金币枪', '喷火枪', '引雷针护符', '荆棘种子', '荆棘丛',
  '能量熔炉', '恐惧魔杖', '斜方刀', '冲撞牛角', '护卫种子', '护卫植物', '远射种子',
  '远射植物', '能量草', '吸能种子', '魔法师法杖', '大师附魔卷轴', '小书魔',
  '符文圈', '调试工具', '渔网', '渔网陷阱', '充能魔杖', '魔力远射植物', '时间卷轴',
  '潜行靴子', '钩索', '嗜血战斧', '毒气瓶', '毒气', '陨石法杖', '神偷手', '追踪风弹',
  '扫帚', '守卫者盔甲', '死灵法杖', '火箭筒', '灌木丛', '雷电法杖', '太阳卷轴',
  '秘银锁甲', '钢制板甲', '锅盖', '灵能盾牌', '冰盾', '防化服', '纵火狂', '迅捷卷轴',
  '神秘卷轴', '贪婪卷轴', '清净卷轴', '附魔卷轴', '跃迁卷轴', '真言卷轴',
  '湮灭卷轴', '配方卷轴', '易位卷轴', '饰品', '陷阱先锋饰品', '飞毛腿饰品',
  '瞬间移动饰品', '博士之卷饰品', '恢复之心饰品', '以牙还牙饰品', '嗅探之鼻饰品',
  '治疗药水', '能量药水', '狂暴药水', '神龟药水', '隐身药水', '透视药水',
  '神秘药水', '硫酸药水', '中毒药水', '抗火药水', '冰冻药水', '失明药水',
  '国际象棋车', '国际象棋马', '国际象棋象', '中国象棋炮', '熊猫', '水母', '火蜥蜴',
  '魔法水晶', '魔法师', '大魔法师', '腐蚀怪物', '盗贼怪物', '吸能怪物',
  '剧毒云雾怪物', '召唤师怪物', '幽灵仆从', '萨满怪物', '大史莱姆怪物',
  '小史莱姆怪物', '瞬移怪物', '伪装怪物', '炸弹怪物', '盔甲怪物', '敏捷怪物',
  '远攻怪物', '仙人掌怪物', '冰冻怪物', '旋风怪物', '幽灵怪物', '旋风', '恐惧怪物',
  '米诺陶', '超速怪物', '复活怪物', '娃娃怪物', '吸血鬼', '皇家守卫', '王座守护者',
  '墓碑', '分裂怪物', '巨人怪物', '巨人部位', '移动弹幕', '蜘蛛怪物', '骷髅仆从',
  '反弹怪物', '蜈蚣怪物', '蜈蚣部位', '水怪'
] as const;
export type SourceGlobalClassName = typeof SOURCE_GLOBAL_CLASS_NAMES[number];

export type AnyClass = abstract new (...args: any[]) => object;
/** What `window[类名]` yields: constructible with the source arguments, `instanceof`-compatible. */
export interface SourceConstructor<T extends object = object> {
  new (...args: unknown[]): T;
  readonly prototype: T;
  readonly name: string;
}

interface Entry { name: string; implementation: AnyClass; global: SourceConstructor }

const GLOBAL_NAMES: ReadonlySet<string> = new Set(SOURCE_GLOBAL_CLASS_NAMES);

export class SourceClassRegistry {
  readonly #byName = new Map<string, Entry>();
  readonly #nameByImplementation = new Map<AnyClass, string>();

  /**
   * Define a source class. `construct` receives the source constructor arguments and must
   * return an instance of `implementation` (bind ports here). Names outside
   * `注册全局类` may be defined for `nameOf`/`isA` but are not resolvable via `lookup`.
   */
  define<T extends object>(name: string, implementation: abstract new (...args: never[]) => T,
    construct: (...args: unknown[]) => T): SourceConstructor<T> {
    if (this.#byName.has(name)) throw new Error(`Source class already defined: ${name}`);
    const impl = implementation as unknown as AnyClass;
    const owner = this.#nameByImplementation.get(impl);
    if (owner !== undefined) throw new Error(`${name} reuses the implementation of ${owner}`);
    // A plain function (not a class) so `new global(cfg)` returns the constructed instance and
    // `x instanceof global` follows the implementation prototype, including subclasses.
    const global = function (this: unknown, ...args: unknown[]) {
      if (!new.target) throw new TypeError(`Class constructor ${name} cannot be invoked without 'new'`);
      return construct(...args);
    } as unknown as SourceConstructor<T>;
    Object.defineProperty(global, 'name', { value: name });
    Object.defineProperty(global, 'prototype', { value: implementation.prototype, writable: false });
    const entry: Entry = { name, implementation: impl, global };
    this.#byName.set(name, entry);
    this.#nameByImplementation.set(impl, name);
    return global;
  }

  /** Convenience for the ports-first packet convention: `new Impl(ports, ...sourceArgs)`. */
  defineWithPorts<P, T extends object>(name: string, implementation: new (ports: P, ...args: never[]) => T, ports: P): SourceConstructor<T> {
    const Impl = implementation as unknown as new (ports: P, ...args: unknown[]) => T;
    return this.define(name, implementation, (...args) => new Impl(ports, ...args));
  }

  /** Source `window[类名]`: undefined for unregistered names, unknown names and non-strings. */
  lookup(name: unknown): SourceConstructor | undefined {
    if (typeof name !== 'string' || !GLOBAL_NAMES.has(name)) return undefined;
    return this.#byName.get(name)?.global;
  }

  /** Implementation class for a source name (any defined name), for `instanceof` ports. */
  implementation(name: string): AnyClass | undefined { return this.#byName.get(name)?.implementation; }

  /** Source `value instanceof 类`; false when the class is not (yet) defined in this session. */
  isA(value: unknown, name: string): boolean {
    const implementation = this.#byName.get(name)?.implementation;
    return implementation !== undefined && typeof value === 'object' && value !== null && value instanceof implementation;
  }

  /**
   * Source `实例.constructor.name`. Uses the registered source name of the exact constructor;
   * otherwise reads `constructor.name` like the source (functions keep names by K1; a
   * non-function constructor value yields its `name` property). Throws the source TypeError
   * when the value or its constructor is nullish.
   */
  nameOf(value: unknown): string {
    const constructor = (value as { constructor?: unknown }).constructor;
    const registered = this.#nameByImplementation.get(constructor as AnyClass);
    if (registered !== undefined) return registered;
    if (constructor === null || constructor === undefined) throw new TypeError("Cannot read properties of undefined (reading 'name')");
    return (constructor as { name: string }).name;
  }

  /**
   * Source \`类.name\` for a class reference held in data (e.g. \`召唤物类.name\`): the registered
   * source name of an implementation, otherwise the value's own \`name\` (a looked-up global
   * already carries its source name). Nullish values throw the source TypeError.
   */
  className(constructor: unknown): string {
    const registered = this.#nameByImplementation.get(constructor as AnyClass);
    if (registered !== undefined) return registered;
    return (constructor as { name: string }).name;
  }

  /** Defined names in definition order. */
  definedNames(): string[] { return [...this.#byName.keys()]; }

  /** Source names of `注册全局类` without a definition yet (integration progress, not an error). */
  missingGlobals(): string[] { return SOURCE_GLOBAL_CLASS_NAMES.filter(name => !this.#byName.has(name)); }

  /**
   * The object `注册全局类` would leave on `window` for these classes: own enumerable keys in
   * source order, restricted to defined names. For script facades and editor class menus.
   */
  globals(): Record<string, SourceConstructor> {
    const result: Record<string, SourceConstructor> = {};
    for (const name of SOURCE_GLOBAL_CLASS_NAMES) {
      const entry = this.#byName.get(name);
      if (entry) result[name] = entry.global;
    }
    return result;
  }
}
