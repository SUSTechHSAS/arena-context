import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { analyzeSharedOutputs, supportsSharedDetector, calibrateRanking } from '../vendor/fingerpoint/shared-detector.mjs';
import { hash, scoreSample as scoreLegacySample } from './fingerprint-lib.mjs';
import { httpFetch } from './http-client.mjs';
import { REFERENCE_MASS_MIN, modelMembers } from './model-gate.mjs';
export { modelMembers } from './model-gate.mjs';

export const SITE = 'https://lm.ikale.io';
export const REPOSITORY = 'https://github.com/Ikaleio/lm-detector';
const API = 'https://api.github.com/repos/Ikaleio/lm-detector';
const vendor = new URL('../vendor/fingerpoint/', import.meta.url);
const readJSON = name => JSON.parse(fs.readFileSync(new URL(name, vendor), 'utf8'));
const provenance = () => readJSON('provenance.json');
const probes = () => readJSON('probes.json');
const shaPattern = /^[a-f0-9]{64}$/;
export const MAX_PACKAGE_BYTES = 20_000_000;
const MAX_ARTIFACT_BYTES = 40_000_000;
export const gitBlobId = value => {
  const bytes = Buffer.from(value);
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
};

function unpack(encoded, expectedHash, label, expectedBlob) {
  if (typeof encoded !== 'string' || encoded.length > MAX_PACKAGE_BYTES || !shaPattern.test(expectedHash || '')) throw new Error(`invalid_${label}_artifact`);
  const bytes = gunzipSync(Buffer.from(encoded, 'base64'), { maxOutputLength: MAX_ARTIFACT_BYTES });
  if (hash(bytes) !== expectedHash) throw new Error(`${label}_hash_mismatch`);
  if (gitBlobId(bytes) !== expectedBlob) throw new Error(`${label}_git_blob_mismatch`);
  return JSON.parse(bytes.toString('utf8'));
}

export function validateFingerpointBundle(bundle, trusted = provenance().upstream_code_sha256) {
  if (bundle?.schema !== 2 || bundle.provider !== 'fingerpoint' || bundle.source !== SITE ||
      bundle.source_repository !== REPOSITORY || !/^[a-f0-9]{40}$/.test(bundle.source_commit || '')) throw new Error('fingerpoint_bundle_schema_changed');
  for (const [name, sha] of Object.entries(trusted)) {
    if (bundle.code_sha256?.[name] !== sha) throw new Error('engine_update_required');
  }
  if (JSON.stringify(bundle.challenges) !== JSON.stringify(probes())) throw new Error('fingerpoint_probe_changed');
  const bank = unpack(bundle.bank_gzip_base64, bundle.bank_sha256, 'bank', bundle.bank_git_blob_sha1);
  const detector = unpack(bundle.detector_gzip_base64, bundle.detector_sha256, 'detector', bundle.detector_git_blob_sha1);
  if (!Array.isArray(bank.models) || bank.models.length < 2 || bank.models.length > 1000 ||
      bank.models.some(m => typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(m.id) ||
        !Number.isInteger(m.response_count) || m.response_count < 1) ||
      new Set(bank.models.map(m => m.id)).size !== bank.models.length ||
      !supportsSharedDetector(bank, detector) || bank.built_at !== bundle.bank_version ||
      !shaPattern.test(bank.reference_sha256 || '') || bank.reference_sha256 !== detector.source_reference_sha256) throw new Error('fingerpoint_bank_detector_mismatch');
  const count = bank.models.length;
  const vector = (v, length, positive = false) => Array.isArray(v) && v.length === length && v.every(x => Number.isFinite(x) && (!positive || x > 0));
  const matrix = (m, rows, cols) => Array.isArray(m) && m.length === rows && m.every(row => vector(row, cols));
  const params = (p, dimensions) => Array.isArray(p) && p.length === dimensions.length && p.every((block, i) =>
    vector(block.mean, dimensions[i]) && vector(block.scale, dimensions[i], true));
  const featureBank = (b, dimension) => b && vector(b.feature_mean, dimension) && vector(b.feature_scale, dimension, true) &&
    Array.isArray(b.nuisance_basis) && b.nuisance_basis.every(row => vector(row, dimension)) && matrix(b.centroids, count, dimension);
  const a = detector.ranker;
  if (!a || !params(a.head_params, [355, 74]) || !params(a.full_params, [355, 74]) ||
      !matrix(a.lda_weights, count, 429) || !vector(a.lda_bias, count) ||
      !Array.isArray(a.references) || a.references.length !== count ||
      a.references.some((rows, i) => !matrix(rows, detector.response_counts[i], 429)) ||
      !featureBank(a.bank?.hellinger, 355) || !featureBank(a.bank?.ordered_blocks, 74) ||
      JSON.stringify(a.bank.model_order) !== JSON.stringify(detector.model_ids) ||
      !Array.isArray(a.bank.ordered_blocks.environment_centroids) || !a.bank.ordered_blocks.environment_centroids.length ||
      a.bank.ordered_blocks.environment_centroids.some(rows => !matrix(rows, count, 74)) ||
      a.blend?.frequency !== 0.5 || a.blend?.positional !== 0.5 ||
      !params(a.positional?.params, [355, 74, 102, 220]) || !matrix(a.positional.weights, count, 751) || !vector(a.positional.bias, count)) {
    throw new Error('fingerpoint_ranker_schema_changed');
  }
  if (!calibrateRanking(Array(count).fill(0), detector)) throw new Error('fingerpoint_calibration_unavailable');
  return { bank, detector };
}

export function createFingerpointBundle({ source_commit, bank_text, detector_text, code_sha256 }) {
  const bundle = { schema: 2, provider: 'fingerpoint', source: SITE, source_repository: REPOSITORY, source_commit,
    bank_version: JSON.parse(bank_text).built_at, bank_sha256: hash(bank_text), detector_sha256: hash(detector_text),
    bank_git_blob_sha1: gitBlobId(bank_text), detector_git_blob_sha1: gitBlobId(detector_text),
    code_sha256, challenges: probes(),
    bank_gzip_base64: gzipSync(bank_text, { level: 9 }).toString('base64'),
    detector_gzip_base64: gzipSync(detector_text, { level: 9 }).toString('base64') };
  validateFingerpointBundle(bundle);
  if (Buffer.byteLength(JSON.stringify(bundle)) > MAX_PACKAGE_BYTES) throw new Error('fingerpoint_package_too_large');
  return bundle;
}

export function readFingerpointSeed() {
  const bytes = fs.readFileSync(new URL('seed.json.gz', vendor));
  if (hash(bytes) !== provenance().seed_sha256) throw new Error('fingerpoint_seed_hash_mismatch');
  const bundle = JSON.parse(gunzipSync(bytes, { maxOutputLength: MAX_PACKAGE_BYTES }).toString('utf8'));
  validateFingerpointBundle(bundle); return bundle;
}

export async function downloadFingerpointBundle(fetcher = httpFetch, cached = readFingerpointSeed()) {
  async function get(url, limit = 250_000) {
    const timeoutMs = limit > 1_000_000 ? 60_000 : 9_000;
    const response = await fetcher(url, { cache: 'no-store', redirect: 'error', maxBytes: limit, timeoutMs,
      headers: { Accept: 'application/vnd.github.raw+json', 'User-Agent': 'arena-context-fingerprint',
        'X-GitHub-Api-Version': '2022-11-28', 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(timeoutMs + 1000) });
    if (!response.ok) throw new Error(`fingerpoint_http_${response.status}`);
    if (response.url && new URL(response.url).origin !== 'https://api.github.com') throw new Error('unexpected_fingerpoint_redirect');
    const text = await response.text();
    if (Buffer.byteLength(text) > limit) throw new Error('fingerpoint_response_too_large');
    // Contents gateways may ignore the raw media type. Never follow download_url.
    let document; try { document = JSON.parse(text); } catch {}
    if (document?.type === 'file') {
      if (document.encoding !== 'base64' || typeof document.content !== 'string') throw new Error('fingerpoint_contents_encoding');
      return Buffer.from(document.content, 'base64').toString('utf8');
    }
    return text;
  }
  const commit = JSON.parse(await get(API + '/git/ref/heads/main')).object?.sha;
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('fingerpoint_commit_missing');
  const trusted = provenance();
  const directories = await Promise.all(['shared', 'data'].map(name => get(`${API}/contents/${name}?ref=${commit}`)));
  const files = new Map();
  for (const text of directories) {
    const entries = JSON.parse(text);
    if (!Array.isArray(entries)) throw new Error('fingerpoint_directory_schema_changed');
    for (const entry of entries) if (entry.type === 'file') files.set(entry.path, entry);
  }
  for (const [name, sha] of Object.entries(trusted.upstream_git_blob_sha1)) {
    if (files.get(name)?.sha !== sha) throw new Error('engine_update_required');
  }
  const bankFile = files.get('data/unified_bank.json'), detectorFile = files.get('data/shared_detector.json');
  if ([bankFile, detectorFile].some(file => !file || !/^[a-f0-9]{40}$/.test(file.sha) || !Number.isInteger(file.size) || file.size < 1 || file.size > MAX_ARTIFACT_BYTES)) throw new Error('fingerpoint_artifact_metadata_invalid');
  // Content-addressed API metadata proves that unchanged data needs no large
  // download. Keep the original artifact commit and package ID for deduplication.
  if (cached) {
    validateFingerpointBundle(cached);
    if (cached.bank_git_blob_sha1 === bankFile.sha && cached.detector_git_blob_sha1 === detectorFile.sha) return cached;
  }
  const [bank_text, detector_text] = await Promise.all([
    get(`${API}/contents/data/unified_bank.json?ref=${commit}`, MAX_ARTIFACT_BYTES),
    get(`${API}/contents/data/shared_detector.json?ref=${commit}`, MAX_ARTIFACT_BYTES),
  ]);
  if (gitBlobId(bank_text) !== bankFile.sha || gitBlobId(detector_text) !== detectorFile.sha) throw new Error('fingerpoint_download_blob_mismatch');
  return createFingerpointBundle({ source_commit: commit, bank_text, detector_text, code_sha256: trusted.upstream_code_sha256 });
}

// Retain the existing arithmetic/monotonic input checks as local anti-pattern
// checks, separately from the new detector's three-answer calibration.
function checkSample(numbers, expected) {
  const minimum = Math.max(80, Math.ceil(expected * 0.55));
  const unique = new Set(numbers).size, steps = numbers.slice(1).map((n, i) => n - numbers[i]);
  const frequencies = new Map(); for (const n of steps) frequencies.set(Math.abs(n), (frequencies.get(Math.abs(n)) || 0) + 1);
  const monotone = steps.length ? Math.max(steps.filter(n => n >= 0).length, steps.filter(n => n <= 0).length) / steps.length : 0;
  const arithmetic = steps.length ? Math.max(...frequencies.values()) / steps.length : 0;
  const reason = numbers.length === 0 ? 'empty' : numbers.length >= 2 && unique <= 1 ? 'constant' :
    numbers.length >= 3 && monotone >= 0.9 ? 'monotonic' : numbers.length >= 3 && arithmetic >= 0.5 ? 'arithmetic' :
    unique / Math.min(numbers.length, 355) < 0.05 ? 'low_unique' : numbers.length < minimum ? 'too_short' : null;
  return { parsed_numbers: numbers.length, expected_count: expected, minimum_numbers: minimum,
    exact_count: numbers.length === expected, level: !reason ? 'ok' : reason === 'too_short' ? 'insufficient' : 'invalid', reason };
}

export function referenceSet(results) {
  if (!Array.isArray(results) || results.length < 2 || results.some(r => !Number.isFinite(r.probability) || r.probability < 0 || r.probability > 1) ||
      Math.abs(results.reduce((sum, r) => sum + r.probability, 0) - 1) > 1e-9) throw new Error('fingerpoint_probabilities_invalid');
  const ranked = [...results].sort((a, b) => b.probability - a.probability);
  const classes = []; let mass = 0, boundary;
  for (const candidate of ranked) {
    // Include every class tied at the boundary, never just a top-three display.
    if (mass >= REFERENCE_MASS_MIN && candidate.probability !== boundary) break;
    classes.push(candidate.model); mass += candidate.probability; boundary = candidate.probability;
  }
  return { reference_classes: classes, reference_models: [...new Set(classes.flatMap(modelMembers))], reference_mass: Math.min(1, mass) };
}

export function scoreFingerpointSample(raw, bundle) {
  const { bank, detector } = validateFingerpointBundle(bundle);
  const common = { provider: 'fingerpoint', detector_sha256: bundle.detector_sha256, source_commit: bundle.source_commit,
    identified_candidate: null, probability_scope: 'reference-closed-set', reference_mass_min: REFERENCE_MASS_MIN,
    upstream_decision: 'not_confirmed', identity_verified: false, arena_protocol_calibrated: false };
  let arrays;
  try { arrays = JSON.parse(raw.trim()); } catch { return { ...common, status: 'invalid', reason: 'raw_must_be_three_json_arrays', candidates: [] }; }
  if (!Array.isArray(arrays) || arrays.length !== 3 || arrays.some(a => !Array.isArray(a) || a.length > 2000 ||
      a.some(n => !Number.isInteger(n) || n < 1 || n > 355))) return { ...common, status: 'invalid', reason: 'three_arrays_of_integers_1_to_355_required', candidates: [] };
  const input_checks = arrays.map((a, i) => checkSample(a, bundle.challenges[i].expected_count));
  const checked = { ...common, sample_count: 3, parsed_numbers: arrays.map(a => a.length), input_checks };
  const bad = input_checks.find(c => c.level !== 'ok');
  if (bad) return { ...checked, status: bad.level, reason: bad.reason, candidates: [] };
  if (new Set(arrays.map(a => JSON.stringify(a))).size !== 3) return { ...checked, status: 'invalid', reason: 'duplicate_samples', candidates: [] };
  const analysis = analyzeSharedOutputs(arrays.map((a, i) => ({ text: JSON.stringify(a), expected_count: bundle.challenges[i].expected_count })), bank, detector);
  if (analysis.probability_status !== 'reference_calibrated' || analysis.used_outputs !== 3) return { ...checked, status: 'insufficient', reason: 'fingerpoint_calibration_unavailable', candidates: [] };
  const selection = referenceSet(analysis.results);
  return { ...checked, ...selection, status: selection.reference_models.length === 1 ? 'reference_match' : 'reference_ambiguity',
    nearest_model: modelMembers(analysis.prediction)[0], nearest_class: analysis.prediction,
    family: analysis.family_prediction, calibration: analysis.calibration,
    candidates: analysis.results.slice(0, 3).map(r => ({ model: r.model, models: modelMembers(r.model), display_name: r.display_name,
      family: r.family, score: r.score, reference_probability: r.probability })) };
}

// Historical packages keep their original scorer and one-array format. New
// prepare calls only produce Fingerpoint packages; a refresh never downgrades.
export function scoreBundle(raw, bundle) {
  if (bundle?.schema === 2) return scoreFingerpointSample(raw, bundle);
  const legacy = JSON.parse(fs.readFileSync(new URL('../vendor/modeltrace/provenance.json', import.meta.url), 'utf8'));
  return scoreLegacySample(raw, bundle, legacy.website_code_sha256);
}
