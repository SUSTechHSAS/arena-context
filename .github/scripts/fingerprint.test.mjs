import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { downloadBundle, hash, packageId, scoreSample, validateBundle, websiteManifest } from './fingerprint-lib.mjs';
import { prepare, score } from './fingerprint.mjs';
import { decideWork } from './model-gate.mjs';
const seed = JSON.parse(fs.readFileSync(new URL('../vendor/modeltrace/seed.json', import.meta.url)));
const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/fingerprint.json', import.meta.url))).fixtures;
const policyFetcher = async () => ({ ok: true, text: async () => JSON.stringify({ schema: 1, accepted_models: ['claude-fable-5-1'] }) });
const ambiguityRaw = fs.readFileSync(new URL('./fixtures/allowed-ambiguity.json', import.meta.url), 'utf8');

test('matches website ranking/verdict/fit/separation for nine recorded examples', () => {
  for (const f of fixtures) {
    const result = scoreSample(f.raw, { ...seed, challenge: { ...seed.challenge, expected_count: f.expected_count } }, seed.code_sha256);
    assert.equal(result.status, f.expected.status); assert.equal(result.nearest_model, f.expected.nearest_model);
    assert.ok(Math.abs(result.fit - f.expected.fit) < 1e-12); assert.ok(Math.abs(result.separation - f.expected.separation) < 1e-12);
    assert.equal('probability' in result, false);
  }
});
test('rejects counted/constant/too-short/malformed answers without repairing the sample', () => {
  for (const raw of [JSON.stringify(Array.from({ length: 301 }, (_, i) => i + 1)), JSON.stringify(Array(301).fill(42)), '[0,356]', 'not JSON']) {
    assert.equal(scoreSample(raw, seed, seed.code_sha256).status, 'invalid');
  }
  assert.equal(scoreSample('[5,34,13,66]', seed, seed.code_sha256).status, 'insufficient');
});
test('bank hash and incompatible engine cannot silently change', () => {
  assert.throws(() => validateBundle({ ...seed, bank_text: seed.bank_text + ' ' }, seed.code_sha256), /hash/);
  assert.throws(() => validateBundle({ ...seed, code_sha256: {} }, seed.code_sha256), /engine_update/);
});
test('ambiguity uses the entire bank, including unlisted models outside the display top three and other families', () => {
  const bank = JSON.parse(seed.bank_text);
  const index = bank.models.findIndex(m => m.id === 'gpt-6.1-sol');
  for (const id of ['fixture-close-a', 'fixture-close-b', 'fixture-close-c']) {
    bank.models.push({ ...structuredClone(bank.models[index]), id });
    bank.robust.model_order.push(id);
    bank.robust.hellinger.centroids.push(structuredClone(bank.robust.hellinger.centroids[index]));
    bank.robust.ordered_blocks.centroids.push(structuredClone(bank.robust.ordered_blocks.centroids[index]));
    for (const group of bank.robust.ordered_blocks.environment_centroids) group.push(structuredClone(group[index]));
  }
  const scoreBank = thresholds => {
    const bankText = JSON.stringify(bank);
    return scoreSample(ambiguityRaw, { ...seed, bank_text: bankText, bank_sha256: hash(bankText),
      verdict: { ...seed.verdict, thresholds: { ...seed.verdict.thresholds, ...thresholds } } }, seed.code_sha256);
  };
  const result = scoreBank({});
  assert.equal(result.status, 'family_only');
  assert.equal(result.candidates.length, 3);
  assert.equal(result.ambiguous_models.length, 5);
  const displayOnlyPolicy = { schema: 1, accepted_models: result.candidates.map(x => x.model) };
  assert.equal(decideWork(result, displayOnlyPolicy).allowed, false);
  assert.equal(decideWork(result, { schema: 1, accepted_models: result.ambiguous_models }).allowed, true);
  bank.models.at(-1).family = 'fixture-other-family';
  // Lower only this fixture's family threshold to isolate cross-family set
  // membership from the independent website family-confidence verdict.
  const crossFamily = scoreBank({ family_min: 0 });
  assert.equal(crossFamily.status, 'family_only');
  assert.ok(crossFamily.ambiguous_models.includes('fixture-close-c'));
  assert.equal(decideWork(crossFamily, { schema: 1, accepted_models: crossFamily.ambiguous_models.filter(id => id !== 'fixture-close-c') }).allowed, false);
});
test('ambiguity keeps the upstream fit, separation boundary, and weak-result gates', () => {
  const result = scoreSample(ambiguityRaw, seed, seed.code_sha256);
  const withThresholds = thresholds => scoreSample(ambiguityRaw, { ...seed,
    verdict: { ...seed.verdict, thresholds: { ...seed.verdict.thresholds, ...thresholds } } }, seed.code_sha256);
  const boundary = withThresholds({ margin_min: result.separation });
  assert.equal(boundary.status, 'match'); assert.deepEqual(boundary.ambiguous_models, []);
  assert.deepEqual(withThresholds({ margin_min: result.separation + 1e-12 }).ambiguous_models, ['gpt-6-astra', 'gpt-6.1-sol']);
  for (const thresholds of [{ fit_min: result.fit + 1e-12 }, { family_min: 1 }]) {
    const weak = withThresholds(thresholds);
    assert.equal(weak.status, 'insufficient'); assert.deepEqual(weak.ambiguous_models, []);
    assert.equal(decideWork(weak, { schema: 1, accepted_models: result.ambiguous_models }).allowed, false);
  }
});
test('sync accepts an added model and new numeric thresholds without hardcoded model labels', async () => {
  const bank = JSON.parse(seed.bank_text), clone = x => structuredClone(x);
  bank.models.push({ ...clone(bank.models[0]), id: 'fixture-new-model' }); bank.robust.model_order.push('fixture-new-model');
  bank.robust.hellinger.centroids.push(clone(bank.robust.hellinger.centroids[0]));
  bank.robust.ordered_blocks.centroids.push(clone(bank.robust.ordered_blocks.centroids[0]));
  for (const group of bank.robust.ordered_blocks.environment_centroids) group.push(clone(group[0]));
  const bankText = JSON.stringify(bank), page = `<body data-bank="/data/bank/vnext.json" data-bank-version="next" data-bank-sha256="${hash(bankText)}"><div class="challenge-set" data-language="en" data-style="json"><article data-challenge-id="query-next"><pre class="prompt">${seed.challenge.prompt}</pre><textarea data-expected-count="301"></textarea></article></div></body>`;
  const code = Object.fromEntries(Object.keys(seed.code_sha256).map(k => [k, 'fixture-reviewed-code-' + k]));
  const accepted = Object.fromEntries(Object.entries(code).map(([k, v]) => [k, hash(v)]));
  const lookup = { '/': page, '/data/bank/vnext.json': bankText, '/data/gates.json': JSON.stringify(seed.gates),
    '/data/verdict.json': JSON.stringify({ ...seed.verdict, thresholds: { ...seed.verdict.thresholds, fit_min: 0.3 } }),
    ...Object.fromEntries(Object.entries(code).map(([k, v]) => ['/js/' + k, v])) };
  const fresh = await downloadBundle(accepted, async url => ({ ok: true, url, text: async () => lookup[new URL(url).pathname] }));
  assert.equal(fresh.bank_version, 'next'); assert.equal(JSON.parse(fresh.bank_text).models.length, bank.models.length);
  assert.equal(fresh.verdict.thresholds.fit_min, 0.3);
  assert.throws(() => websiteManifest('<body data-bank="https://elsewhere/bank.json">'), /manifest/);
});
test('offline turn records are frozen, independently scored, and never reused for the next turn', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-fingerprint-test-'));
  try {
    const git = args => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git(['init', '-b', 'arena/test']); fs.mkdirSync(path.join(root, '.context')); fs.writeFileSync(path.join(root, '.context/TASK.md'), 'Test fixture');
    git(['add', '.']); git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture']);
    const first = await prepare(root, { offline: true, policyFetcher }); assert.equal(first.freshness, 'cached-fallback');
    const rawPath = path.join(root, first.raw_path); fs.writeFileSync(rawPath, fixtures[0].raw);
    const report = score(root, first.turn_id); assert.equal(report.raw_sha256, hash(fixtures[0].raw));
    assert.deepEqual(score(root, first.turn_id), report);
    fs.appendFileSync(rawPath, '\n'); assert.throws(() => score(root, first.turn_id), /sample changed/);
    const next = await prepare(root, { offline: true, policyFetcher }); assert.notEqual(next.turn_id, first.turn_id);
    assert.equal(score(root, next.turn_id).status, 'unscored');
    assert.equal(score(root, next.turn_id).gate.action, 'END_TURN');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
