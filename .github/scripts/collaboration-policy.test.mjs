import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { decideWork, validatePolicy, policyHash, modelMembers, REFERENCE_MASS_MIN, exitCode } from './model-gate.mjs';
import { readFingerpointSeed, validateFingerpointBundle } from './fingerpoint-lib.mjs';
import { validatePacket, inScope, scopeErrors, noWorkErrors, reviewDigest, newestReview } from './collaboration-lib.mjs';

const policy = JSON.parse(fs.readFileSync(new URL('../fingerprint-policy.json', import.meta.url)));
const fingerprint = '.context/fingerprints/20261009T010203Z-aabbccdd/report.json';
const packetPath = '.context/collaboration/packets/unit.json';
const packet = { schema: 1, id: 'unit', task_issue: 1, accepted_branch: 'AerraGen-main', title: 'Unit', objective: 'Bounded work',
  allowed_paths: ['src/unit.mjs', 'tests/'], acceptance: ['Observable output'], verification: ['Test the output'], depends_on: [], issued_by: fingerprint };

function reference(classes) {
  const models = [...new Set(classes.flatMap(modelMembers))];
  return { provider: 'fingerpoint', status: models.length === 1 ? 'reference_match' : 'reference_ambiguity',
    identified_candidate: null, identity_verified: false, arena_protocol_calibrated: false,
    probability_scope: 'reference-closed-set', upstream_decision: 'not_confirmed', sample_count: 3,
    reference_mass_min: REFERENCE_MASS_MIN, reference_mass: .97, reference_models: models, reference_classes: classes,
    nearest_class: classes[0], nearest_model: models[0] };
}

test('central policy keeps the six original primary models and adds exactly the five requested secondary models', () => {
  assert.equal(policy.schema, 2);
  assert.deepEqual(policy.primary_models, ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-sol']);
  assert.deepEqual(policy.secondary_models, ['claude-haiku-5-5', 'claude-opus-5', 'claude-fable-5', 'gpt-5.6-sol', 'gpt-6-luna']);
  assert.deepEqual(modelMembers('claude-haiku-5.5'), ['claude-haiku-5-5']);
});

test('every pinned-bank class is either precisely primary, precisely secondary, or denied', () => {
  const { bank } = validateFingerpointBundle(readFingerpointSeed());
  const allowed = new Set([...policy.primary_models, ...policy.secondary_models]);
  for (const { id } of bank.models) {
    const models = modelMembers(id), gate = decideWork(reference([id]), policy);
    if (models.some(model => !allowed.has(model))) {
      assert.equal(gate.action, 'END_TURN', id); assert.equal(gate.allowed, false, id); assert.equal(exitCode({ gate }), 20);
    } else if (models.every(model => policy.primary_models.includes(model))) {
      assert.equal(gate.action, 'CONTINUE', id); assert.equal(gate.role, 'primary', id);
    } else {
      assert.equal(gate.action, 'CONTINUE_SUBTASK', id); assert.equal(gate.role, 'secondary', id); assert.equal(gate.scope, 'assigned_subtask', id);
    }
  }
});

test('mixed primary/secondary sets get secondary capabilities; one unlisted member always denies the whole set', () => {
  const classes = ['gpt-6-astra', 'claude-opus-5.5', 'claude-haiku-5.5', 'gpt-6-luna'];
  const mixed = decideWork(reference(classes), policy);
  assert.equal(mixed.allowed, true); assert.equal(mixed.role, 'secondary');
  assert.equal(mixed.action, 'CONTINUE_SUBTASK'); assert.equal(exitCode({ gate: mixed }), 0);
  for (const unknown of ['gpt-5.6-terra', 'gpt-5.6-luna', 'claude-haiku-4.5', 'claude-opus-5-50', 'haiku-5.5', 'unknown']) {
    const denied = decideWork(reference([...classes, unknown]), policy);
    assert.equal(denied.action, 'END_TURN', unknown);
    assert.deepEqual(denied.rejected_models, [unknown]);
  }
  for (const patch of [{ reference_mass: .94 }, { sample_count: 1 }, { status: 'insufficient' }, { status: 'invalid' }, { reference_models: ['gpt-6-astra'] }]) {
    assert.equal(decideWork({ ...reference(classes), ...patch }, policy).allowed, false);
  }
});

test('schema 1 stays primary-only and role policy rejects duplicates, overlap, malformed IDs, and missing tiers', () => {
  const old = { schema: 1, accepted_models: policy.primary_models };
  assert.equal(decideWork(reference(['gpt-6-astra']), old).role, 'primary');
  assert.equal(decideWork(reference(['gpt-6-luna']), old).action, 'END_TURN');
  for (const bad of [null, { schema: 2, primary_models: [] }, { ...policy, secondary_models: ['gpt-*'] },
    { ...policy, secondary_models: ['gpt-6-luna', 'gpt-6-luna'] }, { ...policy, secondary_models: ['gpt-6-sol'] }]) assert.throws(() => validatePolicy(bad));
  const changed = { schema: 2, primary_models: [...policy.primary_models, 'gpt-6-luna'], secondary_models: policy.secondary_models.filter(id => id !== 'gpt-6-luna') };
  assert.notEqual(policyHash(policy), policyHash(changed));
  assert.equal(decideWork(reference(['gpt-6-astra', 'gpt-6-luna']), { ...policy, primary_models: ['gpt-6-astra'] }).action, 'END_TURN');
});

test('packets bound exact files and directory prefixes without allowing protocol edits or path escapes', () => {
  assert.deepEqual(validatePacket(packet, packetPath), packet);
  for (const file of ['/tmp/output', '../output', 'src/../AGENTS.md', '.github/', '.context/', '.templates/', '.git/', 'AGENTS.md', 'docs/COLLABORATION.md', 'src/*.mjs', 'src\\unit.mjs', 'src//unit.mjs']) {
    assert.throws(() => validatePacket({ ...packet, allowed_paths: [file] }, packetPath), undefined, file);
  }
  assert.equal(inScope('src/unit.mjs', packet), true);
  assert.equal(inScope('tests/unit.test.mjs', packet), true);
  for (const file of ['src/unit.mjs.bak', 'tests-other/foo', 'tests/AGENTS.md']) assert.equal(inScope(file, packet), false, file);
  assert.equal(scopeErrors([{ filename: 'src/unit.mjs', previous_filename: '.context/TASK.md', status: 'renamed' }], packet).length, 1);
  assert.equal(scopeErrors([{ filename: fingerprint, status: 'modified' }], packet).length, 1);
  assert.deepEqual(scopeErrors([{ filename: fingerprint, status: 'added' }, { filename: '.context/STATE.md', status: 'modified' }], packet), []);
  assert.equal(noWorkErrors([{ filename: 'src/unit.mjs', status: 'modified' }], fingerprint).length, 1);
});

test('review digests bind content, modes, deletions and run evidence, while permitting handoff metadata', () => {
  const run = '.context/collaboration/runs/20261009T010203Z-aabbccdd/run.json';
  const entries = [{ path: 'src/unit.mjs', mode: '100644', type: 'blob', sha: 'a'.repeat(40) },
    { path: packetPath, mode: '100644', type: 'blob', sha: 'b'.repeat(40) },
    { path: run, mode: '100644', type: 'blob', sha: 'c'.repeat(40) }];
  const digest = reviewDigest(entries, packet, [run]);
  for (const patch of [{ sha: 'd'.repeat(40) }, { mode: '100755' }, { type: 'commit', mode: '160000' }]) {
    assert.notEqual(reviewDigest([{ ...entries[0], ...patch }, ...entries.slice(1)], packet, [run]), digest);
  }
  assert.notEqual(reviewDigest(entries.slice(1), packet, [run]), digest);
  assert.notEqual(reviewDigest([...entries, { ...entries[0], path: run.replace('run.json', 'result.md') }], packet, [run]), digest);
  assert.equal(reviewDigest([...entries, { ...entries[0], path: '.context/STATE.md' }, { ...entries[0], path: fingerprint }], packet, [run]), digest);
});

test('later changes-requested reviews supersede approvals by Git history, regardless of timestamp suffix order', async () => {
  const approved = { file: 'z-review.json', review: { verdict: 'approved', reviewed_head: 'first' } };
  const rejected = { file: 'a-review.json', review: { verdict: 'changes_requested', reviewed_head: 'second' } };
  const read = async (file, ref) => ref === 'head' || (ref === 'second' && file === approved.file) ? file : undefined;
  assert.equal(await newestReview([rejected, approved], read, 'head'), rejected);
  await assert.rejects(newestReview([approved, rejected], async (file, ref) => ref === 'head' ? file : undefined, 'head'), /concurrent/);
});
