import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { legacyScripts, walk } from './legacy-source.mjs';
const pages = ['ChineseDungeon.html', 'ChineseDungeon-Viewer.html', 'LevelManager.html', 'index.html'];
const inventory = { referenceCommit: '8d80b5a4dd3d737ed6d3060f05611eaa3de611ab', pages: [] };
for (const page of pages) {
  const declarations = [], globals = [], registrations = [], listeners = [];
  for (const script of legacyScripts(page)) {
    const line = (node) => node.loc.start.line + script.lineOffset;
    for (const node of script.ast.program.body) {
      if (node.type === 'VariableDeclaration') for (const value of node.declarations) {
        globals.push({ name: value.id.name ?? '<destructuring>', kind: node.kind, line: line(value) });
      }
    }
    walk(script.ast, (node) => {
      if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') declarations.push({
        name: node.id?.name ?? '<anonymous>', kind: node.type, line: line(node), endLine: node.loc.end.line + script.lineOffset,
        ...(node.superClass ? { extends: script.code.slice(node.superClass.start, node.superClass.end) } : {}),
      });
      if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && node.left.object.name === 'window' && node.right.type === 'Identifier') {
        registrations.push({ name: node.right.name, property: node.left.property.name, line: line(node) });
      }
      if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && ['addEventListener', 'on'].includes(node.callee.property.name)) {
        listeners.push({ event: node.arguments[0]?.value ?? '<dynamic>', line: line(node) });
      }
    });
  }
  inventory.pages.push({ page, declarations, globals, registrations, listeners });
}
const url = new URL('../docs/audit/source-inventory.json', import.meta.url);
const json = JSON.stringify(inventory, null, 2) + '\n';
if (process.argv.includes('--check')) assert.equal(readFileSync(url, 'utf8'), json, 'Audit inventory is stale');
else writeFileSync(url, json);
for (const p of inventory.pages) console.log(`${p.page}: ${p.declarations.length} declarations, ${p.globals.length} globals, ${p.registrations.length} window assignments, ${p.listeners.length} listeners`);
