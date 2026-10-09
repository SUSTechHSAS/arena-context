#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fingerprintVerifier, FINGERPRINT } from './fingerprint-record.mjs';
import { PACKET, RUN, REVIEW, metadata, validatePacket, validateRun, validateReview,
  requirePrimary, scopeErrors, reviewDigest, newestReview } from './collaboration-lib.mjs';

const WORKTREE = 'working-files';
const writeNew = (root, file, value) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
};

export function localRepository(root) {
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const read = async (file, ref = WORKTREE) => {
    if (ref === WORKTREE) {
      try { return fs.readFileSync(path.join(root, file), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return undefined; throw e; }
    }
    try { return git(['show', `${ref}:${file}`]); } catch (e) { if (e.status === 128) return undefined; throw e; }
  };
  const tree = ref => git(['ls-tree', '-rz', '--full-tree', ref]).split('\0').filter(Boolean).map(row => {
    const tab = row.indexOf('\t'), [mode, type, sha] = row.slice(0, tab).split(' ');
    return { path: row.slice(tab + 1), mode, type, sha };
  });
  const compare = (base, head) => {
    git(['merge-base', '--is-ancestor', base, head]);
    const rows = git(['diff', '--name-status', '-z', '--find-renames', base, head, '--']).split('\0').filter(Boolean), files = [];
    for (let i = 0; i < rows.length;) {
      const status = rows[i++], first = rows[i++];
      files.push(status.startsWith('R') ? { filename: rows[i++], previous_filename: first, status: 'renamed' } :
        { filename: first, status: ({ A: 'added', M: 'modified', D: 'removed', T: 'modified' })[status] || 'modified' });
    }
    return files;
  };
  return { git, read, tree, compare };
}

async function session(root) {
  const repository = localRepository(root), { git, read } = repository;
  const fingerprint = metadata(await read('.context/STATE.md'), 'Fingerprint');
  const turn = FINGERPRINT.exec(fingerprint || '')?.[1];
  if (!turn) throw new Error('Score this user turn and set STATE Fingerprint before using collaboration commands.');
  const manifest = JSON.parse(await read(fingerprint.replace('report.json', 'manifest.json')));
  const verify = fingerprintVerifier({ read, policy: manifest.policy });
  const evidence = await verify(fingerprint, WORKTREE);
  const branch = git(['branch', '--show-current']).trim(), head = git(['rev-parse', 'HEAD']).trim();
  if (evidence.report.branch !== branch || !/^(arena|work)\//.test(branch)) throw new Error('The current fingerprint must belong to the actual work/arena branch.');
  git(['merge-base', '--is-ancestor', evidence.manifest.work_head_before_probe, head]);
  const task = await read('.context/TASK.md'), accepted = metadata(task, 'Accepted branch');
  const issue = /^https:\/\/github\.com\/SUSTechHSAS\/arena-context\/issues\/([1-9]\d*)$/.exec(metadata(task, 'Task Issue'))?.[1];
  if (!issue || !['AerraGen-main', `task/${issue}/main`].includes(accepted)) throw new Error('Task identity is missing or invalid.');
  return { ...repository, root, fingerprint, turn, evidence, verify, branch, head, issue: Number(issue), accepted };
}

async function issuedPacket(ctx, file) {
  const { read, git, verify, head } = ctx;
  const packet = validatePacket(JSON.parse(await read(file, head)), file);
  if (packet.task_issue !== ctx.issue || packet.accepted_branch !== ctx.accepted) throw new Error('Packet belongs to another task.');
  const source = git(['log', '--format=%H', '--diff-filter=A', head, '--', file]).trim().split('\n')[0];
  if (!source || await read(file, source) !== await read(file, head)) throw new Error('Use the unchanged packet from its primary introduction checkpoint.');
  const parents = git(['rev-list', '--parents', '-n', '1', source]).trim().split(' ').slice(1);
  if (parents.length !== 1 || !ctx.compare(parents[0], source).some(f => f.filename === file && f.status === 'added')) throw new Error('Packet source must be a normal introduction commit.');
  const issuer = await verify(packet.issued_by, source); requirePrimary(issuer);
  git(['merge-base', '--is-ancestor', issuer.manifest.work_head_before_probe, source]);
  const sourceTask = await read('.context/TASK.md', source);
  if (metadata(sourceTask, 'Task Issue') !== `https://github.com/SUSTechHSAS/arena-context/issues/${ctx.issue}` || metadata(sourceTask, 'Accepted branch') !== ctx.accepted) throw new Error('Packet source task mismatch.');
  return { packet, file, source };
}

async function packetRuns(ctx, issued) {
  const runs = [];
  for (const entry of ctx.tree(ctx.head).filter(e => RUN.test(e.path))) {
    const run = validateRun(JSON.parse(await ctx.read(entry.path, ctx.head)), entry.path);
    if (run.packet === issued.file && run.source_commit === issued.source) runs.push({ file: entry.path, run });
  }
  return runs;
}

async function latestReview(ctx, issued, runs) {
  const candidates = [];
  for (const entry of ctx.tree(ctx.head).filter(e => REVIEW.test(e.path))) {
    const review = validateReview(JSON.parse(await ctx.read(entry.path, ctx.head)), entry.path);
    if (review.packet !== issued.file || review.source_commit !== issued.source) continue;
    requirePrimary(await ctx.verify(review.fingerprint, ctx.head));
    ctx.git(['merge-base', '--is-ancestor', review.reviewed_head, ctx.head]);
    candidates.push({ file: entry.path, review });
  }
  const latest = await newestReview(candidates, ctx.read, ctx.head);
  if (!latest || latest.review.verdict !== 'approved') return false;
  const files = runs.map(r => r.file), digest = reviewDigest(ctx.tree(ctx.head), issued.packet, files);
  return latest.review.tree_sha256 === digest && reviewDigest(ctx.tree(latest.review.reviewed_head), issued.packet, files) === digest;
}

async function dependenciesReady(ctx, issued, trail = []) {
  if (trail.includes(issued.packet.id)) throw new Error('Work packet dependencies contain a cycle.');
  for (const id of issued.packet.depends_on) {
    const dependency = await issuedPacket(ctx, `.context/collaboration/packets/${id}.json`);
    await dependenciesReady(ctx, dependency, [...trail, issued.packet.id]);
    if (!await latestReview(ctx, dependency, await packetRuns(ctx, dependency))) throw new Error(`Dependency ${id} needs primary review first.`);
  }
}

export async function collaborate(root, command, argument, input) {
  const ctx = await session(root);
  if (command === 'create') {
    requirePrimary(ctx.evidence);
    const definition = JSON.parse(fs.readFileSync(argument, 'utf8'));
    const file = `.context/collaboration/packets/${definition.id}.json`;
    const packet = validatePacket({ ...definition, schema: 1, task_issue: ctx.issue, accepted_branch: ctx.accepted,
      depends_on: definition.depends_on || [], issued_by: ctx.fingerprint }, file);
    writeNew(root, file, packet);
    return { packet: file, next: 'Update STATE, commit and push the packet with this primary fingerprint. Secondary sessions may claim it after that checkpoint; no owner merge is needed to start the candidate work.' };
  }
  if (command === 'status') {
    const packets = [];
    for (const entry of ctx.tree(ctx.head).filter(e => PACKET.test(e.path))) {
      try {
        const issued = await issuedPacket(ctx, entry.path), runs = await packetRuns(ctx, issued);
        await dependenciesReady(ctx, issued);
        packets.push({ id: issued.packet.id, title: issued.packet.title, source_commit: issued.source,
          status: await latestReview(ctx, issued, runs) ? 'primary-reviewed' : runs.length ? 'working-or-awaiting-primary-review' : 'available' });
      } catch (error) { packets.push({ packet: entry.path, status: 'blocked', reason: error.message }); }
    }
    return { role: ctx.evidence.role, packets, next: packets.length ? 'Claim one assigned, unblocked packet; one writer and one packet per secondary PR.' : 'No primary packet is available. Save only this turn fingerprint and a blocked STATE, then hand back to a primary session.' };
  }
  const file = `.context/collaboration/packets/${argument}.json`;
  if (!PACKET.test(file)) throw new Error('Use a valid packet ID.');
  const issued = await issuedPacket(ctx, file), runs = await packetRuns(ctx, issued);
  if (command === 'claim') {
    if (ctx.evidence.role !== 'secondary' || ctx.evidence.originalRole !== 'secondary') throw new Error('claim is for a current secondary turn; primary sessions can work directly or review.');
    await dependenciesReady(ctx, issued);
    if (await latestReview(ctx, issued, runs)) throw new Error('This packet is already primary-reviewed; choose another or have a primary issue a new packet.');
    const start = runs[0]?.run.start_head || ctx.evidence.manifest.work_head_before_probe;
    if (runs.some(({ run }) => run.start_head !== start)) throw new Error('The packet has conflicting starting checkpoints.');
    if (!runs.length) {
      let acceptedStart = false;
      for (const ref of [`refs/remotes/origin/${ctx.accepted}`, `refs/heads/${ctx.accepted}`]) {
        try { ctx.git(['merge-base', '--is-ancestor', start, ref]); acceptedStart = true; break; } catch {}
      }
      if (!acceptedStart) requirePrimary(await ctx.verify(metadata(await ctx.read('.context/STATE.md', start), 'Fingerprint'), start));
    }
    const errors = scopeErrors(ctx.compare(start, ctx.head), issued.packet);
    if (errors.length) throw new Error(errors.join('\n'));
    const runPath = `.context/collaboration/runs/${ctx.turn}/run.json`;
    const run = validateRun({ schema: 1, turn_id: ctx.turn, packet: file, source_commit: issued.source, start_head: start,
      fingerprint: ctx.fingerprint, branch: ctx.branch }, runPath);
    writeNew(root, runPath, run);
    writeNew(root, runPath.replace('run.json', 'result.md'), `# Secondary result: ${argument}\n\n## Changes\n\nNot started.\n\n## Verification\n\nNot run.\n\n## Gaps and handoff\n\nWork only within the packet. Record actual evidence and request primary review when ready.\n`);
    return { role: 'secondary', packet: file, source_commit: issued.source, run: runPath,
      allowed_paths: issued.packet.allowed_paths, acceptance: issued.packet.acceptance, verification: issued.packet.verification,
      next: 'Set STATE Model role: secondary and Work packet to this packet path. Execute only its scope; update result.md and STATE, then commit and push. Keep the PR Draft until primary review.' };
  }
  if (command === 'review') {
    requirePrimary(ctx.evidence);
    if (!runs.length) throw new Error('There are no committed secondary runs to review.');
    if (runs.some(({ run }) => run.start_head !== runs[0].run.start_head)) throw new Error('The packet has conflicting starting checkpoints.');
    const errors = scopeErrors(ctx.compare(runs[0].run.start_head, ctx.head), issued.packet);
    if (errors.length) throw new Error(errors.join('\n'));
    for (const { file: runFile, run } of runs) {
      const proof = await ctx.verify(run.fingerprint, ctx.head);
      if (proof.originalRole !== 'secondary' || proof.role !== 'secondary' || proof.report.branch !== run.branch) throw new Error('Secondary run evidence does not match its role/branch.');
      if (!(await ctx.read(runFile.replace('run.json', 'result.md'), ctx.head))?.trim()) throw new Error(`Missing result for ${runFile}`);
    }
    const dirty = [...ctx.git(['diff', '--name-only', '-z', 'HEAD', '--']).split('\0'), ...ctx.git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0')].filter(Boolean);
    const probePrefix = ctx.fingerprint.replace('report.json', '');
    if (dirty.some(p => p !== '.context/STATE.md' && !p.startsWith(probePrefix) && !/^\.context\/fingerprints\/banks\/[a-f0-9]{64}\.json$/.test(p))) {
      throw new Error('Commit the outputs and run evidence before review; only current fingerprint files and STATE may be uncommitted. Keep the review input outside the repository.');
    }
    const details = JSON.parse(fs.readFileSync(input, 'utf8'));
    const reviewPath = `.context/collaboration/reviews/${ctx.turn}-${argument}.json`;
    const review = validateReview({ ...details, schema: 1, packet: file, source_commit: issued.source,
      reviewed_head: ctx.head, fingerprint: ctx.fingerprint, tree_sha256: reviewDigest(ctx.tree(ctx.head), issued.packet, runs.map(r => r.file)) }, reviewPath);
    writeNew(root, reviewPath, review);
    return { review: reviewPath, verdict: review.verdict, reviewed_head: ctx.head,
      next: 'Update STATE, commit and push this review and primary fingerprint. Human CODEOWNER review and merge are still required; changed outputs or new run evidence invalidate this review.' };
  }
  throw new Error('Usage: collaboration.mjs status | create <definition.json> | claim <packet-id> | review <packet-id> <review.json>');
}

async function main() {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const [command, argument, input] = process.argv.slice(2);
  console.log(JSON.stringify(await collaborate(root, command, argument, input), null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.log(JSON.stringify({ action: 'STOP_TASK', reason: error.message, next: 'Do not widen scope or change policy. Record the blocker in the permitted handoff and return to a primary session.' }));
  process.exitCode = 1;
});
