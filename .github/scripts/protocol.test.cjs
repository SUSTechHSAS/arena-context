'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validate, inspectPullRequest } = require('./protocol.cjs');
const { createTaskFiles, initializeTask } = require('./task-scaffold.cjs');

function fixture(branch = 'task/12/main') {
  const issue = { number: 12, title: 'Task', html_url: 'https://github.com/SUSTechHSAS/arena-context/issues/12', body: 'Requirements' };
  const candidate = createTaskFiles({ issue, branch, protocolSha: 'a'.repeat(40), now: '2026-10-07T00:00:00Z' });
  candidate['.context/STATE.md'] = candidate['.context/STATE.md'].replace('Work branch / PR: not created', 'Work branch / PR: work/12/first');
  return { pr: { base: { ref: branch, repo: { full_name: 'SUSTechHSAS/arena-context' } },
    head: { ref: 'work/12/first', repo: { full_name: 'SUSTechHSAS/arena-context' } }, changed_files: 2 },
    files: [{ filename: '.context/STATE.md', status: 'modified' }, { filename: 'notes/result.md', status: 'added' }],
    trustedTask: candidate['.context/TASK.md'], candidate };
}

test('ordinary and legacy task branches accept consistent candidate checkpoints', () => {
  for (const branch of ['task/12/main', 'AerraGen-main']) assert.deepEqual(validate(fixture(branch)).errors, []);
});
test('Arena opaque branches bind to accepted task metadata and must record the real head', () => {
  const a = fixture('AerraGen-main'); a.pr.head.ref = 'arena/abcd-arena-context';
  assert.ok(validate(a).errors.some(x => x.includes('exact work branch')));
  a.candidate['.context/STATE.md'] = a.candidate['.context/STATE.md'].replace('work/12/first', a.pr.head.ref);
  assert.deepEqual(validate(a).errors, []);
  a.candidate['.context/TASK.md'] = a.candidate['.context/TASK.md'].replace('/issues/12', '/issues/99');
  assert.ok(validate(a).errors.some(x => x.includes('Issue identity')));
});
test('rejects wrong task, wrong main base, and candidate attempts to change identity', () => {
  const a = fixture(); a.pr.head.ref = 'work/13/first'; assert.ok(validate(a).errors.length);
  const b = fixture(); b.pr.base.ref = 'main'; assert.ok(validate(b).errors.length);
  const c = fixture(); c.candidate['.context/TASK.md'] = c.trustedTask.replace('/issues/12', '/issues/13');
  assert.ok(validate(c).errors.some(x => x.includes('Issue identity')));
});
test('rejects stale handoff, missing evidence sections, and missing files', () => {
  const a = fixture(); a.files = []; assert.ok(validate(a).errors.some(x => x.includes('Update')));
  const b = fixture(); b.candidate['.context/STATE.md'] = '# Incomplete'; assert.ok(validate(b).errors.length);
  const c = fixture(); delete c.candidate['.context/DECISIONS.md']; assert.ok(validate(c).errors.length);
});
test('detects protected-file renames as well as edits; maintenance still needs matching task', () => {
  const a = fixture(); a.files.push({ filename: 'notes/copied.md', previous_filename: '.github/CODEOWNERS', status: 'renamed' });
  assert.ok(validate(a).errors.some(x => x.includes('meta/')));
  a.pr.head.ref = 'meta/12/update'; assert.deepEqual(validate(a).errors, []);
  a.pr.head.ref = 'meta/13/update'; assert.ok(validate(a).errors.length);
});
test('main maintenance route is explicit', () => {
  const a = fixture(); a.pr.base.ref = 'main'; a.pr.head.ref = 'meta/update-protocol';
  assert.deepEqual(validate(a).errors, []);
});
test('foreign PR head is rejected without reading its content', async () => {
  const a = fixture(); a.pr.head.repo.full_name = 'other/fork';
  const report = await inspectPullRequest({ github: {}, repo: {}, pr: a.pr });
  assert.ok(report.errors.length);
});
test('API file-list truncation and duplicate identity fields cannot pass', () => {
  const a = fixture(); a.pr.changed_files = 3001; assert.ok(validate(a).errors.length);
  const b = fixture(); b.candidate['.context/TASK.md'] = b.candidate['.context/TASK.md'].replace('- Task Issue:', '- Task Issue: https://github.com/SUSTechHSAS/arena-context/issues/12\n- Task Issue:');
  assert.ok(validate(b).errors.length);
});
test('quoted metadata in the supplied Issue brief does not override task identity', () => {
  const a = fixture();
  a.trustedTask += '\n## Quoted reference\n- Accepted branch: unrelated\n- Task Issue: https://github.com/other/repo/issues/99\n';
  a.candidate['.context/TASK.md'] = a.trustedTask;
  assert.deepEqual(validate(a).errors, []);
});
test('task initialization preserves supplied brief verbatim and blocks unauthorized actor/ref', async () => {
  const body = 'An opaque deferred payload must remain untouched: opaque-payload';
  const files = createTaskFiles({ issue: { number: 1, title: 'Title', html_url: 'https://github.com/a/b/issues/1', body }, branch: 'task/1/main', protocolSha: 'a'.repeat(40) });
  assert.ok(files['.context/TASK.md'].includes(body));
  await assert.rejects(initializeTask({ actor: 'SUSTechHSAS' }), /Only Kibiandkimi/);
  await assert.rejects(initializeTask({ actor: 'Kibiandkimi', ref: 'refs/heads/work/1/a' }), /from main/);
});
test('existing branch cannot be overwritten by task initialization', async () => {
  const github = { rest: { issues: { get: async () => ({ data: { number: 12, state: 'open', user: { login: 'Kibiandkimi' }, body: 'Goal' } }) },
    repos: { getContent: async () => { const error = new Error('Not found'); error.status = 404; throw error; } },
    git: { getRef: async () => ({ data: {} }) } } };
  await assert.rejects(initializeTask({ github, repo: {}, actor: 'Kibiandkimi', ref: 'refs/heads/main', issueNumber: '12' }), /already exists/);
});
test('legacy task identity cannot be initialized again under a standard branch name', async () => {
  const issue = { number: 1, html_url: 'https://github.com/SUSTechHSAS/arena-context/issues/1', state: 'open', user: { login: 'SUSTechHSAS' }, body: 'Goal' };
  const github = { rest: { issues: { get: async () => ({ data: issue }) }, repos: { getContent: async () => ({ data: {
    type: 'file', encoding: 'base64', content: Buffer.from(`- Task Issue: ${issue.html_url}\n`).toString('base64'),
  } }) } } };
  await assert.rejects(initializeTask({ github, repo: {}, actor: 'Kibiandkimi', ref: 'refs/heads/main', issueNumber: '1' }), /already exists: AerraGen-main/);
});
