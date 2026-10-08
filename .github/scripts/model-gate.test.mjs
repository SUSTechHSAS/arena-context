import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { decideWork, validatePolicy, loadLivePolicy, exitCode, STOP_EXIT_CODE } from './model-gate.mjs';
import { prepare } from './fingerprint.mjs';
import { scoreSample, packageId } from './fingerprint-lib.mjs';

const policy = { schema: 1, accepted_models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-sol'] };
const match = id => ({ status: 'match', identified_candidate: id, nearest_model: id });
const seed = JSON.parse(fs.readFileSync(new URL('../vendor/modeltrace/seed.json', import.meta.url)));
const ambiguityRaw = fs.readFileSync(new URL('./fixtures/allowed-ambiguity.json', import.meta.url), 'utf8');
// Historical records are built as historical fixtures, never by asking the
// current prepare command to downgrade to the retired provider.
function legacyTurn(root, policy) {
  const turn_id = '20261007T000000Z-aabbccdd', prefix = `.context/fingerprints/${turn_id}`;
  fs.mkdirSync(path.join(root, prefix), { recursive: true });
  fs.mkdirSync(path.join(root, '.context/fingerprints/banks'), { recursive: true });
  fs.writeFileSync(path.join(root, `.context/fingerprints/banks/${packageId(seed)}.json`), JSON.stringify(seed));
  fs.writeFileSync(path.join(root, prefix, 'manifest.json'), JSON.stringify({ schema: 1, turn_id, branch: 'arena/test',
    package_id: packageId(seed), bank_sha256: seed.bank_sha256, bank_version: seed.bank_version, policy, freshness: 'cached-fallback' }));
  return { turn_id, raw_path: `${prefix}/raw.json` };
}
test('Clear match still requires an exact accepted model; other statuses cannot use the nearest model alone', () => {
  for (const id of policy.accepted_models) assert.equal(decideWork(match(id), policy).action, 'CONTINUE');
  for (const id of ['claude-opus-5', 'gpt-6-luna', 'claude-opus-5-50', 'gpt-6-astra-mini']) {
    assert.equal(decideWork(match(id), policy).action, 'END_TURN');
  }
  for (const status of ['family_only', 'insufficient', 'invalid', 'unscored', undefined]) {
    assert.equal(decideWork({ ...match('gpt-6-astra'), status }, policy).allowed, false);
  }
});
test('owner sample continues only when every ambiguous model is accepted', () => {
  const result = scoreSample(ambiguityRaw, seed, seed.code_sha256);
  assert.equal(result.status, 'family_only');
  assert.equal(result.identified_candidate, null);
  assert.deepEqual(result.ambiguous_models, ['gpt-6-astra', 'gpt-6.1-sol']);
  assert.equal(result.candidates[2].model, 'gpt-5.6-terra');
  const gate = decideWork(result, policy);
  assert.equal(gate.reason, 'accepted_ambiguity');
  assert.equal(gate.action, 'CONTINUE');
  assert.deepEqual(gate.models, result.ambiguous_models);
  assert.equal(gate.model, undefined);
  for (const excluded of result.ambiguous_models) {
    const denied = decideWork(result, { schema: 1, accepted_models: policy.accepted_models.filter(id => id !== excluded) });
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, 'ambiguous_model_not_accepted');
    assert.deepEqual(denied.rejected_models, [excluded]);
  }
});
test('missing, empty, duplicate, malformed, or inconsistent ambiguity evidence fails closed', () => {
  const result = scoreSample(ambiguityRaw, seed, seed.code_sha256);
  for (const models of [undefined, null, [], ['gpt-6-astra'], ['gpt-6-astra', 'gpt-6-astra'],
    ['gpt-6-sol', 'gpt-6.1-sol'], ['gpt-6-astra', null], ['gpt-6-astra', 'gpt-*']]) {
    assert.equal(decideWork({ ...result, ambiguous_models: models }, policy).allowed, false);
  }
  assert.equal(decideWork({ ...result, identified_candidate: result.nearest_model }, policy).allowed, false);
  assert.equal(decideWork(result, null).allowed, false);
  assert.equal(decideWork(result, { schema: 1, accepted_models: [] }).allowed, false);
  for (const status of ['insufficient', 'invalid', 'unscored', undefined]) {
    assert.equal(decideWork({ ...result, status }, policy).allowed, false);
  }
  assert.equal(decideWork(null, policy).allowed, false);
});
test('invalid/empty policy, mismatched labels and top candidate alone fail closed', () => {
  assert.equal(decideWork(match('gpt-6-astra'), null).action, 'END_TURN');
  assert.equal(decideWork(match('gpt-6-astra'), { schema: 1, accepted_models: [] }).allowed, false);
  assert.equal(decideWork({ status: 'match', nearest_model: 'gpt-6-astra' }, policy).allowed, false);
  assert.equal(decideWork({ ...match('gpt-6-astra'), nearest_model: 'gpt-6-sol' }, policy).allowed, false);
  assert.throws(() => validatePolicy({ schema: 1, accepted_models: ['gpt-*'] }));
  assert.throws(() => validatePolicy({ schema: 1, accepted_models: ['gpt-6-sol', 'gpt-6-sol'] }));
});
test('live policy snapshot preserves exact IDs and has an auditable hash', async () => {
  const loaded = await loadLivePolicy(async () => ({ ok: true, text: async () => JSON.stringify(policy) }));
  assert.deepEqual(loaded.accepted_models, policy.accepted_models); assert.match(loaded.sha256, /^[a-f0-9]{64}$/);
  await assert.rejects(loadLivePolicy(async () => ({ ok: false, status: 404 })), /404/);
});
test('denials use a distinct intentional exit code; a pending probe is not permission to work', () => {
  assert.equal(exitCode({ gate: decideWork(match('gpt-6-astra'), policy) }), 0);
  assert.equal(exitCode({ gate: decideWork(match('gpt-6-luna'), policy) }), STOP_EXIT_CODE);
  assert.equal(exitCode({ action: 'END_TURN' }), 20);
  assert.equal(exitCode({ action: 'GENERATE_SAMPLE' }), 0);
});
test('CLI emits END_TURN/exit 20 immediately after a non-accepted Clear match, with no task edits', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-model-gate-'));
  try {
    const git = args => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git(['init', '-b', 'arena/test']); fs.mkdirSync(path.join(root, '.context')); fs.writeFileSync(path.join(root, '.context/TASK.md'), 'Do not change task');
    git(['add', '.']); git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture']);
    const first = legacyTurn(root, { schema: 1, accepted_models: ['gpt-6-astra'] });
    const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/fingerprint.json', import.meta.url))).fixtures;
    const example = fixtures.find(f => f.expected.status === 'match' && f.expected.nearest_model === 'claude-fable-5-1');
    assert.ok(example); fs.writeFileSync(path.join(root, first.raw_path), example.raw);
    const cli = fileURLToPath(new URL('./fingerprint.mjs', import.meta.url));
    const ran = spawnSync(process.execPath, [cli, 'score', first.turn_id], { cwd: root, encoding: 'utf8' });
    assert.equal(ran.status, 20, ran.stderr);
    const result = JSON.parse(ran.stdout); assert.equal(result.status, 'match'); assert.equal(result.action, 'END_TURN');
    assert.equal(result.gate.reason, 'model_not_accepted');
    assert.equal(fs.readFileSync(path.join(root, '.context/TASK.md'), 'utf8'), 'Do not change task');
    let bankRequests = 0;
    const denied = await prepare(root, { policyFetcher: async () => ({ ok: false, status: 503 }), fetcher: async () => { bankRequests++; throw new Error('must not fetch bank'); } });
    assert.equal(denied.action, 'END_TURN'); assert.equal(bankRequests, 0);
    const saved = JSON.parse(fs.readFileSync(path.join(root, '.context/fingerprints', denied.turn_id, 'report.json')));
    assert.equal(saved.gate.allowed, false); assert.equal(saved.gate.detail, saved.detail);
    assert.match(saved.detail, /503/); assert.ok(!saved.detail.includes('invalid_model_policy'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('CLI freezes the original sample and emits CONTINUE or END_TURN for an allowed or mixed ambiguity', async () => {
  for (const accepted of [true, false]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-ambiguity-gate-'));
    try {
      const git = args => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
      git(['init', '-b', 'arena/test']); fs.mkdirSync(path.join(root, '.context'));
      fs.writeFileSync(path.join(root, '.context/TASK.md'), 'Do not change task');
      git(['add', '.']); git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture']);
      const current = accepted ? policy : { schema: 1, accepted_models: ['gpt-6-astra'] };
      const first = legacyTurn(root, current);
      const rawPath = path.join(root, first.raw_path); fs.writeFileSync(rawPath, ambiguityRaw);
      const cli = fileURLToPath(new URL('./fingerprint.mjs', import.meta.url));
      const ran = spawnSync(process.execPath, [cli, 'score', first.turn_id], { cwd: root, encoding: 'utf8' });
      assert.equal(ran.status, accepted ? 0 : 20, ran.stderr);
      const result = JSON.parse(ran.stdout);
      assert.equal(result.status, 'family_only'); assert.equal(result.identified_candidate, null);
      assert.equal(result.action, accepted ? 'CONTINUE' : 'END_TURN');
      assert.deepEqual(result.ambiguous_models, ['gpt-6-astra', 'gpt-6.1-sol']);
      assert.equal(fs.readFileSync(rawPath, 'utf8'), ambiguityRaw);
      assert.equal(fs.readFileSync(path.join(root, '.context/TASK.md'), 'utf8'), 'Do not change task');
      const frozen = JSON.parse(fs.readFileSync(path.join(root, '.context/fingerprints', first.turn_id, 'report.json')));
      assert.equal(frozen.gate.allowed, accepted);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
});
