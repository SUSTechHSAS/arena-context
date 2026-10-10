import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { applySourcePatches, SOURCE_PATCHES } from './oracle/source-patches';
import { declaration, originalDeclaration } from './oracle/source';

const deviations = readFileSync(new URL('../../docs/task-10/DEVIATIONS.md', import.meta.url), 'utf8');

describe('recorded upstream fixes (owner rule 2026-10-10)', () => {
  it.each(SOURCE_PATCHES.map(patch => [patch.id, patch] as const))('%s applies exactly once, parses and is recorded', (_id, patch) => {
    const original = originalDeclaration(patch.declaration);
    const patched = applySourcePatches(patch.declaration, original, [patch.id]);
    expect(patched).not.toBe(original);
    // Only the recorded edits change: undoing them restores the exact source text.
    let undone = patched;
    for (const edit of [...patch.edits].reverse()) undone = undone.replace(edit.replace, () => edit.find);
    expect(undone).toBe(original);
    expect(() => new vm.Script(patched)).not.toThrow();
    expect(declaration(patch.declaration)).toBe(applySourcePatches(patch.declaration, original));
    const base = patch.id.replace(/[a-z]$/, '');
    const row = deviations.split('\n').find(line => line.startsWith(`| ${base} |`));
    expect(row, base).toBeDefined();
    expect(row).toContain('Fixed (primary decision');
    expect(row).toContain(patch.id);
  });

  it('a patch that does not match exactly once is rejected', () => {
    expect(() => applySourcePatches('净化HTML', 'function 净化HTML() {}')).toThrow(/expected exactly one match/);
    expect(() => applySourcePatches('净化HTML', "'>': '&gt;', '>': '&gt;',")).toThrow(/found 2/);
  });

});
