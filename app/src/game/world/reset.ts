import { createPlayerAttributes, createRoomMap, type PlayerAttributes, type WorldState } from './state';

/** Objects the reset touches through source duck-typed methods. */
interface ResettableMonster { 绘制血条?: (force: boolean) => unknown }
interface RemovableStatus { 移除状态(): unknown }
interface EquippedScroll { 卸下(): unknown }

/** Side effects the source performs on UI/runtime objects outside the session state. */
export interface ResetPorts {
  /** Source: 怪物动画状态.delete(monster) — animation state is owned by the renderer. */
  forgetMonsterAnimation(monster: unknown): void;
  /** Source: replaces the editor's UI state object with its defaults. */
  resetEditorState(): void;
  /** Source: destroys each truthy victory-condition hint element and nulls its slot. */
  destroyVictoryHints(): void;
  /** Source: clears the inventory bar, every equipment slot and the log panel (in that order). */
  clearPanels(): void;
  /** Source: 怪物追踪提示.更新 then 击杀提示.更新 with the given text. */
  updateHint(hint: '怪物追踪提示' | '击杀提示', text: string): void;
  /** Source (developer mode only): 尝试收集物品(new 调试工具({}), true); errors are swallowed. */
  grantDebugTool(): void;
}

/**
 * Source `重置所有游戏状态` applied to a session. Statement order is preserved because
 * monster, status and scroll callbacks may observe the partially reset state.
 * Source quirks preserved on purpose (see docs/task-10/DEVIATIONS.md):
 * - the reset 自定义全局设置 shape differs from the initial declaration
 *   (死亡次数限制 moves under 玩家属性, 胜利条件 loses it, 禁用大地图 is dropped);
 * - 玩家属性 becomes a SHALLOW copy of 初始玩家属性, so both share 已获得神龛效果;
 * - 当前生命值/当前能量值 are first written from the OLD settings onto the old attribute object.
 * 地牢生成方式, 当前关卡存档数据字符串 and 自定义游戏设置 are intentionally not reset by the source.
 */
export function resetAllGameState(state: WorldState, ports: ResetPorts): void {
  state.融合区物品 = [null, null, null, null];
  state.融合结果 = null;
  state.传送点列表 = [];
  state.所有怪物.forEach(monster => {
    const candidate = monster as ResettableMonster;
    if (candidate.绘制血条) candidate.绘制血条(true);
  });
  state.所有怪物.forEach(monster => { ports.forgetMonsterAnimation(monster); });
  state.地牢 = [];
  state.房间列表 = [];
  state.上锁房间列表 = [];
  state.宠物状态表 = new WeakMap();

  state.游戏开始时间 = null;
  state.上次死亡地点 = null;
  state.调试无限生命 = false;
  state.调试无限能量 = false;
  state.玩家仆从列表 = [];
  state.所有怪物 = [];
  state.玩家属性.当前生命值 = state.自定义全局设置.初始生命值;
  state.玩家属性.当前能量值 = state.自定义全局设置.初始能量值;
  state.已揭示洞穴格子 = new Set();
  state.所有计时器 = [];
  state.当前天气效果 = [];
  state.玩家死亡次数 = 0;
  state.红蓝开关状态 = '红';
  state.绿紫开关状态 = '绿';
  state.自定义全局设置 = {
    初始生命值: 100, 初始能量值: 100, 初始背包容量: 12,
    玩家属性: { 移动步数: 1, 攻击加成: 0, 防御加成: 0, 死亡次数限制: 0 },
    胜利条件: { 回合数限制: 0, 伤害限制: 0, 生命下限: 0, 清除所有怪物: false },
    全局天气: [], 禁用传送菜单: false, 诡魅天气怪物层级: 1, 奖励物品层级: 1,
  } as unknown as WorldState['自定义全局设置'];
  state.初始玩家属性 = createPlayerAttributes() as PlayerAttributes;
  ports.resetEditorState();
  state.玩家背包 = new Map();
  state.玩家装备 = new Map();
  state.门实例列表 = new Map();
  state.已访问房间 = new Set();
  state.房间地图 = createRoomMap(state.地牢大小);
  state.玩家初始位置 = { x: 0, y: 0 };
  state.玩家.x = 0;
  state.玩家.y = 0;
  state.当前层数 = 0;

  state.永久Buffs = { 已获得效果: new Set() };
  state.玩家状态.forEach(status => { (status as RemovableStatus).移除状态(); });
  if (state.当前激活卷轴列表.size > 0) {
    const scrolls = state.当前激活卷轴列表;
    scrolls.forEach(scroll => { scrolls.delete(scroll); (scroll as EquippedScroll).卸下(); });
  }
  state.是否是自定义关卡 = false;
  state.玩家属性 = { ...state.初始玩家属性 };
  state.玩家状态 = [];
  state.移动历史 = [];
  state.已击杀怪物数 = 0;
  state.NPC互动中 = false;
  state.当前NPC = null;
  state.死亡界面已显示 = false;
  state.教程阶段 = 0;
  state.最高教程阶段 = 0;
  state.是否为教程层 = false;
  state.日志历史 = [];
  state.最大背包容量 = 12;
  state.玩家总移动回合数 = 0;
  state.玩家总受到伤害 = 0;
  ports.destroyVictoryHints();
  ports.clearPanels();
  state.玩家属性.当前生命值 = state.自定义全局设置.初始生命值;
  state.玩家属性.当前能量值 = state.自定义全局设置.初始能量值;
  ports.updateHint('怪物追踪提示', '追踪怪物：0');
  ports.updateHint('击杀提示', '已击杀怪物：0');
  if (state.开发者模式) {
    try { ports.grantDebugTool(); } catch { /* source swallows debug-tool failures */ }
  }
}
