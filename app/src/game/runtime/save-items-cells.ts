import { GameCell } from '../world/cell';
import { 单元格类型, 环境类型, 颜色表 } from '../world/constants';
import type { WorldState } from '../world/state';
import type { SourceClassRegistry } from './class-registry';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- save records and items are source-shaped dynamic objects.

/**
 * Integration phase P2 (PLAN.md): item and cell records of the main-game save format.
 * Ports source `序列化物品` (JS L56680), `恢复物品` (L57210), `序列化单元格` (L56507) and
 * `恢复单元格` (L56573) with statement order, key order, falsy checks and try/catch scopes
 * preserved. Audit packet: `t10-save-items-cells-audit`.
 *
 * Class identity goes through the session registry (DECISIONS K1/K2): `constructor.name` →
 * `classes.nameOf`, `window[类名]` → `classes.lookup`, `instanceof X` → `classes.isA(x, 'X')`.
 * Deviation SRC-45: `window[类名]` also resolved browser globals (`Object`, `Map`, …); the
 * registry resolves only `注册全局类` names, so such records take the "class not found" path.
 */
export interface ItemCellCodecPorts {
  classes: Pick<SourceClassRegistry, 'lookup' | 'isA' | 'nameOf'>;
  /** Page global `图标映射`, read at each restore. */
  icons(): Record<string, unknown>;
  /** Page global `楼梯图标` (`{ 下楼, 上楼 }`), read at each stairs restore. */
  stairIcons(): { 下楼: unknown; 上楼: unknown };
  /** Source `切换楼层(目标层数, false, null, true)`, awaited by the restored stairs' `使用`. */
  switchFloor(target: number, keepPosition: false, position: null, fromStairs: true): unknown;
  /** `Date.now()` for fallback identities. */
  now(): number;
  warn(...args: unknown[]): void; // console.warn
  error(...args: unknown[]): void; // console.error
}

export function createItemCellCodec(state: Pick<WorldState, '所有怪物' | '当前层数'>, ports: ItemCellCodecPorts) {
  const { classes } = ports;
  const is = (value: unknown, name: string) => classes.isA(value, name);
  /** Source `物品实例?.constructor?.name` inside a diagnostic: never throws. */
  const diagnosticName = (value: Loose) => { try { return classes.nameOf(value); } catch { return undefined; } };

  function 序列化物品(物品实例: Loose): Loose {
    if (!物品实例 || !物品实例.constructor) {
      ports.warn('尝试序列化无效物品', 物品实例);
      return null;
    }
    try {
      const 类名 = classes.nameOf(物品实例);
      const 配置: Loose = {
        类型: 物品实例.类型,
        名称: 物品实例.名称,
        图标: 物品实例.图标,
        品质: 物品实例.品质,
        数量: 物品实例.堆叠数量,
        最大堆叠数量: 物品实例.最大堆叠数量,
        颜色索引: 物品实例.颜色索引,
        强化: 物品实例.强化,
        能否拾起: 物品实例.能否拾起,
        是否正常物品: 物品实例.是否正常物品,
        是否隐藏: 物品实例.是否隐藏,
        是否为隐藏物品: 物品实例.是否为隐藏物品,
        效果描述: 物品实例.效果描述,
        已装备: 物品实例.已装备,
        装备槽位: 物品实例.装备槽位,
        x: 物品实例.x,
        y: 物品实例.y,
        是否被丢弃: 物品实例.是否被丢弃 || false,
        阻碍怪物: 物品实例.阻碍怪物,
        材质: 物品实例.材质,
        玩家放置: 物品实例.玩家放置,
        数据: 物品实例.自定义数据 ? Object.fromEntries(物品实例.自定义数据) : null,
      };
      if (is(物品实例, '刷怪笼')) {
        const spawnedList = 配置.数据.当前生成物列表 || [];
        配置.数据.当前生成物标识列表 = spawnedList.map((instance: Loose) => {
          if (is(instance, '怪物')) {
            const index = state.所有怪物.findIndex(m => m === instance);
            return index !== -1 ? `怪物_${index}` : null;
          } else if (is(instance, '物品')) {
            return instance.唯一标识.toString();
          }
          return null;
        }).filter((id: unknown) => id !== null);
        delete 配置.数据.当前生成物列表;
      }
      if (is(物品实例, '武器类')) {
        配置.数据.冷却剩余 = 物品实例.自定义数据.get('冷却剩余') ?? 0;
      }
      if (is(物品实例, '宠物')) {
        配置.是否已放置 = 物品实例.是否已放置 ?? false;
        配置.层数 = 物品实例.层数;
      }
      if (is(物品实例, '附魔卷轴')) {
        配置.数据.可用次数 = 物品实例.可用次数;
        const 效果索引 = 物品实例.附魔池.findIndex((func: unknown) => func === 物品实例.附魔效果);
        if (效果索引 !== -1) {
          配置.数据.附魔效果名 = 物品实例.效果名[效果索引];
        } else {
          ports.warn('无法找到附魔卷轴的效果名:', 物品实例);
        }
      }
      if (is(物品实例, '神秘商人') || is(物品实例, '物品祭坛')) {
        配置.数据.库存序列化 = (物品实例.自定义数据.get('库存') || [])
          .map(序列化物品)
          .filter((item: unknown) => item !== null);
        delete 配置.数据.库存;
      }
      if (is(物品实例, '宠物')) {
        const 宠物装备 = 物品实例.自定义数据.get('装备') || {};
        配置.数据.装备标识 = {};
        for (const 槽位 in 宠物装备) {
          if (宠物装备[槽位] && 宠物装备[槽位].唯一标识) {
            配置.数据.装备标识[槽位] = 宠物装备[槽位].唯一标识.toString();
          } else {
            配置.数据.装备标识[槽位] = null;
          }
        }
        配置.数据.技能 = JSON.parse(JSON.stringify(物品实例.自定义数据.get('技能') || []));
        delete 配置.数据.装备;
      }
      if (is(物品实例, '折跃门')) {
        const 目标房间 = 物品实例.自定义数据.get('目标房间');
        配置.数据.目标房间ID = 目标房间 ? 目标房间.id : null;
      }
      return {
        类名: 类名,
        唯一标识符串: 物品实例.唯一标识.toString(),
        配置: 配置,
      };
    } catch (e) {
      ports.error(`序列化物品 ${物品实例?.名称} (${diagnosticName(物品实例)}) 失败:`, e);
      return null;
    }
  }

  function 恢复物品(物品数据: Loose, 全局物品标识映射: Map<unknown, symbol>): Loose {
    if (!物品数据 || !物品数据.类名) return null;
    const 类构造器 = classes.lookup(物品数据.类名);
    if (!类构造器 || typeof 类构造器 !== 'function') {
      ports.warn(`未找到物品类构造器: ${物品数据.类名}`);
      return null;
    }
    try {
      const 配置 = { ...物品数据.配置 };
      const 标识符串 = 物品数据.唯一标识符串;
      let 唯一标识 = 全局物品标识映射.get(标识符串);
      if (!唯一标识) {
        if (标识符串 && 标识符串.startsWith('Symbol(')) {
          const description = 标识符串.slice(7, -1);
          唯一标识 = Symbol.for(description);
        } else {
          ports.warn('物品缺少有效唯一标识符串，生成新Symbol:', 物品数据);
          唯一标识 = Symbol.for(`恢复_${物品数据.类名}_${ports.now()}`);
        }
        全局物品标识映射.set(标识符串, 唯一标识);
      }
      if (配置.数据) {
        配置.数据 = new Map(Object.entries(配置.数据));
      } else {
        配置.数据 = new Map();
      }
      const 实例: Loose = new 类构造器({ ...配置, 唯一标识: 唯一标识 });
      实例.自定义数据 = 配置.数据;
      实例.是否隐藏 = 配置.是否隐藏;
      实例.堆叠数量 = 配置.数量;
      实例.图标 = 配置.图标;
      实例.材质 = 配置.材质;
      实例.唯一标识 = 唯一标识;
      实例.已装备 = 配置.已装备 ?? false;
      if (is(实例, '武器类')) {
        实例.自定义数据.set('冷却剩余', 配置.数据.get('冷却剩余') ?? 0);
      }
      const 图标映射 = ports.icons(); // one read of the page global; the source reads it four times
      if (实例.名称 && 图标映射[实例.名称]) {
        实例.图标 = 图标映射[实例.名称];
      }
      if (is(实例, '药水类') && !is(实例, '神秘药水')) {
        实例.图标 = 图标映射.药水;
      } else if (is(实例, '祭坛类')) {
        实例.图标 = 图标映射.祭坛;
      }
      if (is(实例, '附魔卷轴')) {
        实例.可用次数 = 配置.数据.get('可用次数') ?? 1;
        const 效果名 = 配置.数据.get('附魔效果名');
        const 效果索引 = 实例.效果名.indexOf(效果名);
        if (效果索引 !== -1) {
          实例.附魔效果 = 实例.附魔池[效果索引];
        } else {
          ports.warn(`无法恢复附魔卷轴效果: ${效果名}`);
        }
      }
      if (is(实例, '刷怪笼')) {
        实例.临时生成物标识列表 = 配置.数据.get('当前生成物标识列表') || [];
      }
      if (is(实例, '隐形毒气陷阱')) {
        实例.自定义数据.set('激活后图标', 图标映射.毒气);
      }
      实例.x = 配置.x ?? null;
      实例.y = 配置.y ?? null;
      实例.是否被丢弃 = 配置.是否被丢弃 ?? false;
      return 实例;
    } catch (e) {
      ports.error(`恢复物品 ${物品数据.类名} 失败:`, e);
      return null;
    }
  }

  function 序列化单元格(单元格实例: Loose, 物品标识映射: Map<unknown, unknown>, 怪物索引映射: Map<unknown, unknown>): Loose {
    if (!单元格实例) return null;
    try {
      const 序列化数据: Loose = {};
      if (单元格实例.类型 !== null) 序列化数据.类型 = 单元格实例.类型;
      if (单元格实例.背景类型 !== 单元格类型.墙壁) 序列化数据.背景类型 = 单元格实例.背景类型;
      if (单元格实例.是否强制墙壁) 序列化数据.是否强制墙壁 = true;
      if (单元格实例.环境) 序列化数据.环境 = 单元格实例.环境;
      if (单元格实例.已探索暗河) 序列化数据.已探索暗河 = true;
      if (单元格实例.已揭示) 序列化数据.已揭示 = true;
      if (单元格实例.环境 === 环境类型.药水水域 && 单元格实例.药水数据) {
        序列化数据.药水数据 = 单元格实例.药水数据;
      }
      const 墙壁数据: Loose = {};
      let 有墙 = false;
      for (const 方向 in 单元格实例.墙壁) {
        if (单元格实例.墙壁[方向]) {
          墙壁数据[方向] = true;
          有墙 = true;
        }
      }
      if (有墙) 序列化数据.墙壁 = 墙壁数据;
      if (单元格实例.钥匙ID !== null) 序列化数据.钥匙ID = 单元格实例.钥匙ID;
      if (单元格实例.颜色索引 !== 颜色表.length) 序列化数据.颜色索引 = 单元格实例.颜色索引;
      if (单元格实例.类型 === 单元格类型.楼梯下楼 || 单元格实例.类型 === 单元格类型.楼梯上楼) {
        if (单元格实例.关联物品?.图标) 序列化数据.关联物品图标 = 单元格实例.关联物品.图标;
      } else if (单元格实例.关联物品) {
        const 关联物品标识 = 物品标识映射.get(单元格实例.关联物品.唯一标识);
        if (关联物品标识) {
          序列化数据.关联物品标识 = 关联物品标识;
        } else {
          const serializedItem = 序列化物品(单元格实例.关联物品);
          if (serializedItem) {
            序列化数据.关联物品标识 = serializedItem.唯一标识符串;
            if (!物品标识映射.has(单元格实例.关联物品.唯一标识)) {
              物品标识映射.set(单元格实例.关联物品.唯一标识, 序列化数据.关联物品标识);
            }
          }
        }
      }
      if (单元格实例.关联怪物) {
        const 关联怪物索引 = 怪物索引映射.get(单元格实例.关联怪物);
        if (关联怪物索引 !== undefined) {
          序列化数据.关联怪物索引 = 关联怪物索引;
        }
      }
      if (单元格实例.标识) 序列化数据.标识符串 = 单元格实例.标识.toString();
      if (单元格实例.配对单元格位置) 序列化数据.配对单元格位置 = { ...单元格实例.配对单元格位置 };
      if (单元格实例.isOneWay) 序列化数据.isOneWay = true;
      if (单元格实例.oneWayAllowedDirection) 序列化数据.oneWayAllowedDirection = 单元格实例.oneWayAllowedDirection;
      if (单元格实例.doorOrientation) 序列化数据.doorOrientation = 单元格实例.doorOrientation;
      if (单元格实例.阻碍视野) 序列化数据.阻碍视野 = 单元格实例.阻碍视野;
      return 序列化数据;
    } catch (e) {
      ports.error(`序列化单元格 (${单元格实例.x}, ${单元格实例.y}) 失败:`, e);
      return null;
    }
  }

  function 恢复单元格(单元格数据: Loose, x: number, y: number, 全局物品实例映射: Map<unknown, Loose>,
    _怪物实例映射: unknown, 门实例映射: Map<unknown, Loose>): GameCell<Loose, Loose> {
    const 单元格实例: Loose = new GameCell(x, y);
    if (!单元格数据) return 单元格实例;
    单元格实例.是否强制墙壁 = 单元格数据.是否强制墙壁 || false;
    单元格实例.类型 = 单元格数据.类型 ?? null;
    单元格实例.背景类型 = 单元格数据.背景类型 ?? 单元格类型.墙壁;
    单元格实例.环境 = 单元格数据.环境 || null;
    单元格实例.已探索暗河 = 单元格数据.已探索暗河 || false;
    单元格实例.已揭示 = 单元格数据.已揭示 ?? false;
    单元格实例.墙壁 = { 上: false, 右: false, 下: false, 左: false, ...单元格数据.墙壁 };
    单元格实例.钥匙ID = 单元格数据.钥匙ID ?? null;
    单元格实例.颜色索引 = 单元格数据.颜色索引 ?? 颜色表.length;
    单元格实例.阻碍视野 = 单元格数据.阻碍视野 ?? false;
    单元格实例.关联物品 = null;
    单元格实例.关联怪物 = null;
    if (单元格实例.类型 === 单元格类型.楼梯下楼 || 单元格实例.类型 === 单元格类型.楼梯上楼) {
      const 图标 = 单元格数据.关联物品图标 ||
        (单元格实例.类型 === 单元格类型.楼梯下楼 ? ports.stairIcons().下楼 : ports.stairIcons().上楼);
      单元格实例.关联物品 = {
        类型: '楼梯',
        图标: 图标,
        显示图标: 图标,
        颜色索引: 颜色表.length,
        唯一标识: Symbol.for(`楼梯_${单元格实例.类型}`),
        获取名称: () => 单元格实例.类型 === 单元格类型.楼梯下楼 ? '下楼楼梯' : '上楼楼梯',
        自定义数据: new Map(),
        品质: 1,
        能否拾起: false,
        是否正常物品: false,
        是否隐藏: false,
        是否为隐藏物品: false,
        效果描述: null,
        已装备: false,
        装备槽位: null,
        堆叠数量: 1,
        最大堆叠数量: 1,
        颜色表: 颜色表,
        使用: async () => {
          const 目标层数 = 单元格实例.类型 === 单元格类型.楼梯下楼 ? state.当前层数 + 1 : state.当前层数 - 1;
          await ports.switchFloor(目标层数, false, null, true);
        },
      };
    } else if (单元格数据.关联物品标识) {
      const 物品实例 = 全局物品实例映射.get(单元格数据.关联物品标识);
      if (物品实例) {
        单元格实例.关联物品 = 物品实例;
        物品实例.x = x;
        物品实例.y = y;
      } else {
        ports.warn(`单元格 (${x},${y}) 关联物品标识 ${单元格数据.关联物品标识} 未找到对应实例`);
      }
    }
    if (单元格数据.关联怪物索引 !== null && 单元格数据.关联怪物索引 !== undefined) {
      单元格实例.关联怪物 = 单元格数据.关联怪物索引;
    }
    if (单元格数据.标识符串) {
      const 门实例 = 门实例映射.get(单元格数据.标识符串);
      if (门实例) {
        单元格实例.标识 = 门实例.唯一标识;
      } else {
        单元格实例.临时门标识符串 = 单元格数据.标识符串;
      }
    }
    if (单元格数据.环境 === 环境类型.药水水域 && 单元格数据.药水数据) {
      单元格实例.药水数据 = 单元格数据.药水数据;
    }
    单元格实例.配对单元格位置 = 单元格数据.配对单元格位置 || null;
    单元格实例.isOneWay = 单元格数据.isOneWay || false;
    单元格实例.oneWayAllowedDirection = 单元格数据.oneWayAllowedDirection || null;
    单元格实例.doorOrientation = 单元格数据.doorOrientation || null;
    return 单元格实例;
  }

  return { 序列化物品, 恢复物品, 序列化单元格, 恢复单元格 };
}
