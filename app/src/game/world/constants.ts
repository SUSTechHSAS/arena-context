/**
 * Main-game (ChineseDungeon.html) world constants and default tunables.
 * Values, key order and duplicates (e.g. 深夜 twice) are part of the source contract:
 * weighted weather draws and Object.values() iteration depend on them.
 * Plain (unfrozen) objects: freezing would change property descriptors compared by the
 * oracle; immutability is enforced by readonly types instead.
 * Tunables declared with `let` in the source are exported as DEFAULT_* and must be
 * copied into a session (see world/state.ts), never mutated here.
 */
export const 单元格类型 = ({
  墙壁: 0, 房间: 1, 走廊: 2, 门: 3, 上锁的门: 4, 物品: 5, 楼梯下楼: 6, 楼梯上楼: 7, 怪物: 8,
} as const);
export type CellKind = (typeof 单元格类型)[keyof typeof 单元格类型];

export const 怪物状态 = ({ 休眠: 0, 活跃: 1, 攻击: 2 } as const);

/** Lock/item colour table. Its length is the "no colour" index used by cells. */
export const 颜色表: readonly string[] = (['#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#FF0000', '#800080']);
export const 颜色名表: readonly string[] = (['绿', '蓝', '黄', '品红', '红', '紫']);

export const 效果颜色编号映射: readonly string[] = ([
  '#ff0000', '#00ff00', '#2196F3', '#FF9800', '#808080', '#9C27B0', '#008000', '#888888', '#8FBC8F',
  '#FFEB3B', '#CC5500', '#FFD700', '#8A2BE2', '#A0522D', '#2196F3', '#CD5C5C', '#333333',
]);
export const 效果名称编号映射 = ({
  治疗: 0, 能量: 1, 神龟: 2, 狂暴: 3, 隐身: 4, 透视: 5, 中毒: 6, 缓慢: 7, 腐蚀: 8,
  眩晕: 9, 火焰: 10, 充能: 11, 恐惧: 12, 牵制: 13, 冻结: 14, 抗火: 15, 失明: 16,
} as const);

export const 环境类型 = ({
  水: '水', 草地: '草地', 冰: '冰', 岩浆: '岩浆', 血冰: '血冰', 血水: '血水', 药水水域: '药水水域',
} as const);
export type EnvironmentKind = (typeof 环境类型)[keyof typeof 环境类型];

export const 房间尺寸范围: readonly [number, number] = [7, 10];
export const 最大堆叠数 = 64;
export const 最大怪物数 = 5;
export const 存档版本 = 'v1';
export const 游戏版本 = 1534;
export const 所有天气列表: readonly string[] = (['雷暴', '诡魅', '大风', '严寒', '深夜', '深夜']);
export const 大风吹动概率 = 0.3;
export const 怪物移动动画时长 = 300;
export const 调试序列: readonly string[] = (['上', '上', '下', '下', '左', '右', '左', '右']);
export const 数据完整性密钥 = 'f_SECRET_KEY_FOR_CHINESE_DUNGEON';
export const Q字形图案: readonly string[] = ([' XXXX ', 'X    X', 'X    X', 'X    X', 'X  XX ', ' XXX X']);

/** Source `let` tunables: initial values only. */
export const DEFAULT_单元格大小 = 30;
export const DEFAULT_最大房间数 = 15;
export const DEFAULT_相机显示边长 = 15;
export const DEFAULT_地牢大小 = 100;
