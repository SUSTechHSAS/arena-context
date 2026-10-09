import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFingerpointSeed, validateFingerpointBundle, downloadFingerpointBundle, scoreBundle, referenceSet, modelMembers, gitBlobId, MAX_PACKAGE_BYTES } from './fingerpoint-lib.mjs';
import { hash, packageId } from './fingerprint-lib.mjs';
import { decideWork, REFERENCE_MASS_MIN } from './model-gate.mjs';
import { prepare, score } from './fingerprint.mjs';

const seed = readFingerpointSeed();
const cases = JSON.parse(fs.readFileSync(new URL('./fixtures/fingerpoint.json', import.meta.url))).cases;
// Preserve the original single-tier fixture expectations as a regression.
const policy = { schema: 1, accepted_models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-sol'] };
const policyFetcher = async () => ({ ok: true, text: async () => JSON.stringify(policy) });
const require = createRequire(import.meta.url);
const { inspectPullRequest } = require('./protocol.cjs');
const { createTaskFiles } = require('./task-scaffold.cjs');

function taskRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-fingerpoint-test-'));
  const git = args => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git(['init', '-b', 'arena/test']); fs.mkdirSync(path.join(root, '.context'));
  fs.writeFileSync(path.join(root, '.context/TASK.md'), 'Unchanged task');
  git(['add', '.']); git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture']);
  return root;
}

test('pinned full bank matches upstream three-answer rankings and explicit policy membership', () => {
  const { bank, detector } = validateFingerpointBundle(seed);
  assert.equal(bank.models.length, 57);
  assert.equal(bank.models.reduce((n, m) => n + m.response_count, 0), 2128);
  assert.equal(detector.schema, 'shared-detector-v2');
  for (const example of cases) {
    const result = scoreBundle(example.raw, seed);
    assert.equal(result.nearest_class, example.expected.prediction);
    assert.equal(result.status, example.expected.status);
    assert.deepEqual(result.reference_models, example.expected.reference_models);
    for (const [i, candidate] of result.candidates.entries()) {
      const expected = example.expected.ranking[i];
      assert.equal(candidate.model, expected.model);
      assert.ok(Math.abs(candidate.score - expected.score) < 1e-12);
      assert.ok(Math.abs(candidate.reference_probability - expected.probability) < 1e-12);
    }
    assert.equal(decideWork(result, policy).allowed, example.expected.allowed);
    assert.equal(result.identified_candidate, null);
    assert.equal(result.upstream_decision, 'not_confirmed');
    assert.equal(result.probability_scope, 'reference-closed-set');
    assert.equal(result.identity_verified, false);
    assert.equal(result.arena_protocol_calibrated, false);
  }
});

test('the full reference set includes a fourth candidate and every boundary tie', () => {
  const rows = probabilities => probabilities.map(([model, probability]) => ({ model, probability }));
  const four = referenceSet(rows([['gpt-6-astra', .6], ['claude-opus-5.5', .2], ['claude-sonnet-5.5', .14], ['gpt-6-luna', .06]]));
  assert.equal(four.reference_classes.length, 4);
  assert.ok(four.reference_models.includes('gpt-6-luna'));
  const base = scoreBundle(cases.find(c => c.model === 'gpt-6-astra').raw, seed);
  assert.equal(decideWork({ ...base, ...four }, policy).reason, 'reference_model_not_accepted');
  const tied = referenceSet(rows([['claude-opus-5.5', .8], ['gpt-6-sol', .1], ['gpt-6-luna', .05], ['deepseek-v4-pro', .05]]));
  assert.equal(tied.reference_classes.length, 4);
  assert.deepEqual(referenceSet(rows([['gpt-6-sol', .95], ['gpt-6-luna', .05]])).reference_models, ['gpt-6-sol']);
  for (const probabilities of [[['gpt-6-sol', 1]], [['gpt-6-sol', .8], ['gpt-6-luna', .8]], [['gpt-6-sol', NaN], ['gpt-6-luna', .1]]]) {
    assert.throws(() => referenceSet(rows(probabilities)), /probabilities_invalid/);
  }
});

test('the merged Astra/Sol identity can never authorize only one of its members', () => {
  const result = scoreBundle(cases.find(c => c.model === 'gpt-6-astra').raw, seed);
  assert.deepEqual(result.reference_models, ['gpt-6-astra', 'gpt-6.1-sol']);
  for (const id of result.reference_models) {
    const denied = decideWork(result, { ...policy, accepted_models: policy.accepted_models.filter(m => m !== id) });
    assert.equal(denied.allowed, false); assert.deepEqual(denied.rejected_models, [id]);
  }
  assert.equal(decideWork({ ...result, status: 'reference_match', reference_models: ['gpt-6-astra'] }, policy).allowed, false);
  for (const patch of [{ reference_models: [] }, { reference_classes: [] }, { reference_mass: NaN },
    { reference_mass: REFERENCE_MASS_MIN - 1e-6 }, { reference_mass_min: .5 }, { sample_count: 1 },
    { identity_verified: true }, { identified_candidate: 'gpt-6-astra' }, { probability_scope: 'identity' }]) {
    assert.equal(decideWork({ ...result, ...patch }, policy).allowed, false);
  }
  assert.deepEqual(modelMembers('claude-fable-5.1'), ['claude-fable-5-1']);
  assert.deepEqual(modelMembers('claude-opus-5.50'), ['claude-opus-5.50']);
});

test('single, duplicated, incomplete, patterned, and out-of-range samples cannot pass', () => {
  const arrays = JSON.parse(cases[0].raw);
  const bad = [JSON.stringify(arrays[0]), JSON.stringify([arrays[0], arrays[0], arrays[0]]),
    JSON.stringify(arrays.slice(0, 2)), '```json\n' + cases[0].raw + '\n```'];
  for (const replacement of [[0, 356], Array(301).fill(42), Array.from({ length: 301 }, (_, i) => i + 1)]) {
    bad.push(JSON.stringify([replacement, arrays[1], arrays[2]]));
  }
  for (const raw of bad) assert.equal(scoreBundle(raw, seed).status, 'invalid');
  assert.equal(scoreBundle(JSON.stringify([[5, 34, 13, 66], arrays[1], arrays[2]]), seed).status, 'insufficient');
});

test('code, probes, bank, detector dimensions, and calibration binding must stay compatible', () => {
  assert.throws(() => validateFingerpointBundle({ ...seed, code_sha256: {} }), /engine_update_required/);
  assert.throws(() => validateFingerpointBundle({ ...seed, challenges: [] }), /probe_changed/);
  assert.throws(() => validateFingerpointBundle({ ...seed, bank_sha256: '0'.repeat(64) }), /bank_hash_mismatch/);
  assert.throws(() => validateFingerpointBundle({ ...seed, detector_sha256: '0'.repeat(64) }), /detector_hash_mismatch/);
  const original = JSON.parse(gunzipSync(Buffer.from(seed.detector_gzip_base64, 'base64')));
  for (const mutate of [d => { d.ranker.positional.weights[0].pop(); }, d => { d.calibration.binding.reference_sha256 = '0'.repeat(64); },
    d => { d.model_ids.reverse(); }, d => { d.ranker.full_params[0].scale[0] = 0; }]) {
    const detector = structuredClone(original); mutate(detector);
    const text = JSON.stringify(detector), bundle = { ...seed, detector_sha256: hash(text), detector_git_blob_sha1: gitBlobId(text), detector_gzip_base64: gzipSync(text, { level: 1 }).toString('base64') };
    assert.throws(() => validateFingerpointBundle(bundle), /schema_changed|calibration_unavailable|bank_detector_mismatch/);
  }
});

test('refresh pins API metadata to one commit, rejects new code before data, and never follows download_url', async () => {
  const calls = [];
  await assert.rejects(downloadFingerpointBundle(async (url, options) => {
    calls.push(url); assert.equal(new URL(url).origin, 'https://api.github.com'); assert.equal(options.redirect, 'error');
    const text = url.endsWith('/git/ref/heads/main') ? JSON.stringify({ object: { sha: seed.source_commit } }) :
      JSON.stringify([{ type: 'file', path: 'shared/fingerprint-core.js', sha: '0'.repeat(40), download_url: 'https://forbidden.invalid/file' }]);
    return { ok: true, url, text: async () => text };
  }), /engine_update_required/);
  assert.equal(calls.length, 3);
  assert.ok(calls.slice(1).every(url => url.endsWith('?ref=' + seed.source_commit)));
  assert.ok(calls.every(url => !url.includes('unified_bank.json') && !url.includes('shared_detector.json')));
  await assert.rejects(downloadFingerpointBundle(async () => ({ ok: true, url: 'https://elsewhere.invalid/', text: async () => '{}' })), /redirect/);
});

test('unchanged upstream blobs reuse the exact package without downloading the large artifacts', async () => {
  const trusted = JSON.parse(fs.readFileSync(new URL('../vendor/fingerpoint/provenance.json', import.meta.url)));
  const entries = Object.entries(trusted.upstream_git_blob_sha1).map(([path, sha]) => ({ type: 'file', path, sha }));
  entries.push({ type: 'file', path: 'data/unified_bank.json', sha: seed.bank_git_blob_sha1, size: 11559335 },
    { type: 'file', path: 'data/shared_detector.json', sha: seed.detector_git_blob_sha1, size: 21249213 });
  const calls = [];
  const fresh = await downloadFingerpointBundle(async (url, options) => {
    calls.push(url); assert.equal(options.redirect, 'error');
    const text = url.endsWith('/git/ref/heads/main') ? JSON.stringify({ object: { sha: 'b'.repeat(40) } }) : JSON.stringify(entries);
    return { ok: true, url, text: async () => text };
  }, seed);
  assert.equal(fresh, seed); assert.equal(calls.length, 3);
  assert.equal(packageId(fresh), packageId(seed));
});

test('compatible changed data is downloaded, blob-checked and frozen with its matching detector', async () => {
  const trusted = JSON.parse(fs.readFileSync(new URL('../vendor/fingerpoint/provenance.json', import.meta.url)));
  const { bank, detector } = validateFingerpointBundle(seed);
  bank.built_at = detector.bank_built_at = '2099-01-01T00:00:00+00:00';
  const bodies = { 'data/unified_bank.json': JSON.stringify(bank), 'data/shared_detector.json': JSON.stringify(detector) };
  const entries = Object.entries(trusted.upstream_git_blob_sha1).map(([path, sha]) => ({ type: 'file', path, sha }));
  entries.push(...Object.entries(bodies).map(([path, text]) => ({ type: 'file', path, sha: gitBlobId(text), size: Buffer.byteLength(text) })));
  const calls = [];
  const fresh = await downloadFingerpointBundle(async (url, options) => {
    calls.push(url);
    let text;
    if (url.endsWith('/git/ref/heads/main')) text = JSON.stringify({ object: { sha: 'c'.repeat(40) } });
    else {
      assert.equal(new URL(url).searchParams.get('ref'), 'c'.repeat(40));
      const name = new URL(url).pathname.split('/contents/')[1];
      text = bodies[name] || JSON.stringify(entries);
      if (bodies[name]) assert.equal(options.timeoutMs, 60_000);
    }
    return { ok: true, url, text: async () => text };
  }, seed);
  assert.equal(calls.length, 5); assert.equal(fresh.bank_version, bank.built_at);
  assert.equal(fresh.source_commit, 'c'.repeat(40)); assert.notEqual(packageId(fresh), packageId(seed));
  assert.equal(fresh.bank_sha256, hash(bodies['data/unified_bank.json']));
  assert.deepEqual(scoreBundle(cases[0].raw, fresh).reference_models, cases[0].expected.reference_models);
});

test('fresh-cache fallback never chooses a legacy bank, and prepare never generates answers', async () => {
  const root = taskRoot();
  try {
    const first = await prepare(root, { offline: true, policyFetcher });
    assert.equal(first.action, 'GENERATE_SAMPLE'); assert.equal(first.sample_count, 3);
    assert.deepEqual(first.challenges.map(c => c.expected_count), [301, 319, 327]);
    assert.equal(fs.existsSync(path.join(root, first.raw_path)), false);
    const legacy = JSON.parse(fs.readFileSync(new URL('../vendor/modeltrace/seed.json', import.meta.url)));
    const old = path.join(root, '.context/fingerprints/20990101T000000Z-aabbccdd'); fs.mkdirSync(old);
    fs.writeFileSync(path.join(old, 'manifest.json'), JSON.stringify({ package_id: packageId(legacy) }));
    fs.writeFileSync(path.join(root, '.context/fingerprints/banks', packageId(legacy) + '.json'), JSON.stringify(legacy));
    const next = await prepare(root, { policyFetcher, fetcher: async () => { throw new Error('test network unavailable'); } });
    assert.equal(next.provider, 'fingerpoint'); assert.equal(next.freshness, 'cached-fallback');
    assert.match(next.refresh_error, /test network unavailable/);
    assert.equal(score(root, next.turn_id).gate.allowed, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('CLI preserves three raw answers and returns the intentional allow/deny exit codes', async () => {
  for (const model of ['gpt-6-astra', 'gpt-6-luna']) {
    const root = taskRoot();
    try {
      const first = await prepare(root, { offline: true, policyFetcher }), example = cases.find(c => c.model === model);
      fs.writeFileSync(path.join(root, first.raw_path), example.raw);
      const cli = fileURLToPath(new URL('./fingerprint.mjs', import.meta.url));
      const run = spawnSync(process.execPath, [cli, 'score', first.turn_id], { cwd: root, encoding: 'utf8' });
      assert.equal(run.status, example.expected.allowed ? 0 : 20, run.stderr);
      const report = JSON.parse(run.stdout); assert.equal(report.sample_count, 3);
      assert.equal(report.gate.allowed, example.expected.allowed);
      assert.equal(fs.readFileSync(path.join(root, first.raw_path), 'utf8'), example.raw);
      assert.equal(fs.readFileSync(path.join(root, '.context/TASK.md'), 'utf8'), 'Unchanged task');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
});

test('CI recomputes the full Fingerpoint evidence and rejects forged membership, scores, and revocation', async () => {
  const root = taskRoot();
  try {
    const first = await prepare(root, { offline: true, policyFetcher });
    fs.writeFileSync(path.join(root, first.raw_path), cases.find(c => c.model === 'gpt-6-astra').raw);
    const result = score(root, first.turn_id), prefix = path.dirname(first.raw_path);
    const repo = { owner: 'SUSTechHSAS', repo: 'arena-context' }, full_name = 'SUSTechHSAS/arena-context', head = 'a'.repeat(40);
    const files = createTaskFiles({ issue: { number: 1, title: 'Test', html_url: `https://github.com/${full_name}/issues/1`, body: 'Goal' }, branch: 'AerraGen-main', protocolSha: head });
    files['.context/STATE.md'] = files['.context/STATE.md'].replace('Work branch / PR: not created', 'Work branch / PR: arena/test')
      .replace('## Current objective', `- Fingerprint: ${prefix}/report.json\n\n## Current objective`);
    files[first.raw_path] = fs.readFileSync(path.join(root, first.raw_path), 'utf8');
    files[prefix + '/manifest.json'] = fs.readFileSync(path.join(root, prefix, 'manifest.json'), 'utf8');
    const bankPath = `.context/fingerprints/banks/${result.package_id}.json`;
    files[bankPath] = fs.readFileSync(path.join(root, bankPath), 'utf8');
    assert.ok(Buffer.byteLength(files[bankPath]) > 10_000_000 && Buffer.byteLength(files[bankPath]) < MAX_PACKAGE_BYTES);
    let currentPolicy = policy;
    const github = { rest: { pulls: { listFiles() {} }, repos: { getContent: async ({ path, ref }) => {
      const text = ref === 'main' && path === '.github/fingerprint-policy.json' ? JSON.stringify(currentPolicy) : files[path];
      if (text === undefined) throw Object.assign(new Error('missing'), { status: 404 });
      return { data: { type: 'file', size: Buffer.byteLength(text), encoding: 'base64', content: Buffer.from(text).toString('base64') } };
    } } }, paginate: async () => [{ filename: '.context/STATE.md', status: 'modified' }] };
    const pr = { number: 1, changed_files: 1, base: { ref: 'AerraGen-main', sha: head, repo: { full_name } }, head: { ref: 'arena/test', sha: head, repo: { full_name } } };
    const check = async changed => { files[prefix + '/report.json'] = JSON.stringify(changed); return inspectPullRequest({ github, repo, pr }); };
    assert.deepEqual((await check(result)).errors, []);
    const rounded = structuredClone(result); rounded.candidates[0].score += 1e-13;
    assert.deepEqual((await check(rounded)).errors, []);
    rounded.candidates[0].score += 1e-4;
    assert.ok((await check(rounded)).errors.some(e => e.includes('candidates')));
    for (const patch of [{ reference_models: ['gpt-6-astra'] }, { reference_mass: 0.5 }, { detector_sha256: '0'.repeat(64) },
      { upstream_decision: 'confirmed' }, { sample_count: 1 }, { gate: { allowed: false, action: 'END_TURN' } }]) {
      assert.ok((await check({ ...result, ...patch })).errors.length);
    }
    currentPolicy = { ...policy, accepted_models: ['gpt-6-astra'] };
    assert.ok((await check(result)).errors.some(e => e.includes('reference_model_not_accepted')));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
