import { 单元格类型 } from '../world/constants';
import type { WorldState } from '../world/state';
import type { SourceClassRegistry } from './class-registry';
import type { createItemCellCodec } from './save-items-cells';
import type { createMonsterCodec } from './save-monsters';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- floor records are source-shaped dynamic objects.

/**
 * Integration phase P2 (PLAN.md): floor records of the main-game save format.
 * Ports source `序列化楼层` (JS L57013) and `恢复楼层` (L57501) with statement order, key
 * order, `||`/`??` choices, the try/catch scope and the logging preserved. Audit packet:
 * `t10-save-floors-audit`. Composes the I3 item/cell codec and the I4 monster codec.
 *
 * Source behavior kept on purpose:
 * - SRC-47: the serializer destructures `玩家位置 = 玩家位置`, `已揭示洞穴格子 = 已揭示洞穴格子`
 *   and `地牢生成方式 = 地牢生成方式`. Each default names the binding being declared, so a
 *   floor missing one of those keys hits the temporal dead zone. The serializer logs the
 *   ReferenceError and returns null, and the floor is dropped from the save.
 * - The restorer assigns the page global `地牢大小` from every restored floor, constructs
 *   doors with the page `门` class (which registers each door in the *current* global
 *   `门实例列表` and draws `prng`), and walks the whole shared item-instance map on every floor.
 */
export interface FloorCodecPorts {
  classes: Pick<SourceClassRegistry, 'lookup' | 'isA'>;
  /** Source `new 状态效果(类型, 颜色, 图标, 持续时间, 剩余回合, null, 目标, 强度)`; the effect registers itself. */
  createStatusEffect(type: unknown, color: unknown, icon: unknown, duration: unknown, remaining: unknown, source: null,
    target: unknown, strength: unknown): unknown;
  log(...args: unknown[]): void; // console.log
  warn(...args: unknown[]): void; // console.warn
  error(...args: unknown[]): void; // console.error
}

type ItemCellCodec = ReturnType<typeof createItemCellCodec>;
type MonsterCodec = ReturnType<typeof createMonsterCodec>;

/** A destructuring default that names its own binding (`const { a = a } = o`). */
const temporalDeadZone = (name: string) => () => {
  throw new ReferenceError(`Cannot access '${name}' before initialization`);
};

export function createFloorCodec(state: Pick<WorldState, '玩家' | '玩家仆从列表' | '地牢大小'>, ports: FloorCodecPorts,
  itemsAndCells: ItemCellCodec, monsters: Pick<MonsterCodec, '序列化怪物' | '恢复怪物'>) {
  const { classes } = ports;
  const is = (value: unknown, name: string) => classes.isA(value, name);
  const { 序列化物品, 恢复物品, 序列化单元格, 恢复单元格 } = itemsAndCells;
  const { 序列化怪物, 恢复怪物 } = monsters;

  function 序列化楼层(层号: unknown, 楼层原始数据: Loose, 全局物品标识映射: Map<unknown, unknown>): Loose {
    ports.log(`开始序列化楼层 ${层号}`);
    if (!楼层原始数据) {
      ports.warn(`楼层 ${层号} 数据不存在，跳过序列化`);
      return null;
    }
    try {
      // Source object destructuring with defaults, read in pattern order.
      const 读取 = (key: string, fallback: () => unknown): Loose => {
        const value = 楼层原始数据[key];
        return value === undefined ? fallback() : value;
      };
      const 地牢数组 = 读取('地牢数组', () => []);
      const 房间列表 = 读取('房间列表', () => []);
      const 上锁房间列表 = 读取('上锁房间列表', () => []);
      const 已访问房间 = 读取('已访问房间', () => new Set());
      const 房间地图 = 读取('房间地图', () => []);
      const 门实例列表 = 读取('门实例列表', () => new Map());
      const 所有怪物 = 读取('所有怪物', () => []);
      const 所有计时器 = 读取('所有计时器', () => []);
      const 玩家初始位置 = 读取('玩家初始位置', () => ({ x: 0, y: 0 }));
      const 玩家位置 = 读取('玩家位置', temporalDeadZone('玩家位置'));
      const 当前天气效果 = 读取('当前天气效果', () => []);
      const 已揭示洞穴格子 = 读取('已揭示洞穴格子', temporalDeadZone('已揭示洞穴格子'));
      const 地牢生成方式 = 读取('地牢生成方式', temporalDeadZone('地牢生成方式'));

      const 地上物品列表: Loose[] = [];
      for (let y = 0; y < 地牢数组.length; y++) {
        for (let x = 0; x < 地牢数组[y]?.length; x++) {
          const 物品 = 地牢数组[y][x]?.关联物品;
          if (物品) {
            地上物品列表.push(物品);
            if (!全局物品标识映射.has(物品.唯一标识)) {
              全局物品标识映射.set(物品.唯一标识, 物品.唯一标识.toString());
            }
          }
        }
      }
      const 序列化地上物品 = 地上物品列表.map(物品 => 序列化物品(物品)).filter(i => i != null);

      const 怪物索引映射 = new Map<unknown, number>();
      const 序列化怪物列表 = 所有怪物
        .map((怪物: unknown, 索引: number) => {
          怪物索引映射.set(怪物, 索引);
          return 序列化怪物(怪物, 索引, 所有怪物);
        })
        .filter((m: unknown) => m != null);

      const 序列化地牢格子 = 地牢数组.map((行: Loose) =>
        行.map((单元格: unknown) => 序列化单元格(单元格, 全局物品标识映射, 怪物索引映射)).filter((g: unknown) => g != null));

      const 序列化物品列表 = 所有计时器.map((物品: unknown) => 序列化物品(物品)).filter((b: unknown) => b != null);
      序列化物品列表.forEach((炸弹数据: Loose) => {
        if (炸弹数据) {
          const 符号 = Symbol.for(炸弹数据.唯一标识符串.slice(7, -1));
          if (!全局物品标识映射.has(符号)) {
            全局物品标识映射.set(符号, 炸弹数据.唯一标识符串);
          }
        }
      });

      const 序列化门实例 = Array.from(门实例列表.values() as Iterable<Loose>).map(门 => ({
        唯一标识符串: 门.唯一标识.toString(),
        类型: 门.类型,
        是否上锁: 门.是否上锁,
        房间ID: 门.房间ID,
        所在位置: { ...门.所在位置 },
      }));
      const 序列化挑战房间状态 = (楼层原始数据.房间列表 || [])
        .filter((r: Loose) => r.类型 === '挑战房间' && r.挑战状态)
        .map((r: Loose) => {
          const 挑战状态 = r.挑战状态;
          const 挑战状态拷贝: Loose = {
            进行中: 挑战状态.进行中,
            已完成: 挑战状态.已完成,
            当前波次: 挑战状态.当前波次,
            总波次: 挑战状态.总波次,
            波次最大回合数: 挑战状态.波次最大回合数,
            波次当前回合数: 挑战状态.波次当前回合数,
            挑战怪物层级: 挑战状态.挑战怪物层级,
            候选怪物池: 挑战状态.候选怪物池,
            波次内怪物: [],
            原始门数据: [],
          };
          if (挑战状态.波次内怪物 && Array.isArray(挑战状态.波次内怪物)) {
            挑战状态拷贝.波次内怪物 = 挑战状态.波次内怪物
              .map((怪实例: unknown) => {
                const 索引 = (楼层原始数据.所有怪物 || []).findIndex((m: unknown) => m === 怪实例);
                return 索引 !== -1 ? `怪物_${索引}` : null;
              })
              .filter((id: unknown) => id !== null);
          }
          if (挑战状态.原始门数据 && Array.isArray(挑战状态.原始门数据)) {
            挑战状态拷贝.原始门数据 = 挑战状态.原始门数据.map((门数据: Loose) => ({
              ...门数据,
              原标识: 门数据.原标识 ? 门数据.原标识.toString() : null,
            }));
          }
          return { id: r.id, 状态: 挑战状态拷贝 };
        });

      ports.log(`楼层 ${层号} 序列化完成`);
      return {
        玩家位置: 玩家位置,
        地牢生成方式: 地牢生成方式,
        已揭示洞穴格子: Array.from(已揭示洞穴格子 || new Set()),
        玩家初始位置: (玩家初始位置 && 玩家初始位置.x !== undefined) ? { ...玩家初始位置 } : { x: 50, y: 50 },
        房间列表: 房间列表.map((r: Loose) => {
          const { 挑战状态: _挑战状态, ...restOfRoom } = r;
          const serializedRoom: Loose = { ...restOfRoom, 门: r.门 ? [...r.门] : [] };
          if (r && r.自定义奖励 && r.自定义奖励.length > 0) {
            serializedRoom.自定义奖励 = r.自定义奖励.map((reward: Loose) => {
              const newReward = { ...reward };
              if (newReward.配置 && newReward.配置.数据 instanceof Map) {
                newReward.配置.数据 = Object.fromEntries(newReward.配置.数据);
              }
              return newReward;
            });
          }
          return serializedRoom;
        }),
        上锁房间列表: 上锁房间列表.map((r: Loose) => {
          const { 挑战状态: _挑战状态, ...restOfRoom } = r;
          return { ...restOfRoom, 门: r.门 ? [...r.门] : [] };
        }),
        已访问房间数组: Array.from(已访问房间 || new Set()),
        房间地图: 房间地图.map((row: Loose) => [...row]),
        挑战状态列表: 序列化挑战房间状态,
        序列化地上物品: 序列化地上物品,
        序列化怪物列表: 序列化怪物列表,
        序列化物品列表: 序列化物品列表,
        序列化地牢格子: 序列化地牢格子,
        序列化门实例: 序列化门实例,
        序列化玩家仆从索引: state.玩家仆从列表
          .map(仆从 => 所有怪物.findIndex((m: unknown) => m === 仆从))
          .filter((index: number) => index !== -1 && 所有怪物[index].层数 === 层号),
        当前天气效果: [...当前天气效果],
      };
    } catch (e) {
      ports.error(`序列化楼层 ${层号} 失败:`, e);
      return null;
    }
  }

  function 恢复楼层(层号: unknown, 楼层存档数据: Loose, 全局物品实例映射: Map<unknown, Loose>,
    全局物品标识映射: Map<unknown, symbol>): Loose {
    ports.log(`开始恢复楼层 ${层号}`);
    if (!楼层存档数据) {
      ports.warn(`楼层 ${层号} 存档数据无效，跳过恢复`);
      return null;
    }
    try {
      const 楼层数据: Loose = {
        玩家位置: 楼层存档数据.玩家位置,
        玩家初始位置: (楼层存档数据.玩家初始位置 && 楼层存档数据.玩家初始位置.x !== undefined && 楼层存档数据.玩家初始位置.y !== undefined)
          ? { ...楼层存档数据.玩家初始位置 }
          : { x: 50, y: 50 },
        房间列表: [...(楼层存档数据.房间列表 || [])],
        上锁房间列表: [...(楼层存档数据.上锁房间列表 || [])],
        已访问房间: new Set(楼层存档数据.已访问房间数组 || []),
        房间地图: [...(楼层存档数据.房间地图 || [])],
        地牢数组: [],
        所有怪物: [],
        所有计时器: [],
        门实例列表: new Map(),
        地牢生成方式: 楼层存档数据.地牢生成方式 || 'default',
        已揭示洞穴格子: 楼层存档数据.已揭示洞穴格子 || new Set(),
        当前天气效果: [...(楼层存档数据.当前天气效果 || [])],
      };
      state.地牢大小 = 楼层存档数据.序列化地牢格子?.length;
      if (楼层数据.地牢生成方式 === 'cave' && 楼层数据.已揭示洞穴格子) {
        楼层数据.已揭示洞穴格子 = new Set(楼层数据.已揭示洞穴格子);
      }
      const 地上物品实例映射 = new Map<unknown, Loose>();
      if (楼层存档数据.序列化地上物品) {
        楼层存档数据.序列化地上物品.forEach((物品数据: Loose) => {
          let 实例 = 全局物品实例映射.get(物品数据.唯一标识符串);
          if (!实例) {
            实例 = 恢复物品(物品数据, 全局物品标识映射);
            if (实例) 全局物品实例映射.set(物品数据.唯一标识符串, 实例);
          }
          if (实例) {
            地上物品实例映射.set(物品数据.唯一标识符串, 实例);
            实例.x = 物品数据.配置?.x ?? null;
            实例.y = 物品数据.配置?.y ?? null;
          }
        });
      }

      const 门实例映射 = new Map<unknown, Loose>();
      if (楼层存档数据.序列化门实例) {
        楼层存档数据.序列化门实例.forEach((门数据: Loose) => {
          let 唯一标识;
          const 现有符号 = 全局物品标识映射.get(门数据.唯一标识符串);
          if (现有符号) {
            唯一标识 = 现有符号;
          } else {
            唯一标识 = Symbol.for(门数据.唯一标识符串.slice(7, -1));
            全局物品标识映射.set(门数据.唯一标识符串, 唯一标识);
          }
          const 门类 = classes.lookup('门');
          if (!门类) throw new TypeError('门 is not a constructor');
          const 实例: Loose = new 门类({ 关联房间ID: 门数据.房间ID, 位置: { ...门数据.所在位置 } });
          实例.唯一标识 = 唯一标识;
          实例.类型 = 门数据.类型;
          实例.是否上锁 = 门数据.是否上锁;
          楼层数据.门实例列表.set(唯一标识, 实例);
          门实例映射.set(门数据.唯一标识符串, 实例);
        });
      }

      // Source `Array(地牢大小).fill().map(...)`: a missing grid gives `Array(undefined)`, one row of one cell.
      const 尺寸: Loose = state.地牢大小;
      楼层数据.地牢数组 = Array(尺寸)
        .fill(undefined)
        .map((_, y) =>
          Array(尺寸)
            .fill(undefined)
            .map((__, x) => {
              const 单元格数据 = 楼层存档数据.序列化地牢格子?.[y]?.[x];
              return 恢复单元格(单元格数据, x, y, 全局物品实例映射, new Map(), 门实例映射);
            }));
      for (let y = 0; y < state.地牢大小; y++) {
        for (let x = 0; x < state.地牢大小; x++) {
          const 单元格 = 楼层数据.地牢数组[y][x];
          if (单元格.临时门标识符串) {
            const 门实例 = 门实例映射.get(单元格.临时门标识符串);
            if (门实例) 单元格.标识 = 门实例.唯一标识;
            delete 单元格.临时门标识符串;
          }
        }
      }
      if (楼层存档数据.房间列表) {
        楼层存档数据.房间列表.forEach((存档房间: Loose, 索引: number) => {
          if (存档房间 && 存档房间.自定义奖励 && 楼层数据.房间列表[索引]) {
            楼层数据.房间列表[索引].自定义奖励 = 存档房间.自定义奖励.map((reward: Loose) => {
              const newReward = { ...reward };
              if (newReward.配置 && newReward.配置.数据 && !(newReward.配置.数据 instanceof Map)) {
                newReward.配置.数据 = new Map(Object.entries(newReward.配置.数据));
              }
              return newReward;
            });
          }
        });
      }

      const 当前楼层怪物映射 = new Map<unknown, Loose>();
      if (楼层存档数据.序列化怪物列表) {
        楼层数据.所有怪物 = 楼层存档数据.序列化怪物列表
          .map((怪物数据: unknown) => 恢复怪物(怪物数据, 全局物品实例映射, 当前楼层怪物映射))
          .filter((m: unknown) => m != null);
      }

      楼层数据.所有怪物.forEach((怪物实例: Loose) => {
        if (怪物实例.x !== null && 怪物实例.y !== null) {
          const 单元格 = 楼层数据.地牢数组[怪物实例.y]?.[怪物实例.x];
          if (单元格) {
            if (!is(单元格.关联怪物, '怪物')) {
              单元格.关联怪物 = 怪物实例;
              单元格.类型 = 单元格类型.怪物;
            }
          }
        }
        if (怪物实例.临时仇恨目标标识) {
          const 标识 = 怪物实例.临时仇恨目标标识;
          if (标识 === '玩家') {
            怪物实例.仇恨 = state.玩家;
          } else if (标识.startsWith('怪物_')) {
            const 仇恨索引 = parseInt(标识.split('_')[1]);
            怪物实例.仇恨 = 当前楼层怪物映射.get(仇恨索引) || null;
          }
          delete 怪物实例.临时仇恨目标标识;
        }
        if (is(怪物实例, '召唤师怪物') && 怪物实例.临时召唤物索引列表) {
          怪物实例.当前召唤物列表 = 怪物实例.临时召唤物索引列表
            .map((召唤索引: unknown) => 当前楼层怪物映射.get(召唤索引))
            .filter((仆从: unknown) => 仆从 != null);
          delete 怪物实例.临时召唤物索引列表;
        }
        if (is(怪物实例, '幽灵仆从') && 怪物实例.临时召唤者索引 !== undefined) {
          怪物实例.召唤者 = 当前楼层怪物映射.get(怪物实例.临时召唤者索引) || null;
          delete 怪物实例.临时召唤者索引;
        }
        if (is(怪物实例, '大魔法师') && 怪物实例.临时分身索引 !== undefined) {
          怪物实例.分身 = 当前楼层怪物映射.get(怪物实例.临时分身索引) || null;
          delete 怪物实例.临时分身索引;
        }
        if (is(怪物实例, '旋风怪物') && 怪物实例.临时召唤物索引列表) {
          怪物实例.当前召唤物列表 = 怪物实例.临时召唤物索引列表
            .map((召唤索引: unknown) => 当前楼层怪物映射.get(召唤索引))
            .filter((旋: unknown) => is(旋, '旋风'));
          delete 怪物实例.临时召唤物索引列表;
        }
        if (怪物实例.临时状态效果) {
          const 状态数据 = 怪物实例.临时状态效果;
          ports.createStatusEffect(状态数据.类型, 状态数据.颜色, 状态数据.图标, 状态数据.持续时间, 状态数据.剩余回合, null, 怪物实例,
            状态数据.强度);
          delete 怪物实例.临时状态效果;
        }
      });
      const 蜈蚣部分映射 = new Map<unknown, Loose>();
      楼层数据.所有怪物.forEach((m: Loose) => {
        if (m.存档ID) 蜈蚣部分映射.set(m.存档ID, m);
      });
      楼层数据.所有怪物.forEach((m: Loose) => {
        if (is(m, '蜈蚣怪物') && m.临时身体部位ID列表) {
          m.身体部位 = m.临时身体部位ID列表.map((id: unknown) => 蜈蚣部分映射.get(id)).filter(Boolean);
          delete m.临时身体部位ID列表;
        }
        if (is(m, '蜈蚣部位')) {
          if (m.临时主体ID) {
            m.主体 = 蜈蚣部分映射.get(m.临时主体ID);
            delete m.临时主体ID;
          }
          if (m.临时跟随ID) {
            m.跟随 = 蜈蚣部分映射.get(m.临时跟随ID);
            delete m.临时跟随ID;
          }
        }
      });

      if (楼层存档数据.序列化物品列表) {
        楼层数据.所有计时器 = 楼层存档数据.序列化物品列表
          .map((物品数据: Loose) => {
            let 实例 = 全局物品实例映射.get(物品数据.唯一标识符串);
            if (!实例) {
              实例 = 恢复物品(物品数据, 全局物品标识映射);
              if (实例) 全局物品实例映射.set(物品数据.唯一标识符串, 实例);
            }
            return 实例;
          })
          .filter((b: unknown) => b != null);
      }

      for (const 物品实例 of 全局物品实例映射.values()) {
        if (is(物品实例, '宠物')) {
          const 装备标识 = 物品实例.自定义数据.get('装备标识') || {};
          const 恢复后装备: Loose = {};
          for (const 槽位 in 装备标识) {
            const 标识符串 = 装备标识[槽位];
            if (标识符串) {
              const 装备物品实例 = 全局物品实例映射.get(标识符串);
              if (装备物品实例 && ((槽位 === '武器' && is(装备物品实例, '武器类')) || (槽位 === '防具' && is(装备物品实例, '防御装备类')))) {
                恢复后装备[槽位] = 装备物品实例;
              }
            } else {
              恢复后装备[槽位] = null;
            }
          }
          物品实例.自定义数据.set('装备', 恢复后装备);
        } else if (is(物品实例, '折跃门')) {
          const 目标房间ID = 物品实例.自定义数据.get('目标房间');
          if (目标房间ID !== null && 目标房间ID !== undefined) {
            const 目标房间 = 楼层数据.房间列表.find((r: Loose) => r.id === 目标房间ID.id);
            if (目标房间) 物品实例.自定义数据.set('目标房间', 目标房间);
          } else {
            物品实例.自定义数据.set('目标房间', null);
          }
        } else if (is(物品实例, '神秘商人') || is(物品实例, '物品祭坛')) {
          const 库存序列化 = 物品实例.自定义数据.get('库存序列化') || [];
          const 恢复后库存: Loose[] = [];
          库存序列化.forEach((物品数据: Loose) => {
            let 库存物品实例 = 全局物品实例映射.get(物品数据.唯一标识符串);
            if (!库存物品实例) {
              库存物品实例 = 恢复物品(物品数据, 全局物品标识映射);
              if (库存物品实例) 全局物品实例映射.set(物品数据.唯一标识符串, 库存物品实例);
            }
            if (库存物品实例) 恢复后库存.push(库存物品实例);
          });
          物品实例.自定义数据.set('库存', 恢复后库存);
        }
      }
      if (楼层存档数据.挑战状态列表 && Array.isArray(楼层存档数据.挑战状态列表)) {
        楼层存档数据.挑战状态列表.forEach((存档的挑战状态: Loose) => {
          const 对应房间 = 楼层数据.房间列表.find((r: Loose) => r.id === 存档的挑战状态.id);
          if (对应房间 && 存档的挑战状态.状态) {
            对应房间.类型 = '挑战房间';
            对应房间.挑战状态 = JSON.parse(JSON.stringify(存档的挑战状态.状态));
            if (对应房间.挑战状态.波次内怪物 && Array.isArray(对应房间.挑战状态.波次内怪物)) {
              对应房间.挑战状态.波次内怪物 = 对应房间.挑战状态.波次内怪物
                .map((怪物标识符: unknown) => {
                  if (typeof 怪物标识符 === 'string' && 怪物标识符.startsWith('怪物_')) {
                    const 索引 = parseInt(怪物标识符.split('_')[1]!);
                    return 楼层数据.所有怪物[索引] || null;
                  }
                  return null;
                })
                .filter((m: unknown) => m !== null);
            }
            if (对应房间.挑战状态.原始门数据 && Array.isArray(对应房间.挑战状态.原始门数据)) {
              对应房间.挑战状态.原始门数据.forEach((门数据: Loose) => {
                if (门数据.原标识 && typeof 门数据.原标识 === 'string') {
                  let 门符号 = 全局物品标识映射.get(门数据.原标识);
                  if (!门符号 && 门数据.原标识.startsWith('Symbol(')) {
                    const description = 门数据.原标识.slice(7, -1);
                    门符号 = Symbol.for(description);
                    全局物品标识映射.set(门数据.原标识, 门符号);
                  }
                  门数据.原标识 = 门符号 || 门数据.原标识;
                }
              });
            }
          }
        });
      }
      if (楼层存档数据.序列化玩家仆从索引) {
        楼层存档数据.序列化玩家仆从索引.forEach((索引: number) => {
          const 仆从 = 楼层数据.所有怪物[索引];
          if (is(仆从, '骷髅仆从') && !state.玩家仆从列表.includes(仆从)) {
            state.玩家仆从列表.push(仆从);
          }
        });
      }

      楼层数据.所有怪物.forEach((monster: Loose) => {
        if (is(monster, '王座守护者')) {
          monster.皇家守卫列表 = (monster.临时守卫索引列表 || []).map((index: number) => 楼层数据.所有怪物[index]).filter(Boolean);
          monster.激活的墓碑列表 = (monster.临时墓碑索引列表 || []).map((index: number) => 楼层数据.所有怪物[index]).filter(Boolean);
          delete monster.临时守卫索引列表;
          delete monster.临时墓碑索引列表;
        }
      });

      const allFloorItems = [...(楼层数据.所有计时器 || []), ...(地上物品实例映射.values() || [])];
      allFloorItems.forEach((item: Loose) => {
        if (is(item, '刷怪笼') && item.临时生成物标识列表) {
          item.自定义数据.set('当前生成物列表', item.临时生成物标识列表.map((id: unknown) => {
            if (typeof id === 'string' && id.startsWith('怪物_')) {
              const index = parseInt(id.split('_')[1]!);
              return 楼层数据.所有怪物[index] || null;
            }
            return 全局物品实例映射.get(id) || null;
          }).filter(Boolean));
          delete item.临时生成物标识列表;
        }
      });

      ports.log(`楼层 ${层号} 恢复完成`);
      return 楼层数据;
    } catch (e) {
      ports.error(`恢复楼层 ${层号} 失败:`, e);
      return null;
    }
  }

  return { 序列化楼层, 恢复楼层 };
}
