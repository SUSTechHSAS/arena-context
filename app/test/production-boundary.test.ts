import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('production source imports stay in src/framework, never original fixtures or Node VM', () => {
  const root = fileURLToPath(new URL('../src/', import.meta.url));
  const files = readdirSync(root, { recursive: true }).map(String).filter(path => /\.tsx?$/.test(path));
  expect(files.length).toBeGreaterThan(5);
  for (const file of files) {
    const path = resolve(root, file);
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      expect(specifier, file).not.toMatch(/reference|oracle|node:|\/test\//);
      if (specifier.startsWith('.')) expect(resolve(dirname(path), specifier).startsWith(root)).toBe(true);
      else expect(['react', 'react-dom/client'], file).toContain(specifier);
    }
  }
});
