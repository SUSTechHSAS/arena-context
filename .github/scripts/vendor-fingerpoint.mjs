#!/usr/bin/env node
// Maintenance only, after reviewing the upstream source. Never run by prepare
// or CI. Requires Node 24 for type stripping; generated runtime code is plain JS.
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const [source, commit] = process.argv.slice(2);
if (!source || !/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('Usage: node vendor-fingerpoint.mjs <reviewed-upstream-directory> <full-commit>');
const declared = fs.existsSync(path.join(source, '.git'))
  ? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim()
  : fs.readFileSync(path.join(source, 'UPSTREAM_COMMIT'), 'utf8').trim();
if (declared !== commit) throw new Error('Upstream directory does not match the declared commit.');
const vendor = fileURLToPath(new URL('../vendor/fingerpoint/', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const blob = bytes => createHash('sha1').update(`blob ${Buffer.byteLength(bytes)}\0`).update(bytes).digest('hex');
const mapping = { 'shared/fingerprint-core.js': 'fingerprint-core.mjs', 'shared/positional.ts': 'positional.mjs', 'shared/shared-detector.ts': 'shared-detector.mjs' };
const upstream_code_sha256 = {}, upstream_git_blob_sha1 = {}, vendored_code_sha256 = {};
fs.mkdirSync(vendor, { recursive: true });
for (const [from, to] of Object.entries(mapping)) {
  const raw = fs.readFileSync(path.join(source, from), 'utf8');
  upstream_code_sha256[from] = hash(raw); upstream_git_blob_sha1[from] = blob(raw);
  let code = from.endsWith('.ts') ? stripTypeScriptTypes(raw, { mode: 'strip' }) : raw;
  code = code.replaceAll("'./fingerprint-core.js'", "'./fingerprint-core.mjs'").replaceAll("'./positional'", "'./positional.mjs'").replace(/[ \t]+$/gm, '');
  fs.writeFileSync(path.join(vendor, to), code); vendored_code_sha256[to] = hash(code);
}
const suitePath = 'data/enrollment-suite.json', suite = fs.readFileSync(path.join(source, suitePath), 'utf8');
upstream_code_sha256[suitePath] = hash(suite); upstream_git_blob_sha1[suitePath] = blob(suite);
const probes = JSON.parse(suite).filter(p => p.condition === 'environment-06').map(p => ({ id: p.challenge_id, expected_count: p.expected_count, prompt: p.prompt }));
if (probes.length !== 3) throw new Error('Review the new probe suite before changing the integration.');
fs.writeFileSync(path.join(vendor, 'probes.json'), JSON.stringify(probes, null, 2) + '\n');
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(vendor, 'LICENSE'));
const provenance = { source: 'https://github.com/Ikaleio/lm-detector', website: 'https://lm.ikale.io', commit, license: 'MIT',
  upstream_code_sha256, upstream_git_blob_sha1, vendored_code_sha256 };
const saveProvenance = () => fs.writeFileSync(path.join(vendor, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
saveProvenance();
const { createFingerpointBundle } = await import('./fingerpoint-lib.mjs');
const { packageId } = await import('./fingerprint-lib.mjs');
const bundle = createFingerpointBundle({ source_commit: commit, code_sha256: upstream_code_sha256,
  bank_text: fs.readFileSync(path.join(source, 'data/unified_bank.json'), 'utf8'),
  detector_text: fs.readFileSync(path.join(source, 'data/shared_detector.json'), 'utf8') });
const bytes = gzipSync(JSON.stringify(bundle), { level: 9 });
fs.writeFileSync(path.join(vendor, 'seed.json.gz'), bytes);
Object.assign(provenance, { seed_sha256: hash(bytes), seed_package_id: packageId(bundle), seed_bank_sha256: bundle.bank_sha256,
  seed_detector_sha256: bundle.detector_sha256, seed_bank_version: bundle.bank_version });
saveProvenance();
console.log(JSON.stringify({ source_commit: commit, package_id: packageId(bundle), seed_bytes: bytes.length }));
