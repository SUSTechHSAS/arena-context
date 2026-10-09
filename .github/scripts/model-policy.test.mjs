import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { scoreSample, hash, packageId } from './fingerprint-lib.mjs';
import { decideWork } from './model-gate.mjs';
const require = createRequire(import.meta.url);
const { inspectPullRequest } = require('./protocol.cjs');
const { createTaskFiles } = require('./task-scaffold.cjs');
const seed = JSON.parse(fs.readFileSync(new URL('../vendor/modeltrace/seed.json', import.meta.url)));
const example = JSON.parse(fs.readFileSync(new URL('./fixtures/fingerprint.json', import.meta.url))).fixtures.find(f => f.expected.status === 'match');
const ambiguityRaw = fs.readFileSync(new URL('./fixtures/allowed-ambiguity.json', import.meta.url), 'utf8');

function fixture({ recorded = true, legacy = false, advanced = false, domainChange = false, raw = example.raw,
  acceptedModels = ['claude-fable-5-1'] } = {}) {
  const branch = 'arena/test', old = 'a'.repeat(40), head = advanced ? 'b'.repeat(40) : old;
  const repo = { owner: 'SUSTechHSAS', repo: 'arena-context' }, full_name = 'SUSTechHSAS/arena-context';
  const files = createTaskFiles({ issue: { number: 1, title: 'Test', html_url: `https://github.com/${full_name}/issues/1`, body: 'Goal' }, branch: 'AerraGen-main', protocolSha: old });
  files['.context/STATE.md'] = files['.context/STATE.md'].replace('Work branch / PR: not created', 'Work branch / PR: ' + branch);
  const central = { schema: 1, accepted_models: acceptedModels };
  const prefix = '.context/fingerprints/20261007T000000Z-aabbccdd';
  let report;
  if (recorded) {
    const graded = scoreSample(raw, seed, seed.code_sha256);
    report = { turn_id: prefix.split('/').at(-1), branch, identity_verified: false, same_model_within_turn: 'assumed_by_user', raw_sha256: hash(raw),
      package_id: packageId(seed), bank_sha256: seed.bank_sha256, bank_version: seed.bank_version, ...graded, gate: decideWork(graded, central) };
    files[`${prefix}/manifest.json`] = JSON.stringify({ schema: 1, turn_id: report.turn_id, branch, work_head_before_probe: old, package_id: packageId(seed), policy: structuredClone(central) });
    files[`${prefix}/raw.json`] = raw; files[`${prefix}/report.json`] = JSON.stringify(report);
    files[`.context/fingerprints/banks/${packageId(seed)}.json`] = JSON.stringify(seed);
    files['.context/STATE.md'] = files['.context/STATE.md'].replace('## Current objective', `- Fingerprint: ${prefix}/report.json\n\n## Current objective`);
    files['.context/STATE.md'] = files['.context/STATE.md'].replace('Model role: not recorded', `Model role: ${report.gate.role || 'not recorded'}`);
  }
  const github = { rest: { pulls: { listFiles() {} }, repos: {
    getContent: async ({ path, ref }) => {
      let text = files[path];
      if (ref === 'main' && path === '.github/fingerprint-policy.json') text = JSON.stringify(central);
      if (ref === 'main' && path === '.github/fingerprint-legacy.json') text = JSON.stringify({ schema: 1, heads: legacy ? { [branch]: old } : {} });
      if (text === undefined) { const e = new Error('missing'); e.status = 404; throw e; }
      return { data: { type: 'file', size: Buffer.byteLength(text), encoding: 'base64', content: Buffer.from(text).toString('base64') } };
    },
    compareCommitsWithBasehead: async () => ({ data: { status: 'ahead', files: [{ filename: domainChange ? 'docs/plan/new-work.md' : 'AGENTS.md' }] } }),
  } }, paginate: async () => [{ filename: '.context/STATE.md', status: 'modified' }] };
  return { github, repo, pr: { number: 1, changed_files: 1, base: { ref: 'AerraGen-main', sha: old, repo: { full_name } }, head: { ref: branch, sha: head, repo: { full_name } } }, central, files, report, prefix };
}
test('CI recomputes the sample and checks the current central policy instead of candidate policy', async () => {
  const f = fixture(); assert.deepEqual((await inspectPullRequest(f)).errors, []);
  f.files['.github/fingerprint-policy.json'] = JSON.stringify({ schema: 1, accepted_models: ['claude-fable-5-1'] });
  f.central.accepted_models = ['gpt-6-astra'];
  assert.ok((await inspectPullRequest(f)).errors.some(x => x.includes('Model gate denied')));
});
test('a denied original report cannot retroactively authorize work after list expansion', async () => {
  const f = fixture(); f.report.gate = { allowed: false, action: 'END_TURN' };
  f.files[f.prefix + '/report.json'] = JSON.stringify(f.report);
  assert.ok((await inspectPullRequest(f)).errors.some(x => x.includes('original turn')));
});
test('CI independently accepts allowed ambiguity and rejects revocation or a forged incomplete set', async () => {
  const f = fixture({ raw: ambiguityRaw, acceptedModels: ['gpt-6-astra', 'gpt-6.1-sol'] });
  assert.deepEqual((await inspectPullRequest(f)).errors, []);
  f.central.accepted_models = ['gpt-6-astra'];
  assert.ok((await inspectPullRequest(f)).errors.some(x => x.includes('ambiguous_model_not_accepted')));
  f.report.ambiguous_models = ['gpt-6-astra'];
  f.files[f.prefix + '/report.json'] = JSON.stringify(f.report);
  assert.ok((await inspectPullRequest(f)).errors.some(x => x.includes('ambiguity set mismatch')));
});
test('CI does not retroactively allow a previously denied Close call or accept missing ambiguity evidence', async () => {
  const f = fixture({ raw: ambiguityRaw, acceptedModels: ['gpt-6-astra', 'gpt-6.1-sol'] });
  f.report.gate = { allowed: false, action: 'END_TURN' };
  f.files[f.prefix + '/report.json'] = JSON.stringify(f.report);
  assert.ok((await inspectPullRequest(f)).errors.some(x => x.includes('original turn')));
  delete f.report.ambiguous_models;
  f.report.gate = { allowed: true, action: 'CONTINUE' };
  f.files[f.prefix + '/report.json'] = JSON.stringify(f.report);
  assert.ok((await inspectPullRequest(f)).errors.some(x => x.includes('ambiguity set mismatch')));
});
test('old accepted Clear match and explicitly preserved pre-gate Close call records remain reviewable', async () => {
  const f = fixture(); delete f.report.ambiguous_models;
  f.files[f.prefix + '/report.json'] = JSON.stringify(f.report);
  assert.deepEqual((await inspectPullRequest(f)).errors, []);
  const old = fixture({ raw: ambiguityRaw, legacy: true });
  delete old.report.gate; delete old.report.ambiguous_models;
  old.files[old.prefix + '/report.json'] = JSON.stringify(old.report);
  assert.deepEqual((await inspectPullRequest(old)).errors, []);
});
test('only explicitly fixed legacy work survives without a fingerprint; new domain work does not', async () => {
  assert.deepEqual((await inspectPullRequest(fixture({ recorded: false, legacy: true }))).errors, []);
  assert.deepEqual((await inspectPullRequest(fixture({ recorded: false, legacy: true, advanced: true }))).errors, []);
  assert.ok((await inspectPullRequest(fixture({ recorded: false, legacy: true, advanced: true, domainChange: true }))).errors.length);
  assert.ok((await inspectPullRequest(fixture({ recorded: false }))).errors.length);
});
test('an original pre-gate report remains reviewable but cannot accompany new business changes', async () => {
  for (const domainChange of [false, true]) {
    const f = fixture({ legacy: true, advanced: true, domainChange });
    delete f.report.gate; f.files[f.prefix + '/report.json'] = JSON.stringify(f.report);
    const checked = await inspectPullRequest(f);
    assert.equal(checked.errors.length === 0, !domainChange);
  }
});
