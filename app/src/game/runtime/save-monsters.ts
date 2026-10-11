import { 怪物状态 } from '../world/constants';
import type { WorldState } from '../world/state';
import type { SourceClassRegistry } from './class-registry';
import type { createItemCellCodec } from './save-items-cells';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- monsters and records are source-shaped dynamic objects.

/**
 * Integration phase P2 (PLAN.md): monster records of the main-game save format.
 * Ports source `序列化怪物` (JS L56804) and `恢复怪物` (L57307) with statement order, key
 * order, `??`/`||` choices and the try/catch scope preserved. Audit packet:
 * `t10-save-monsters-audit`. Class identity goes through the session registry (K1/K2);
 * monster classes themselves are packet-owned and arrive as registry definitions.
 *
 * Source quirks preserved (SRC-46): the restorer reads `攻击冷却回合剩余` while the
 * serializer writes `攻击冷却剩余`, so attack cooldowns always restore as 0; a missing
 * `基础攻击力` falls back to the monster's derived `生命值`.
 */
export interface MonsterCodecPorts {
  classes: Pick<SourceClassRegistry, 'lookup' | 'isA' | 'nameOf' | 'className'>;
  /** Session seeded stream (`prng`), drawn for missing centipede save IDs. */
  random(): number;
  /** Page global `图标映射`, read once per restore. */
  icons(): Record<string, unknown>;
  /** Page global `怪物技能池` (searched with `Object.values(...).find`). */
  skillPool(): Record<string, { 名称: unknown }>;
  /** Source `new 状态效果(类型, 颜色, 图标, 持续时间, 剩余回合, null, 目标, 强度)`; the effect registers itself. */
  createStatusEffect(type: unknown, color: unknown, icon: unknown, duration: unknown, remaining: unknown, source: null,
    target: unknown, strength: unknown): unknown;
  warn(...args: unknown[]): void; // console.warn
  error(...args: unknown[]): void; // console.error
}

type ItemCodec = Pick<ReturnType<typeof createItemCellCodec>, '序列化物品' | '恢复物品'>;

export function createMonsterCodec(state: Pick<WorldState, '玩家' | '怪物状态表' | '是否是自定义关卡'>, ports: MonsterCodecPorts,
  items: ItemCodec) {
  const { classes } = ports;
  const is = (value: unknown, name: string) => classes.isA(value, name);
  const { 序列化物品, 恢复物品 } = items;

  function 序列化怪物(怪物实例: Loose, 怪物索引: unknown, 当前楼层所有怪物列表: unknown[]): Loose {
    if (!怪物实例 || !怪物实例.constructor) {
      ports.warn('尝试序列化无效怪物', 怪物实例);
      return null;
    }
    const 类名 = classes.nameOf(怪物实例);
    try {
      let 仇恨目标标识: string | null = null;
      if (怪物实例.仇恨 === state.玩家) {
        仇恨目标标识 = '玩家';
      } else if (is(怪物实例.仇恨, '怪物')) {
        const 仇恨索引 = 当前楼层所有怪物列表.findIndex(m => m === 怪物实例.仇恨);
        if (仇恨索引 !== -1) {
          仇恨目标标识 = `怪物_${仇恨索引}`;
        } else {
          ports.warn(`怪物 ${怪物索引} 的仇恨目标未在当前楼层找到:`, 怪物实例.仇恨);
        }
      }
      const 状态效果数据 = state.怪物状态表.get(怪物实例) as Loose;
      let 序列化状态 = null;
      if (状态效果数据) {
        序列化状态 = {
          类型: 状态效果数据.类型,
          颜色: 状态效果数据.颜色,
          图标: 状态效果数据.图标,
          持续时间: 状态效果数据.持续时间,
          剩余回合: 状态效果数据.剩余回合,
          强度: 状态效果数据.强度,
        };
      }
      const 配置: Loose = {
        x: 怪物实例.x,
        y: 怪物实例.y,
        图标: 怪物实例.图标,
        房间ID: 怪物实例.房间ID,
        当前生命值: 怪物实例.当前生命值,
        状态: 怪物实例.状态,
        强化: 怪物实例.强化,
        攻击冷却剩余: 怪物实例.攻击冷却回合剩余,
        受伤冻结回合剩余: 怪物实例.受伤冻结回合剩余,
        仇恨目标标识: 仇恨目标标识,
        基础攻击力: 怪物实例.基础攻击力,
        基础生命值: 怪物实例.基础生命值,
        移动率: 怪物实例.移动率,
        基础移动距离: 怪物实例.基础移动距离,
        基础攻击范围: 怪物实例.基础攻击范围,
        跟踪距离: 怪物实例.跟踪距离,
        攻击冷却: 怪物实例.攻击冷却,
        受伤冻结回合: 怪物实例.受伤冻结回合,
        掉落概率: 怪物实例.掉落概率,
        当前格: 怪物实例.当前格,
        始终追踪玩家: 怪物实例.始终追踪玩家,
        携带药水: 怪物实例.携带药水 ? { ...怪物实例.携带药水 } : null,
        永久增益: [...怪物实例.永久增益],
        残血逃跑: 怪物实例.残血逃跑,
        等级: 怪物实例.等级,
        技能池名称列表: 怪物实例.技能池.map((技能: Loose) => 技能.名称),
      };
      const indexIn = (target: unknown) => 当前楼层所有怪物列表.findIndex(m => m === target);
      if (is(怪物实例, '王座守护者')) {
        配置.当前阶段 = 怪物实例.当前阶段;
        配置.技能冷却剩余 = { ...怪物实例.技能冷却剩余 };
        配置.无敌 = 怪物实例.无敌;
        配置.无敌次数 = 怪物实例.无敌次数;
        配置.皇家守卫索引列表 = 怪物实例.皇家守卫列表.map(indexIn).filter((index: number) => index !== -1);
        配置.激活的墓碑索引列表 = 怪物实例.激活的墓碑列表.map(indexIn).filter((index: number) => index !== -1);
      }
      if (is(怪物实例, '蜈蚣怪物') || is(怪物实例, '蜈蚣部位')) {
        怪物实例.存档ID = 怪物实例.存档ID || `centipede_${ports.random()}`;
        配置.存档ID = 怪物实例.存档ID;
      }
      if (is(怪物实例, '蜈蚣怪物')) {
        配置.身体部位ID列表 = 怪物实例.身体部位.map((p: Loose) => {
          p.存档ID = p.存档ID || `centipede_${ports.random()}`;
          return p.存档ID;
        });
        配置.长度 = 怪物实例.长度;
        配置.朝向 = 怪物实例.朝向;
      }
      if (is(怪物实例, '蜈蚣部位')) {
        配置.主体ID = 怪物实例.主体?.存档ID;
        配置.跟随ID = 怪物实例.跟随?.存档ID;
        配置.基础颜色 = 怪物实例.基础颜色;
      }
      if (is(怪物实例, '骷髅仆从')) {
        配置.生命周期 = 怪物实例.生命周期;
      }
      if (is(怪物实例, '佣兵单位')) {
        配置.跟随层数 = 怪物实例.跟随层数;
      }
      if (is(怪物实例, '腐蚀怪物')) {
        配置.腐蚀强度 = 怪物实例.腐蚀强度;
        配置.腐蚀持续 = 怪物实例.腐蚀持续;
      }
      if (is(怪物实例, '盗贼怪物')) {
        配置.偷窃几率 = 怪物实例.偷窃几率;
        配置.偷窃武器几率 = 怪物实例.偷窃武器几率;
        配置.偷到的金币 = 怪物实例.偷到的金币;
        配置.偷到的武器列表序列化 = 怪物实例.偷到的武器列表.map(序列化物品).filter((i: unknown) => i != null);
      }
      if (is(怪物实例, '吸能怪物')) {
        配置.吸能比例 = 怪物实例.吸能比例;
        配置.最小吸能 = 怪物实例.最小吸能;
      }
      if (is(怪物实例, '剧毒云雾怪物')) {
        配置.毒云范围 = 怪物实例.毒云范围;
        配置.毒云持续 = 怪物实例.毒云持续;
        配置.毒云强度 = 怪物实例.毒云强度;
      }
      if (is(怪物实例, '召唤师怪物')) {
        配置.召唤冷却剩余 = 怪物实例.召唤冷却剩余;
        配置.最大召唤物数量 = 怪物实例.最大召唤物数量;
        配置.召唤物类名 = classes.className(怪物实例.召唤物类);
        配置.当前召唤物索引列表 = 怪物实例.当前召唤物列表.map(indexIn).filter((index: number) => index !== -1);
      }
      if (is(怪物实例, '幽灵仆从')) {
        配置.生命周期 = 怪物实例.生命周期;
        const 召唤者索引 = indexIn(怪物实例.召唤者);
        配置.召唤者索引 = 召唤者索引 !== -1 ? 召唤者索引 : null;
      }
      if (is(怪物实例, '萨满怪物')) {
        配置.治疗冷却剩余 = 怪物实例.治疗冷却剩余;
      }
      // Source has an empty `instanceof 大史莱姆怪物` block here.
      if (is(怪物实例, '瞬移怪物')) {
        配置.瞬移几率 = 怪物实例.瞬移几率;
        配置.受击瞬移几率 = 怪物实例.受击瞬移几率;
      }
      if (is(怪物实例, '伪装怪物')) {
        配置.伪装状态 = 怪物实例.伪装状态;
      }
      if (is(怪物实例, '炸弹怪物')) {
        配置.携带炸弹 = 怪物实例.携带炸弹;
      }
      if (is(怪物实例, '大魔法师')) {
        配置.技能冷却 = 怪物实例.技能冷却;
        配置.隐身中 = 怪物实例.隐身中;
        配置.isClone = 怪物实例.isClone;
        const 分身索引 = 怪物实例.分身 ? indexIn(怪物实例.分身) : -1;
        配置.分身索引 = 分身索引 !== -1 ? 分身索引 : null;
      }
      if (is(怪物实例, '旋风怪物')) {
        配置.召唤冷却剩余 = 怪物实例.召唤冷却剩余;
        配置.最大召唤物数量 = 怪物实例.最大召唤物数量;
        配置.当前召唤物索引列表 = 怪物实例.当前召唤物列表.map(indexIn).filter((index: number) => index !== -1);
      }
      if (is(怪物实例, '旋风')) {
        配置.生命周期 = 怪物实例.生命周期;
      }
      if (is(怪物实例, '超速怪物')) {
        配置.加速范围 = 怪物实例.加速范围 ?? 10;
        配置.加速回合数 = 怪物实例.加速回合数 ?? 2;
      }
      if (is(怪物实例, '巡逻怪物')) {
        配置.随机游走 = 怪物实例.随机游走;
        配置.巡逻方向 = 怪物实例.巡逻方向;
        配置.随机游走方向 = 怪物实例.随机游走方向;
      }
      const 掉落物序列化 = 怪物实例.掉落物 ? 序列化物品(怪物实例.掉落物) : null;
      return {
        类名: 类名,
        怪物索引: 怪物索引,
        配置: 配置,
        掉落物: 掉落物序列化,
        状态效果: 序列化状态,
      };
    } catch (e) {
      ports.error(`序列化怪物 ${怪物实例?.类型} (${类名}) 失败:`, e);
      return null;
    }
  }

  function 恢复怪物(怪物数据: Loose, 全局物品实例映射: Map<unknown, Loose>, 当前楼层怪物映射: Map<unknown, unknown>): Loose {
    if (!怪物数据 || !怪物数据.类名) return null;
    const 类构造器 = classes.lookup(怪物数据.类名);
    if (!类构造器 || typeof 类构造器 !== 'function') {
      ports.warn(`未找到怪物类构造器: ${怪物数据.类名}`);
      return null;
    }
    try {
      const 配置 = { ...怪物数据.配置 };
      let 掉落物实例: Loose = null;
      if (怪物数据.掉落物) {
        const 临时物品标识映射 = new Map();
        掉落物实例 = 恢复物品(怪物数据.掉落物, 临时物品标识映射);
        if (掉落物实例) {
          const 全局实例 = 全局物品实例映射.get(怪物数据.掉落物.唯一标识符串);
          if (全局实例) 掉落物实例 = 全局实例;
          else 全局物品实例映射.set(怪物数据.掉落物.唯一标识符串, 掉落物实例.唯一标识);
        }
      }
      delete 配置.掉落物;
      const 实例: Loose = new 类构造器(配置);
      实例.掉落物 = 掉落物实例;
      实例.图标 = 配置.图标 ?? 实例.图标;
      实例.基础生命值 = 配置.基础生命值 ?? 实例.生命值;
      实例.基础攻击力 = 配置.基础攻击力 ?? 实例.生命值;
      实例.当前生命值 = 配置.当前生命值 ?? 实例.生命值;
      实例.状态 = 配置.状态 ?? 怪物状态.休眠;
      实例.攻击冷却回合剩余 = 配置.攻击冷却回合剩余 ?? 0;
      实例.受伤冻结回合剩余 = 配置.受伤冻结回合剩余 ?? 0;
      实例.移动率 = 配置.移动率 ?? 实例.移动率;
      实例.基础移动距离 = 配置.基础移动距离 ?? 实例.基础移动距离;
      实例.基础攻击范围 = 配置.基础攻击范围 ?? 实例.基础攻击范围;
      实例.跟踪距离 = 配置.跟踪距离 ?? 实例.跟踪距离;
      实例.攻击冷却 = 配置.攻击冷却 ?? 实例.攻击冷却;
      实例.受伤冻结回合 = 配置.受伤冻结回合 ?? 实例.受伤冻结回合;
      实例.掉落概率 = 配置.掉落概率 ?? 实例.掉落概率;
      实例.始终追踪玩家 = 配置.始终追踪玩家 ?? 实例.始终追踪玩家;
      const 图标映射 = ports.icons();
      if (实例.类型 && 图标映射[实例.类型] && !is(实例, '伪装怪物') && 实例.图标 !== ' ' && !state.是否是自定义关卡) {
        实例.图标 = 图标映射[实例.类型];
      }
      if (配置.技能池名称列表 && Array.isArray(配置.技能池名称列表)) {
        实例.技能池 = [];
        配置.技能池名称列表.forEach((技能名称: unknown) => {
          const 对应技能 = Object.values(ports.skillPool()).find(技能 => 技能.名称 === 技能名称);
          if (对应技能) {
            实例.技能池.push(对应技能);
          }
        });
      }
      if (is(实例, '王座守护者')) {
        实例.当前阶段 = 配置.当前阶段 || 1;
        实例.技能冷却剩余 = 配置.技能冷却剩余 || { ...实例.技能冷却 };
        实例.无敌 = 配置.无敌 || false;
        实例.无敌次数 = 配置.无敌次数 || 0;
        实例.临时守卫索引列表 = 配置.皇家守卫索引列表 || [];
        实例.临时墓碑索引列表 = 配置.激活的墓碑索引列表 || [];
      }
      if (配置.存档ID) {
        实例.存档ID = 配置.存档ID;
      }
      if (is(实例, '蜈蚣怪物')) {
        实例.临时身体部位ID列表 = 配置.身体部位ID列表 || [];
        实例.朝向 = 配置.朝向 || 'W';
      }
      if (is(实例, '蜈蚣部位')) {
        实例.临时主体ID = 配置.主体ID;
        实例.临时跟随ID = 配置.跟随ID;
        实例.基础颜色 = 配置.基础颜色;
      }
      if (is(实例, '骷髅仆从')) {
        实例.生命周期 = 配置.生命周期 ?? 30;
        实例.主人 = state.玩家;
      }
      if (is(实例, '佣兵单位')) {
        实例.跟随层数 = 配置.跟随层数;
      }
      if (is(实例, '腐蚀怪物')) {
        实例.腐蚀强度 = 配置.腐蚀强度 ?? 1;
        实例.腐蚀持续 = 配置.腐蚀持续 ?? 4;
      }
      if (is(实例, '盗贼怪物')) {
        实例.偷窃几率 = 配置.偷窃几率 ?? 0.5;
        实例.偷窃武器几率 = 配置.偷窃武器几率 ?? 0.15;
        实例.偷到的金币 = 配置.偷到的金币 ?? 0;
        实例.偷到的武器列表 = (配置.偷到的武器列表序列化 || [])
          .map((wData: unknown) => 恢复物品(wData, 全局物品实例映射))
          .filter((w: unknown) => w != null);
      }
      if (is(实例, '吸能怪物')) {
        实例.吸能比例 = 配置.吸能比例 ?? 0.3;
        实例.最小吸能 = 配置.最小吸能 ?? 5;
      }
      if (is(实例, '剧毒云雾怪物')) {
        实例.毒云范围 = 配置.毒云范围 ?? 1;
        实例.毒云持续 = 配置.毒云持续 ?? 3;
        实例.毒云强度 = 配置.毒云强度 ?? 2;
      }
      if (is(实例, '召唤师怪物')) {
        实例.召唤冷却剩余 = 配置.召唤冷却剩余 ?? 0;
        实例.最大召唤物数量 = 配置.最大召唤物数量 ?? 2;
        实例.召唤物类 = classes.lookup(配置.召唤物类名) || classes.lookup('幽灵仆从');
        实例.临时召唤物索引列表 = 配置.当前召唤物索引列表 || [];
      }
      if (is(实例, '幽灵仆从')) {
        实例.生命周期 = 配置.生命周期 ?? 8;
        实例.临时召唤者索引 = 配置.召唤者索引;
      }
      if (is(实例, '萨满怪物')) {
        实例.治疗冷却剩余 = 配置.治疗冷却剩余 ?? 0;
      }
      if (is(实例, '瞬移怪物')) {
        实例.瞬移几率 = 配置.瞬移几率 ?? 0.6;
        实例.受击瞬移几率 = 配置.受击瞬移几率 ?? 0.4;
      }
      if (is(实例, '伪装怪物')) {
        实例.伪装状态 = 配置.伪装状态 ?? false;
      }
      if (is(实例, '炸弹怪物')) {
        实例.携带炸弹 = 配置.携带炸弹 ?? true;
      }
      if (is(实例, '大魔法师')) {
        实例.技能冷却 = 配置.技能冷却 ?? { 隐身术: 0, 分身术: 0, 火球术: 0, 冰冻术: 0, 传送术: 0, 召唤术: 0 };
        实例.隐身中 = 配置.隐身中 ?? false;
        实例.isClone = 配置.isClone ?? false;
        实例.临时分身索引 = 配置.分身索引;
      }
      if (is(实例, '旋风怪物')) {
        实例.召唤冷却剩余 = 配置.召唤冷却剩余 ?? 0;
        实例.最大召唤物数量 = 配置.最大召唤物数量 ?? 1;
        实例.临时召唤物索引列表 = 配置.当前召唤物索引列表 || [];
      }
      if (is(实例, '旋风')) {
        实例.生命周期 = 配置.生命周期 ?? 10;
      }
      if (is(实例, '超速怪物')) {
        实例.加速范围 = 配置.加速范围 ?? 10;
        实例.加速回合数 = 配置.加速回合数 ?? 2;
      }
      if (is(实例, '巡逻怪物')) {
        实例.随机游走 = 配置.随机游走 ?? false;
        实例.随机游走方向 = 配置.随机游走方向 || '';
        实例.巡逻方向 = 配置.巡逻方向 || 'E';
      }
      if (怪物数据.怪物索引 !== undefined) {
        当前楼层怪物映射.set(怪物数据.怪物索引, 实例);
      }
      if (怪物数据.状态效果) {
        ports.createStatusEffect(怪物数据.状态效果.类型, 怪物数据.状态效果.颜色, 怪物数据.状态效果.图标, 怪物数据.状态效果.持续时间,
          怪物数据.状态效果.剩余回合, null, 实例, 怪物数据.状态效果.强度);
      }
      实例.临时状态效果 = 怪物数据.状态效果;
      实例.临时仇恨目标标识 = 配置.仇恨目标标识;
      return 实例;
    } catch (e) {
      ports.error(`恢复怪物 ${怪物数据.类名} 失败:`, e);
      return null;
    }
  }

  return { 序列化怪物, 恢复怪物 };
}
