import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFingerpointSeed } from './fingerpoint-lib.mjs';
import { packageId } from './fingerprint-lib.mjs';
import { score } from './fingerprint.mjs';
import { fingerprintVerifier } from './fingerprint-record.mjs';
import { collaborate, localRepository } from './collaboration.mjs';
import { reviewDigest } from './collaboration-lib.mjs';

const require = createRequire(import.meta.url);
const { createTaskFiles } = require('./task-scaffold.cjs');
const { inspectPullRequest } = require('./protocol.cjs');
const policy = JSON.parse(fs.readFileSync(new URL('../fingerprint-policy.json', import.meta.url)));
const seed = readFingerpointSeed(), bankId = packageId(seed);
const examples = JSON.parse(fs.readFileSync(new URL('./fixtures/fingerpoint.json', import.meta.url))).cases;

// Replayed fixture answers exercise the real scorer in disposable repositories.
// They are test data, never samples authorizing an actual Arena turn.
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-collaboration-test-')), root = path.join(directory, 'repo');
  fs.mkdirSync(root);
  const repository = localRepository(root), { git, read, tree, compare } = repository;
  git(['init', '-b', 'arena/collaboration']);
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text); };
  const json = (file, value) => write(file, JSON.stringify(value, null, 2) + '\n');
  const commit = message => { git(['add', '.']); git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', message]); return git(['rev-parse', 'HEAD']).trim(); };
  const files = createTaskFiles({ issue: { number: 1, title: 'Double a number', html_url: 'https://github.com/SUSTechHSAS/arena-context/issues/1', body: 'Fix double and test it.' }, branch: 'AerraGen-main', protocolSha: 'a'.repeat(40) });
  files['.context/STATE.md'] = files['.context/STATE.md'].replace('Work branch / PR: not created', 'Work branch / PR: arena/collaboration');
  for (const [file, text] of Object.entries(files)) write(file, text);
  write('src/unit.mjs', 'export const double = n => n;\n');
  const base = commit('Accepted fixture'); git(['branch', 'AerraGen-main', base]);
  let counter = 0;
  const setState = (key, value) => {
    let text = fs.readFileSync(path.join(root, '.context/STATE.md'), 'utf8');
    const line = `- ${key}: ${value}`, pattern = new RegExp(`^- ${key}:.*$`, 'm');
    text = pattern.test(text) ? text.replace(pattern, line) : text.replace('## Current objective', `${line}\n\n## Current objective`);
    write('.context/STATE.md', text);
  };
  const begin = model => {
    const turn = `20261009T01${String(++counter).padStart(2, '0')}00Z-aabbccdd`, prefix = `.context/fingerprints/${turn}`;
    json(`.context/fingerprints/banks/${bankId}.json`, seed);
    json(`${prefix}/manifest.json`, { schema: 2, turn_id: turn, branch: 'arena/collaboration',
      work_head_before_probe: git(['rev-parse', 'HEAD']).trim(), package_id: bankId, bank_sha256: seed.bank_sha256,
      bank_version: seed.bank_version, policy: structuredClone(policy), freshness: 'fixture' });
    write(`${prefix}/raw.json`, examples.find(e => e.model === model).raw);
    const report = score(root, turn);
    setState('Fingerprint', `${prefix}/report.json`); setState('Model role', report.gate.role);
    return { turn, prefix, report, fingerprint: `${prefix}/report.json` };
  };
  const input = (name, value) => { const file = path.join(directory, name); fs.writeFileSync(file, JSON.stringify(value)); return file; };
  const definition = input('packet.json', { id: 'double', title: 'Fix double', objective: 'Return twice the input',
    allowed_paths: ['src/unit.mjs', 'tests/'], acceptance: ['double(3) is 6'], verification: ['node --test tests/unit.test.mjs'], depends_on: [] });
  const reviewInput = input('review.json', { verdict: 'approved', summary: 'Reviewed the function and result evidence.', verification: ['Reran node --test tests/unit.test.mjs successfully.'] });
  const verifyOutput = () => execFileSync(process.execPath, ['--test', 'tests/unit.test.mjs'], { cwd: root, stdio: 'pipe' });
  const full_name = 'SUSTechHSAS/arena-context', repo = { owner: 'SUSTechHSAS', repo: 'arena-context' };
  const f = { ...repository, directory, root, base, begin, write, json, commit, setState, definition, reviewInput, input, verifyOutput, policy: structuredClone(policy) };
  f.inspect = async () => {
    const base = f.base, head = git(['rev-parse', 'HEAD']).trim(), changed = compare(base, head);
    const github = { rest: { pulls: { listFiles() {} }, repos: {
      getContent: async ({ path: file, ref }) => {
        let text;
        if (ref === 'main' && file === '.github/fingerprint-policy.json') text = JSON.stringify(f.policy);
        else if (ref === 'main' && file === '.github/fingerprint-legacy.json') text = '{"schema":1,"heads":{}}';
        else text = await read(file, ref);
        if (text === undefined) throw Object.assign(new Error('Missing file'), { status: 404 });
        return { data: { type: 'file', size: Buffer.byteLength(text), encoding: 'base64', content: Buffer.from(text).toString('base64') } };
      },
      compareCommitsWithBasehead: async ({ basehead }) => {
        const [a, b] = basehead.split('...');
        let status;
        if (a === b) status = 'identical';
        else { try { git(['merge-base', '--is-ancestor', a, b]); status = 'ahead'; } catch {
          try { git(['merge-base', '--is-ancestor', b, a]); status = 'behind'; } catch { status = 'diverged'; }
        } }
        return { data: { status, files: ['ahead', 'identical'].includes(status) ? compare(a, b) : [], merge_base_commit: { sha: git(['merge-base', a, b]).trim() } } };
      },
    }, git: {
      getCommit: async ({ commit_sha }) => ({ data: { sha: commit_sha, tree: { sha: git(['rev-parse', `${commit_sha}^{tree}`]).trim() },
        parents: git(['rev-list', '--parents', '-n', '1', commit_sha]).trim().split(' ').slice(1).map(sha => ({ sha })) } }),
      getTree: async ({ tree_sha }) => ({ data: { truncated: false, tree: tree(tree_sha) } }),
    } }, paginate: async () => changed };
    return inspectPullRequest({ github, repo, pr: { number: 1, changed_files: changed.length, draft: true,
      base: { ref: 'AerraGen-main', sha: base, repo: { full_name } }, head: { ref: 'arena/collaboration', sha: head, repo: { full_name } } } });
  };
  f.dispose = () => fs.rmSync(directory, { recursive: true, force: true });
  return f;
}

test('real Fingerpoint turns can delegate, resume and review without granting secondary or unknown models primary powers', async t => {
  const f = fixture();
  try {
    const primary = f.begin('gpt-6-astra');
    assert.equal(primary.report.gate.role, 'primary');
    const created = await collaborate(f.root, 'create', f.definition);
    const source = f.commit('Primary issues packet');
    const secondary = f.begin('gpt-6-luna');
    assert.equal(secondary.report.gate.action, 'CONTINUE_SUBTASK');
    assert.equal((await collaborate(f.root, 'status')).packets[0].status, 'available');
    await assert.rejects(collaborate(f.root, 'create', f.definition), /primary-role/);
    const claimed = await collaborate(f.root, 'claim', 'double');
    assert.equal(claimed.source_commit, source);
    await assert.rejects(collaborate(f.root, 'review', 'double', f.reviewInput), /primary-role/);
    f.setState('Work packet', created.packet);
    f.write('src/unit.mjs', 'export const double = n => n * 2;\n');
    f.write('tests/unit.test.mjs', "import test from 'node:test'; import assert from 'node:assert/strict'; import { double } from '../src/unit.mjs'; test('doubles input', () => assert.equal(double(3), 6));\n");
    f.verifyOutput();
    f.write(claimed.run.replace('run.json', 'result.md'), 'Fixed double. Ran node --test tests/unit.test.mjs: passed. Needs primary review.\n');
    const childHead = f.commit('Secondary checkpoint');

    await t.test('saved child work is reviewable but cannot pass protocol until primary review', async () => {
      assert.deepEqual((await f.inspect()).errors, ['Packet double is awaiting primary review; keep this checkpoint as Draft.']);
    });
    await t.test('unlisted model revocation and forged role fields remain denied', async () => {
      f.policy.secondary_models = f.policy.secondary_models.filter(id => id !== 'gpt-6-luna');
      assert.match((await f.inspect()).errors.join('\n'), /Model gate denied/);
      f.policy = structuredClone(policy);
      const manifestPath = `${secondary.prefix}/manifest.json`, manifest = JSON.parse(await f.read(manifestPath));
      f.json(manifestPath, { ...manifest, policy: { ...policy, secondary_models: [] } });
      const denied = spawnSync(process.execPath, [fileURLToPath(new URL('./collaboration.mjs', import.meta.url)), 'status'], { cwd: f.root, encoding: 'utf8' });
      assert.equal(denied.status, 20, denied.stderr); assert.equal(JSON.parse(denied.stdout).action, 'END_TURN');
      f.json(manifestPath, manifest);
      const report = structuredClone(secondary.report); report.gate.role = 'primary'; report.gate.action = 'CONTINUE'; report.gate.scope = 'task';
      f.json(secondary.fingerprint, report); f.commit('Forged role fixture');
      assert.match((await f.inspect()).errors.join('\n'), /original role or policy mismatch/);
      f.git(['reset', '--hard', childHead]);
      const run = JSON.parse(await f.read(claimed.run)); run.source_commit = childHead;
      f.json(claimed.run, run); f.commit('Forged packet source fixture');
      assert.match((await f.inspect()).errors.join('\n'), /original introduction commit/);
      f.git(['reset', '--hard', childHead]);
    });
    await t.test('out-of-scope changes and attempts to rewrite packet authority are rejected', async () => {
      f.write('src/unassigned.mjs', 'export const unassigned = true;\n'); f.commit('Out of scope fixture');
      assert.match((await f.inspect()).errors.join('\n'), /Outside packet double: src\/unassigned/);
      f.git(['reset', '--hard', childHead]);
      const packet = JSON.parse(await f.read(created.packet)); packet.allowed_paths.push('src/unassigned.mjs');
      f.json(created.packet, packet); f.commit('Widened scope fixture');
      assert.match((await f.inspect()).errors.join('\n'), /packet cannot change/);
      f.git(['reset', '--hard', childHead]);
    });
    await t.test('secondary self-review is rejected even with a correct output digest', async () => {
      const packet = JSON.parse(await f.read(created.packet));
      f.json(`.context/collaboration/reviews/${secondary.turn}-double.json`, { schema: 1, packet: created.packet, source_commit: source,
        reviewed_head: childHead, fingerprint: secondary.fingerprint, verdict: 'approved', summary: 'Self approval fixture', verification: ['fixture'],
        tree_sha256: reviewDigest(f.tree(childHead), packet, [claimed.run]) });
      f.commit('Self review fixture');
      assert.match((await f.inspect()).errors.join('\n'), /primary-role/);
      f.git(['reset', '--hard', childHead]);
    });
    await t.test('a successor secondary turn inherits the original scope and its own evidence', async () => {
      f.begin('gpt-6-luna');
      const resumed = await collaborate(f.root, 'claim', 'double');
      assert.equal(JSON.parse(await f.read(resumed.run)).start_head, source);
      assert.notEqual(resumed.run, claimed.run);
      f.write(resumed.run.replace('run.json', 'result.md'), 'Reran the existing test; no further code changes.\n');
      f.verifyOutput(); f.commit('Secondary resumes packet');
      assert.deepEqual((await f.inspect()).errors, ['Packet double is awaiting primary review; keep this checkpoint as Draft.']);
    });
    f.begin('gpt-6-astra'); f.verifyOutput();
    const reviewed = await collaborate(f.root, 'review', 'double', f.reviewInput);
    f.setState('Primary review', reviewed.review);
    const approvedHead = f.commit('Primary reviews current output');
    await t.test('a primary review passes only for the exact committed outputs and all child run evidence', async () => {
      assert.deepEqual((await f.inspect()).errors, []);
      f.write('src/unit.mjs', 'export const double = n => n * 3;\n'); f.commit('Stale review fixture');
      assert.match((await f.inspect()).errors.join('\n'), /review for double is stale/);
      f.git(['reset', '--hard', approvedHead]);
      f.write(claimed.run.replace('run.json', 'result.md'), 'Changed evidence after approval.\n'); f.commit('Changed result fixture');
      assert.match((await f.inspect()).errors.join('\n'), /review for double is stale/);
      f.git(['reset', '--hard', approvedHead]);
      f.setState('Candidate stage', 'ready-for-review'); f.commit('Handoff metadata');
      assert.deepEqual((await f.inspect()).errors, []);
    });
    await t.test('policy promotion cannot upgrade a historical secondary fingerprint into a primary reviewer', async () => {
      const promoted = { schema: 2, primary_models: [...policy.primary_models, 'gpt-6-luna'], secondary_models: policy.secondary_models.filter(id => id !== 'gpt-6-luna') };
      const verify = fingerprintVerifier({ read: f.read, policy: promoted });
      const result = await verify(secondary.fingerprint, approvedHead);
      assert.equal(result.current.role, 'primary'); assert.equal(result.role, 'secondary');
    });
    await t.test('a completed packet cannot be reopened by a secondary session', async () => {
      f.begin('gpt-6-luna');
      await assert.rejects(collaborate(f.root, 'claim', 'double'), /already primary-reviewed/);
    });
  } finally { f.dispose(); }
});

test('a secondary session with no packet may save only its fingerprint/handoff, and a later primary can unblock it', async () => {
  const f = fixture();
  try {
    f.begin('gpt-6-luna');
    assert.deepEqual((await collaborate(f.root, 'status')).packets, []);
    f.setState('Candidate stage', 'awaiting-primary-assignment');
    const waiting = f.commit('Waiting for a primary packet');
    let report = await f.inspect();
    assert.deepEqual(report.errors, []); assert.match(report.warnings.join('\n'), /no assigned packet/);
    f.write('src/unit.mjs', 'export const double = n => n * 2;\n'); f.commit('Unassigned task work fixture');
    assert.match((await f.inspect()).errors.join('\n'), /without a packet may only save/);
    f.git(['reset', '--hard', waiting]);
    f.begin('gpt-6-astra');
    await collaborate(f.root, 'create', f.definition); f.commit('Primary unblocks the waiting session');
    report = await f.inspect(); assert.deepEqual(report.errors, []);
  } finally { f.dispose(); }
});

test('secondary claims wait for reviewed dependencies and can start from a newly accepted task base', async () => {
  const f = fixture();
  try {
    f.begin('gpt-6-astra');
    const definition = JSON.parse(fs.readFileSync(f.definition, 'utf8'));
    await collaborate(f.root, 'create', f.definition);
    const dependent = f.input('dependent.json', { ...definition, id: 'dependent', depends_on: ['double'] });
    await collaborate(f.root, 'create', dependent); f.commit('Primary publishes dependent work');
    const secondary = f.begin('gpt-6-luna');
    await assert.rejects(collaborate(f.root, 'claim', 'dependent'), /Dependency double needs primary review/);
    // Bypass the CLI deliberately: server-side checks must reject it as well.
    const source = f.git(['rev-parse', 'HEAD']).trim(), run = `.context/collaboration/runs/${secondary.turn}/run.json`;
    f.setState('Work packet', '.context/collaboration/packets/dependent.json');
    f.json(run, { schema: 1, turn_id: secondary.turn, packet: '.context/collaboration/packets/dependent.json', source_commit: source,
      start_head: source, branch: 'arena/collaboration', fingerprint: secondary.fingerprint });
    f.write(run.replace('run.json', 'result.md'), 'Bypassed dependency fixture.\n'); f.commit('Bypassed dependency fixture');
    assert.match((await f.inspect()).errors.join('\n'), /Dependency double needs primary review/);
    f.git(['reset', '--hard', source]);

    f.begin('gpt-6-luna');
    const first = await collaborate(f.root, 'claim', 'double');
    f.setState('Work packet', '.context/collaboration/packets/double.json');
    f.write('src/unit.mjs', 'export const double = n => n * 2;\n');
    f.write('tests/unit.test.mjs', "import test from 'node:test'; import assert from 'node:assert/strict'; import { double } from '../src/unit.mjs'; test('doubles input', () => assert.equal(double(3), 6));\n");
    f.verifyOutput();
    f.write(first.run.replace('run.json', 'result.md'), 'Fixed double and ran the unit test successfully.\n'); f.commit('Complete prerequisite');
    f.begin('gpt-6-astra'); f.verifyOutput();
    const approved = await collaborate(f.root, 'review', 'double', f.reviewInput);
    f.setState('Primary review', approved.review);
    f.base = f.commit('Primary reviews prerequisite');
    // Simulate human acceptance only inside the disposable test repository.
    f.git(['update-ref', 'refs/heads/AerraGen-main', f.base]);
    f.begin('gpt-6-luna');
    const next = await collaborate(f.root, 'claim', 'dependent');
    assert.equal(JSON.parse(await f.read(next.run)).start_head, f.base);
    assert.equal(next.source_commit, source);
    f.setState('Work packet', '.context/collaboration/packets/dependent.json');
    f.setState('Primary review', 'none');
    f.write('tests/edge.test.mjs', "import test from 'node:test'; import assert from 'node:assert/strict'; import { double } from '../src/unit.mjs'; test('doubles zero', () => assert.equal(double(0), 0));\n");
    execFileSync(process.execPath, ['--test', 'tests/unit.test.mjs', 'tests/edge.test.mjs'], { cwd: f.root, stdio: 'pipe' });
    f.write(next.run.replace('run.json', 'result.md'), 'Added a zero-input regression; both tests passed.\n'); f.commit('Dependent secondary checkpoint');
    assert.deepEqual((await f.inspect()).errors, ['Packet dependent is awaiting primary review; keep this checkpoint as Draft.']);
  } finally { f.dispose(); }
});
