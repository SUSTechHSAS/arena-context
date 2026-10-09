'use strict';

function createTaskFiles({ issue, branch, protocolSha, now = new Date().toISOString() }) {
  if (!Number.isSafeInteger(issue.number) || issue.number < 1) throw new Error('Invalid issue number.');
  if (!/^[a-f0-9]{40}$/.test(protocolSha)) throw new Error('Expected a full protocol commit SHA.');
  if (branch !== `task/${issue.number}/main` && branch !== 'AerraGen-main') throw new Error('Invalid task branch.');
  return {
    '.context/TASK.md': `# Task contract\n\n- Task Issue: ${issue.html_url}\n- Title: ${issue.title.replace(/[\r\n]/g, ' ')}\n- Kind: mixed\n- Accepted branch: ${branch}\n- Human task owner and reviewer: Kibiandkimi\n- Arena submission account: SUSTechHSAS\n- Protocol version: ${protocolSha}\n\n## Goal, scope, acceptance, and inputs\n\nBrief copied from the Issue at initialization. Read subsequent explicit owner instructions. Missing requirements do not authorize inventing a goal.\n\n${issue.body || '待补充目标与验收要求。'}\n\n## Contract changes\n\nPropose changes for human review. Task Issue and accepted branch identities remain fixed.\n`,
    '.context/STATE.md': `# Current handoff\n\n- Task: #${issue.number}\n- Unit: not started\n- Work branch / PR: not created\n- Accepted base at unit start: not started\n- Updated: ${now}\n- Latest session: initialization\n- Candidate stage: not started\n- Model role: not recorded\n- Work packet: none\n- Primary review: none\n\nThis card does not establish approval; check the actual task branch and PR.\n\n## Current objective\n\nRead TASK.md and confirm actionable goals and acceptance criteria.\n\n## Candidate progress\n\nWorkspace initialized. No domain work has been performed or accepted.\n\n## Verification\n\nInitialization only; no task-specific validation has run.\n\n## Blockers and unresolved owner feedback\n\nClarify any missing requirements before dependent work.\n\n## Next action\n\nRead the Issue, then create work/${issue.number}/<unit> from ${branch}. Record its actual accepted base SHA and work branch before saving the first candidate checkpoint.\n`,
    '.context/DECISIONS.md': '# Decisions and rationale\n\nNo task-specific decisions yet. Record consequential choices, alternatives, evidence, and owner instructions. Candidate decisions remain unreviewed.\n',
  };
}

async function initializeTask({ github, repo, issueNumber, actor, ref, protocolSha }) {
  if (actor.toLowerCase() !== 'kibiandkimi') throw new Error('Only Kibiandkimi may initialize tasks.');
  if (ref !== 'refs/heads/main') throw new Error('Run New task from main.');
  if (!/^[1-9]\d*$/.test(String(issueNumber)) || !Number.isSafeInteger(Number(issueNumber))) throw new Error('Enter a positive Issue number.');
  const number = Number(issueNumber);
  const { data: issue } = await github.rest.issues.get({ ...repo, issue_number: number });
  if (issue.pull_request || issue.state !== 'open') throw new Error('Use an open task Issue, not a PR.');
  if (!['kibiandkimi', 'sustechhsas'].includes(issue.user.login.toLowerCase())) throw new Error('Task Issue must be authored by a designated account.');
  if (!issue.body?.trim()) throw new Error('Fill in the task brief first.');
  // The existing AerraGen task retains its legacy base name.
  try {
    const { data } = await github.rest.repos.getContent({ ...repo, path: '.context/TASK.md', ref: 'AerraGen-main' });
    if (data.type === 'file' && data.encoding === 'base64') {
      const { field } = require('./protocol.cjs');
      if (field(Buffer.from(data.content, 'base64').toString('utf8'), 'Task Issue') === issue.html_url) {
        throw new Error('Task branch already exists: AerraGen-main');
      }
    }
  } catch (error) { if (error.status !== 404) throw error; }
  const branch = `task/${number}/main`;
  try {
    await github.rest.git.getRef({ ...repo, ref: `heads/${branch}` });
    throw new Error(`Task branch already exists: ${branch}`);
  } catch (error) { if (error.status !== 404) throw error; }
  const { data: base } = await github.rest.git.getCommit({ ...repo, commit_sha: protocolSha });
  const files = createTaskFiles({ issue, branch, protocolSha });
  const { data: tree } = await github.rest.git.createTree({ ...repo, base_tree: base.tree.sha,
    tree: Object.entries(files).map(([path, content]) => ({ path, mode: '100644', type: 'blob', content })) });
  const { data: commit } = await github.rest.git.createCommit({ ...repo,
    message: `Initialize task #${number}: ${issue.title}`, tree: tree.sha, parents: [protocolSha] });
  await github.rest.git.createRef({ ...repo, ref: `refs/heads/${branch}`, sha: commit.sha });
  return { branch, sha: commit.sha, issue: issue.html_url };
}

module.exports = { createTaskFiles, initializeTask };
