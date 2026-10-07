import { mkdtempSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { referenceRoot, upstreamCommit, verifyReference } from '../scripts/reference.mjs';

it('pinned reference checksums and commit are verified', () => {
  expect(verifyReference().commit).toBe(upstreamCommit);
});
it('tampered reference fails verification before oracle execution', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dungeon-reference-'));
  const root = pathToFileURL(`${dir}/`);
  try {
    for (const name of ['manifest.json', 'ChineseDungeon.html', 'LICENSE']) {
      copyFileSync(new URL(name, referenceRoot), new URL(name, root));
    }
    const path = new URL('ChineseDungeon.html', root);
    writeFileSync(path, readFileSync(path, 'utf8') + '\n');
    expect(() => verifyReference(root)).toThrow('Reference checksum mismatch: ChineseDungeon.html');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
