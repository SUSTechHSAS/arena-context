'use strict';
const { field, readText, inspectPullRequest } = require('./protocol.cjs');

async function ensureTaskPR({ github, repo, branch, runURL }) {
  if (!/^(arena|work)\/[a-z0-9][a-z0-9/_-]*$/.test(branch || '')) throw new Error('Not an Arena/work branch.');
  const { data: ref } = await github.rest.git.getRef({ ...repo, ref: `heads/${branch}` });
  const sha = ref.object.sha;
  const task = await readText(github, repo, '.context/TASK.md', sha);
  if (!task) return { skipped: 'No task context on this branch; choose a task branch in Arena first.' };
  const base = field(task, 'Accepted branch'), issue = field(task, 'Task Issue');
  if (base !== 'AerraGen-main' && !/^task\/[1-9]\d*\/main$/.test(base)) throw new Error('Unsupported accepted branch.');
  const { data: baseRef } = await github.rest.git.getRef({ ...repo, ref: `heads/${base}` });
  const contract = await readText(github, repo, '.context/TASK.md', baseRef.object.sha);
  if (!contract || field(contract, 'Task Issue') !== issue || field(contract, 'Accepted branch') !== base || !issue.startsWith(`https://github.com/${repo.owner}/${repo.repo}/issues/`)) {
    throw new Error('The candidate task identity does not match its accepted base.');
  }
  const number = issue.split('/').at(-1);
  if (!/^[1-9]\d*$/.test(number)) throw new Error('Invalid task Issue.');
  const open = await github.paginate(github.rest.pulls.list, { ...repo, state: 'open', head: `${repo.owner}:${branch}`, per_page: 100 });
  if (open.some(pr => pr.base.ref !== base)) throw new Error('An existing PR has the wrong base; resolve it explicitly.');
  let pr = open[0];
  if (!pr) {
    const { data: comparison } = await github.rest.repos.compareCommitsWithBasehead({ ...repo, basehead: `${baseRef.object.sha}...${sha}` });
    if (!comparison.files?.length) return { skipped: 'No file changes relative to the task base.' };
    const created = await github.rest.pulls.create({ ...repo, head: branch, base, draft: true,
      title: `Task #${number}: ${branch}`,
      body: `Refs #${number}\n\n自动为已推送的工作检查点建立审核入口。\n\n- 工作分支：\`${branch}\`\n- 任务正式分支：\`${base}\`\n- 最新进度、证据和下一步：\`.context/STATE.md\`\n- 每轮指纹记录：\`.context/fingerprints/\`（若该检查点早于接入，不能追溯补测）。\n\n当前仍为候选成果。请由 Kibiandkimi 审核并决定是否合并；agent 不得自行合并。\n` });
    pr = created.data;
  }
  // PRs created with GITHUB_TOKEN do not trigger ordinary PR workflows. Run the
  // trusted checker here as well and bind the result to the actual current head.
  const { data: current } = await github.rest.pulls.get({ ...repo, pull_number: pr.number });
  const status = state => github.rest.repos.createCommitStatus({ ...repo, sha: current.head.sha, state,
    context: 'arena/protocol', target_url: runURL, description: state === 'pending' ? 'Checking saved checkpoint' : 'Task routing, handoff and recorded fingerprint checks' });
  await status('pending');
  let report;
  try { report = await inspectPullRequest({ github, repo, pr: current }); await status(report.errors.length ? 'failure' : 'success'); }
  catch (error) { await status('failure'); throw error; }
  return { url: current.html_url, number: current.number, head: current.head.sha, report };
}

module.exports = { ensureTaskPR };
