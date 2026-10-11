import { FUSION_BUFF_TYPES as 融合Buff类型 } from '../buffs';
import { MATERIALS as 材质 } from '../item-core';
import { 单元格类型, 怪物状态, 环境类型 } from '../world/constants';
import type { MoveSession } from '../world/move';
import type { WorldState } from '../world/state';
import type { SourceClassRegistry } from './class-registry';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- monsters, items and cells are source-shaped dynamic objects.

/**
 * Integration phase P3 (PLAN.md): turn actors around the ported turn loop (`world/turn.ts`) and
 * movement (`world/move.ts`). Ports source `检查移动可行性` (JS L40041), `获取实际移动步数`
 * (L39600), `更新武器冷却` (L42761), `处理宠物着陆效果` (L39136), `伤害玩家` (L42585) and
 * `处理怪物回合` (L42912). Statement order, `prng` draw order, `||`/`??` choices and the
 * early `return`s inside `forEach` callbacks are preserved. Audit packet:
 * `t10-turn-movement-audit`. Class checks go through the session registry (K1/K2); monster,
 * pet and item behavior stays with the packet classes (their methods are called as in the source).
 *
 * Source defects kept on purpose, pending owner review:
 * - SRC-49: `处理宠物着陆效果` reads the undefined global `效果颜色编号编号映射` (a typo for
 *   `效果颜色编号映射`). A pet landing on fire or poison therefore throws a ReferenceError
 *   before any status effect is created.
 * - SRC-50: `伤害玩家` only adds to `玩家总受到伤害` when the UI setting `自动移动可打断` is on.
 */
export interface TurnActorPorts {
  classes: Pick<SourceClassRegistry, 'isA'>;
  random(): number; // prng
  /** Source `快速直线检查(sx, sy, ex, ey, 最大距离, 无视物品)` (packet `t10-path-primitives`). */
  quickLineCheck(sx: number, sy: number, ex: number, ey: number, max: number, ignoreItems?: boolean): boolean;
  addLog(message: string, type: string): void; // 添加日志
  floatText(text: string, x: number, y: number, color: string): void; // 显示浮动文字
  notify(message: string, type: string, flag?: boolean): void; // 显示通知
  createStatusEffect(type: unknown, color: unknown, icon: unknown, duration: unknown, remaining: unknown, source: unknown,
    target: unknown, strength?: unknown): unknown; // new 状态效果(...)
  updateEquipmentDisplay(): void; // 更新装备显示
  destroyItem(id: unknown, flag: true): void; // 处理销毁物品
  updateVictoryDisplay(): void; // 更新胜利条件显示
  playerLanding(oldX: number, oldY: number, newX: number, newY: number): unknown; // 处理玩家着陆效果 (world/landing.ts)
  updateViewport(): void; // 更新视口
  playerDeath(source: unknown): void; // 玩家死亡
  restoreChallengeArea(): void; // 恢复挑战区域
  triggerPotionWater(entity: unknown, cell: unknown): void; // 触发药水水域效果 (world/hazards.ts)
  /** Source `怪物动画状态` (renderer-owned WeakMap); `undefined` models `typeof … === 'undefined'`. */
  monsterAnimations(): { delete(monster: unknown): unknown } | undefined;
  /** Source `怪物追踪提示.容器元素.querySelector('.hud-label')`. */
  trackerLabel(): { classList: { add(name: string): void; remove(name: string): void } };
  updateTracker(update: { 内容: string }): void; // 怪物追踪提示.更新
}

export type TurnActorSession = Pick<MoveSession, 'moveQueue' | 'isAutoMoving'>;

const 方向列表 = () => [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];

export function createTurnActors(state: WorldState, session: TurnActorSession, ports: TurnActorPorts) {
  const S = state as Loose;
  const is = (value: unknown, name: string) => ports.classes.isA(value, name);
  /** Source `Array.from({ length: 装备栏每页装备数 }, (_, i) => 玩家装备.get(当前装备页 * 装备栏每页装备数 + i + 1))`. */
  const 当前页装备 = (): Loose[] => Array.from({ length: S.装备栏每页装备数 }, (_, i) => S.玩家装备.get(S.当前装备页 * S.装备栏每页装备数 + i + 1));

  function 检查移动可行性(fromX: number, fromY: number, toX: number, toY: number, 未解锁房间视作障碍: unknown = false, 无视物品 = false): boolean {
    if (toX < 0 || toX >= S.地牢大小 || toY < 0 || toY >= S.地牢大小) return false;
    if (fromX < 0 || fromX >= S.地牢大小 || fromY < 0 || fromY >= S.地牢大小) return false;
    const 目标单元格实例 = S.地牢[toY]?.[toX];
    if (目标单元格实例?.关联物品 && !无视物品) {
      if (is(目标单元格实例.关联物品, '红砖块') && S.红蓝开关状态 === '红') return false;
      if (is(目标单元格实例.关联物品, '蓝砖块') && S.红蓝开关状态 === '蓝') return false;
      if (is(目标单元格实例.关联物品, '绿砖块') && S.绿紫开关状态 === '绿') return false;
      if (is(目标单元格实例.关联物品, '紫砖块') && S.绿紫开关状态 === '紫') return false;
      if (is(目标单元格实例.关联物品, '栅栏')) return false;
    }
    const dx = toX - fromX;
    const dy = toY - fromY;
    const 方向 = {
      dx: dx !== 0 ? (dx > 0 ? 1 : -1) : 0,
      dy: dy !== 0 ? (dy > 0 ? 1 : -1) : 0,
    };
    if (Math.abs(dx) == 0 || Math.abs(dy) == 0) {
      return ports.quickLineCheck(fromX, fromY, toX, toY, Math.max(Math.abs(dx), Math.abs(dy)), 无视物品);
    }
    let currentX = fromX;
    let currentY = fromY;
    while (currentX !== toX || currentY !== toY) {
      currentX += 方向.dx;
      currentY += 方向.dy;
      const 当前单元格 = S.地牢[currentY][currentX];
      const 前一单元格 = S.地牢[currentY - 方向.dy][currentX - 方向.dx];
      const 垂直移动 = 方向.dy !== 0;
      if (垂直移动) {
        if (前一单元格.墙壁[方向.dy > 0 ? '下' : '上'] || 当前单元格.墙壁[方向.dy > 0 ? '上' : '下']) return false;
      } else {
        if (前一单元格.墙壁[方向.dx > 0 ? '右' : '左'] || 当前单元格.墙壁[方向.dx > 0 ? '左' : '右']) return false;
      }
      if ((当前单元格.关联物品?.类型 === '开关砖' && 当前单元格.关联物品?.阻碍怪物) && !无视物品) return false;
      if (is(当前单元格.关联物品, '栅栏') && !无视物品) return false;
      if ([单元格类型.墙壁, 单元格类型.上锁的门].includes(当前单元格.背景类型)) return false;
      if (S.房间地图[currentY][currentX] !== 0 && S.房间地图[currentY][currentX] !== -1 && !S.已访问房间.has(S.房间地图[currentY][currentX]) &&
        未解锁房间视作障碍) return false;
    }
    return true;
  }

  function 获取实际移动步数(): number {
    const 缓慢状态 = S.玩家状态.some((s: Loose) => s.类型 === '缓慢');
    if (缓慢状态) return 1;

    let 步数 = S.玩家属性.移动步数;

    const 玩家所在单元格 = S.地牢[S.玩家.y]?.[S.玩家.x];
    if (玩家所在单元格?.环境 === 环境类型.水) { // 玩家碰到血水就会变成水，故不用考虑血水
      const 水鞋装备 = 当前页装备().find(item => is(item, '水鞋'));
      if (水鞋装备) 步数 += 水鞋装备.强化 ? 2 : 1;
    }

    当前页装备().forEach(item => {
      if (is(item, '马') && !item.自定义数据.get('休眠中')) 步数 += 1;
    });

    return 步数;
  }

  function 更新武器冷却(): void {
    const 时间加速 = S.当前激活卷轴列表.has(Array.from(S.当前激活卷轴列表 as Iterable<unknown>).find(item => is(item, '时间卷轴')));
    const 冷却减少量 = 时间加速 ? 2 : 1;

    S.玩家背包.forEach((item: Loose) => {
      if ((item.类型 === '武器' || is(item, '钩索')) && item.自定义数据.get('冷却剩余') > 0) {
        item.自定义数据.set('冷却剩余', Math.max(0, item.自定义数据.get('冷却剩余') - 冷却减少量));
      }
    });
    ports.updateEquipmentDisplay();
  }

  function 处理宠物着陆效果(宠物: Loose, _旧X: unknown, _旧Y: unknown, 新X: number, 新Y: number): void {
    const 目标单元格 = S.地牢[新Y]?.[新X];
    if (目标单元格 && 目标单元格.关联物品) {
      const 物品 = 目标单元格.关联物品;
      if (is(物品, '蛛网') || is(物品, '渔网陷阱')) {
        ports.createStatusEffect('牵制', '#FFFFFF', '网', 物品.自定义数据.get('牵制回合'), null, null, 宠物);
        ports.addLog(`${宠物.名称} 被 ${物品.名称} 缠住了！`, '警告');
        物品.移除自身();
      } else if (is(物品, '火焰物品') || is(物品, '毒液物品')) {
        // SRC-49: the source evaluates `效果颜色编号编号映射[…]` (undefined global) as the effect color argument.
        throw new ReferenceError('效果颜色编号编号映射 is not defined');
      } else if (is(物品, '药水类') && 物品.是否被丢弃) {
        物品.当被收集(宠物);
      }
    }
    ports.triggerPotionWater(宠物, 目标单元格);
  }

  function 伤害玩家(原始攻击力: number, 伤害来源: Loose = null): void {
    if (S.调试无限生命) return;
    if (is(S.地牢[S.玩家.y]?.[S.玩家.x]?.关联物品, '烟雾')) {
      ports.addLog('烟雾保护了你！', '成功');
      return;
    }
    const hasFireResistance = S.玩家状态.some((s: Loose) => s.类型 === '抗火');
    if (hasFireResistance && (伤害来源 === '火焰' || 伤害来源 === '岩浆')) return;

    let 最终攻击力 = 原始攻击力;
    const 伤害来源文本 = is(伤害来源, '怪物') ? 伤害来源.类型 : 伤害来源 || '未知来源';
    let 闪避成功 = false;

    if (ports.random() < (S.玩家属性.闪避率 || 0)) {
      ports.floatText('闪避', S.玩家.x, S.玩家.y, '#4caf50');
      ports.addLog(`你凭借身法闪避了 ${伤害来源文本} 的攻击！`, '成功');
      return;
    }

    const 纵火狂装备 = 当前页装备().find(item => is(item, '纵火狂'));
    const 是爆炸伤害 = (伤害来源 === '炸弹' || is(伤害来源, '炸弹怪物') || 伤害来源?.名称 === '陨石法杖');

    if (纵火狂装备 && 是爆炸伤害) {
      const 治疗量 = 原始攻击力;
      const 玩家最大生命值 = 100 + (S.玩家属性.最大生命值加成 || 0);
      S.玩家属性.当前生命值 = Math.min(玩家最大生命值, (S.玩家属性.当前生命值 || 玩家最大生命值) + 治疗量);
      纵火狂装备.当被攻击(最终攻击力, 伤害来源);
      ports.addLog(`爆炸治愈了你 ${治疗量.toFixed(1)} 点生命！`, '成功');
      ports.floatText(`+${治疗量.toFixed(0)}`, S.玩家.x, S.玩家.y, '#00ff00');
      return;
    }

    for (const 装备 of 当前页装备().filter(v => v != null)) {
      if (is(装备, '防御装备类')) {
        const buffs = 装备.自定义数据.get('fusedBuffs') || [];
        const dodgeBuff = buffs.find((b: Loose) => b.type === 融合Buff类型.闪避几率);
        if (dodgeBuff && ports.random() < dodgeBuff.value) {
          闪避成功 = true;
          ports.addLog(`通过 ${装备.获取名称()} 闪避了来自 ${伤害来源文本} 的攻击！`, '成功');
          break;
        }
      }
    }

    if (闪避成功) {
      ports.floatText('闪避', S.玩家.x, S.玩家.y, '#4caf50');
      return;
    }

    let 守卫者减伤比例 = 0;
    当前页装备().filter(v => v != null).forEach(装备 => {
      if (is(装备, '守卫者盔甲')) 守卫者减伤比例 += 装备.强化 ? 0.10 : 0.05;
    });
    守卫者减伤比例 = Math.min(0.85, 守卫者减伤比例);
    if (守卫者减伤比例 > 0) 最终攻击力 *= (1 - 守卫者减伤比例);

    当前页装备().filter(v => v != null).forEach(装备 => {
      if (最终攻击力 <= 0) return;
      if (is(装备, '宠物') && !装备.自定义数据.get('休眠中')) 最终攻击力 = 装备.当玩家被攻击(最终攻击力, 伤害来源);
      if (is(装备, '防御装备类')) 最终攻击力 = 装备.当被攻击(最终攻击力, 伤害来源);
    });

    最终攻击力 = Math.max(0, 最终攻击力 - (S.玩家属性.防御加成 || 0));
    if (最终攻击力 <= 0 && 原始攻击力 > 0) 最终攻击力 = Math.round(ports.random() * 100) / 100;

    if (最终攻击力 > 0 && S.游戏设置.自动移动可打断) {
      S.玩家总受到伤害 += 最终攻击力; // SRC-50
      if (session.isAutoMoving) {
        session.moveQueue = [];
        session.isAutoMoving = false;
      }
    }

    ports.updateEquipmentDisplay();
    const 玩家最大生命值 = 100 + (S.玩家属性.最大生命值加成 || 0);
    if (S.玩家属性.当前生命值 === undefined) S.玩家属性.当前生命值 = 玩家最大生命值;

    let 预测生命 = Math.max(0, S.玩家属性.当前生命值 - 最终攻击力);

    if (预测生命 <= 5 && 预测生命 > 0) {
      const 空桶实例 = 当前页装备().find(item => is(item, '空桶'));
      if (空桶实例) {
        ports.notify(`${空桶实例.获取名称()} 抵挡了伤害，但被摧毁了！`, '警告');
        ports.destroyItem(空桶实例.唯一标识, true);
        return;
      }
    }

    if (S.游戏状态 === '图鉴' && 最终攻击力 > 0) 预测生命 = Math.max(1, 预测生命);
    S.玩家属性.当前生命值 = 预测生命;

    ports.updateVictoryDisplay();

    if (最终攻击力 > 0) {
      ports.floatText(`-${最终攻击力.toFixed(0)}`, S.玩家.x, S.玩家.y, '#ff0000');
      ports.addLog(`受到了 ${伤害来源文本} 的伤害！损失了 ${最终攻击力.toFixed(1)} 点血量！`, `警告`);
    } else if (原始攻击力 > 0) {
      ports.floatText(`格挡`, S.玩家.x, S.玩家.y, '#cccccc');
      ports.addLog(`成功抵挡了来自 ${伤害来源文本} 的攻击！`, `成功`);
    }

    let 实际击退 = false;
    let 击退后X = S.玩家.x; const 原始X = S.玩家.x;
    let 击退后Y = S.玩家.y; const 原始Y = S.玩家.y;

    if (S.玩家属性.当前生命值 > 0 && is(伤害来源, '怪物') && S.游戏设置.受伤时击退) {
      const dx = S.玩家.x - 伤害来源?.x;
      const dy = S.玩家.y - 伤害来源?.y;
      let 击退DX = 0, 击退DY = 0;

      if (Math.abs(dx) > Math.abs(dy)) 击退DX = Math.sign(dx) || (dy === 0 ? (ports.random() < 0.5 ? 1 : -1) : 0);
      else if (Math.abs(dy) > Math.abs(dx)) 击退DY = Math.sign(dy) || (dx === 0 ? (ports.random() < 0.5 ? 1 : -1) : 0);
      else if (dx !== 0 && dy !== 0) { if (ports.random() < 0.5) 击退DX = Math.sign(dx); else 击退DY = Math.sign(dy); }
      if (击退DX === 0 && 击退DY === 0) { if (ports.random() < 0.5) 击退DX = ports.random() < 0.5 ? 1 : -1; else 击退DY = ports.random() < 0.5 ? 1 : -1; }

      if (击退DX !== 0 || 击退DY !== 0) {
        const 新X = S.玩家.x + 击退DX;
        const 新Y = S.玩家.y + 击退DY;
        if (新X >= 0 && 新X < S.地牢大小 && 新Y >= 0 && 新Y < S.地牢大小 && 检查移动可行性(S.玩家.x, S.玩家.y, 新X, 新Y) &&
          ![单元格类型.墙壁, 单元格类型.上锁的门].includes(S.地牢[新Y]?.[新X]?.背景类型)) {
          const 目标单元格 = S.地牢[新Y]?.[新X];
          const 目标物品 = 目标单元格?.关联物品;
          const 不可移动类型列表 = ['楼梯'];
          const 目标不可移动 = 目标物品 && (不可移动类型列表.includes(目标物品.类型) || 目标物品.能否拾起 === false);
          if (!目标不可移动) {
            S.玩家.x = 新X;
            S.玩家.y = 新Y;
            击退后X = 新X;
            击退后Y = 新Y;
            实际击退 = true;
          }
        }
      }
    }

    if (实际击退) {
      const 触发中断 = ports.playerLanding(原始X, 原始Y, 击退后X, 击退后Y);
      if (!触发中断) ports.updateViewport();
    }

    if (S.玩家属性.当前生命值 <= 0) {
      ports.playerDeath(伤害来源);
    } else if (S.自定义游戏设置.极限模式 && S.生存挑战激活 && S.玩家属性.当前生命值 <= 50) {
      ports.restoreChallengeArea();
      S.生存挑战激活 = false;
      let 石碑: Loose = null;
      for (const row of S.地牢) {
        for (const cell of row) {
          if (is(cell.关联物品, '挑战石碑') && cell.关联物品.自定义数据.get('已激活')) {
            石碑 = cell.关联物品;
            break;
          }
        }
        if (石碑) break;
      }
      if (石碑) {
        石碑.发放奖励(石碑.自定义数据.get('当前波数'));
        石碑.自定义数据.set('已激活', false);
      }
      ports.notify('生命垂危，生存挑战结束！', '警告', true);
    }
  }

  /** The repeated "throne guardian with no skill to cast takes a random legal step" block. */
  const 王座守护者随机移动 = (m: Loose, shiftPaths: boolean) => {
    const 可移动方向 = 方向列表().filter(dir => 检查移动可行性(m.x, m.y, m.x + dir.dx, m.y + dir.dy));
    if (可移动方向.length > 0) {
      const 随机方向 = 可移动方向[Math.floor(ports.random() * 可移动方向.length)]!;
      m.目标路径 = [{ x: m.x + 随机方向.dx, y: m.y + 随机方向.dy }];
      m.目标 = { x: m.x + 随机方向.dx, y: m.y + 随机方向.dy };
      m.尝试移动();
      if (shiftPaths && m.目标路径 && m.通向目标路径) {
        m.通向目标路径.shift();
        m.目标路径.shift();
      }
    }
  };

  function 处理怪物回合(): void {
    if (S.地牢.length !== S.地牢大小) return;
    if (S.所有怪物 && Array.isArray(S.所有怪物)) {
      S.所有怪物 = S.所有怪物.filter((m: Loose) => {
        if (m.当前生命值 <= 0) {
          // 执行清理逻辑
          if (m.恢复背景类型) m.恢复背景类型(); // 从地图格子中移除关联
          if (m.血条元素) m.血条元素.remove(); // 移除UI
          S.怪物状态表.delete(m); // 清理状态 (`typeof 怪物状态表 !== 'undefined'` always holds here)
          const 动画状态 = ports.monsterAnimations();
          if (动画状态 !== undefined) 动画状态.delete(m); // 清理动画
          // 确保地图格子上没有残留引用 (双重保险)
          if (m.x !== null && m.y !== null && S.地牢[m.y]?.[m.x]?.关联怪物 === m) {
            S.地牢[m.y][m.x].关联怪物 = null;
            if (S.地牢[m.y][m.x].类型 === 单元格类型.怪物) S.地牢[m.y][m.x].类型 = null;
          }
          return false; // 从数组中移除
        }
        return true; // 保留存活怪物
      });
    }
    const 当前房间ID = S.房间地图[S.玩家.y][S.玩家.x];
    S.跟踪玩家怪物数 = 0;

    const 玩家穿了潜行靴子 = 当前页装备().some(item => is(item, '潜行靴子'));
    const 有金质装备 = 当前页装备().filter(v => v != null).some(装备 => 装备.材质 === 材质.金质);

    S.所有怪物.forEach((m: Loose) => {
      if (is(S.地牢[m.y]?.[m.x]?.关联物品, '传送带')) return;
      if (S.房间地图[m.y][m.x] === 当前房间ID) m.状态 = 怪物状态.活跃;
      if (is(m, '超速怪物') && m.状态 === 怪物状态.活跃) {
        const 范围 = m.加速范围;
        const 加速值 = m.加速回合数;
        for (let dy = -范围; dy <= 范围; dy++) {
          for (let dx = -范围; dx <= 范围; dx++) {
            const x = m.x + dx;
            const y = m.y + dy;
            const 邻居 = S.地牢[y]?.[x]?.关联怪物;
            if (邻居 && 邻居.状态 === 怪物状态.活跃) 邻居.本回合行动次数 = 加速值;
          }
        }
      }
    });

    const 隐身中 = () => S.玩家状态.some((s: Loose) => s.类型 === '隐身');
    const 被魅惑 = (m: unknown) => (S.怪物状态表.get(m) as Loose)?.类型 === '魅惑';

    S.所有怪物.forEach((m: Loose) => {
      if (m.状态 === 怪物状态.活跃 || m.始终追踪玩家) {
        const 我的状态 = S.怪物状态表.get(m) as Loose;
        我的状态?.更新状态();

        if (is(S.地牢[m.y]?.[m.x]?.关联物品, '传送带')) return;
        const 行动次数 = m.本回合行动次数 || 1;
        const 原始移动距离 = m.基础移动距离;
        for (let i = 0; i < 行动次数; i++) {
          if (is(m, '同步怪物') || is(m, '巡逻怪物')) {
            m.尝试移动();
            m.目标 = m.选择目标();
            m.尝试攻击();
            return; // leaves the forEach callback: no action-count or move-distance reset for these
          } else if (m.始终追踪玩家) {
            m.追踪玩家();
          }

          const 距离玩家 = Math.abs(m.x - S.玩家.x) + Math.abs(m.y - S.玩家.y);
          if (有金质装备 && 距离玩家 > 5) m.基础移动距离 += 1;

          const 目标 = m.选择目标();
          m.目标 = 目标;
          const { x, y } = 目标;

          let 可以追踪 = true;
          if (玩家穿了潜行靴子 && !被魅惑(m) && 目标 === S.玩家) {
            可以追踪 = ports.quickLineCheck(m.x, m.y, S.玩家.x, S.玩家.y, m.跟踪距离);
          }

          const 曼哈顿距离 = Math.abs(m.x - x) + Math.abs(m.y - y);

          if (可以追踪 && 曼哈顿距离 <= m.跟踪距离 && m.移动距离 > 0 && m.移动率 > 0) {
            m.通向目标路径 = m.计算目标路径(x, y);
            if (m.通向目标路径) {
              const 截断点 = Math.max(0, m.通向目标路径.length - Math.floor(m.攻击范围 / 2));
              m.目标路径 = m.通向目标路径.slice(0, 截断点);
            } else {
              m.目标路径 = null;
            }
          } else {
            m.通向目标路径 = null;
            m.目标路径 = null;
            if (玩家穿了潜行靴子) {
              const 可移动方向 = 方向列表().filter(dir => 检查移动可行性(m.x, m.y, m.x + dir.dx, m.y + dir.dy));
              if (可移动方向.length > 0) {
                const 随机方向 = 可移动方向[Math.floor(ports.random() * 可移动方向.length)]!;
                const 随机路径 = [{ x: m.x + 随机方向.dx, y: m.y + 随机方向.dy }];
                m.通向目标路径 = 随机路径;
                m.目标路径 = 随机路径;
                m.目标 = { x: S.玩家.x, y: S.玩家.y };
              }
            }
          }
          if (m.通向目标路径) {
            if (m.目标路径 && m.目标路径.length > 0 &&
              !(m.通向目标路径.length > 1 && 隐身中() && !被魅惑(m) && !(is(m, '王座守护者') && m.当前阶段 === 3))) {
              if (!被魅惑(m)) m.追击玩家中 = true;
              m.尝试移动();
              if (m.目标路径 && m.通向目标路径) {
                m.通向目标路径.shift();
                m.目标路径.shift();
              }
            } else {
              m.追击玩家中 = false;
              if (m.x == m.目标.x && m.y == m.目标.y) {
                m.追击玩家中 = true;
                S.跟踪玩家怪物数++;
              }
              if (is(m, '王座守护者') && !m.强制释放随机技能()) 王座守护者随机移动(m, true);
            }

            if (m.通向目标路径 && !(m.通向目标路径.length > 1 && 隐身中() && !被魅惑(m))) {
              m.尝试攻击();
            } else {
              m.绘制血条();
            }
            if (m.当前生命值 <= 0) break;
            if (is(m, '大魔法师')) m.更新技能冷却();
          } else {
            m.追击玩家中 = false;
            if (is(m, '王座守护者') && !m.强制释放随机技能()) 王座守护者随机移动(m, false);
          }
        }
        if (!is(m, '超速怪物') && m?.本回合行动次数 > 1) m.本回合行动次数 = 1;
        m.基础移动距离 = 原始移动距离;
      }
    });

    const 提示元素 = ports.trackerLabel();
    if (S.跟踪玩家怪物数 > 3) 提示元素.classList.add('怪物数量警告');
    else 提示元素.classList.remove('怪物数量警告');
    ports.updateTracker({ 内容: `追踪怪物：${S.跟踪玩家怪物数}` });
  }

  return { 检查移动可行性, 获取实际移动步数, 更新武器冷却, 处理宠物着陆效果, 伤害玩家, 处理怪物回合 };
}
