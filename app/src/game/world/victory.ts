import type { WorldState } from './state';

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface VictoryPorts {
  notify(message: string, type: string, sticky: boolean): void; // 显示通知
  showVictory(): void; // 显示胜利界面
}

/**
 * Source `检查胜利条件()` (HTML L55522): creative-level victory gate. Limits of 0 (or below) are disabled; death limits
 * fail at `>=` and report `limit - 1`, the other limits fail strictly above (or below for minimum health).
 */
export function checkVictoryConditions(state: WorldState, ports: VictoryPorts): void {
  const S = state as Loose;
  const conditions = S.自定义全局设置.胜利条件;
  const health = S.玩家属性.当前生命值;
  const failures: string[] = [];
  if (conditions.死亡次数限制 > 0 && S.玩家死亡次数 >= conditions.死亡次数限制) failures.push(`超过了最大死亡次数 (${conditions.死亡次数限制 - 1})`);
  if (conditions.回合数限制 > 0 && S.玩家总移动回合数 > conditions.回合数限制) failures.push(`超过了回合数限制 (${S.玩家总移动回合数}/${conditions.回合数限制})`);
  if (conditions.伤害限制 > 0 && S.玩家总受到伤害 > conditions.伤害限制) failures.push(`承受伤害过多 (${S.玩家总受到伤害.toFixed(1)}/${conditions.伤害限制})`);
  if (conditions.生命下限 > 0 && health < conditions.生命下限) failures.push(`生命值过低 (${health.toFixed(1)}% / ${conditions.生命下限}%)`);
  if (failures.length > 0) ports.notify(`胜利条件未达成：${failures.join('，')}。`, '错误', true);
  else ports.showVictory();
}
