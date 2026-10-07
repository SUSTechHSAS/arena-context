import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const manifest = JSON.parse(readFileSync(new URL('../tests/reference/manifest.json', import.meta.url)));
assert.equal(manifest.commit, '8d80b5a4dd3d737ed6d3060f05611eaa3de611ab');
for (const file of manifest.files) {
  const bytes = readFileSync(new URL(`../tests/reference/chinese-dungeon/${file.path}`, import.meta.url));
  assert.equal(bytes.length, file.bytes, `${file.path}: length`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `${file.path}: SHA-256`);
  const header = Buffer.from(`blob ${bytes.length}\0`);
  assert.equal(createHash('sha1').update(header).update(bytes).digest('hex'), file.gitBlob, `${file.path}: Git blob`);
}
console.log(`Verified ${manifest.files.length} frozen reference files at ${manifest.commit}`);
