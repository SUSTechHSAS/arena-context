import { 最大堆叠数 } from '../world/constants';
import type { MoveSession } from '../world/move';
import type { WorldState } from '../world/state';
import type { SourceClassRegistry } from './class-registry';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- items, NPCs and stations are source-shaped dynamic objects.

/**
 * Integration phase P4 (PLAN.md): the player's inventory verbs. Ports source `整理背包` (JS L2813),
 * `触发游戏事件` (L37313), `处理丢弃物品` (L40081), `执行连发攻击` (L43768), `使用装备槽物品`
 * (L43787), `卸下装备槽物品` (L43883), `处理销毁物品` (L43897), `尝试收集物品` (L43997),
 * `使用背包物品` (L44056), `执行修复` (L45530), `执行重铸` (L45565), `扣除金币` (L45639),
 * `尝试出售` (L46106), `尝试购买` (L46228) and `停止自动移动` (L48611). Audit packet:
 * `t10-inventory-actions-audit`. Statement order, early returns, the second `使用()` call after a
 * failed weapon attack and the online-mode branches (socket messages as a port) are preserved.
 * Item, NPC and station behavior stays with the packet classes; DOM work (selection lookups,
 * fireworks, slot pulse, windows) is a port.
 *
 * Source defects kept on purpose, pending owner review:
 * - SRC-51: online `执行重铸` reads the undeclared `data` (ReferenceError); online `尝试购买`
 *   reads `npc` before its `const` declaration (TDZ ReferenceError).
 * - SRC-52: `尝试购买` checks the price against all coins but `扣除金币` only spends visible
 *   ones, after the bought item was already collected.
 */
export interface InventoryActionPorts {
  classes: Pick<SourceClassRegistry, 'isA' | 'lookup'>;
  online(): boolean; // 联机模式
  emit(action: Record<string, unknown>): void; // socket.emit('playerAction', action)
  notify(message: string, type: string, flag?: boolean): void; // 显示通知
  addLog(message: string, type: string): void; // 添加日志
  updateInventoryDisplay(): void; // 更新背包显示
  updateEquipmentDisplay(): void; // 更新装备显示
  /** Source `位置是否可用(x, y[, 检查玩家])`; the argument list is forwarded as written. */
  positionAvailable(...args: unknown[]): boolean;
  canMove(fromX: number, fromY: number, toX: number, toY: number): boolean; // 检查移动可行性 (runtime/turn-actors.ts)
  placeItem(item: unknown, x: number, y: number): unknown; // 放置物品到单元格
  checkQEgg(x: number, y: number): void; // 检查Q字形彩蛋 (world/easter-eggs.ts)
  hideTooltip(): void; // document.getElementById("浮动提示框").style.display = "none"
  draw(): void; // 绘制
  nearbyMonsters(count: unknown, range: unknown): { 怪物: Loose; 路径: Loose }; // 获取周围怪物 (world/targeting.ts)
  playSound(name: string): void; // 音效管理器.播放音效
  collectEffect(item: unknown, textMode: unknown): void; // 显示收集特效
  confirm(message: string): boolean;
  /** `document.body.contains(element)`. */
  inDocument(element: unknown): boolean;
  /** The fireworks burst over an item element being destroyed (DOM only). */
  destroyEffect(element: unknown, item: unknown): void;
  /** The 200 ms scale pulse on `#装备槽{n}`. */
  pulseSlot(slot: unknown): void;
  /** `document.querySelector(selector)`, read for its `__物品实例`. */
  selected(selector: string): { __物品实例?: unknown } | null;
  closeRepairWindow(): void; // 关闭修复界面
  closeReforgeWindow(): void; // 关闭重铸界面
  reforgeStation(): Loose; // 当前重铸台 (window global, never set to a station by the source)
  openSellWindow(npc: unknown): void; // 打开收购窗口
  closeSellWindow(): void; // 关闭收购窗口
  closeTradeWindow(): void; // 关闭交易窗口
  cloneItem(item: unknown): Loose; // 克隆物品 (world/drops.ts)
  schedule(callback: () => void, ms: number): void; // setTimeout
  /** Source `互动 = true` (an implicit global nothing reads). */
  markInteracted(): void;
}

export type InventorySession = Pick<MoveSession, 'moveQueue' | 'isAutoMoving'>;

export function createInventoryActions(state: WorldState, session: InventorySession, ports: InventoryActionPorts) {
  const S = state as Loose;
  const is = (value: unknown, name: string) => ports.classes.isA(value, name);
  const 当前页装备 = (): Loose[] => Array.from({ length: S.装备栏每页装备数 }, (_, i) => S.玩家装备.get(S.当前装备页 * S.装备栏每页装备数 + i + 1));
  const 可见物品数 = () => [...S.玩家背包.values()].reduce((sum: number, i: Loose) => sum + (i.是否隐藏 ? 0 : 1), 0);
  const 通知宠物攻击 = (怪物: unknown) => {
    当前页装备().filter(v => v != null).forEach(装备 => {
      if (is(装备, '宠物') && !装备.自定义数据.get('休眠中')) 装备.当玩家攻击(怪物);
    });
  };

  function 停止自动移动(): void {
    if (session.isAutoMoving) {
      session.moveQueue = [];
      session.isAutoMoving = false;
    }
  }

  function 触发游戏事件(事件类型: string, 事件坐标: { x: number; y: number }): void {
    S.所有计时器.forEach((计时器实例: Loose) => {
      if (is(计时器实例, '侦测器')) {
        const { x, y } = 计时器实例;
        const 侦测事件 = 计时器实例.自定义数据.get('侦测事件');
        const 侦测范围 = 计时器实例.自定义数据.get('侦测范围');
        if (侦测事件 === 事件类型) {
          const 距离 = Math.abs(x - 事件坐标.x) + Math.abs(y - 事件坐标.y);
          if (距离 <= 侦测范围) {
            const 切换开关 = 计时器实例.自定义数据.get('切换开关');
            if (切换开关 === '红蓝') {
              S.红蓝开关状态 = S.红蓝开关状态 === '红' ? '蓝' : '红';
              ports.addLog(`侦测器 (${x},${y}) 触发，切换为 ${S.红蓝开关状态} 状态！`, '信息');
            } else if (切换开关 === '绿紫') {
              S.绿紫开关状态 = S.绿紫开关状态 === '绿' ? '紫' : '绿';
              ports.addLog(`侦测器 (${x},${y}) 触发，切换为 ${S.绿紫开关状态} 状态！`, '信息');
            }
          }
        }
      }
    });
  }

  function 整理背包(无提示 = false): void {
    if (ports.online()) {
      ports.emit({ type: 'sortInventory' });
      return;
    }
    const 物品数组 = [...S.玩家背包.values()].filter((item: Loose) => !item.是否隐藏);
    物品数组.sort((a: Loose, b: Loose) => (b.品质 !== a.品质 ? b.品质 - a.品质 : 0));

    const mergedList: Loose[] = [];
    while (物品数组.length > 0) {
      const current: Loose = 物品数组.shift();
      for (const target of mergedList) {
        if (target.名称 === current.名称 && target.品质 === current.品质 && target.强化 === current.强化 && target.最大堆叠数量 > 1 &&
          target.堆叠数量 < target.最大堆叠数量 && target.比较自定义数据(current.自定义数据)) {
          const space = target.最大堆叠数量 - target.堆叠数量;
          const toTransfer = Math.min(space, current.堆叠数量);
          target.堆叠数量 += toTransfer;
          current.堆叠数量 -= toTransfer;
        }
        if (current.堆叠数量 <= 0) break;
      }
      if (current.堆叠数量 > 0) mergedList.push(current);
    }

    const 隐藏物品 = [...S.玩家背包.values()].filter((item: Loose) => item.是否隐藏);
    S.玩家背包.clear();
    ports.updateInventoryDisplay();
    mergedList.forEach(item => S.玩家背包.set(item.唯一标识, item));
    隐藏物品.forEach((item: Loose) => S.玩家背包.set(item.唯一标识, item));
    ports.updateInventoryDisplay();
    if (!无提示) ports.notify('背包已整理并合并！', '成功');
  }

  function 处理丢弃物品(唯一标识: Loose): boolean {
    if (ports.online()) {
      ports.emit({ type: 'drop', id: 唯一标识.toString() });
      return true;
    }
    const 物品实例 = S.玩家背包.get(唯一标识);
    if (!物品实例) return false;

    let 目标X = S.玩家.x;
    let 目标Y = S.玩家.y;
    let 可用 = false;
    if (ports.positionAvailable(目标X, 目标Y, false)) {
      可用 = true;
    } else {
      const 方向 = [[0, -1], [0, 1], [-1, 0], [1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]] as const;
      for (const [dx, dy] of 方向) {
        const 新X = S.玩家.x + dx;
        const 新Y = S.玩家.y + dy;
        if (新X >= 0 && 新X < S.地牢大小 && 新Y >= 0 && 新Y < S.地牢大小 && ports.positionAvailable(新X, 新Y) && ports.canMove(S.玩家.x, S.玩家.y, 新X, 新Y)) {
          目标X = 新X;
          目标Y = 新Y;
          可用 = true;
          break;
        }
      }
    }

    if (!可用) {
      ports.notify('周围没有空间丢弃物品！', '错误');
      return false;
    }
    if (!物品实例.当被丢弃(目标X, 目标Y)) return false;
    S.玩家背包.delete(唯一标识);
    if (物品实例.已装备) {
      物品实例.取消装备();
      S.玩家装备.delete(物品实例.装备槽位);
      物品实例.已装备 = false;
      物品实例.装备槽位 = null;
    }

    物品实例.是否被丢弃 = true;
    物品实例.isActive = false;
    ports.placeItem(物品实例, 目标X, 目标Y);
    触发游戏事件('玩家丢弃物品', { x: 目标X, y: 目标Y });
    ports.updateInventoryDisplay();
    ports.updateEquipmentDisplay();
    ports.notify(`丢弃了 ${物品实例.获取名称()}`, '信息');
    if (!S.彩蛋1触发) ports.checkQEgg(目标X, 目标Y);
    ports.hideTooltip();
    ports.draw();
    return true;
  }

  function 执行连发攻击(武器实例: Loose, 攻击次数: number, 当前次数 = 0): unknown {
    if (当前次数 >= 攻击次数) return undefined;
    const 当前武器实例 = S.玩家装备.get(武器实例.装备槽位);
    if (!当前武器实例) return undefined;
    const { 怪物, 路径 } = ports.nearbyMonsters(当前武器实例.自定义数据.get('攻击目标数'), 当前武器实例.最终攻击范围);
    if (!怪物) return undefined;
    const 攻击成功 = 当前武器实例.使用(怪物, 路径, S.玩家);
    if (攻击成功 && 当前次数 < 攻击次数 - 1) {
      当前武器实例.自定义数据.set('冷却剩余', 0);
      ports.schedule(() => {
        if (!执行连发攻击(武器实例, 攻击次数, 当前次数 + 1)) 当前武器实例.自定义数据.set('冷却剩余', 当前武器实例.最终冷却回合);
      }, 200);
    }
    return 攻击成功;
  }

  function 使用装备槽物品(槽位编号: number): boolean | undefined {
    if (S.死亡界面已显示) return undefined;
    if (ports.online()) ports.emit({ type: 'useItem', id: S.玩家装备.get(槽位编号).唯一标识.toString() });
    if (S.游戏设置.自动移动可打断) 停止自动移动();

    const 物品实例 = S.玩家装备.get(槽位编号);
    if (!物品实例) return undefined;

    if (物品实例.类型 === '武器') {
      if (物品实例.堆叠数量 > 0 && 物品实例.自定义数据.get('冷却剩余') == 0) {
        const { 怪物, 路径 } = ports.nearbyMonsters(物品实例.自定义数据.get('攻击目标数'), 物品实例.最终攻击范围);
        if (怪物 !== null) {
          const 连发附魔 = 物品实例.自定义数据.get('附魔')?.find((e: Loose) => e.种类 === '连发附魔');
          if (连发附魔 && 连发附魔.等级 > 0) {
            执行连发攻击(物品实例, 连发附魔.等级 + 1);
            ports.playSound('武器命中');
            ports.updateEquipmentDisplay();
            ports.draw();
            return true;
          }
          if (物品实例.使用(怪物, 路径, S.玩家)) {
            通知宠物攻击(怪物);
            ports.playSound('武器命中');
            ports.updateEquipmentDisplay();
            ports.draw();
            return true;
          }
        } else if (S.当前天气效果.includes('诡魅')) {
          ports.notify('太远了...看不清怪物的真实位置了...', '错误');
        } else if (物品实例.自定义数据.get('攻击目标数') > 0) {
          ports.notify('附近没有目标', '错误');
        }
      } else {
        ports.notify('武器还未准备好', '错误');
        return false;
      }
    }
    if (物品实例.类型 === '卷轴') {
      ports.notify('请使用卷轴键使用该物品', '错误');
      return false;
    }
    if (物品实例.自定义数据.get('静默回合') > 0) {
      ports.notify(`${物品实例.获取名称()} 被浸湿了，暂时无法使用！(剩余 ${物品实例.自定义数据.get('静默回合')} 回合)`, '警告');
      return false;
    }
    if (物品实例.使用()) {
      if (物品实例.堆叠数量 <= 0) {
        if (物品实例.装备槽位) S.玩家装备.delete(物品实例.装备槽位);
        S.玩家背包.delete(物品实例.唯一标识);
      }
      ports.updateInventoryDisplay();
      ports.updateEquipmentDisplay();
      ports.notify('已使用物品', '成功');
      ports.draw();
      return true;
    } else if (物品实例.类型 !== '武器') {
      ports.notify('无法使用该物品', '错误');
    }
    return false;
  }

  function 卸下装备槽物品(槽位编号: number): void {
    const 当前物品 = S.玩家装备.get(槽位编号);
    if (当前物品) {
      当前物品.取消装备();
      ports.notify('已卸下', '成功');
      ports.updateEquipmentDisplay();
      ports.updateInventoryDisplay();
      ports.pulseSlot(槽位编号);
    }
  }

  function 处理销毁物品(唯一标识: unknown, 直接清理 = false): boolean {
    const 目标物品 = S.玩家背包.get(唯一标识);
    if (!直接清理) {
      if (!ports.confirm('确定要销毁这个物品吗？')) return false;
    }
    if (!目标物品) return false;

    const 物品元素 = 目标物品.显示元素;
    ports.hideTooltip();
    if (!直接清理 && 物品元素 && ports.inDocument(物品元素)) ports.destroyEffect(物品元素, 目标物品);

    if (目标物品.安全销毁()) {
      [...S.玩家背包.values()].forEach((item: Loose) => {
        if (is(item, '宠物')) {
          for (const 槽位 in item.自定义数据.get('装备')) {
            if (item.自定义数据.get('装备')[槽位] === 目标物品) {
              item.自定义数据.get('装备')[槽位] = null;
              item.更新宠物管理窗口();
            }
          }
        }
      });
      if (目标物品.装备槽位) S.玩家装备.delete(目标物品.装备槽位);
      S.玩家背包.delete(唯一标识);
      ports.updateInventoryDisplay();
      ports.updateEquipmentDisplay();
    }
    return true;
  }

  function 尝试收集物品(新物品: Loose, 直接收集 = false): boolean | undefined {
    if (!新物品) return undefined;
    if (!新物品.当被收集('玩家') && 新物品.当被收集) return false;
    if (!新物品.能否拾起) return false;

    const 现有物品: Loose = [...S.玩家背包.values()].find((item: Loose) => item.可堆叠于(新物品));
    ports.playSound('收集物品');
    if (现有物品) {
      if (现有物品.堆叠数量 < 现有物品.最大堆叠数量) {
        if (现有物品.堆叠数量 + 新物品.堆叠数量 >= 现有物品.最大堆叠数量) {
          新物品.堆叠数量 -= 现有物品.最大堆叠数量 - 现有物品.堆叠数量;
          现有物品.堆叠数量 = 现有物品.最大堆叠数量;
          return 尝试收集物品(新物品, 直接收集);
        } else {
          现有物品.堆叠数量 += 新物品.堆叠数量;
          触发游戏事件('玩家拾起物品', { x: S.玩家.x, y: S.玩家.y });
          ports.updateInventoryDisplay();
          ports.updateEquipmentDisplay();
          if (!直接收集) ports.collectEffect(新物品, S.中文模式);
          return true;
        }
      }
    }

    if (可见物品数() >= S.最大背包容量) {
      ports.updateInventoryDisplay();
      ports.updateEquipmentDisplay();
      ports.notify('背包已满！', '错误');
      return false;
    }
    if (新物品.堆叠数量 > 0) {
      新物品.是否被丢弃 = false;
      S.玩家背包.set(新物品.唯一标识, 新物品);
      ports.addLog(`已收集物品 ${新物品.获取名称()}`, '信息');
    }
    触发游戏事件('玩家拾起物品', { x: S.玩家.x, y: S.玩家.y });
    ports.updateInventoryDisplay();
    ports.updateEquipmentDisplay();
    if (!直接收集) ports.collectEffect(新物品, S.中文模式 || S.命令行模式开启);
    return true;
  }

  function 使用背包物品(物品标识: Loose): boolean {
    if (ports.online()) ports.emit({ type: 'useItem', id: 物品标识.toString() });
    const 物品实例 = S.玩家背包.get(物品标识);
    if (!物品实例) return false;

    if (物品实例.类型 === '武器') {
      if (物品实例.堆叠数量 > 0 && 物品实例.自定义数据.get('冷却剩余') == 0) {
        const { 怪物, 路径 } = ports.nearbyMonsters(物品实例.自定义数据.get('攻击目标数'), 物品实例.最终攻击范围);
        if (怪物 !== null) {
          if (物品实例.使用(怪物, 路径)) {
            通知宠物攻击(怪物);
            ports.updateEquipmentDisplay();
            ports.draw();
            ports.markInteracted();
            return true;
          }
          // 失败后回退到 物品实例.使用()
        } else if (S.当前天气效果.includes('诡魅')) {
          ports.notify('太远了...看不清怪物的真实位置了...', '错误');
        } else {
          ports.notify('附近没有目标', '错误');
        }
      } else {
        ports.notify('武器还未准备好', '错误');
        return false;
      }
    }
    if (物品实例.类型 === '卷轴') {
      ports.notify('请在装备栏中使用该物品', '错误');
      return false;
    }
    if (物品实例.自定义数据.get('静默回合') > 0) {
      ports.notify(`${物品实例.获取名称()} 被浸湿了，暂时无法使用！(剩余 ${物品实例.自定义数据.get('静默回合')} 回合)`, '警告');
      return false;
    }
    if (物品实例.使用(S.所有怪物, [], S.玩家)) {
      ports.hideTooltip();
      if (物品实例.堆叠数量 <= 0) {
        if (物品实例.装备槽位) S.玩家装备.delete(物品实例.装备槽位);
        S.玩家背包.delete(物品标识);
        物品实例.isActive = false;
      }
      ports.updateInventoryDisplay();
      ports.updateEquipmentDisplay();
      ports.notify('已使用物品', '成功');
      return true;
    } else {
      ports.notify('无法使用该物品', '错误');
    }
    return false;
  }

  function 扣除金币(数量: number): boolean {
    const 可见金币 = () => [...S.玩家背包.values()].filter((i: Loose) => is(i, '金币') && !i.是否隐藏 && i.堆叠数量 > 0);
    const 可用金币总量 = 可见金币().reduce((sum: number, i: Loose) => sum + i.堆叠数量, 0);
    if (可用金币总量 < 数量) return false;

    let 剩余扣除 = 数量;
    for (const 金币实例 of 可见金币() as Loose[]) {
      if (剩余扣除 === 0) break;
      const 本次可扣除 = Math.min(金币实例.堆叠数量, 剩余扣除);
      金币实例.堆叠数量 -= 本次可扣除;
      剩余扣除 -= 本次可扣除;
      if (金币实例.堆叠数量 === 0) S.玩家背包.delete(金币实例.唯一标识);
    }
    return 剩余扣除 === 0;
  }

  function 执行修复(修复台实例: Loose): void {
    const 选中元素 = ports.selected('#repairableItemsContainer .selected');
    if (!选中元素) {
      ports.notify('请先选择一件需要修复的装备！', '错误');
      return;
    }
    const 待修复物品: Loose = 选中元素.__物品实例;
    const 修复费用 = 修复台实例.计算修复消耗(待修复物品);
    if (is(待修复物品, '时空罗盘')) {
      ports.notify('该物品无法被修复。', '信息');
      return;
    }
    if (修复费用 <= 0) {
      ports.notify('该物品无需修复。', '信息');
      return;
    }
    if (!扣除金币(修复费用)) {
      ports.notify(`金币不足！需要 ${修复费用} 金币。`, '错误');
      return;
    }
    const 剩余耐久 = 修复台实例.自定义数据.get('耐久') - 1;
    修复台实例.自定义数据.set('耐久', 剩余耐久);
    修复台实例.效果描述 = `消耗金币，可将一件装备/武器的耐久完全修复。\n剩余使用次数：${剩余耐久}/${修复台实例.自定义数据.get('最大耐久')}`;
    待修复物品.自定义数据.set('耐久', 待修复物品.自定义数据.get('原耐久'));
    ports.notify(`成功修复 ${待修复物品.获取名称()}，花费了 ${修复费用} 金币！`, '成功');
    ports.closeRepairWindow();
    ports.updateInventoryDisplay();
    ports.updateEquipmentDisplay();
  }

  /** No source caller invokes `执行重铸`; it is ported for completeness (see VERIFICATION I8). */
  function 执行重铸(): boolean | undefined {
    if (ports.online()) {
      const 选中元素 = ports.selected('#repairableItemsContainer .selected');
      if (!选中元素) {
        ports.notify('请先选择装备', '错误');
        return undefined;
      }
      const 物品: Loose = 选中元素.__物品实例;
      物品.唯一标识.toString();
      void 物品.装备槽位;
      // SRC-51: the message literal reads `data.data.id`; `data` is not declared anywhere in the page.
      throw new ReferenceError('data is not defined');
    }
    const 源物品: Loose = ports.selected('#sourceItems .selected')?.__物品实例;
    const 材料物品: Loose = ports.selected('#materialItems .selected')?.__物品实例;
    if (!源物品 || !材料物品) {
      ports.notify('需要选择两个有效装备', '错误');
      return undefined;
    }
    if (源物品 === 材料物品) {
      ports.notify('需要选择两个不同装备', '错误');
      return undefined;
    }
    if (源物品.名称 !== 材料物品.名称) {
      ports.notify('装备名称不一致', '错误');
      return undefined;
    }
    const 当前耐久 = 源物品.自定义数据.get('耐久');
    const 最大耐久 = 源物品.自定义数据.get('原耐久');
    const 可用空间 = 最大耐久 - 当前耐久;
    const 可转移量 = Math.min(材料物品.自定义数据.get('耐久'), 可用空间);
    if (可转移量 <= 0) {
      ports.notify(可用空间 <= 0 ? '目标已满耐久' : '材料无可用耐久', '错误');
      return undefined;
    }
    const 消耗金币 = ports.reforgeStation().计算消耗(源物品, 材料物品);
    if (!扣除金币(消耗金币)) {
      ports.notify('金币不足！', '错误');
      return false;
    }
    源物品.自定义数据.set('耐久', 当前耐久 + 可转移量);
    处理销毁物品(材料物品.唯一标识, true);
    const 剩余耐久 = ports.reforgeStation().自定义数据.get('耐久') - 1;
    ports.reforgeStation().自定义数据.set('耐久', 剩余耐久);
    ports.reforgeStation().效果描述 = `将同名装备的耐久融合\n剩余耐久：${剩余耐久}/${ports.reforgeStation().自定义数据.get('最大耐久')}`;
    ports.notify(`消耗 ${消耗金币} 金币成功修复！`, '成功');
    ports.closeReforgeWindow();
    return undefined;
  }

  function 尝试出售(物品实例: Loose, 价格: number, npc: Loose): void {
    if (ports.online()) {
      ports.emit({ type: 'sell', x: npc.x, y: npc.y, id: 物品实例.唯一标识.toString() });
      return;
    }
    if (npc.自定义数据.get('交易次数') <= 0) {
      ports.notify('探险家已经不想再收购了。', '警告');
      ports.closeSellWindow();
      return;
    }
    const 潜在空格子 = 物品实例.堆叠数量 === 1 ? 1 : 0;
    const 预计出售后物品数量 = 可见物品数() - 潜在空格子;
    const 金币实例: Loose = [...S.玩家背包.values()].find((i: Loose) => is(i, '金币'));
    let 需要的金币格子 = 0;
    if (金币实例) {
      const 可堆叠空间 = 最大堆叠数 - 金币实例.堆叠数量;
      const 剩余金币 = 价格 - Math.min(价格, 可堆叠空间);
      if (剩余金币 > 0) 需要的金币格子 = Math.ceil(剩余金币 / 最大堆叠数);
    } else {
      需要的金币格子 = Math.ceil(价格 / 最大堆叠数);
    }
    if (预计出售后物品数量 + 需要的金币格子 > S.最大背包容量) {
      ports.notify('背包空间不足，无法完成交易！', '错误');
      return;
    }
    if (物品实例.堆叠数量 > 1) {
      物品实例.堆叠数量 -= 1;
    } else {
      S.玩家背包.delete(物品实例.唯一标识);
      if (物品实例.已装备) {
        S.玩家装备.delete(物品实例.装备槽位);
        物品实例.已装备 = false;
        物品实例.装备槽位 = null;
      }
    }
    const 金币 = ports.classes.lookup('金币')!;
    尝试收集物品(new 金币({ 数量: 价格 }), true);
    npc.自定义数据.set('交易次数', npc.自定义数据.get('交易次数') - 1);
    S.玩家属性.允许移动 -= 1;
    ports.openSellWindow(npc);
    ports.updateInventoryDisplay();
    ports.updateEquipmentDisplay();
    ports.notify(`成功出售 ${物品实例.名称}，获得 ${价格} 金币！`, '成功');
    if (npc.自定义数据.get('交易次数') <= 0) {
      ports.notify('探险家满意地离开了。', '信息');
      ports.closeSellWindow();
    }
  }

  function 尝试购买(物品: Loose, 价格: number): void {
    // SRC-51: the online branch reads `npc` before `const npc = 当前NPC` below (temporal dead zone).
    if (ports.online()) throw new ReferenceError("Cannot access 'npc' before initialization");
    const npc = S.当前NPC;
    const 总金币 = [...S.玩家背包.values()].filter((i: Loose) => is(i, '金币')).reduce((sum: number, i: Loose) => sum + i.堆叠数量, 0);
    if (总金币 < 价格) {
      ports.notify('金币不足！', '错误');
      return;
    }
    if (物品.类型 === 'NPC' && !S.彩蛋2触发) {
      ports.notify('就是你小子在酒吧里点了一个酒吧!?', '信息', true);
      S.彩蛋2触发 = true;
    }
    const 新物品 = ports.cloneItem(物品);
    if (!尝试收集物品(新物品, true)) return; // 注意：如果购买物品数量多，则会出现部分成功收集并返回false的情况
    if (!扣除金币(价格)) { // SRC-52: hidden coins counted above are not spendable here
      ports.notify('金币不足！', '错误');
      return;
    }
    npc.自定义数据.set('刷新次数', npc.自定义数据.get('刷新次数') - 1);
    ports.updateInventoryDisplay();
    ports.notify(`购买 ${物品.名称} 成功！`, '成功');
    ports.closeTradeWindow();
  }

  return {
    停止自动移动, 触发游戏事件, 整理背包, 处理丢弃物品, 执行连发攻击, 使用装备槽物品, 卸下装备槽物品, 处理销毁物品, 尝试收集物品, 使用背包物品,
    扣除金币, 执行修复, 执行重铸, 尝试出售, 尝试购买,
  };
}
