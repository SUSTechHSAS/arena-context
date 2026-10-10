#!/usr/bin/env node
// Task #10 integration-coverage ledger generator (primary planning artifact).
// Usage: node scripts/task10-coverage.mjs [--write | --check]
// Classifies every top-level declaration of ChineseDungeon.html as ported in app/src,
// assigned to an implementation packet, covered only by an audit packet, or unassigned.
// "Ported" is a static heuristic (declaration with the source name, or a `Source \`name\``
// comment documenting a declaration); it is planning evidence, not proof of equivalence.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(root + 'app/package.json');
const ts = require('typescript');
const html = readFileSync(root + 'reference/chinese-dungeon/ChineseDungeon.html', 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(m => m[1]).filter(t => t.trim());
const text = scripts[0];
const ast = ts.createSourceFile('m.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const decls = [];
const lineOf = p => ast.getLineAndCharacterOfPosition(p).line + 1;
const visit = (stmts, scope) => {
  for (const s of stmts) {
    if (ts.isFunctionDeclaration(s) && s.name) decls.push({ kind: 'function', name: s.name.text, scope, start: lineOf(s.getStart(ast)), end: lineOf(s.getEnd()) });
    else if (ts.isClassDeclaration(s) && s.name) decls.push({ kind: 'class', name: s.name.text, scope, start: lineOf(s.getStart(ast)), end: lineOf(s.getEnd()) });
    else if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)))
        decls.push({ kind: 'varfn', name: d.name.text, scope, start: lineOf(s.getStart(ast)), end: lineOf(s.getEnd()) });
    }
    else if (ts.isExpressionStatement(s) && ts.isCallExpression(s.expression)) {
      const e = s.expression; const cb = e.arguments[1];
      if (ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === 'addEventListener' && cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) && ts.isBlock(cb.body)) {
        const ev = e.arguments[0] && ts.isStringLiteral(e.arguments[0]) ? e.arguments[0].text : '?';
        decls.push({ kind: 'listener', name: `${e.expression.expression.getText(ast).slice(0,30)}:${ev}`, scope, start: lineOf(s.getStart(ast)), end: lineOf(s.getEnd()) });
        if (ev === 'DOMContentLoaded') visit(cb.body.statements, 'dom-ready');
      }
    }
  }
};
visit(ast.statements, 'top');
// packet coverage
const catalog = JSON.parse(readFileSync(root + 'docs/task-10/packet-pool/catalog.json', 'utf8'));
const packetOf = new Map();
for (const p of catalog.new_packets) for (const s of p.sources || []) if (s.page === 'ChineseDungeon.html') packetOf.set(s.name, p.id);
// Original four packets predate the catalog; their declaration scope is fixed by their acceptance text.
const ORIGINAL = { 武器类: 't10-weapon-contract-audit', 药水类: 't10-potion-base-contracts', 饰品: 't10-accessory-contracts',
  陷阱先锋饰品: 't10-accessory-contracts', 飞毛腿饰品: 't10-accessory-contracts', 瞬间移动饰品: 't10-accessory-contracts',
  博士之卷饰品: 't10-accessory-contracts', 恢复之心饰品: 't10-accessory-contracts', 以牙还牙饰品: 't10-accessory-contracts',
  嗅探之鼻饰品: 't10-accessory-contracts' };
for (const [name, id] of Object.entries(ORIGINAL)) if (!packetOf.has(name)) packetOf.set(name, id);
// rewrite coverage: names mentioned in src
const srcText = [];
const walk = dir => { for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) { const p = dir + '/' + e.name; if (e.isDirectory()) walk(p); else if (p.endsWith('.ts') || p.endsWith('.tsx')) srcText.push(readFileSync(p, 'utf8')); } };
walk(root + 'app/src');
const src = srcText.join('\n');
const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const OVERRIDES = { 注册全局类: 'app/src/game/runtime/class-registry.ts', 状态效果: 'app/src/game/status-effect.ts', 门: 'app/src/game/door.ts', 物品: 'app/src/game/item-core.ts', 防御装备类: 'app/src/game/armor.ts', 生成玩家距离图: 'app/src/domain/distance-map.ts' };
const srcLines = src.split('\n');
const citedPort = n => {
  const re = new RegExp('[Ss]ource `(async |new )?' + n + '[`( ]');
  for (let i = 0; i < srcLines.length; i++) {
    if (!re.test(srcLines[i]) || /packet `|\(path-search|contract\)/.test(srcLines[i])) continue;
    let j = i; // the declaration the comment documents
    while (j < srcLines.length && (/^\s*(\/\/|\/\*\*|\*)/.test(srcLines[j]) || j === i)) { if (j > i + 12) break; if (/\*\/\s*$/.test(srcLines[j]) && j >= i) { j++; break; } j++; }
    const decl = srcLines[j] || '';
    if (/^\s*(export\s+)?(async\s+)?(function|class|const|let)\b/.test(decl) || /\)\s*(:[^;{]*)?\{\s*$/.test(decl) || /=>\s*\{?\s*$/.test(decl)) return true;
  }
  return false;
};
const ported = d => {
  if (d.kind === 'listener') return false;
  if (OVERRIDES[d.name]) return true;
  const n = esc(d.name);
  return citedPort(n) ||
    new RegExp('(function|class)\\s+' + n + '(?![\\p{L}\\p{N}_$])', 'u').test(src) ||
    new RegExp('(^|[\\s{,])(async\\s+)?' + n + '\\s*\\([^)]*\\)\\s*(:[^{\\n]*)?\\{', 'mu').test(src);
};
const mentioned = d => src.includes(d.name);
const rows = decls.map(d => ({ ...d, lines: d.end - d.start + 1, packet: packetOf.get(d.name) || '', ported: ported(d), mentioned: mentioned(d) }));
// ---- classification and report ----
const modeOf = new Map(catalog.new_packets.map(p => [p.id, p.mode]));
modeOf.set('t10-weapon-contract-audit', 'audit'); modeOf.set('t10-potion-base-contracts', 'classes'); modeOf.set('t10-accessory-contracts', 'classes');
const AREAS = [
  ['editor', /编辑器|扳手|属性编辑器|undo|redo|笔刷|油漆桶/i],
  ['big-map', /大地图/],
  ['workshop-levels', /关卡|创意|工坊|种子筛选|联机/],
  ['tutorial', /教程/],
  ['settings', /设置|风格|命令行|文本模式|动画模式|HUD/],
  ['canvas-fx', /^set(Fill|Stroke|LineWidth|Font|Align|Shadow)$|特效|动画|浮动文字|屏显|粒子|Particles|Background|指示器|handleResize/],
  ['windows-menus', /窗口|界面|菜单|对话框|图鉴|配方书|通知|日志|背包|显示|打开|关闭|隐藏|刷新|切换/],
];
const areaOf = r => {
  if (r.packet) return r.packet;
  if (r.kind === 'listener') return 'dom-listeners';
  for (const [area, re] of AREAS) if (re.test(r.name)) return area;
  return 'core-unassigned';
};
for (const r of rows) {
  const mode = r.packet ? modeOf.get(r.packet) : null;
  r.status = r.kind === 'listener' ? 'dom-listener' : r.ported ? 'ported' : mode && mode !== 'audit' ? 'packet' : mode === 'audit' ? 'audit-only' : 'unassigned';
  r.overlap = r.ported && mode && mode !== 'audit' ? r.packet : null;
  r.area = areaOf(r);
  delete r.mentioned;
}
const sum = a => a.reduce((s, r) => s + r.lines, 0);
const STATUS = [
  ['ported', 'Ported in `app/src` (foundation + primary world kernel)'],
  ['packet', 'Assigned to a secondary implementation packet, not yet ported'],
  ['audit-only', 'Covered only by an audit packet: implementation is primary/integration work'],
  ['unassigned', 'No packet: primary/integration work (mostly DOM UI)'],
  ['dom-listener', 'Top-level DOM event listeners (input/UI wiring)'],
];
const md = [];
md.push('# Task #10 integration coverage ledger', '');
md.push('Generated by `node scripts/task10-coverage.mjs --write` from the pinned `ChineseDungeon.html`, the packet catalog and the current `app/src`. Machine-readable rows: [coverage-ledger.json](coverage-ledger.json).', '');
md.push('Scope: the 757 top-level statements of the main page that declare a function, class, function-valued `const`, or a block-bodied `addEventListener` callback (488 functions + 252 classes + 3 function constants + 14 listeners; the 16 nested functions of the lexical inventory are counted inside their parents). Line counts are inline-JS lines of each declaration.', '');
md.push('"Ported" is a **static heuristic**: a declaration in `app/src` with the source name, a factory method with that name, or a `Source \\`name\\`` comment directly documenting a declaration. It is planning evidence; equivalence is only claimed by the differential tests named in VERIFICATION.md.', '');
md.push('## Summary', '', '| Status | Declarations | Source lines | Share of lines |', '| --- | ---: | ---: | ---: |');
const total = sum(rows);
for (const [key, label] of STATUS) { const a = rows.filter(r => r.status === key); md.push(`| ${label} | ${a.length} | ${sum(a)} | ${(100 * sum(a) / total).toFixed(1)}% |`); }
md.push(`| **Total** | ${rows.length} | ${total} | 100% |`, '');
const overlaps = rows.filter(r => r.overlap);
md.push('## Overlaps between primary ports and implementation packets', '');
if (!overlaps.length) md.push('None.', '');
else { md.push('These declarations are already ported in `app/src` although an implementation packet also owns them. A secondary taking that packet must reuse or reconcile the existing port instead of re-implementing it; the primary reviews any divergence.', '', '| Declaration | Packet | Lines |', '| --- | --- | ---: |');
  for (const r of overlaps) md.push(`| \`${r.name}\` (JS L${r.start}) | \`${r.overlap}\` | ${r.lines} |`); md.push(''); }
md.push('## Primary / integration backlog by area', '', 'Every declaration below is neither ported nor owned by an implementation packet. Audit-packet areas name the audit whose evidence should be read (or produced) before the primary implementation.', '', '| Area | Declarations | Source lines | Largest declarations |', '| --- | ---: | ---: | --- |');
const backlog = rows.filter(r => r.status === 'audit-only' || r.status === 'unassigned' || r.status === 'dom-listener');
const areas = new Map();
for (const r of backlog) { if (!areas.has(r.area)) areas.set(r.area, []); areas.get(r.area).push(r); }
for (const [area, list] of [...areas].sort((a, b) => sum(b[1]) - sum(a[1]) || (a[0] < b[0] ? -1 : 1))) {
  const top = [...list].sort((a, b) => b.lines - a.lines || a.start - b.start);
  md.push(`| ${area} | ${list.length} | ${sum(list)} | ${top.slice(0, 8).map(r => `\`${r.name}\` (${r.lines})`).join(', ')}${top.length > 8 ? ', …' : ''} |`);
}
md.push('', `Backlog total: ${backlog.length} declarations, ${sum(backlog)} source lines.`, '');
md.push('## Implementation packets still open', '', '| Packet | Declarations | Source lines |', '| --- | ---: | ---: |');
const pk = new Map();
for (const r of rows.filter(r => r.status === 'packet')) { if (!pk.has(r.packet)) pk.set(r.packet, []); pk.get(r.packet).push(r); }
for (const [id, list] of [...pk].sort((a, b) => sum(b[1]) - sum(a[1]) || (a[0] < b[0] ? -1 : 1))) md.push(`| \`${id}\` | ${list.length} | ${sum(list)} |`);
md.push('');
const jsonText = JSON.stringify({ schema: 1, source: 'reference/chinese-dungeon/ChineseDungeon.html', rows: rows.map(({ kind, name, start, end, lines, status, packet, area, overlap }) => ({ kind, name, start, end, lines, status, packet: packet || null, area, overlap })) }, null, 1) + '\n';
const mdText = md.join('\n');
const files = [[root + 'docs/task-10/COVERAGE.md', mdText], [root + 'docs/task-10/coverage-ledger.json', jsonText]];
const mode = process.argv[2];
if (mode === '--write') for (const [f, t] of files) writeFileSync(f, t);
else if (mode === '--check') { const stale = files.filter(([f, t]) => { try { return readFileSync(f, 'utf8') !== t; } catch { return true; } }); if (stale.length) { console.error('stale:', stale.map(f => f[0]).join(', ')); process.exit(1); } }
else process.stdout.write(mdText);
