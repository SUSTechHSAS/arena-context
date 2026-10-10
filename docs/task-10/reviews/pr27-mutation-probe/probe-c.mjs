// Independent reviewer mutation probe for PR #27 (not part of the repo). Each mutant is a literal
// find/replace that must match exactly once; the targeted test file is run; the original is restored.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const APP = '/home/user/pr27m/app';
const W = 'src/game/world/';
const M = [
  ['C44 SRC-30 revert', 'utils.ts', "'&': '&amp;', '\"': '&quot;', \"'\": '&#39;' }", "}", 'world-utils'],
  ['C44 SRC-11 revert', 'turn.ts', "low: attributes.当前生命值 <= 20 }", "low: attributes.当前能量值 <= 20 }", 'world-turn'],
  ['C44 SRC-03 revert', 'lighting.ts', "timer?.x != null) addLight", "timer?.x) addLight", 'world-lighting'],
  ['C45 f-check', 'fusion-check.ts', "if (whetstone.自定义数据.get('耐久') > 0) {", "if (whetstone.自定义数据.get('耐久') >= 0) {", 'world-fusion-check'],
  ['C45 f-check', 'fusion-check.ts', "if (onlyPotionAndGold && totalGold > 0) {", "if (onlyPotionAndGold && totalGold >= 0) {", 'world-fusion-check'],
  ['C47 tut-nav', 'tutorial-nav.ts', "while (ports.tutorialText(stage) === UNKNOWN && stage <= 6);", "while (ports.tutorialText(stage) === UNKNOWN && stage < 6);", 'world-tutorial-wrench'],
  ['C47 tut-nav', 'tutorial-nav.ts', "if (stage === 2.5) stage = 2;", "if (stage === 2.5) stage = 1;", 'world-tutorial-wrench'],
  ['C47 wrench', 'wrench.ts', "target.名称 || target.类型", "target.名称 ?? target.类型", 'world-tutorial-wrench'],
];

const results = [];
for (const [label, file, find, replace, test] of M) {
  if (find === null) continue;
  const path = `${APP}/${W}${file}`;
  const original = readFileSync(path, 'utf8');
  const count = original.split(find).length - 1;
  if (count !== 1) { results.push([label, find.slice(0, 50), `INVALID(${count} matches)`]); continue; }
  writeFileSync(path, original.replace(find, () => replace));
  try {
    const run = spawnSync('npx', ['vitest', 'run', `test/${test}.test.ts`], { cwd: APP, encoding: 'utf8', timeout: 300_000 });
    const verdict = run.status === 0 ? 'SURVIVED' : 'killed';
    results.push([label, find.replace(/\n/g, '⏎').slice(0, 60), verdict]);
    console.log(label, '|', find.replace(/\n/g, '⏎').slice(0, 60), '|', verdict);
  } finally { writeFileSync(path, original); }
}
writeFileSync('/home/user/mutprobe/results-c.json', JSON.stringify(results, null, 1));
