import { DEFAULT_地牢大小, DEFAULT_最大房间数 } from './constants';
import type { GameCell } from './cell';

/**
 * Session-owned replacement for the main game's top-level `let` globals that carry
 * gameplay/persisted state. Keys keep the source names so save/restore, scripting and
 * differential tests map 1:1. Each call returns fresh, unshared containers.
 *
 * Deliberately excluded (UI/runtime-only, owned by the React/input/render layers):
 * canvas/DOM handles, touch/swipe/pinch and movement timers, animation queues, sound,
 * camera interpolation, editor UI state, socket handles and notification queues.
 * `prng` is not stored here: the session owns an explicit random stream instead.
 */

export interface Point { x: number; y: number }

export function createRoomMap(size: number): number[][] {
  // Source: Array(地牢大小).fill().map(() => Array(地牢大小).fill(-1)); invalid sizes throw RangeError.
  return Array(size).fill(undefined).map(() => Array(size).fill(-1) as number[]);
}

export function createPlayerAttributes() {
  return {
    移动步数: 1, 当前生命值: 100, 当前能量值: 100, 攻击加成: 0, 防御加成: 0, 掉落倍率: 1, 透视: false,
    允许移动: 0, 能挖掘墙壁: false, 最大生命值加成: 0, 怪物反伤: false, 挑战波数增加: 0, 随机掉落: false,
    初始能量加成: 0, 耐久消耗减免: 0, 能量流失: 0, 商店价格倍率: 1, 已获得神龛效果: [] as unknown[],
    暴击率: 0, 闪避率: 0, 能量自然恢复: 0, 生命自然恢复: 0, 视野加成: 0, 幸运值: 0,
  };
}
export type PlayerAttributes = ReturnType<typeof createPlayerAttributes> & Record<string, unknown>;

export function createDefaultSettings() {
  return {
    热键绑定: {
      '等待': ' ', '装备槽1': '1', '装备槽2': '2', '装备槽3': '3', '装备槽4': '4',
      '装备槽5': '5', '装备槽6': '6', '装备槽7': '7', '切换HUD': 'q',
      '背包': 'e', '日志': 'g', '互动': 'f', '导出存档': 'z',
      '传送菜单': 't', '装备页上一页': 'j', '装备页下一页': 'k', '自杀': 'u',
      '重置关卡': 'r', '配方书': 'c', '编辑器游玩': 'h', '编辑器删除工具': 'b',
      '编辑器撤销': 'z', '编辑器重做': 'y', '编辑器确认': 'Enter', '大地图': 'm',
    } as Record<string, string>,
    热键绑定描述: {
      '等待': '等待/休息', '装备槽1': '使用装备1', '装备槽2': '使用装备2', '装备槽3': '使用装备3', '装备槽4': '使用装备4',
      '装备槽5': '使用装备5', '装备槽6': '使用装备6', '装备槽7': '使用装备7', '切换HUD': '切换HUD',
      '背包': '打开/关闭背包', '日志': '打开/关闭日志', '互动': '互动/攻击', '导出存档': '导出存档',
      '传送菜单': '传送菜单', '装备页上一页': '装备页(上)', '装备页下一页': '装备页(下)', '自杀': '自杀',
      '重置关卡': '重置关卡', '配方书': '打开配方书', '编辑器游玩': '开始游玩', '编辑器删除工具': '选择删除工具',
      '编辑器撤销': '撤销 (Ctrl/Cmd)', '编辑器重做': '重做 (Ctrl/Cmd+Shift)', '编辑器确认': '确认/应用',
      '大地图': '打开/关闭大地图',
    } as Record<string, string>,
    方向键大小: 13, 显示方向键: true, 禁用点击移动: false, 手机模式: false, 动画模式: false,
    emoji风格: 'microsoft-3D-fluent', emojiCDN是否可用: true, 命令行模式: false, 文本模式: false,
    画面增强: false, 物品光晕: true, 相机视野大小: 15, 移动速度: 100, 小地图大小: 150, 受伤时击退: false,
    自动移动可打断: true, 开启音效: false, 显示伤害文本: true,
  };
}
export type GameSettings = ReturnType<typeof createDefaultSettings>;

export function createCustomGlobalSettings() {
  return {
    初始生命值: 100, 初始能量值: 100, 初始背包容量: 12,
    玩家属性: { 移动步数: 1, 攻击加成: 0, 防御加成: 0 },
    胜利条件: { 回合数限制: 0, 伤害限制: 0, 生命下限: 0, 清除所有怪物: false, 死亡次数限制: 0 },
    全局天气: [] as string[], 禁用传送菜单: false, 禁用大地图: false, 诡魅天气怪物层级: 1, 奖励物品层级: 1,
  };
}

export function createCustomGameSettings() {
  return {
    开启怪物等级: true, 开启药水增益怪物: true, 开启巡逻怪物: true, 开启红蓝砖块谜题: true,
    开启Boss战: true, 天气系统: '三层一次', 陷阱密度: '普通', 物品掉落率: 1.0,
    地牢初始大小: 100, 初始房间数量: 15, 洞穴开阔度: 55, 剔除死胡同: 0.20, 洞穴随机重生: true,
    禁用传送菜单: false, 极限模式: false, 怪物强度系数: 1.0, 开启升级奖励: true,
  };
}

/** Item/monster/room shapes are owned by their contract modules; the kernel stays generic. */
export function createWorldState<Item = unknown, Monster = unknown, Room = unknown>() {
  const 地牢大小 = DEFAULT_地牢大小;
  return {
    // Map and floors
    地牢: [] as GameCell[][], 房间列表: [] as Room[], 房间地图: createRoomMap(地牢大小), 上锁房间列表: [] as Room[],
    已访问房间: new Set<number>(), 门实例列表: new Map<symbol, unknown>(), 所有传送门: [] as unknown[],
    传送点列表: [] as unknown[], 玩家距离图: [] as number[][], 已揭示洞穴格子: new Set<string>(),
    地牢生成方式: 'default' as string, 当前层数: 0, 所有地牢层: new Map<number, unknown>(), 地牢大小,
    最大房间数: DEFAULT_最大房间数, 光源地图: new Set<string>(), 地图标记: new Map<string, unknown>(),
    推箱子任务列表: [] as unknown[], 怪物引入计划: new Map<unknown, unknown>(),
    // Player
    玩家: { x: 0, y: 0 } as Point & Record<string, unknown>, 玩家初始位置: { x: 0, y: 0 } as Point,
    玩家背包: new Map<symbol, Item>(), 玩家装备: new Map<number | boolean | null, Item | null>(), 最大背包容量: 12,
    玩家状态: [] as unknown[], 玩家职业: null as unknown, 玩家属性: createPlayerAttributes() as PlayerAttributes,
    初始玩家属性: createPlayerAttributes() as PlayerAttributes, 永久Buffs: { 已获得效果: new Set<unknown>() },
    玩家死亡次数: 0, 玩家总移动回合数: 0, 玩家总受到伤害: 0, 已击杀怪物数: 0,
    当前装备页: 0, 最大装备页: 3, 最大装备槽数量: 24, 装备栏每页装备数: 7,
    当前出战宠物列表: [] as Monster[], 玩家仆从列表: [] as Monster[], 已使用存档点: false, 上次死亡地点: null as unknown,
    // Turn, world and puzzle state
    所有怪物: [] as Monster[], 所有计时器: [] as { 唯一标识: symbol | null }[], 当前天气效果: [] as string[],
    红蓝开关状态: '红' as string, 绿紫开关状态: '绿' as string, 跳过怪物回合剩余次数: 0,
    当前激活卷轴列表: new Set<unknown>(), 移动历史: [] as unknown[], 随机数状态: 0, 当前游戏种子: null as unknown,
    游戏状态: '主菜单' as string, 是否是自定义关卡: false, 是否为教程层: false, 教程阶段: 0, 最高教程阶段: 0,
    生存挑战激活: false, 生存挑战备份单元格: [] as unknown[], 扳手规则集: { '1': [], '2': [], '3': [] } as Record<string, unknown[]>,
    当前扳手快捷槽: '1', 上次放置的传送带: null as unknown, 上次放置的箭头: null as unknown,
    上次放置的开关脉冲器: null as unknown, 上次放置的隐形毒气陷阱: null as unknown,
    怪物状态表: new WeakMap<object, unknown>(), 宠物状态表: new WeakMap<object, unknown>(), 跟踪玩家怪物数: 0,
    游戏事件日志: [] as unknown[], 游戏开始时间: null as number | null, 日志历史: [] as unknown[],
    // Fusion and procedural recipes
    融合区物品: [null, null, null, null] as (Item | null)[], 融合结果: null as unknown, fusionGoldQuantities: [0, 0, 0, 0],
    当前匹配的融合配方: null as unknown, 已发现的程序生成配方: [] as unknown[], 程序生成配方列表: [] as unknown[],
    // Level identity and pools
    当前关卡ID: null as unknown, 当前加载的关卡数据缓存: null as unknown, 当前关卡存档数据字符串: null as string | null,
    物品池: undefined as unknown, 怪物池: undefined as unknown,
    // Flags
    彩蛋1触发: undefined as boolean | undefined, 彩蛋2触发: undefined as boolean | undefined, 彩蛋3触发: false,
    死亡界面已显示: false, 玩家正在传送: false, 玩家正在钩索: false, 玩家正在放置障碍物: false, 玩家正在休息: false,
    调试无限生命: false, 调试无限能量: false, 开发者模式: false,
    // Settings
    游戏设置: createDefaultSettings(), 自定义全局设置: createCustomGlobalSettings(), 自定义游戏设置: createCustomGameSettings(),
    创意工坊已启用: false, 中文模式: false, 命令行模式开启: false,
  };
}
export type WorldState<Item = unknown, Monster = unknown, Room = unknown> = ReturnType<typeof createWorldState<Item, Monster, Room>>;
