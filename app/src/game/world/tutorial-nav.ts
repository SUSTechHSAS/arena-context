/** Ports for the tutorial replay navigation (`获取教程文本` belongs to the audit-only packet t10-tutorial-professions-audit). */
export interface TutorialNavPorts {
  tutorialText(stage: number): unknown; // 获取教程文本
}

const UNKNOWN = '未知教程阶段';

/** Source `获取上一个有效阶段(当前阶段)` (HTML L52375): steps back (2.5 → 2, else floor(stage - 1)) past unknown stages; min 0. */
export function previousTutorialStage(ports: TutorialNavPorts, current: number): number {
  let stage = current;
  do {
    if (stage === 2.5) stage = 2;
    else stage = Math.floor(stage - 1);
  } while (stage > 0 && ports.tutorialText(stage) === UNKNOWN);
  return Math.max(0, stage);
}

/** Source `获取下一个有效阶段(当前阶段)` (HTML L52387): steps forward (2 → 2.5, else ceil(stage + 1)) past unknown stages; null after 6. */
export function nextTutorialStage(ports: TutorialNavPorts, current: number): number | null {
  let stage = current;
  do {
    if (stage === 2) stage = 2.5;
    else stage = Math.ceil(stage + 1);
  } while (ports.tutorialText(stage) === UNKNOWN && stage <= 6);
  return stage <= 6 ? stage : null;
}
