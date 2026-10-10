import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SOURCE_COMMIT = '8d80b5a4dd3d737ed6d3060f05611eaa3de611ab';
const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../reference');

/** Verify original bytes, never execute upstream code. */
export async function verifyReference(root = defaultRoot) {
  const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  if (manifest.schema !== 1 || manifest.commit !== SOURCE_COMMIT || manifest.license !== 'GPL-3.0') {
    throw new Error('Unexpected reference manifest identity');
  }
  if (!Array.isArray(manifest.files) || manifest.files.length !== 8) {
    throw new Error('Expected all eight upstream application/reference files');
  }
  const names = new Set();
  const results = [];
  for (const entry of manifest.files) {
    if (typeof entry.path !== 'string' || entry.path.includes('/') || entry.path.includes('\\') ||
        entry.path === '..' || names.has(entry.path)) {
      throw new Error(`Invalid or duplicate reference path: ${entry.path}`);
    }
    names.add(entry.path);
    const file = resolve(root, 'chinese-dungeon', entry.path);
    if (relative(resolve(root, 'chinese-dungeon'), file).startsWith('..')) {
      throw new Error('Reference path escapes snapshot');
    }
    const bytes = await readFile(file);
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== entry.bytes || actual !== entry.sha256) {
      throw new Error(`Reference checksum mismatch: ${entry.path}`);
    }
    results.push({ path: entry.path, bytes: bytes.length, sha256: actual });
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const results = await verifyReference();
  console.log(`Reference ${SOURCE_COMMIT}: ${results.length} unchanged files verified.`);
}
