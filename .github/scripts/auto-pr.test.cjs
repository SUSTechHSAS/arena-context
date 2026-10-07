const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureTaskPR } = require('./auto-pr.cjs');
const { createTaskFiles } = require('./task-scaffold.cjs');

function mock() {
  const repo = { owner: 'SUSTechHSAS', repo: 'arena-context' }, full_name = 'SUSTechHSAS/arena-context';
  const issue = { number: 1, title: 'Task', html_url: `https://github.com/${full_name}/issues/1`, body: 'Goal' };
  const branch = 'arena/abcd-arena-context', files = createTaskFiles({ issue, branch: 'AerraGen-main', protocolSha: 'a'.repeat(40) });
  files['.context/STATE.md'] = files['.context/STATE.md'].replace('Work branch / PR: not created', 'Work branch / PR: ' + branch);
  const pr = { number: 9, html_url: 'https://github.com/example/pr/9', changed_files: 1,
    base: { ref: 'AerraGen-main', sha: 'a'.repeat(40), repo: { full_name } }, head: { ref: branch, sha: 'b'.repeat(40), repo: { full_name } } };
  const open = [], states = []; let creates = 0;
  const github = { rest: {
    git: { getRef: async ({ ref }) => ({ data: { object: { sha: ref.endsWith(branch) ? pr.head.sha : pr.base.sha } } }) },
    repos: { getContent: async ({ path }) => { if (!(path in files)) { const e = new Error('missing'); e.status = 404; throw e; }
      return { data: { type: 'file', size: Buffer.byteLength(files[path]), encoding: 'base64', content: Buffer.from(files[path]).toString('base64') } }; },
      compareCommitsWithBasehead: async () => ({ data: { files: [{ filename: '.context/STATE.md' }] } }),
      createCommitStatus: async ({ state }) => { states.push(state); } },
    pulls: { list: () => {}, listFiles: () => {}, get: async () => ({ data: pr }),
      create: async input => { creates++; assert.equal(input.draft, true); assert.equal(input.base, 'AerraGen-main'); open.push(pr); return { data: pr }; } },
  } };
  github.paginate = async method => method === github.rest.pulls.list ? open : [{ filename: '.context/STATE.md', status: 'modified' }];
  return { github, repo, branch, runURL: 'https://github.com/example/run/1', files, states, creates: () => creates };
}
test('creates one correctly based Draft PR for opaque Arena head, then reuses it and explicitly checks it', async () => {
  const x = mock(); const a = await ensureTaskPR(x); const b = await ensureTaskPR(x);
  assert.equal(x.creates(), 1); assert.equal(a.url, b.url); assert.deepEqual(a.report.errors, []);
  assert.deepEqual(x.states, ['pending', 'success', 'pending', 'success']);
});
test('refuses a branch with no accepted task or an unrelated branch prefix', async () => {
  const x = mock(); await assert.rejects(ensureTaskPR({ ...x, branch: 'main' }), /Not an Arena/);
  delete x.files['.context/TASK.md']; assert.match((await ensureTaskPR(x)).skipped, /No task/); assert.equal(x.creates(), 0);
});
