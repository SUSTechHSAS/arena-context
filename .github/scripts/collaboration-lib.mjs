import { createHash } from 'node:crypto';
import { FINGERPRINT, TURN, SHA } from './fingerprint-record.mjs';

export const SLUG = '[a-z0-9][a-z0-9-]{0,63}';
export const PACKET = new RegExp(`^\\.context/collaboration/packets/(${SLUG})\\.json$`);
export const RUN = new RegExp(`^\\.context/collaboration/runs/(${TURN})/run\\.json$`);
export const REVIEW = new RegExp(`^\\.context/collaboration/reviews/(${TURN})-(${SLUG})\\.json$`);
const RESULT = new RegExp(`^\\.context/collaboration/runs/(${TURN})/result\\.md$`);
const SAMPLE = new RegExp(`^\\.context/fingerprints/(${TURN})/(manifest|raw|report)\\.json$`);
const BANK = /^\.context\/fingerprints\/banks\/[a-f0-9]{64}\.json$/;

export function metadata(text, key) {
  const prefix = `- ${key}:`, header = (text || '').split(/^##\s/m, 1)[0];
  const lines = header.split(/\r?\n/).filter(line => line.startsWith(prefix));
  return lines.length === 1 ? lines[0].slice(prefix.length).trim() : '';
}

export function controlPath(file) {
  return ['.github', '.templates', '.context', '.git'].some(p => file === p || file.startsWith(p + '/')) ||
    file.split('/').includes('AGENTS.md') || ['README.md', 'docs/OPERATIONS.md', 'docs/FINGERPRINT.md', 'docs/COLLABORATION.md'].includes(file);
}

function safeScope(file) {
  if (typeof file !== 'string' || !file || /[\x00-\x1f\x7f\\*?\[\]{}]/.test(file)) return false;
  const name = file.endsWith('/') ? file.slice(0, -1) : file;
  return !name.split('/').some(p => ['', '.', '..', '.git'].includes(p)) && !controlPath(name);
}

const textList = (value, empty = false) => Array.isArray(value) && (empty || value.length > 0) && value.every(s => typeof s === 'string' && s.trim());
const unique = values => new Set(values).size === values.length;

export function validatePacket(packet, file) {
  if (packet?.schema !== 1 || !PACKET.test(file || '') || PACKET.exec(file)[1] !== packet.id ||
      !Number.isSafeInteger(packet.task_issue) || packet.task_issue < 1 ||
      !["AerraGen-main", `task/${packet.task_issue}/main`].includes(packet.accepted_branch) ||
      !textList([packet.title, packet.objective]) || !textList(packet.allowed_paths) ||
      !packet.allowed_paths.every(safeScope) || !unique(packet.allowed_paths) ||
      !textList(packet.acceptance) || !textList(packet.verification) ||
      !textList(packet.depends_on, true) || !unique(packet.depends_on) ||
      packet.depends_on.some(id => !new RegExp(`^${SLUG}$`).test(id) || id === packet.id) ||
      !FINGERPRINT.test(packet.issued_by || '')) throw new Error(`Invalid bounded work packet: ${file}`);
  return packet;
}

export function validateRun(run, file) {
  const turn = RUN.exec(file || '')?.[1];
  if (run?.schema !== 1 || !turn || run.turn_id !== turn || !PACKET.test(run.packet || '') ||
      !SHA.test(run.source_commit || '') || !SHA.test(run.start_head || '') || run.fingerprint !== `.context/fingerprints/${turn}/report.json` ||
      !/^(work|arena)\/[a-z0-9][a-z0-9/_-]*$/.test(run.branch || '')) throw new Error(`Invalid secondary run: ${file}`);
  return run;
}

export function validateReview(review, file) {
  const match = REVIEW.exec(file || '');
  if (review?.schema !== 1 || !match || review.packet !== `.context/collaboration/packets/${match[2]}.json` ||
      review.fingerprint !== `.context/fingerprints/${match[1]}/report.json` ||
      !SHA.test(review.source_commit || '') || !SHA.test(review.reviewed_head || '') ||
      !/^[a-f0-9]{64}$/.test(review.tree_sha256 || '') ||
      !['approved', 'changes_requested'].includes(review.verdict) ||
      !textList([review.summary]) || !textList(review.verification)) throw new Error(`Invalid primary review: ${file}`);
  return review;
}

export const inScope = (file, packet) => !controlPath(file) && packet.allowed_paths.some(p => p.endsWith('/') ? file.startsWith(p) : file === p);
export const evidencePath = file => SAMPLE.test(file) || BANK.test(file) || RUN.test(file) || RESULT.test(file) || REVIEW.test(file);

export function scopeErrors(files, packet) {
  return files.filter(f => {
    const allowed = file => file === '.context/STATE.md' || inScope(file, packet) || (f.status === 'added' && evidencePath(file));
    return !allowed(f.filename) || (f.previous_filename && !allowed(f.previous_filename));
  }).map(f => `Outside packet ${packet.id}: ${f.previous_filename ? f.previous_filename + ' -> ' : ''}${f.filename}`);
}

export function noWorkErrors(files, fingerprint) {
  const prefix = fingerprint.replace('report.json', '');
  return files.filter(f => f.previous_filename || !(f.filename === '.context/STATE.md' ||
    (f.status === 'added' && (BANK.test(f.filename) || (SAMPLE.test(f.filename) && f.filename.startsWith(prefix))))))
    .map(f => `A secondary turn without a packet may only save its fingerprint and STATE: ${f.filename}`);
}

// Git blob IDs include exact content, modes distinguish executable/symlink
// changes, and a missing entry distinguishes deletion. STATE and new probe or
// review metadata do not invalidate a review; task outputs and run evidence do.
export function reviewDigest(entries, packet, runFiles) {
  const prefixes = runFiles.map(file => file.slice(0, -'run.json'.length));
  const selected = entries.filter(e => inScope(e.path, packet) || e.path === `.context/collaboration/packets/${packet.id}.json` || prefixes.some(p => e.path.startsWith(p)))
    .map(e => [e.path, e.mode, e.type, e.sha]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return createHash('sha256').update(JSON.stringify(selected)).digest('hex');
}

export function requirePrimary(evidence) {
  if (evidence.role !== 'primary' || evidence.originalRole !== 'primary' || evidence.report.gate?.role !== 'primary' || !evidence.manifest) {
    throw new Error('A fresh primary-role fingerprint is required to issue packets or review secondary work.');
  }
}

// Order reviews by the checkpoints they actually inspected, not timestamps or
// random turn suffixes. A new review must have seen any review it supersedes.
export async function newestReview(candidates, read, head) {
  const latest = [];
  for (const candidate of candidates) {
    const content = await read(candidate.file, head);
    let superseded = false;
    for (const other of candidates) {
      if (candidate !== other && await read(candidate.file, other.review.reviewed_head) === content) { superseded = true; break; }
    }
    if (!superseded) latest.push(candidate);
  }
  if (latest.length > 1) throw new Error('Primary reviews are concurrent; review a checkpoint containing all of them.');
  return latest[0];
}

export function checkedComparison(data) {
  if (!['ahead', 'identical'].includes(data.status)) throw new Error('Collaboration source must be an ancestor of this checkpoint.');
  if (!Array.isArray(data.files) || data.files.length >= 300) throw new Error('Collaboration diff is incomplete or reaches the GitHub 300-file limit; split the work unit.');
  return data.files;
}

export async function inspectCollaboration({ github, repo, pr, files, trustedTask, read, verify, evidence, fingerprint }) {
  const errors = [], warnings = [], head = pr.head.sha;
  const compared = new Map(), trees = new Map();
  const compare = (base, target = head) => {
    const key = `${base}...${target}`;
    if (!compared.has(key)) compared.set(key, github.rest.repos.compareCommitsWithBasehead({ ...repo, basehead: key }).then(({ data }) => checkedComparison(data)));
    return compared.get(key);
  };
  const tree = ref => {
    if (!trees.has(ref)) trees.set(ref, (async () => {
      const { data: commit } = await github.rest.git.getCommit({ ...repo, commit_sha: ref });
      const { data } = await github.rest.git.getTree({ ...repo, tree_sha: commit.tree.sha, recursive: 'true' });
      if (data.truncated || !Array.isArray(data.tree)) throw new Error('Complete Git tree required for primary review.');
      return data.tree.filter(e => e.type !== 'tree');
    })());
    return trees.get(ref);
  };
  const primary = async (file, ref) => { const result = await verify(file, ref); requirePrimary(result); return result; };
  const packetIdentity = packet => {
    if (packet.accepted_branch !== pr.base.ref || metadata(trustedTask, 'Task Issue') !== `https://github.com/${repo.owner}/${repo.repo}/issues/${packet.task_issue}`) {
      throw new Error('Work packet belongs to a different task.');
    }
  };
  const dependencyCache = new Map();
  const checkDependency = async (id, ref, trail = []) => {
    if (trail.includes(id)) throw new Error('Work packet dependencies contain a cycle.');
    const cacheKey = `${ref}:${id}`;
    if (dependencyCache.has(cacheKey)) return;
    const file = `.context/collaboration/packets/${id}.json`;
    const packet = validatePacket(JSON.parse(await read(file, ref)), file); packetIdentity(packet);
    await primary(packet.issued_by, ref);
    for (const dependency of packet.depends_on) await checkDependency(dependency, ref, [...trail, id]);
    const entries = await tree(ref), candidates = [], dependencyRuns = [];
    for (const entry of entries.filter(e => REVIEW.test(e.path))) {
      const review = validateReview(JSON.parse(await read(entry.path, ref)), entry.path);
      if (review.packet === file) candidates.push({ file: entry.path, review });
    }
    const latest = (await newestReview(candidates, read, ref))?.review;
    if (!latest || latest.verdict !== 'approved') throw new Error(`Dependency ${id} needs primary review first.`);
    await primary(latest.fingerprint, ref);
    if (await read(file, latest.source_commit) !== await read(file, ref)) throw new Error(`Dependency ${id} packet changed.`);
    await compare(latest.source_commit, latest.reviewed_head);
    await compare(latest.reviewed_head, ref);
    for (const entry of entries.filter(e => RUN.test(e.path))) {
      const run = validateRun(JSON.parse(await read(entry.path, ref)), entry.path);
      if (run.packet === file && run.source_commit === latest.source_commit) dependencyRuns.push(entry.path);
    }
    const digest = reviewDigest(entries, packet, dependencyRuns);
    if (!dependencyRuns.length || latest.tree_sha256 !== digest || reviewDigest(await tree(latest.reviewed_head), packet, dependencyRuns) !== digest) {
      throw new Error(`Dependency ${id} primary review is stale.`);
    }
    dependencyCache.set(cacheKey, true);
  };
  const relevant = files.filter(f => f.filename.startsWith('.context/collaboration/') || f.filename.startsWith('.context/fingerprints/') ||
    f.previous_filename?.startsWith('.context/collaboration/') || f.previous_filename?.startsWith('.context/fingerprints/'));
  for (const f of relevant) {
    if (f.status !== 'added' || f.previous_filename) errors.push(`Fingerprint and collaboration records are append-only: ${f.filename}`);
    if (!PACKET.test(f.filename) && !evidencePath(f.filename)) errors.push(`Unknown collaboration evidence path: ${f.filename}`);
  }
  const runFiles = relevant.filter(f => RUN.test(f.filename)).map(f => f.filename);
  const reviews = relevant.filter(f => REVIEW.test(f.filename)).map(f => f.filename);
  const runs = new Map(), packets = new Map();
  try {
    // Also inspect earlier turns in this PR. A primary final STATE cannot hide
    // secondary contributions or overwrite their immutable assignment.
    const reportPaths = new Set([fingerprint, ...relevant.filter(f => FINGERPRINT.test(f.filename)).map(f => f.filename)]);
    for (const file of runFiles) {
      const run = validateRun(JSON.parse(await read(file, head)), file);
      const proof = await verify(run.fingerprint, head);
      if (proof.role !== 'secondary' || proof.originalRole !== 'secondary' || run.branch !== proof.report.branch || !proof.manifest) throw new Error('Secondary run role or branch mismatch.');
      reportPaths.add(run.fingerprint);
      runs.set(file, run);
      const key = `${run.source_commit}:${run.start_head}:${run.packet}`;
      if (!packets.has(key)) {
        const sourceText = await read(run.packet, run.source_commit);
        if (sourceText !== await read(run.packet, head)) throw new Error('A secondary packet cannot change after it is issued; create a new primary packet.');
        const packet = validatePacket(JSON.parse(sourceText), run.packet); packetIdentity(packet);
        const issuer = await primary(packet.issued_by, run.source_commit);
        const { data: source } = await github.rest.git.getCommit({ ...repo, commit_sha: run.source_commit });
        if (source.parents?.length !== 1) throw new Error('Issue each packet in a normal primary checkpoint commit.');
        const introduced = await compare(source.parents[0].sha, run.source_commit);
        if (!introduced.some(f => f.filename === run.packet && f.status === 'added')) throw new Error('Packet source must be its original introduction commit.');
        await compare(issuer.manifest.work_head_before_probe, run.source_commit);
        const sourceTask = await read('.context/TASK.md', run.source_commit);
        if (metadata(sourceTask, 'Task Issue') !== metadata(trustedTask, 'Task Issue') || metadata(sourceTask, 'Accepted branch') !== pr.base.ref) throw new Error('Packet source task mismatch.');
        await compare(run.source_commit, run.start_head);
        for (const dependency of packet.depends_on) await checkDependency(dependency, run.start_head, [packet.id]);
        // An accepted task checkpoint or a primary checkpoint can supply the
        // starting workspace. Later packets may build on already merged work.
        const { data: acceptedStart } = await github.rest.repos.compareCommitsWithBasehead({ ...repo, basehead: `${run.start_head}...${pr.base.sha}` });
        if (!['ahead', 'identical'].includes(acceptedStart.status)) {
          const startFingerprint = metadata(await read('.context/STATE.md', run.start_head), 'Fingerprint');
          const starter = await primary(startFingerprint, run.start_head);
          await compare(starter.manifest.work_head_before_probe, run.start_head);
        }
        // Ignore upstream changes already identical to the current accepted
        // base; the remaining candidate delta must fit the assigned packet.
        const candidatePaths = new Set(files.flatMap(f => [f.filename, f.previous_filename].filter(Boolean)));
        errors.push(...scopeErrors((await compare(run.start_head)).filter(f => candidatePaths.has(f.filename) || candidatePaths.has(f.previous_filename)), packet));
        packets.set(key, { packet, source_commit: run.source_commit, file: run.packet, start_head: run.start_head });
      }
      await compare(run.start_head, proof.manifest.work_head_before_probe);
    }
    if (packets.size > 1) errors.push('Use one work packet per secondary PR; keep separate units on separate work branches.');
    const turns = [];
    for (const file of reportPaths) turns.push({ file, proof: file === fingerprint ? evidence : await verify(file, head) });
    for (const { file, proof } of turns) {
      if (proof.role !== 'secondary') continue;
      if (![...runs.values()].some(run => run.fingerprint === file)) {
        if (!proof.manifest) throw new Error('Secondary work requires a new role-aware turn.');
        // Bound a waiting turn by the next probe's starting checkpoint, so a
        // subsequent primary session can issue work without making the earlier
        // legitimate wait appear to contain that later task work.
        let end = head;
        for (const next of turns.filter(t => t.file !== file && t.proof.manifest)) {
          const ref = next.proof.manifest.work_head_before_probe;
          if (await read(file, ref) !== undefined) {
            const { data } = await github.rest.repos.compareCommitsWithBasehead({ ...repo, basehead: `${ref}...${end}` });
            if (['ahead', 'identical'].includes(data.status)) end = ref;
            else if (data.status !== 'behind') throw new Error('Turn checkpoints have diverged; preserve a single writer per branch.');
          }
        }
        errors.push(...noWorkErrors(await compare(proof.manifest.work_head_before_probe, end), file));
        warnings.push('Secondary turn has no assigned packet; only its fingerprint and blocked handoff may be saved.');
      }
    }
    // New definitions and reviews require primary evidence even before a
    // secondary has claimed them. A self-written role field grants nothing.
    for (const f of relevant.filter(f => PACKET.test(f.filename))) {
      const packet = validatePacket(JSON.parse(await read(f.filename, head)), f.filename); packetIdentity(packet);
      await primary(packet.issued_by, head);
    }
    const verifiedReviews = [];
    for (const file of reviews) {
      const review = validateReview(JSON.parse(await read(file, head)), file);
      await primary(review.fingerprint, head);
      await compare(review.source_commit, review.reviewed_head);
      await compare(review.reviewed_head);
      verifiedReviews.push({ file, review });
    }
    for (const { packet, source_commit, file } of packets.values()) {
      const packetRuns = [...runs].filter(([, r]) => r.packet === file && r.source_commit === source_commit).map(([f]) => f);
      for (const runFile of packetRuns) {
        if (!(await read(runFile.replace('run.json', 'result.md'), head))?.trim()) errors.push(`Missing secondary result: ${runFile}`);
      }
      const matching = verifiedReviews.filter(({ review }) => review.packet === file && review.source_commit === source_commit);
      const latest = await newestReview(matching, read, head);
      if (!latest || latest.review.verdict !== 'approved') { errors.push(`Packet ${packet.id} is awaiting primary review; keep this checkpoint as Draft.`); continue; }
      const digest = reviewDigest(await tree(head), packet, packetRuns);
      if (latest.review.tree_sha256 !== digest || reviewDigest(await tree(latest.review.reviewed_head), packet, packetRuns) !== digest) {
        errors.push(`Primary review for ${packet.id} is stale; review the current outputs and run evidence again.`);
      }
    }
  } catch (error) { errors.push(error.message); }
  return { errors, warnings };
}
