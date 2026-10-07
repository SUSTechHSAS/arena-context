#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { downloadBundle, hash, packageId, scoreSample, validateBundle } from './fingerprint-lib.mjs';
import { loadLivePolicy, decideWork, exitCode, STOP_EXIT_CODE } from './model-gate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const vendor = path.resolve(here, '../vendor/modeltrace');
const acceptedCode = JSON.parse(fs.readFileSync(path.join(vendor, 'provenance.json'), 'utf8')).website_code_sha256;
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeNew = (p, value) => fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const turnPattern = /^\d{8}T\d{6}Z-[a-f0-9]{8}$/;

export async function prepare(root, { offline = false, fetcher, policyFetcher } = {}) {
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
  if (!/^(work|arena)\/.+/.test(branch)) throw new Error('Select the real work/... or arena/... branch before preparing a probe.');
  if (!fs.existsSync(path.join(root, '.context/TASK.md'))) throw new Error('The selected branch has no task context.');
  const dir = path.join(root, '.context/fingerprints'); fs.mkdirSync(path.join(dir, 'banks'), { recursive: true });
  const turn = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z') + '-' + randomUUID().slice(0, 8);
  const turnDir = path.join(dir, turn); fs.mkdirSync(turnDir);
  let policy;
  try { policy = await loadLivePolicy(policyFetcher); }
  catch (e) {
    const gate = { allowed: false, action: 'END_TURN', reason: 'model_policy_unavailable', detail: e.message };
    const report = { schema: 1, turn_id: turn, branch, scope: 'user-turn', same_model_within_turn: 'assumed_by_user',
      identity_verified: false, arena_protocol_calibrated: false, sample_count: 0, raw_sha256: null,
      status: 'unscored', reason: 'model_policy_unavailable', detail: e.message, candidates: [],
      gate, diagnostics: e.diagnostics || [], scored_at: new Date().toISOString() };
    writeNew(path.join(turnDir, 'manifest.json'), { schema: 1, turn_id: turn, branch, policy_error: e.message, diagnostics: e.diagnostics || [] });
    writeNew(path.join(turnDir, 'report.json'), report);
    return { action: 'END_TURN', ...report, next: 'Report the policy error and end this user turn. Do not retry or perform task work.' };
  }
  let bundle, freshness = 'fresh', error = null;
  try { if (offline) throw new Error('offline_requested'); bundle = await downloadBundle(acceptedCode, fetcher); }
  catch (e) {
    freshness = 'cached-fallback'; error = e.message;
    for (const name of fs.readdirSync(dir).filter(x => turnPattern.test(x)).sort().reverse()) {
      try { const old = readJSON(path.join(dir, name, 'manifest.json')); if (!/^[a-f0-9]{64}$/.test(old.package_id)) continue; const candidate = readJSON(path.join(dir, 'banks', old.package_id + '.json')); if (packageId(candidate) !== old.package_id) continue; validateBundle(candidate, acceptedCode); bundle = candidate; break; } catch {}
    }
    bundle ||= readJSON(path.join(vendor, 'seed.json')); validateBundle(bundle, acceptedCode);
  }
  const id = packageId(bundle), bankPath = path.join(dir, 'banks', id + '.json');
  if (!fs.existsSync(bankPath)) writeNew(bankPath, bundle);
  const manifest = { schema: 1, turn_id: turn, branch, created_at: new Date().toISOString(),
    work_head_before_probe: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    scope: 'user-turn', same_model_within_turn: 'assumed_by_user', package_id: id,
    bank_version: bundle.bank_version, bank_sha256: bundle.bank_sha256, freshness, refresh_error: error,
    challenge: bundle.challenge, policy, identity_verified: false, arena_protocol_calibrated: false };
  writeNew(path.join(turnDir, 'manifest.json'), manifest);
  return { action: 'GENERATE_SAMPLE', turn_id: turn, bank_version: bundle.bank_version, freshness, refresh_error: error,
    prompt: bundle.challenge.prompt, raw_path: `.context/fingerprints/${turn}/raw.json`,
    next: `Generate the array yourself, save it unchanged, then run: node .github/scripts/fingerprint.mjs score ${turn}` };
}

export function score(root, turn) {
  if (!turnPattern.test(turn || '')) throw new Error('Invalid turn ID.');
  const dir = path.join(root, '.context/fingerprints', turn), manifest = readJSON(path.join(dir, 'manifest.json'));
  const rawPath = path.join(dir, 'raw.json');
  const raw = fs.existsSync(rawPath) ? fs.readFileSync(rawPath, 'utf8') : null;
  const reportPath = path.join(dir, 'report.json');
  if (fs.existsSync(reportPath)) {
    const old = readJSON(reportPath);
    if (old.raw_sha256 !== (raw === null ? null : hash(raw))) throw new Error('The frozen sample changed after scoring. Do not replace or repair it.');
    if (!old.gate) throw new Error('This old report predates the allowlist gate and cannot authorize a new turn.');
    return old;
  }
  let result;
  try {
    if (raw === null) throw new Error('raw_sample_missing');
    if (!/^[a-f0-9]{64}$/.test(manifest.package_id)) throw new Error('invalid_package_id');
    const bundle = readJSON(path.join(root, '.context/fingerprints/banks', manifest.package_id + '.json'));
    if (packageId(bundle) !== manifest.package_id) throw new Error('package_hash_mismatch');
    result = scoreSample(raw, bundle, acceptedCode);
  } catch (e) { result = { status: 'unscored', reason: e.message, candidates: [] }; }
  const report = { schema: 1, turn_id: turn, branch: manifest.branch, scope: 'user-turn', same_model_within_turn: 'assumed_by_user',
    identity_verified: false, arena_protocol_calibrated: false, sample_count: raw === null ? 0 : 1,
    raw_sha256: raw === null ? null : hash(raw), package_id: manifest.package_id,
    bank_version: manifest.bank_version, bank_sha256: manifest.bank_sha256, freshness: manifest.freshness,
    refresh_error: manifest.refresh_error, scored_at: new Date().toISOString(), ...result,
    policy_source: manifest.policy?.source, gate: decideWork(result, manifest.policy) };
  writeNew(reportPath, report); return report;
}

async function main() {
  const [command, argument] = process.argv.slice(2);
  if (command === 'refresh') {
    const bundle = await downloadBundle(acceptedCode);
    console.log(JSON.stringify({ bank_version: bundle.bank_version, bank_sha256: bundle.bank_sha256,
      model_count: JSON.parse(bundle.bank_text).models.length, package_id: packageId(bundle), engine: 'compatible', sample_generated: false })); return;
  }
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const result = command === 'prepare' ? await prepare(root, { offline: argument === '--offline' }) : command === 'score' ? score(root, argument) : null;
  if (!result) throw new Error('Usage: fingerprint.mjs prepare [--offline] | score <turn-id> | refresh');
  console.log(JSON.stringify({ action: result.gate?.action || result.action, ...result }, null, 2));
  process.exitCode = exitCode(result);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => {
  console.log(JSON.stringify({ action: 'END_TURN', gate: { allowed: false, action: 'END_TURN', reason: 'fingerprint_command_failed' }, detail: e.message }));
  process.exitCode = STOP_EXIT_CODE;
});
