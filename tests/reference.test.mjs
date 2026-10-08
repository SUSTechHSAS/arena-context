import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyReference } from '../scripts/verify-reference.mjs';

async function withCopy(callback) {
  const dir = await mkdtemp(resolve(tmpdir(), 'task-10-reference-'));
  try {
    await cp(new URL('../reference/', import.meta.url), dir, { recursive: true });
    await callback(dir);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('all eight pinned upstream files retain exact bytes', async () => {
  const files = await verifyReference();
  assert.equal(files.length, 8);
  assert.ok(files.some(file => file.path === '自定义NPC演示.json'));
});

test('one-byte source mutation is rejected', async () => withCopy(async dir => {
  const file = resolve(dir, 'chinese-dungeon/index.html');
  const bytes = await readFile(file);
  bytes[0] ^= 1;
  await writeFile(file, bytes);
  await assert.rejects(verifyReference(dir), /checksum mismatch: index.html/);
}));

test('different source commit cannot silently replace the contract', async () => withCopy(async dir => {
  const file = resolve(dir, 'manifest.json');
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  manifest.commit = '0'.repeat(40);
  await writeFile(file, JSON.stringify(manifest));
  await assert.rejects(verifyReference(dir), /manifest identity/);
}));

test('duplicate fixture names are rejected', async () => withCopy(async dir => {
  const file = resolve(dir, 'manifest.json');
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  manifest.files[1] = manifest.files[0];
  await writeFile(file, JSON.stringify(manifest));
  await assert.rejects(verifyReference(dir), /duplicate reference path/);
}));

test('manifest cannot read outside the reference directory', async () => withCopy(async dir => {
  const file = resolve(dir, 'manifest.json');
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  manifest.files[0].path = '../../AGENTS.md';
  await writeFile(file, JSON.stringify(manifest));
  await assert.rejects(verifyReference(dir), /Invalid or duplicate reference path/);
}));
