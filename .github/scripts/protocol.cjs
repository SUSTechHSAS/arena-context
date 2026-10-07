'use strict';

const REQUIRED = ['.context/TASK.md', '.context/STATE.md', '.context/DECISIONS.md'];
const STATE_SECTIONS = ['Current objective', 'Candidate progress', 'Verification', 'Blockers and unresolved owner feedback', 'Next action'];

function field(text, key) {
  const prefix = `- ${key}:`;
  // Issue briefs and evidence may quote fields; only the top metadata block is authoritative.
  const header = text.split(/^##\s/m, 1)[0];
  const lines = header.split(/\r?\n/).filter(line => line.startsWith(prefix));
  return lines.length === 1 ? lines[0].slice(prefix.length).trim() : '';
}

function protectedPath(path) {
  return path === 'AGENTS.md' || path.startsWith('.github/') || path.startsWith('.templates/');
}

function validate({ pr, files, trustedTask, candidate }) {
  const errors = [];
  const fail = message => errors.push(message);
  const base = pr.base.ref, head = pr.head.ref, repo = pr.base.repo.full_name;
  if (pr.head.repo?.full_name !== repo) fail('Use a work branch in the same repository.');
  if (pr.changed_files > 3000) fail('Split this PR: GitHub lists at most 3,000 changed files.');
  if (base === 'main') {
    if (!/^meta\/[a-z0-9][a-z0-9/_-]*$/.test(head)) fail('PRs to main must use a meta/<unit> branch.');
    return { errors, summary: 'Shared protocol proposal; human CODEOWNER review is required.' };
  }
  const standard = /^task\/([1-9]\d*)\/main$/.exec(base);
  if (!standard && base !== 'AerraGen-main') fail('Unsupported task base branch.');
  if (typeof trustedTask !== 'string') return { errors: [...errors, 'The task base is missing .context/TASK.md.'], summary: '' };
  const issueURL = field(trustedTask, 'Task Issue');
  const prefix = `https://github.com/${repo}/issues/`;
  const issue = issueURL.startsWith(prefix) ? issueURL.slice(prefix.length) : '';
  if (!/^[1-9]\d*$/.test(issue)) return { errors: [...errors, 'Accepted TASK.md needs this repository\'s Issue URL.'], summary: '' };
  if (standard && standard[1] !== issue) fail('Task branch number differs from its accepted Issue.');
  if (field(trustedTask, 'Accepted branch') !== base) fail('Accepted TASK.md names a different base branch.');
  // Arena chooses opaque branch names. Task identity comes from the accepted
  // TASK.md, never from a UUID or from a branch name guessed by the model.
  const normal = new RegExp(`^work/${issue}/[a-z0-9][a-z0-9/_-]*$`).test(head) || /^arena\/[a-z0-9][a-z0-9/_-]*$/.test(head);
  const maintenance = new RegExp(`^meta/${issue}/[a-z0-9][a-z0-9/_-]*$`).test(head);
  if (!normal && !maintenance) fail(`Use work/${issue}/<unit>, arena/<generated-name>, or meta/${issue}/<unit>.`);
  for (const path of REQUIRED) {
    if (typeof candidate[path] !== 'string' || !candidate[path].trim()) fail(`Missing handoff file: ${path}`);
  }
  const task = candidate['.context/TASK.md'] || '';
  if (field(task, 'Task Issue') !== issueURL) fail('Do not change the task Issue identity.');
  if (field(task, 'Accepted branch') !== base) fail('Do not change the accepted branch identity.');
  if (normal) {
    if (files.some(f => protectedPath(f.filename) || (f.previous_filename && protectedPath(f.previous_filename)))) {
      fail('Shared rules, templates, and workflows require a meta/<issue>/<unit> PR.');
    }
    if (!files.some(f => f.filename === '.context/STATE.md' && ['added', 'modified', 'renamed'].includes(f.status))) {
      fail('Update .context/STATE.md together with the saved work.');
    }
    const state = candidate['.context/STATE.md'] || '';
    if (field(state, 'Task') !== `#${issue}`) fail('STATE.md must identify the matching task number.');
    const work = field(state, 'Work branch / PR');
    if (work !== head && !work.startsWith(`${head} `) && !work.startsWith(`${head};`)) fail('STATE.md must name the exact work branch.');
    for (const section of STATE_SECTIONS) {
      if (!state.split(/\r?\n/).includes(`## ${section}`)) fail(`STATE.md is missing section: ${section}`);
    }
  }
  return { errors, maintenance, summary: maintenance ? `Task #${issue} protocol proposal; human review is required.` : `Task #${issue} routing and handoff match; content still needs human review.` };
}

async function readText(github, repo, path, ref, maxBytes = 65536) {
  try {
    let { data } = await github.rest.repos.getContent({ ...repo, path, ref });
    if (Array.isArray(data) || data.type !== 'file' || data.size > maxBytes) {
      throw new Error(`Expected a regular handoff file within the size limit: ${path}`);
    }
    if (data.encoding === 'none') data = (await github.rest.git.getBlob({ ...repo, file_sha: data.sha })).data;
    if (data.encoding !== 'base64' || data.size > maxBytes) throw new Error(`Unsupported file encoding: ${path}`);
    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch (error) {
    if (error.status === 404) return undefined;
    throw error;
  }
}

async function inspectPullRequest({ github, repo, pr }) {
  if (pr.head.repo?.full_name !== pr.base.repo.full_name) return { errors: ['Use a branch in the same repository.'], summary: '' };
  const files = await github.paginate(github.rest.pulls.listFiles, { ...repo, pull_number: pr.number, per_page: 100 });
  if (pr.base.ref === 'main') return validate({ pr, files, candidate: {} });
  const trustedTask = await readText(github, repo, '.context/TASK.md', pr.base.sha);
  const candidate = {};
  for (const path of REQUIRED) candidate[path] = await readText(github, repo, path, pr.head.sha);
  const report = validate({ pr, files, trustedTask, candidate });
  if (!report.errors.length && !report.maintenance) {
    const fp = field(candidate['.context/STATE.md'] || '', 'Fingerprint');
    if (!fp || fp === 'not recorded') {
      if (await isLegacyCheckpoint({ github, repo, pr })) {
        report.warnings = ['Pre-gate checkpoint preserved for human review; no model identity is claimed. New task changes require an accepted Clear match.'];
      } else {
        report.errors.push('No current fingerprint: new task changes require Clear match from an accepted model.');
      }
    } else if (!/^\.context\/fingerprints\/\d{8}T\d{6}Z-[a-f0-9]{8}\/report\.json$/.test(fp)) {
      report.errors.push('Fingerprint must link to a per-turn report path.');
    } else {
      try {
        const result = JSON.parse(await readText(github, repo, fp, pr.head.sha));
        const raw = await readText(github, repo, fp.replace('report.json', 'raw.json'), pr.head.sha);
        const { hash, packageId, scoreSample } = await import('./fingerprint-lib.mjs');
        const { decideWork, validatePolicy } = await import('./model-gate.mjs');
        // The accepted list is centrally controlled on protected main. A
        // candidate's copy of policy.json or self-written gate cannot grant access.
        const currentPolicy = validatePolicy(JSON.parse(await readText(github, repo, '.github/fingerprint-policy.json', 'main')));
        if (result.identity_verified !== false || result.same_model_within_turn !== 'assumed_by_user') throw new Error('Invalid fingerprint evidence labels.');
        if (result.raw_sha256 !== (raw === undefined ? null : hash(raw))) throw new Error('Fingerprint raw hash mismatch.');
        let verified = { status: 'unscored' };
        if (result.status !== 'unscored') {
          if (!/^[a-f0-9]{64}$/.test(result.package_id)) throw new Error('Invalid fingerprint package ID.');
          const bundle = JSON.parse(await readText(github, repo, `.context/fingerprints/banks/${result.package_id}.json`, pr.head.sha, 10000000));
          if (packageId(bundle) !== result.package_id) throw new Error('Fingerprint package changed.');
          const trusted = require('../vendor/modeltrace/provenance.json').website_code_sha256;
          verified = scoreSample(raw, bundle, trusted);
          if (result.bank_sha256 !== bundle.bank_sha256 || result.bank_version !== bundle.bank_version) throw new Error('Fingerprint bank metadata mismatch.');
          for (const key of ['status', 'nearest_model', 'identified_candidate', 'family']) {
            if (verified[key] !== result[key]) throw new Error(`Fingerprint score mismatch: ${key}`);
          }
          for (const key of ['fit', 'separation']) {
            if (verified[key] !== undefined && (!Number.isFinite(result[key]) || Math.abs(verified[key] - result[key]) > 1e-12)) throw new Error(`Fingerprint numeric mismatch: ${key}`);
          }
          if (JSON.stringify(verified.candidates) !== JSON.stringify(result.candidates)) throw new Error('Fingerprint candidate list mismatch.');
        }
        if (!result.gate && await isLegacyCheckpoint({ github, repo, pr })) {
          report.warnings = ['Historical fingerprint predates the model gate; it does not authorize a new turn.'];
        } else {
          const decision = decideWork(verified, currentPolicy);
          if (!decision.allowed) throw new Error(`Model gate denied: ${decision.reason}. End the user turn; do not perform task work.`);
          if (result.gate?.allowed !== true || result.gate?.action !== 'CONTINUE') throw new Error('This report did not authorize work in its original turn. Obtain a new accepted Clear match in a new user turn.');
        }
      } catch (error) { report.errors.push(`Fingerprint record invalid: ${error.message}`); }
    }
  }
  return report;
}

async function isLegacyCheckpoint({ github, repo, pr }) {
  const text = await readText(github, repo, '.github/fingerprint-legacy.json', 'main');
  if (!text) return false;
  const legacy = JSON.parse(text).heads?.[pr.head.ref];
  if (!/^[a-f0-9]{40}$/.test(legacy || '')) return false;
  if (legacy === pr.head.sha) return true;
  const { data } = await github.rest.repos.compareCommitsWithBasehead({ ...repo, basehead: `${legacy}...${pr.head.sha}` });
  const protocolOnly = p => protectedPath(p) || ['README.md', 'docs/OPERATIONS.md', 'docs/FINGERPRINT.md', '.context/STATE.md'].includes(p);
  return ['ahead', 'identical'].includes(data.status) && Array.isArray(data.files) && data.files.length < 300 &&
    data.files.every(f => protocolOnly(f.filename) && (!f.previous_filename || protocolOnly(f.previous_filename)));
}

module.exports = { field, validate, inspectPullRequest, readText, isLegacyCheckpoint };
