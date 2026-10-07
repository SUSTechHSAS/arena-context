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

function fixture({ recorded = true, legacy = false, advanced = false, domainChange = false } = {}) {
  const branch = 'arena/test', old = 'a'.repeat(40), head = advanced ? 'b'.repeat(40) : old;
  const repo = { owner: 'SUSTechHSAS', repo: 'arena-context' }, full_name = 'SUSTechHSAS/arena-context';
  const files = createTaskFiles({ issue: { number: 1, title: 'Test', html_url: `https://github.com/${full_name}/issues/1`, body: 'Goal' }, branch: 'AerraGen-main', protocolSha: old });
  files['.context/STATE.md'] = files['.context/STATE.md'].replace('Work branch / PR: not created', 'Work branch / PR: ' + branch);
  const central = { schema: 1, accepted_models: ['claude-fable-5-1'] };
  const prefix = '.context/fingerprints/20261007T000000Z-aabbccdd';
  let report;
  if (recorded) {
    const graded = scoreSample(example.raw, seed, seed.code_sha256);
    report = { identity_verified: false, same_model_within_turn: 'assumed_by_user', raw_sha256: hash(example.raw),
      package_id: packageId(seed), bank_sha256: seed.bank_sha256, bank_version: seed.bank_version, ...graded, gate: decideWork(graded, central) };
    files[`${prefix}/raw.json`] = example.raw; files[`${prefix}/report.json`] = JSON.stringify(report);
    files[`.context/fingerprints/banks/${packageId(seed)}.json`] = JSON.stringify(seed);
    files['.context/STATE.md'] = files['.context/STATE.md'].replace('## Current objective', `- Fingerprint: ${prefix}/report.json\n\n## Current objective`);
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
