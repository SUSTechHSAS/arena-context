// Independent reviewer mutation probe for PR #27 (not part of the repo). Each mutant is a literal
// find/replace that must match exactly once; the targeted test file is run; the original is restored.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const APP = '/home/user/pr27m/app';
const W = 'src/game/world/';
const M = [
  // ---- before 72d974b (A/B eras) ----
  ['B37 victory', 'victory.ts', 'S.玩家死亡次数 >= conditions.死亡次数限制', 'S.玩家死亡次数 > conditions.死亡次数限制', 'world-victory'],
  ['B37 victory', 'victory.ts', "health.toFixed(1)}%", "health.toFixed(2)}%", 'world-victory'],
  ['B39 equip-page', 'equipment-page.ts', "Math.max(0, Math.ceil(highestSlot / S.装备栏每页装备数) - 1)", "Math.ceil(highestSlot / S.装备栏每页装备数) - 1", 'world-equipment-page'],
  ['B39 equip-page', 'equipment-page.ts', "}, 100);", "}, 101);", 'world-equipment-page'],
  // ---- C era (72d974b..22dc1eb) ----
  ['C48 edge', 'edge-indicator.ts', null, null, 'world-edge-indicator'],
  // ---- D era (3fe57cf..) ----
  ['D49 template', 'editor-template.ts', 'levelNumber < 0', 'levelNumber <= 0', 'world-editor-template'],
  ['D49 template', 'editor-template.ts', "生成库存(Math.max(cell.关联物品.自定义数据.get('商品层数'), 0))", "生成库存(cell.关联物品.自定义数据.get('商品层数'))", 'world-editor-template'],
  ['D49 template', 'editor-template.ts', "ports.saveEditorState();\n  ports.resetAll();", "ports.resetAll();\n  ports.saveEditorState();", 'world-editor-template'],
  ['D49 template', 'editor-template.ts', "if (startRoom) startRoom.已探索 = true;", "", 'world-editor-template'],
  ['D50 path', 'path-overlay.ts', 'for (let i = 1; i < path.length; i++)', 'for (let i = 0; i < path.length; i++)', 'world-path-overlay'],
  ['D50 path', 'path-overlay.ts', 'ctx.lineWidth = 2 * view.devicePixelRatio;', 'ctx.lineWidth = 2;', 'world-path-overlay'],
  ['D51 c-death', 'creative-death.ts', 'p.x < right', 'p.x <= right', 'world-creative-death'],
  ['D51 c-death', 'creative-death.ts', 'elapsed < animationDuration', 'elapsed <= animationDuration', 'world-creative-death'],
  ['D51 c-death', 'creative-death.ts', "ports.now() + ports.random() * 300", "ports.now() + ports.random() * 299", 'world-creative-death'],
  ['D53 click', 'click.ts', 'if (roomId !== -1 && !S.已访问房间.has(roomId))', 'if (!S.已访问房间.has(roomId))', 'world-click'],
  ['D53 click', 'click.ts', 'const gridX = Math.floor(view.offsetX + x / view.cellSize);', 'const gridX = view.offsetX + Math.floor(x / view.cellSize);', 'world-click'],
  ['D53 click', 'click.ts', '  cut.shift();\n', '\n', 'world-click'],
  ['D53 click', 'click.ts', '50, true, false, false, !isStairs', '50, true, false, false, isStairs', 'world-click'],
  ['D55 e-canvas', 'editor-canvas.ts', 'if (distPx < 6) return 0;', 'if (distPx <= 6) return 0;', 'world-editor-canvas'],
  ['D55 e-canvas', 'editor-canvas.ts', 'const dt = Math.min(0.05, (t - last) / 1000);', 'const dt = Math.min(0.04, (t - last) / 1000);', 'world-editor-canvas'],
  ['D55 e-canvas', 'editor-canvas.ts', 'targetItem.最大堆叠数量 > 1)', 'targetItem.最大堆叠数量 > 0)', 'world-editor-canvas'],
  ['D55 e-canvas', 'editor-canvas.ts', 'if (dragged.堆叠数量 <= 0) E.拖拽对象 = null;', 'if (dragged.堆叠数量 < 0) E.拖拽对象 = null;', 'world-editor-canvas'],
  ['D57 c-levels', 'creative-levels.ts', 'for (let i = 0; i < Math.ceil(ports.prng() * 10); i++) ports.prng();', 'const n = Math.ceil(ports.prng() * 10); for (let i = 0; i < n; i++) ports.prng();', 'world-creative-levels'],
  ['D57 c-levels', 'creative-levels.ts', "ports.startGame(data, true);\n    S.当前关卡存档数据字符串 = saveString;", "S.当前关卡存档数据字符串 = saveString;\n    ports.startGame(data, true);", 'world-creative-levels'],
  ['D57 c-levels', 'creative-levels.ts', '}, 310);', '}, 300);', 'world-creative-levels'],
  ['D57 c-levels', 'creative-levels.ts', "delete mapData.配方信息;", "", 'world-creative-levels'],
  ['D58 particles', 'death-particles.ts', 'prng() * 0.6 + 0.4', 'prng() * 0.6 + 0.5', 'world-death-particles'],
  ['D58 particles', 'death-particles.ts', 'const delay = prng() * 15;', 'const delay = prng() * 14;', 'world-death-particles'],
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
writeFileSync('/home/user/mutprobe/results.json', JSON.stringify(results, null, 1));
