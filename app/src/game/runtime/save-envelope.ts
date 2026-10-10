import { 存档版本, 游戏版本 } from '../world/constants';
import type { WorldState } from '../world/state';
import type { SourceClassRegistry } from './class-registry';
import type { createFloorCodec } from './save-floors';
import type { createItemCellCodec } from './save-items-cells';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- the envelope is a source-shaped dynamic object.

/**
 * Integration phase P2 (PLAN.md): the main-game save envelope.
 * Ports source `保存游戏状态` (JS L55879), `恢复游戏状态` (L56148), `导出存档` (L57968) and
 * `导入存档` (L58012). Statement order, key order, `??`/`||` choices and try/catch scopes are
 * preserved. Audit packet: `t10-save-envelope-audit`. Item, cell, monster and floor records go
 * through the I3–I5 codecs; class identity goes through the session registry (K1/K2).
 *
 * Deviation SRC-45 also covers the editor recent list: `window[itemData.类名]` resolves only
 * `注册全局类` names through the registry.
 */

/** Page globals the envelope reads/writes that the world kernel does not own (UI, camera, editor). */
export interface SaveEnvelopeSession {
  hud模式: unknown;
  显示模式: unknown;
  当前相机X: unknown;
  当前相机Y: unknown;
  相机目标X: unknown;
  相机目标Y: unknown;
  相机显示边长: unknown;
  切换动画: unknown;
  编辑器状态: Loose; // { 模式, 笔刷模式, 笔刷形状, 笔刷半径, 当前选中 }
  编辑器工具栏模式: unknown;
  编辑器最近使用列表: unknown[];
  融合配方列表: Loose[];
  开发者模式: unknown;
  已初始化: number; // count of finished game starts
}

export type SaveEnvelopeState = WorldState & SaveEnvelopeSession;

export interface SaveEnvelopePorts {
  classes: Pick<SourceClassRegistry, 'lookup' | 'isA' | 'nameOf' | 'className'>;
  log(...args: unknown[]): void; // console.log
  warn(...args: unknown[]): void; // console.warn
  error(...args: unknown[]): void; // console.error
  notify(message: string, type: string): void; // 显示通知
  deepClone<T>(value: T): T; // deepClone (world/utils)
  now(): number; // Date.now()
  isoNow(): string; // new Date().toISOString()
  // Restore
  resetAll(): void; // 重置所有游戏状态 (world/reset.ts)
  initRandom(seed: unknown): void; // 初始化随机数生成器
  addLog(content: unknown, type: unknown): void; // 添加日志
  applyProfession(profession: unknown, fromStart: false): void; // 应用职业效果
  updateKillHint(update: { 内容: string }): void; // 击杀提示.更新
  createStatusEffect(type: unknown, color: unknown, icon: unknown, duration: unknown, remaining: unknown, source: unknown,
    target: unknown, strength: unknown): unknown; // new 状态效果(...)
  applyPermanentBuffs(): void; // 应用永久Buffs
  generateDungeon(): PromiseLike<unknown> | unknown; // await 生成地牢()
  updateCaveVision(): void; // 更新洞穴视野
  querySelector(selector: string): Loose; // document.querySelector (health/power bars)
  definitions(): { items: Loose[]; monsters: Loose[] }; // 获取所有可用的定义
  showMainMenu(): void; // 显示主菜单
  // Export / import
  createDownloadUrl(text: string): unknown; // URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  clickDownload(url: unknown, fileName: string): void; // temporary <a download> appended, clicked, removed
  revokeUrl(url: unknown): void; // URL.revokeObjectURL
  startGame(saveData: unknown): void; // 启动游戏(存档数据)
  initEquipment(): void; // 初始化装备系统
  initInventoryListeners(): void; // 初始化背包事件监听
  animationFrame(): void; // 动画帧()
}

type ItemCellCodec = Pick<ReturnType<typeof createItemCellCodec>, '序列化物品' | '恢复物品'>;
type FloorCodec = ReturnType<typeof createFloorCodec>;

export function createSaveEnvelope(state: SaveEnvelopeState, ports: SaveEnvelopePorts, items: ItemCellCodec, floors: FloorCodec) {
  const S = state as Loose;
  const { classes } = ports;
  const is = (value: unknown, name: string) => classes.isA(value, name);
  const { 序列化物品, 恢复物品 } = items;
  const { 序列化楼层, 恢复楼层 } = floors;

  /** Editor palette entry: `!(x instanceof 物品) && !(x instanceof 怪物)` marks a virtual tool. */
  const 编辑器条目 = (实例: Loose) => {
    const isVirtual = !is(实例, '物品') && !is(实例, '怪物');
    if (isVirtual) {
      return {
        isVirtual: true,
        名称: 实例.名称,
        类型: 实例.类型,
        图标: 实例.图标,
        绘制类型: 实例.绘制类型,
        类: 实例.类 === null || 实例.类 === undefined ? undefined : classes.className(实例.类),
      };
    } else if (is(实例, '怪物')) {
      return { isVirtual: false, 图鉴类型: '怪物', 类名: classes.nameOf(实例) };
    }
    return { isVirtual: false, 图鉴类型: '物品', 类名: classes.nameOf(实例) };
  };

  function 保存游戏状态(): string | null {
    ports.log('开始打包游戏状态...');
    try {
      const 全局物品标识映射 = new Map<unknown, unknown>();
      [...S.玩家背包.values(), ...S.玩家装备.values()].forEach((物品实例: Loose) => {
        if (物品实例) 全局物品标识映射.set(物品实例.唯一标识, 物品实例.唯一标识.toString());
      });
      S.当前出战宠物列表.forEach((pet: Loose) => {
        全局物品标识映射.set(pet.唯一标识, pet.唯一标识.toString());
      });
      const 当前楼层所有怪物 = S.所有地牢层.get(S.当前层数)?.所有怪物 || [];
      const 怪物索引映射 = new Map<unknown, number>();
      当前楼层所有怪物.forEach((怪物: unknown, 索引: number) => 怪物索引映射.set(怪物, 索引));

      const 序列化玩家背包 = Array.from(S.玩家背包.values()).map(物品 => 序列化物品(物品)).filter(物品数据 => 物品数据 != null);

      const 序列化玩家装备 = Array.from(S.玩家装备.entries() as Iterable<[unknown, Loose]>)
        .map(([槽位, 物品实例]) => 物品实例 ? { 槽位: 槽位, 唯一标识符串: 全局物品标识映射.get(物品实例.唯一标识) } : null)
        .filter(装备数据 => 装备数据 != null);

      const 序列化玩家状态 = S.玩家状态
        .map((状态实例: Loose) => {
          let 来源标识符串 = null;
          if (状态实例.来源 && 状态实例.来源.唯一标识) {
            来源标识符串 = 全局物品标识映射.get(状态实例.来源.唯一标识);
          }
          return {
            类型: 状态实例.类型,
            颜色: 状态实例.颜色,
            图标: 状态实例.图标,
            持续时间: 状态实例.持续时间,
            剩余回合: 状态实例.剩余回合,
            强度: 状态实例.强度,
            来源类名: 状态实例.来源 === null || 状态实例.来源 === undefined ? undefined : classes.nameOf(状态实例.来源),
            来源标识符串: 来源标识符串,
          };
        })
        .filter((状态数据: unknown) => 状态数据 != null);

      const 序列化激活卷轴 = Array.from(S.当前激活卷轴列表 as Iterable<Loose>)
        .map(卷轴实例 => 全局物品标识映射.get(卷轴实例.唯一标识))
        .filter(标识符串 => 标识符串 != null);

      const 当前楼层临时数据 = {
        地牢数组: S.地牢,
        房间列表: S.房间列表,
        上锁房间列表: S.上锁房间列表,
        已访问房间: S.已访问房间,
        房间地图: S.房间地图,
        门实例列表: S.门实例列表,
        所有怪物: S.所有怪物,
        所有计时器: S.所有计时器,
        玩家初始位置: S.玩家初始位置,
        玩家位置: S.玩家,
        当前天气效果: S.当前天气效果.length == 0 ? S.自定义全局设置.全局天气 : S.当前天气效果,
        已放置配方卷轴: S.所有地牢层.get(S.当前层数)?.已放置配方卷轴 || false,
        地牢生成方式: S.地牢生成方式,
        已揭示洞穴格子: ports.deepClone(S.已揭示洞穴格子),
      };

      const 序列化所有楼层数据: Loose = {};
      for (const [层号, 楼层数据] of S.所有地牢层.entries()) {
        if (层号 !== S.当前层数) 序列化所有楼层数据[层号] = 序列化楼层(层号, 楼层数据, 全局物品标识映射);
      }
      if (S.当前层数 !== null) {
        序列化所有楼层数据[S.当前层数] = 序列化楼层(S.当前层数, 当前楼层临时数据, 全局物品标识映射);
      }
      const 序列化所有传送门 = S.所有传送门.map((p: unknown) => 序列化物品(p)).filter(Boolean);

      const 当前生命值百分比 = parseFloat(S.玩家属性.当前生命值) || 100;
      const 当前能量值百分比 = parseFloat(S.玩家属性.当前能量值) || 100;

      let 编辑器状态数据: Loose = {};
      if (S.游戏状态 === '地图编辑器') {
        编辑器状态数据 = {
          玩家位置: { x: S.玩家.x, y: S.玩家.y },
          相机位置: { x: S.当前相机X, y: S.当前相机Y },
          模式: S.编辑器状态.模式,
          工具栏模式: S.编辑器工具栏模式,
          当前选中: null,
          笔刷设置: {
            模式: S.编辑器状态.笔刷模式,
            形状: S.编辑器状态.笔刷形状,
            半径: S.编辑器状态.笔刷半径,
          },
          扳手规则集: S.扳手规则集,
          最近使用列表: S.编辑器最近使用列表.map(编辑器条目),
        };
        if (S.编辑器状态.当前选中) 编辑器状态数据.当前选中 = 编辑器条目(S.编辑器状态.当前选中);
      }

      const 存档数据 = {
        版本: 存档版本,
        游戏版本: 游戏版本,
        保存时间: ports.isoNow(),
        当前游戏种子: S.当前游戏种子 || ports.now().toString(),
        玩家职业: S.玩家职业,
        所有传送门: 序列化所有传送门,
        游戏开始时间: S.游戏开始时间,
        红蓝开关状态: S.红蓝开关状态,
        绿紫开关状态: S.绿紫开关状态,
        自定义全局设置: { ...S.自定义全局设置, 全局天气: S.自定义全局设置.全局天气.length > 0 ? S.自定义全局设置.全局天气 : S.当前天气效果 },
        自定义游戏设置: S.自定义游戏设置,
        编辑器状态数据: 编辑器状态数据,
        地图标记: Object.fromEntries(Array.from(S.地图标记.entries() as Iterable<[unknown, unknown]>).map(([k, v]) => [k, v])),
        当前层数: S.当前层数,
        玩家: {
          x: S.玩家.x,
          y: S.玩家.y,
          属性: { ...S.玩家属性 },
          // The source literal lists `最大背包容量` twice (here and after 当前能量值百分比); same value, first position.
          最大背包容量: S.最大背包容量,
          背包: S.游戏状态 !== '地图编辑器' ? 序列化玩家背包 : [],
          装备: 序列化玩家装备,
          状态: 序列化玩家状态,
          当前生命值百分比: 当前生命值百分比,
          当前能量值百分比: 当前能量值百分比,
          最大装备槽数量: S.最大装备槽数量,
        },
        当前出战宠物列表: S.当前出战宠物列表.map((pet: unknown) => 序列化物品(pet)).filter(Boolean),
        教程: {
          阶段: S.教程阶段,
          最高阶段: S.最高教程阶段,
          是否教程层: S.是否为教程层,
        },
        UI: {
          hud模式: S.hud模式,
          显示模式: S.显示模式,
          激活卷轴列表: 序列化激活卷轴,
          日志历史: S.游戏状态 !== '地图编辑器' ? S.日志历史 : [],
          当前装备页: S.当前装备页,
        },
        游戏统计: {
          已击杀怪物数: S.已击杀怪物数,
          玩家总移动回合数: S.玩家总移动回合数,
          玩家总受到伤害: S.玩家总受到伤害,
        },
        所有地牢层数据: 序列化所有楼层数据,
        传送点列表: S.传送点列表.map((点: Loose) => ({ ...点 })),
        上次死亡地点: S.上次死亡地点 ? { ...S.上次死亡地点 } : null,
        永久Buffs: {
          ...S.永久Buffs,
          已获得效果: Array.from(S.永久Buffs.已获得效果 || []),
        },
        生存挑战激活: S.生存挑战激活,
        序列化生存挑战备份单元格: S.生存挑战备份单元格.map((备份: Loose) => ({
          x: 备份.x,
          y: 备份.y,
          类型: 备份.类型,
          背景类型: 备份.背景类型,
          墙壁: { ...备份.墙壁 },
          关联物品标识: 备份.关联物品 ? 全局物品标识映射.get(备份.关联物品.唯一标识) : null,
          关联怪物索引: 备份.关联怪物 ? 怪物索引映射.get(备份.关联怪物) : null,
          颜色索引: 备份.颜色索引,
          标识: 备份.标识 ? 备份.标识.toString() : null,
        })),
        配方信息: {
          程序生成配方列表: S.程序生成配方列表,
          已发现的程序生成配方: S.已发现的程序生成配方,
        },
      };
      const 序列化数据 = JSON.stringify(存档数据, null, 2);
      ports.log('游戏状态打包完成！');
      return 序列化数据;
    } catch (错误) {
      ports.error('打包游戏状态失败:', 错误);
      ports.notify('打包游戏状态失败！', '错误');
      return null;
    }
  }

  async function 恢复游戏状态(存档数据: Loose, 是否是创意关卡 = false): Promise<void> {
    if (存档数据.游戏版本 && 存档数据.游戏版本 > 游戏版本) {
      ports.notify(`存档版本 (${存档数据.游戏版本}) 高于当前游戏版本 (${游戏版本})，无法加载！`, '错误');
      return;
    }
    ports.log('开始恢复游戏状态...');
    if (!存档数据) {
      ports.error('无效的存档数据，无法恢复。');
      ports.notify('存档数据损坏，无法加载！', '错误');
      return;
    }
    ports.resetAll();
    try {
      S.当前层数 = 存档数据.当前层数 ?? 0;
      S.地图标记 = new Map(Object.entries(存档数据.地图标记 || {}).map(([k, v]) => [parseInt(k, 10), v]));
      S.游戏开始时间 = 存档数据.游戏开始时间 || ports.now();
      S.当前游戏种子 = 存档数据.当前游戏种子 || ports.now().toString();
      ports.initRandom(S.当前游戏种子);
      S.自定义全局设置 = 存档数据.自定义全局设置 || {
        初始生命值: 100,
        初始能量值: 100,
        初始背包容量: 12,
        玩家属性: { 移动步数: 1, 攻击加成: 0, 防御加成: 0 },
        胜利条件: { 回合数限制: 0, 伤害限制: 0, 生命下限: 0, 清除所有怪物: false, 死亡次数限制: 0 },
        全局天气: [],
        禁用传送菜单: false,
        诡魅天气怪物层级: 1,
        奖励物品层级: 1,
      };

      if (存档数据.作者设置_相机视野) {
        S.相机显示边长 = 存档数据.作者设置_相机视野;
        S.游戏设置.相机视野大小 = 存档数据.作者设置_相机视野;
        S.自定义全局设置.作者设置_相机视野 = 存档数据.作者设置_相机视野;
      }
      if (存档数据.作者设置_受伤击退 !== undefined) {
        S.游戏设置.受伤时击退 = 存档数据.作者设置_受伤击退;
        S.自定义全局设置.作者设置_受伤击退 = 存档数据.作者设置_受伤击退;
      }
      if (存档数据.强制动画模式 !== undefined) {
        S.切换动画 = 存档数据.强制动画模式;
        S.自定义全局设置.强制动画模式 = 存档数据.强制动画模式;
      }

      S.教程阶段 = 存档数据.教程?.阶段 ?? 0;
      S.玩家职业 = 存档数据.玩家职业 || null;
      S.最高教程阶段 = 存档数据.教程?.最高阶段 ?? 0;
      S.是否为教程层 = 存档数据.教程?.是否教程层 ?? false;
      S.hud模式 = 存档数据.UI?.hud模式 ?? '默认';
      S.显示模式 = 存档数据.UI?.显示模式 ?? '装备';
      S.日志历史 = 存档数据.UI?.日志历史 || [];
      S.最大装备槽数量 = 存档数据.玩家?.最大装备槽数量 ?? 8;
      S.红蓝开关状态 = 存档数据?.红蓝开关状态 ?? '红';
      S.绿紫开关状态 = 存档数据?.绿紫开关状态 ?? '绿';
      S.当前装备页 = 存档数据.UI?.当前装备页 ?? 0;
      S.上次死亡地点 = 存档数据.上次死亡地点 || null;
      S.程序生成配方列表 = 存档数据.配方信息?.程序生成配方列表 || [];
      S.已发现的程序生成配方 = 存档数据.配方信息?.已发现的程序生成配方 || [];
      S.自定义游戏设置 = 存档数据.自定义游戏设置 || {
        开启怪物等级: true, 开启药水增益怪物: true, 开启巡逻怪物: true, 开启红蓝砖块谜题: true,
        开启Boss战: true, 天气系统: '三层一次', 陷阱密度: '普通', 物品掉落率: 1.0,
        地牢初始大小: 100, 初始房间数量: 15, 洞穴开阔度: 55, 剔除死胡同: 0.20, 洞穴随机重生: true,
        禁用传送菜单: false, 极限模式: false,
        怪物强度系数: 1.0, 开启升级奖励: true,
      };
      S.已发现的程序生成配方.forEach((discoveredRecipe: Loose) => {
        if (!S.融合配方列表.some((r: Loose) => r.说明 === discoveredRecipe.说明)) {
          S.融合配方列表.push(discoveredRecipe);
        }
      });

      S.日志历史.forEach((log: Loose) => ports.addLog(log.内容, log.类型));

      const 全局物品实例映射 = new Map<unknown, Loose>();
      const 全局物品标识映射 = new Map<unknown, symbol>();

      S.当前天气效果 = null;

      // 1. 应用职业效果 (更新初始玩家属性)
      if (S.玩家职业) ports.applyProfession(S.玩家职业, false);

      if (是否是创意关卡) {
        // 创意关卡覆盖初始属性
        Object.assign(S.初始玩家属性, S.自定义全局设置.玩家属性);
        S.玩家属性 = { ...S.初始玩家属性 };
        S.玩家属性.最大生命值加成 = S.自定义全局设置.初始生命值 - 100;
        S.初始玩家属性.最大生命值加成 = S.自定义全局设置.初始生命值 - 100;
        S.当前天气效果 = S.自定义全局设置.全局天气;
        S.最大背包容量 = S.自定义全局设置.初始背包容量;
        S.玩家背包 = new Map();
        S.玩家装备 = new Map();
        S.玩家状态 = [];
        S.当前激活卷轴列表 = new Set();
      } else {
        // 普通存档
        S.最大背包容量 = 存档数据.玩家?.最大背包容量 ?? 12;
        S.已击杀怪物数 = 存档数据.游戏统计?.已击杀怪物数 ?? 0;
        S.玩家总移动回合数 = 存档数据.游戏统计?.玩家总移动回合数 ?? 0;
        S.玩家总受到伤害 = 存档数据.游戏统计?.玩家总受到伤害 ?? 0;
        ports.updateKillHint({ 内容: `已击杀怪物: ${S.已击杀怪物数}` });

        S.玩家背包 = new Map();
        if (存档数据.玩家?.背包) {
          存档数据.玩家.背包.forEach((物品数据: Loose) => {
            const 实例 = 恢复物品(物品数据, 全局物品标识映射);
            if (实例) {
              S.玩家背包.set(实例.唯一标识, 实例);
              全局物品实例映射.set(物品数据.唯一标识符串, 实例);
            }
          });
        }

        S.玩家装备 = new Map();
        if (存档数据.玩家?.装备) {
          存档数据.玩家.装备.forEach((装备数据: Loose) => {
            const 实例 = 全局物品实例映射.get(装备数据.唯一标识符串);
            if (实例) {
              实例.已装备 = true;
              实例.装备槽位 = 装备数据.槽位;
              S.玩家装备.set(实例.装备槽位, 实例);
            }
          });
        }

        S.玩家状态 = [];
        if (存档数据.玩家?.状态) {
          存档数据.玩家.状态.forEach((状态数据: Loose) => {
            let 来源实例 = null;
            if (状态数据.来源标识符串) 来源实例 = 全局物品实例映射.get(状态数据.来源标识符串);
            ports.createStatusEffect(状态数据.类型, 状态数据.颜色, 状态数据.图标, 状态数据.持续时间, 状态数据.剩余回合, 来源实例, null,
              状态数据.强度);
          });
        }

        S.当前激活卷轴列表 = new Set();
        if (存档数据.UI?.激活卷轴列表) {
          存档数据.UI.激活卷轴列表.forEach((标识符串: unknown) => {
            const 实例 = 全局物品实例映射.get(标识符串);
            if (is(实例, '卷轴类')) {
              S.当前激活卷轴列表.add(实例);
              实例.使用();
            }
          });
        }
      }

      // 2. 恢复并应用永久Buff (基于最新的初始玩家属性重新计算)
      if (存档数据.永久Buffs) {
        S.永久Buffs = { ...存档数据.永久Buffs };
        S.永久Buffs.已获得效果 = new Set(存档数据.永久Buffs.已获得效果 || []);
      } else {
        S.永久Buffs = { 已获得效果: new Set() };
      }
      ports.applyPermanentBuffs();

      // 3. 覆盖存档中的当前属性 (如当前生命值、能量值等可能在属性中的变动)
      if (!是否是创意关卡) Object.assign(S.玩家属性, 存档数据.玩家?.属性 || {});

      S.当前出战宠物列表 = [];
      if (存档数据.当前出战宠物列表) {
        存档数据.当前出战宠物列表.forEach((petData: Loose) => {
          const petInstance = 恢复物品(petData, 全局物品标识映射);
          if (petInstance) {
            S.当前出战宠物列表.push(petInstance);
            if (!全局物品实例映射.has(petData.唯一标识符串)) 全局物品实例映射.set(petData.唯一标识符串, petInstance);
          }
        });
      }

      S.所有地牢层 = new Map();
      if (存档数据.所有地牢层数据) {
        for (const [层号Str, 楼层存档] of Object.entries(存档数据.所有地牢层数据)) {
          const 层号 = parseInt(层号Str);
          if (!isNaN(层号) && 楼层存档) {
            const 恢复后楼层 = 恢复楼层(层号, 楼层存档, 全局物品实例映射, 全局物品标识映射);
            if (恢复后楼层) S.所有地牢层.set(层号, 恢复后楼层);
          }
        }
      }
      S.生存挑战激活 = 存档数据.生存挑战激活 || false;
      S.生存挑战备份单元格 = [];
      if (存档数据.序列化生存挑战备份单元格 && S.生存挑战激活) {
        const 当前楼层数据 = S.所有地牢层.get(S.当前层数);
        if (当前楼层数据) {
          存档数据.序列化生存挑战备份单元格.forEach((序列化备份: Loose) => {
            const 恢复的备份: Loose = {
              x: 序列化备份.x,
              y: 序列化备份.y,
              类型: 序列化备份.类型,
              背景类型: 序列化备份.背景类型,
              墙壁: { ...序列化备份.墙壁 },
              颜色索引: 序列化备份.颜色索引,
              标识: 序列化备份.标识 ? Symbol.for(序列化备份.标识.slice(7, -1)) : null,
              关联物品: null,
              关联怪物: null,
            };
            if (序列化备份.关联物品标识) 恢复的备份.关联物品 = 全局物品实例映射.get(序列化备份.关联物品标识) || null;
            if (序列化备份.关联怪物索引 !== null) 恢复的备份.关联怪物 = 当前楼层数据.所有怪物[序列化备份.关联怪物索引] || null;
            S.生存挑战备份单元格.push(恢复的备份);
          });
        }
      }

      S.传送点列表 = 存档数据.传送点列表 || [];
      if (S.所有地牢层.has(S.当前层数)) {
        const 当前楼层数据 = S.所有地牢层.get(S.当前层数);
        S.地牢 = 当前楼层数据.地牢数组;
        S.地牢大小 = S.地牢.length;
        S.房间列表 = 当前楼层数据.房间列表;
        S.上锁房间列表 = 当前楼层数据.上锁房间列表;
        S.已访问房间 = 当前楼层数据.已访问房间;
        S.房间地图 = 当前楼层数据.房间地图;
        S.门实例列表 = 当前楼层数据.门实例列表;
        S.所有怪物 = 当前楼层数据.所有怪物;
        S.所有计时器 = 当前楼层数据.所有计时器;
        S.玩家初始位置 = 当前楼层数据.玩家初始位置;
        S.当前天气效果 = 当前楼层数据.当前天气效果;
        S.地牢生成方式 = 当前楼层数据.地牢生成方式;
        S.已揭示洞穴格子 = 当前楼层数据.已揭示洞穴格子 || new Set();

        if (是否是创意关卡) {
          S.玩家.x = S.玩家初始位置.x;
          S.玩家.y = S.玩家初始位置.y;
        } else {
          S.玩家.x = 存档数据.玩家?.x ?? 当前楼层数据.玩家位置?.x ?? S.玩家初始位置.x;
          S.玩家.y = 存档数据.玩家?.y ?? 当前楼层数据.玩家位置?.y ?? S.玩家初始位置.y;
        }

        S.怪物状态表 = new WeakMap();
        S.所有怪物.forEach((怪物: Loose) => {
          const 怪物存档数据 = 存档数据.所有地牢层数据[S.当前层数]?.序列化怪物列表?.find((m: Loose) => 怪物.x === m.配置.x && 怪物.y === m.配置.y);
          if (怪物存档数据?.状态效果) {
            const 效果 = 怪物存档数据.状态效果;
            ports.createStatusEffect(效果.类型, 效果.颜色, 效果.图标, 效果.持续时间, 效果.剩余回合, null, 怪物, 效果.强度);
          }
        });
      } else {
        ports.warn(`存档中未找到当前层 ${S.当前层数} 的数据，将重新生成！`);
        S.房间列表 = [];
        S.上锁房间列表 = [];
        S.所有怪物 = [];
        S.所有计时器 = [];
        S.已访问房间 = new Set();
        S.门实例列表 = new Map();
        S.房间地图 = Array(S.地牢大小).fill(undefined).map(() => Array(S.地牢大小).fill(-1));
        await ports.generateDungeon();
        ports.updateCaveVision();

        S.玩家.x = S.玩家初始位置.x;
        S.玩家.y = S.玩家初始位置.y;
        if (S.房间列表.length > 0) S.已访问房间.add(S.房间列表[S.房间列表.findIndex((item: Loose) => item?.id == 0)].id);
      }

      const healthBar = ports.querySelector('.health-bar');
      const powerBar = ports.querySelector('.power-bar');

      if (是否是创意关卡) {
        if (healthBar) healthBar.style.width = '100%';
        if (powerBar) powerBar.style.width = `100%`;
      } else {
        const 保存的生命百分比 = 存档数据.玩家?.当前生命值百分比 ?? 100;
        const 保存的能量百分比 = 存档数据.玩家?.当前能量值百分比 ?? 100;
        if (healthBar) {
          healthBar.style.width = `${Math.max(0, Math.min(100, 保存的生命百分比))}%`;
          if (保存的生命百分比 <= 20) healthBar.classList.add('低数值警告');
          else healthBar.classList.remove('低数值警告');
        }
        if (powerBar) {
          powerBar.style.width = `${Math.max(0, Math.min(100, 保存的能量百分比))}%`;
          if (保存的能量百分比 <= 20) powerBar.classList.add('低数值警告');
          else powerBar.classList.remove('低数值警告');
        }
      }
      S.所有传送门 = [];
      if (存档数据.所有传送门) {
        存档数据.所有传送门.forEach((传送门数据: Loose) => {
          const 实例 = 全局物品实例映射.get(传送门数据.唯一标识符串);
          if (实例) S.所有传送门.push(实例);
        });
      }
      S.地牢大小 = S.地牢.length;

      if (存档数据.编辑器状态数据 && Object.keys(存档数据.编辑器状态数据).length > 0) {
        const 编辑 = 存档数据.编辑器状态数据;
        S.玩家.x = 编辑.玩家位置.x;
        S.玩家.y = 编辑.玩家位置.y;
        S.当前相机X = 编辑.相机位置.x;
        S.当前相机Y = 编辑.相机位置.y;
        S.相机目标X = S.当前相机X;
        S.相机目标Y = S.当前相机Y;
        S.编辑器状态.模式 = 编辑.模式;
        S.编辑器工具栏模式 = 编辑.工具栏模式;

        if (编辑.笔刷设置) {
          S.编辑器状态.笔刷模式 = 编辑.笔刷设置.模式;
          S.编辑器状态.笔刷形状 = 编辑.笔刷设置.形状;
          S.编辑器状态.笔刷半径 = 编辑.笔刷设置.半径;
        }

        if (编辑.当前选中) {
          const 选中数据 = 编辑.当前选中;
          if (选中数据.isVirtual) {
            S.编辑器状态.当前选中 = 选中数据;
          } else {
            const { items: 物品定义, monsters: 怪物定义 } = ports.definitions();
            const 集合 = 选中数据.图鉴类型 === '物品' ? 物品定义 : 怪物定义;
            const 定义 = 集合.find((def: Loose) => classes.className(def.类) === 选中数据.类名);
            if (定义) S.编辑器状态.当前选中 = new 定义.类({});
          }
        }

        S.扳手规则集 = 编辑.扳手规则集 || { '1': [], '2': [], '3': [] };
        S.编辑器最近使用列表 = (编辑.最近使用列表 || []).map((itemData: Loose) => {
          if (itemData.isVirtual) return itemData;
          const definition = classes.lookup(itemData.类名);
          return definition ? new definition({ 玩家放置: true }) : null;
        }).filter(Boolean);
      }

      ports.log('游戏状态恢复完成！');
    } catch (错误) {
      ports.error('恢复游戏状态时发生严重错误:', 错误);
      ports.notify('加载存档时发生严重错误，将开始新游戏。', '错误');
      ports.showMainMenu();
    }
  }

  function 导出存档(): void {
    if (S.是否为教程层) {
      ports.notify('不支持在教程关卡导出存档', '错误');
      return;
    }
    if (S.游戏状态 === '图鉴') {
      ports.notify('不支持在图鉴导出存档', '错误');
      return;
    }
    if (S.是否是自定义关卡) {
      ports.notify('不支持在创意关卡导出存档', '错误');
      return;
    }
    if (S.游戏状态 === '地图编辑器' || S.游戏状态 === '编辑器游玩') {
      ports.notify('不支持在地图编辑器导出存档', '错误');
      return;
    }
    if (S.游戏状态 === '地图编辑器' || S.游戏状态 === '死亡界面' || S.游戏状态 === '图鉴选择') return;
    S.玩家属性.允许移动 -= 1;

    const 存档字符串 = 保存游戏状态();
    S.玩家属性.允许移动 += 1;
    if (存档字符串) {
      const 下载链接 = ports.createDownloadUrl(存档字符串);
      const 时间戳 = ports.isoNow().replace(/[:.]/g, '-');
      ports.clickDownload(下载链接, `中文地牢存档_${时间戳}.json`);
      ports.revokeUrl(下载链接);
      ports.notify('存档已导出为文件。', '成功');
    } else {
      ports.notify('导出存档失败！', '错误');
    }
  }

  function 导入存档(存档字符串: string): void {
    try {
      const 存档数据 = JSON.parse(存档字符串);
      if (!S.开发者模式) {
        if (存档数据.isPublished) {
          ports.notify('无法通过此按钮加载已发布的创意关卡！', '错误');
          return;
        }
        if (Object.keys(存档数据.编辑器状态数据).length !== 0) {
          ports.notify('无法通过此按钮加载地图编辑器文件！', '错误');
          return;
        }
      }

      if (存档数据 && 存档数据.版本) {
        if (存档数据.版本 === 存档版本) {
          ports.startGame(存档数据);
          if (S.已初始化 > 0) ports.initEquipment();
          if (S.已初始化 > 0) ports.initInventoryListeners();
          if (S.已初始化 > 0) ports.animationFrame();
        } else {
          ports.notify('存档版本不匹配！', '错误');
        }
      } else {
        ports.notify('存档数据无效或缺少版本信息！', '错误');
      }
    } catch (错误) {
      ports.error('导入存档失败:', 错误);
      ports.notify('导入存档失败，数据格式错误或损坏！', '错误');
    }
  }

  return { 保存游戏状态, 恢复游戏状态, 导出存档, 导入存档 };
}
