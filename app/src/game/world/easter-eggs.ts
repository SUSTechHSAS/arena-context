import { Q字形图案 } from './constants';
import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface QEggPorts {
  trigger(cells: { x: number; y: number }[]): void; // 触发Q字形彩蛋
}

/**
 * Source `检查Q字形彩蛋(丢弃X, 丢弃Y)` (HTML L66408): after a drop, tries every `X` of the 6×6 Q pattern as the dropped
 * cell; a match needs pickable items exactly on the `X` cells. A cell whose `关联物品` is `undefined` is empty (SRC-27
 * fixed, owner rule 2026-10-10; the source counted it as holding an item and threw on `.能否拾起`).
 */
export function checkQEasterEgg(state: WorldState, ports: QEggPorts, dropX: number, dropY: number): void {
  const S = state as Loose;
  if (S.彩蛋1触发) return;
  for (let row = 0; row < Q字形图案.length; row++) {
    for (let col = 0; col < Q字形图案[row]!.length; col++) {
      if (Q字形图案[row]![col] == 'X') {
        const left = dropX - col;
        const top = dropY - row;
        let matched = true;
        const cells: { x: number; y: number }[] = [];
        for (let r = 0; r < 6; r++) {
          for (let c = 0; c < 6; c++) {
            const x = left + c;
            const y = top + r;
            if (x < 0 || x >= S.地牢大小 || y < 0 || y >= S.地牢大小) {
              matched = false;
              break;
            }
            const cell = S.地牢[y]?.[x];
            const char = Q字形图案[r]![c];
            const hasItem = cell && cell.关联物品 != null && cell.关联物品.能否拾起 !== false;
            if ((char === 'X' && !hasItem) || (char === ' ' && hasItem)) {
              matched = false;
              break;
            }
            if (hasItem) cells.push({ x, y });
          }
          if (!matched) break;
        }
        if (matched) {
          ports.trigger(cells);
          return;
        }
      }
    }
  }
}

export interface QEggTriggerPorts {
  schedule(callback: () => void, ms: number): void; // setTimeout
  createCompass(options: Record<string, never>): unknown; // new 时空罗盘({})
  tryCollect(item: unknown, silent: boolean): unknown; // 尝试收集物品
  scheduleCellEffect(cells: { x: number; y: number }[], color: string, duration: number): void; // 计划显示格子特效
  notify(message: string, type: string): void; // 显示通知
}

/** Source `触发Q字形彩蛋(格子列表)` (HTML L66454): marks the egg found, then a second later grants a 时空罗盘. */
export function triggerQEasterEgg(state: WorldState, ports: QEggTriggerPorts, cells: { x: number; y: number }[]): void {
  (state as Loose).彩蛋1触发 = true;
  ports.schedule(() => {
    const reward = ports.createCompass({});
    if (ports.tryCollect(reward, true)) {
      ports.scheduleCellEffect(cells, 'FFD700', 500);
      ports.notify("难道这是...'Q' for 'Quark'！？", '成功');
    }
  }, 1000);
}
