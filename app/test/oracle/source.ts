/** TEST ONLY. This file must never be imported by src/ or bundled for production. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { applySourcePatches } from './source-patches';

export type DeclarationScope = 'top-level' | 'dom-ready';
export type ReferencePage = 'ChineseDungeon.html' | 'ChineseDungeon-Viewer.html' | 'LevelManager.html';
const referenceRoot = fileURLToPath(new URL('../../../reference/chinese-dungeon/', import.meta.url));
const cache = new Map<ReferencePage, { text: string; ast: ts.SourceFile }>();

export function readSource(page: ReferencePage = 'ChineseDungeon.html') {
  const existing = cache.get(page);
  if (existing) return existing;
  const html = readFileSync(resolve(referenceRoot, page), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)]
    .map(match => match[1]!).filter(text => text.trim().length > 0);
  if (scripts.length !== 1) throw new Error(`Expected one inline source script: ${page}`);
  const text = scripts[0]!;
  const ast = ts.createSourceFile(page + '.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  cache.set(page, { text, ast });
  return { text, ast };
}

/** Exact AST range plus any recorded upstream fix (oracle/source-patches.ts, owner rule 2026-10-10). */
export function declaration(name: string, page: ReferencePage = 'ChineseDungeon.html',
  scope: DeclarationScope = 'top-level'): string {
  const original = originalDeclaration(name, page, scope);
  return page === 'ChineseDungeon.html' && scope === 'top-level' ? applySourcePatches(name, original) : original;
}

/** Exact AST ranges, not hand-maintained copies or candidate implementations. */
export function originalDeclaration(name: string, page: ReferencePage = 'ChineseDungeon.html',
  scope: DeclarationScope = 'top-level'): string {
  const { text, ast } = readSource(page);
  let statements: readonly ts.Statement[] = ast.statements;
  if (scope === 'dom-ready') {
    const callbacks: ts.Block[] = [];
    for (const statement of ast.statements) {
      if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
      const expression = statement.expression;
      if (!ts.isPropertyAccessExpression(expression.expression) || expression.expression.name.text !== 'addEventListener') continue;
      const event = expression.arguments[0]; const callback = expression.arguments[1];
      if (event && ts.isStringLiteral(event) && event.text === 'DOMContentLoaded' && callback &&
          (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && ts.isBlock(callback.body)) callbacks.push(callback.body);
    }
    if (callbacks.length !== 1) throw new Error(`Need one explicit DOM-ready scope in ${page}`);
    statements = callbacks[0]!.statements;
  }
  const found = statements.filter(statement => {
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) return statement.name?.text === name;
    return ts.isVariableStatement(statement) && statement.declarationList.declarations.some(item =>
      ts.isIdentifier(item.name) && item.name.text === name);
  });
  if (found.length !== 1) throw new Error(`Need exactly one ${scope} ${name}; found ${found.length} in ${page}`);
  return text.slice(found[0]!.getStart(ast), found[0]!.getEnd());
}

export function createOracle(names: readonly string[], globals: Record<string, unknown> = {},
  page: ReferencePage = 'ChineseDungeon.html', scope: DeclarationScope = 'top-level') {
  const context = vm.createContext({ ...globals });
  new vm.Script(names.map(name => declaration(name, page, scope)).join('\n'), { filename: `original:${page}` })
    .runInContext(context, { timeout: 5000 });
  return {
    context,
    evaluate<T = unknown>(code: string): T {
      return new vm.Script(code).runInContext(context, { timeout: 5000 }) as T;
    },
    construct<T = unknown>(name: string, ...args: unknown[]): T {
      if (!names.includes(name)) throw new Error(`Not an exposed original declaration: ${name}`);
      context.__oracleArgs = args;
      try { return new vm.Script(`new ${name}(...__oracleArgs)`).runInContext(context, { timeout: 5000 }) as T; }
      finally { delete context.__oracleArgs; }
    },
    invoke<T = unknown>(name: string, ...args: unknown[]): T {
      if (!names.includes(name)) throw new Error(`Not an exposed original declaration: ${name}`);
      context.__oracleArgs = args;
      try { return new vm.Script(`${name}(...__oracleArgs)`).runInContext(context, { timeout: 5000 }) as T; }
      finally { delete context.__oracleArgs; }
    },
  };
}
