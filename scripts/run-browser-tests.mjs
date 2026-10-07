import { readFileSync, mkdirSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
// Linux minimal sandbox lacks NSS/NSPR. Libraries come from pinned npm package,
// not forbidden apt/CDN hosts. Cache is reproducible and intentionally untracked.
if (process.platform === 'linux') {
  mkdirSync('.cache/chromium-libs', { recursive: true });
  const archive = brotliDecompressSync(readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br'));
  const extract = spawnSync('tar', ['xf', '-', '-C', '.cache/chromium-libs'], { input: archive });
  if (extract.status !== 0) throw new Error(`Library extraction failed: ${extract.stderr}`);
  process.env.LD_LIBRARY_PATH = `${resolve('.cache/chromium-libs/lib')}:${process.env.LD_LIBRARY_PATH ?? ''}`;
}
const result = spawnSync('node', ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
