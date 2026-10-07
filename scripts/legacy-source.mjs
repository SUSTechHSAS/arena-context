import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
const cache = new Map();
export function legacyScripts(file = 'ChineseDungeon.html') {
  if (cache.has(file)) return cache.get(file);
  const html = readFileSync(new URL(`../tests/reference/chinese-dungeon/${file}`, import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/\bsrc\s*=/.test(match[1]))
    .map((match) => {
      const offset = match.index + match[0].indexOf('>') + 1;
      const lineOffset = html.slice(0, offset).split('\n').length - 1;
      const code = match[2];
      return { code, lineOffset, ast: parse(code, { sourceType: 'script' }) };
    });
  cache.set(file, scripts);
  return scripts;
}
export function walk(node, visit, parent = null) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'comments', 'tokens', 'errors'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit, node));
    else if (value && typeof value === 'object') walk(value, visit, node);
  }
}
export function declaration(name, file = 'ChineseDungeon.html') {
  const found = [];
  for (const script of legacyScripts(file)) walk(script.ast, (node) => {
    if (['FunctionDeclaration', 'ClassDeclaration'].includes(node.type) && node.id?.name === name) {
      found.push(script.code.slice(node.start, node.end));
    }
  });
  if (found.length !== 1) throw new Error(`Expected one declaration for ${name}, found ${found.length}`);
  return found[0];
}
