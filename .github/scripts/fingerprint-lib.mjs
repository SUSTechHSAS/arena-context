// Local orchestration and independent implementation of the published numeric
// gates/verdict. Only the MIT ModelTrace scoring core is vendored unchanged.
import { createHash } from 'node:crypto';
import { analyzeGlobalOutputs, countNumbers } from '../vendor/modeltrace/fingerprint-core.mjs';

export const SITE = 'https://whatsmyllm.com';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const packageId = bundle => hash(JSON.stringify(bundle));
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
const unescapeHTML = text => text.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (_, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" })[k]);

export function websiteManifest(html) {
  const body = attrs(html.match(/<body\b[^>]*>/i)?.[0] || '');
  if (!/^\/data\/bank\/v[\w.-]+\.json$/.test(body['data-bank'] || '') || !/^[a-f0-9]{64}$/.test(body['data-bank-sha256'] || '')) {
    throw new Error('upstream_manifest_changed');
  }
  const section = [...html.matchAll(/<div\b[^>]*>/g)].find(m => {
    const a = attrs(m[0]); return a.class?.split(' ').includes('challenge-set') && a['data-language'] === 'en' && a['data-style'] === 'json';
  });
  const article = section && html.slice(section.index).match(/<article\b[^>]*>[\s\S]*?<\/article>/)?.[0];
  const prompt = unescapeHTML(article?.match(/<pre\b[^>]*class="[^"]*\bprompt\b[^"]*"[^>]*>([\s\S]*?)<\/pre>/)?.[1] || '');
  const expected = Number(attrs(article?.match(/<textarea\b[^>]*>/)?.[0] || '')['data-expected-count']);
  const id = attrs(article?.match(/<article\b[^>]*>/)?.[0] || '')['data-challenge-id'];
  if (!id || expected < 292 || expected > 333 || !prompt.includes('355') || !prompt.includes('without tools')) throw new Error('upstream_probe_changed');
  return { bank_url: SITE + body['data-bank'], bank_version: body['data-bank-version'], bank_sha256: body['data-bank-sha256'], challenge: { id, expected_count: expected, prompt } };
}

export function validateBundle(bundle, acceptedCode) {
  if (bundle.schema !== 1 || hash(bundle.bank_text) !== bundle.bank_sha256) throw new Error('bank_hash_mismatch');
  for (const [name, sha] of Object.entries(acceptedCode)) if (bundle.code_sha256[name] !== sha) throw new Error('engine_update_required');
  const bank = JSON.parse(bundle.bank_text);
  const order = bank.models.map(m => m.id);
  if (order.length < 2 || new Set(order).size !== order.length || JSON.stringify(order) !== JSON.stringify(bank.robust.model_order)) throw new Error('bank_schema_changed');
  if (bank.robust.hellinger.feature_mean.length !== 355 || bank.robust.hellinger.centroids.length !== order.length) throw new Error('bank_dimension_changed');
  if (bank.robust.hellinger.feature_scale.some(x => !Number.isFinite(x) || x <= 0) || bank.robust.hellinger.centroids.some(row => row.length !== 355 || row.some(x => !Number.isFinite(x)))) throw new Error('invalid_bank_numbers');
  if (bundle.gates.value_min !== 1 || bundle.gates.value_max !== 355 || !Array.isArray(bundle.gates.rules)) throw new Error('gate_schema_changed');
  const knownStats = new Set(['length', 'unique_count', 'unique_ratio', 'monotone_fraction', 'arithmetic_fraction', 'min_length']);
  for (const r of bundle.gates.rules) if (!knownStats.has(r.stat) || !['lt', 'lte', 'gt', 'gte'].includes(r.op)) throw new Error('gate_schema_changed');
  if (!bundle.gates.rules.some(r => r.id === 'too_short')) throw new Error('gate_schema_changed');
  for (const k of ['fit_min', 'margin_min', 'family_min']) if (!Number.isFinite(bundle.verdict.thresholds[k])) throw new Error('verdict_schema_changed');
  return bank;
}

export async function downloadBundle(acceptedCode, fetcher = fetch) {
  async function get(url, limit = 8_000_000) {
    const response = await fetcher(url, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!response.ok) throw new Error(`upstream_http_${response.status}`);
    if (response.url && new URL(response.url).origin !== SITE) throw new Error('unexpected_upstream_redirect');
    const text = await response.text(); if (Buffer.byteLength(text) > limit) throw new Error('upstream_response_too_large'); return text;
  }
  const manifest = websiteManifest(await get(SITE + '/', 1_000_000));
  const [bankText, gatesText, verdictText, ...code] = await Promise.all([
    get(manifest.bank_url), get(SITE + '/data/gates.json'), get(SITE + '/data/verdict.json'),
    ...Object.keys(acceptedCode).map(name => get(SITE + '/js/' + name, 100000)),
  ]);
  const codeHashes = Object.fromEntries(Object.keys(acceptedCode).map((name, i) => [name, hash(code[i])]));
  const gates = JSON.parse(gatesText), verdict = JSON.parse(verdictText);
  const bundle = { schema: 1, source: SITE, ...manifest, bank_text: bankText, code_sha256: codeHashes,
    gates: { version: gates.version, value_min: gates.value_min, value_max: gates.value_max,
      rules: gates.rules.map(r => Object.fromEntries(['id', 'level', 'stat', 'op', 'threshold', 'applies_from'].filter(k => k in r).map(k => [k, r[k]]))) },
    verdict: { version: verdict.version, thresholds: verdict.thresholds } };
  validateBundle(bundle, acceptedCode); return bundle;
}

function gate(numbers, expected, spec) {
  const steps = numbers.slice(1).map((v, i) => v - numbers[i]);
  const frequencies = new Map(); for (const step of steps) frequencies.set(Math.abs(step), (frequencies.get(Math.abs(step)) || 0) + 1);
  const threshold = t => typeof t === 'number' ? t : Math.max(t.absolute, Math.ceil(t.fraction_of_requested * expected));
  const stats = { length: numbers.length, unique_count: new Set(numbers).size,
    unique_ratio: numbers.length ? new Set(numbers).size / Math.min(numbers.length, 355) : 0,
    monotone_fraction: steps.length ? Math.max(steps.filter(x => x >= 0).length, steps.filter(x => x <= 0).length) / steps.length : 0,
    arithmetic_fraction: steps.length ? Math.max(...frequencies.values()) / steps.length : 0,
    min_length: threshold(spec.rules.find(r => r.id === 'too_short').threshold) };
  const compare = { lt: (a, b) => a < b, lte: (a, b) => a <= b, gt: (a, b) => a > b, gte: (a, b) => a >= b };
  const rule = spec.rules.find(r => stats.length >= (r.applies_from || 0) && compare[r.op](stats[r.stat], threshold(r.threshold)));
  return { level: rule?.level || 'ok', rule: rule?.id || null, stats };
}

function absoluteFits(numbers, bank) {
  const counts = countNumbers(numbers), a = bank.robust.hellinger;
  const denominator = numbers.length + 0.5 * 355;
  const v = counts.map((n, i) => (Math.sqrt((n + 0.5) / denominator) - a.feature_mean[i]) / a.feature_scale[i]);
  const dot = (x, y) => x.reduce((s, n, i) => s + n * y[i], 0);
  for (const direction of a.nuisance_basis) { const weight = dot(v, direction); for (let i = 0; i < v.length; i++) v[i] -= weight * direction[i]; }
  const size = Math.max(Math.sqrt(dot(v, v)), 1e-12);
  return a.centroids.map(c => dot(v.map(n => n / size), c));
}

export function scoreSample(raw, bundle, acceptedCode) {
  const bank = validateBundle(bundle, acceptedCode);
  let numbers;
  try { numbers = JSON.parse(raw.trim()); } catch { return { status: 'invalid', reason: 'raw_must_be_one_json_array', candidates: [] }; }
  if (!Array.isArray(numbers) || numbers.length > 2000 || numbers.some(n => !Number.isInteger(n) || n < 1 || n > 355)) {
    return { status: 'invalid', reason: 'integers_1_to_355_required', candidates: [] };
  }
  const checked = gate(numbers, bundle.challenge.expected_count, bundle.gates);
  const common = { parsed_numbers: numbers.length, exact_count: numbers.length === bundle.challenge.expected_count, input_gate: checked };
  if (checked.level !== 'ok') return { ...common, status: checked.level, reason: checked.rule, candidates: [] };
  const scored = analyzeGlobalOutputs([{ text: raw, expected_count: bundle.challenge.expected_count }], bank);
  const fits = absoluteFits(numbers, bank), grouped = new Map();
  for (const item of scored.results) {
    const model = item.model.split('@')[0], fit = fits[bank.robust.model_order.indexOf(item.model)];
    const group = grouped.get(model) || { model, display_name: item.display_name, family: item.family, fit: -Infinity, weight: 0 };
    group.fit = Math.max(group.fit, fit); group.weight += item.probability; grouped.set(model, group);
  }
  const ranking = [...grouped.values()].sort((a, b) => b.weight - a.weight), first = ranking[0];
  const margin = first.fit - Math.max(...ranking.slice(1).map(x => x.fit));
  const familyWeight = ranking.filter(x => x.family === first.family).reduce((s, x) => s + x.weight, 0);
  const t = bundle.verdict.thresholds;
  const status = first.fit < t.fit_min ? 'insufficient' : margin >= t.margin_min ? 'match' : familyWeight >= t.family_min ? 'family_only' : 'insufficient';
  return { ...common, status, nearest_model: first.model, identified_candidate: status === 'match' ? first.model : null,
    family: ['match', 'family_only'].includes(status) ? first.family : null, fit: first.fit, separation: margin,
    candidates: ranking.slice(0, 3).map(({ weight, ...rest }) => rest) };
}
