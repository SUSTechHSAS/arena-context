import { createHash } from 'node:crypto';
import { httpFetch, errorDetail } from './http-client.mjs';

// Arena permits api.github.com; raw.githubusercontent.com is not an allowed
// egress host in the reported sandbox. Never request or follow a raw download URL.
export const POLICY_URL = 'https://api.github.com/repos/SUSTechHSAS/arena-context/contents/.github/fingerprint-policy.json?ref=main';
export const STOP_EXIT_CODE = 20;

export function validatePolicy(value) {
  if (value?.schema !== 1 || !Array.isArray(value.accepted_models)) throw new Error('invalid_model_policy');
  const ids = value.accepted_models;
  if (ids.some(id => typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error('accepted_models_must_be_unique_exact_model_ids');
  }
  return { schema: 1, accepted_models: [...ids] };
}

export const policyHash = policy => createHash('sha256').update(JSON.stringify(validatePolicy(policy))).digest('hex');

export async function loadLivePolicy(fetcher = httpFetch) {
  try {
    const response = await fetcher(POLICY_URL, { cache: 'no-store', maxBytes: 65536, redirect: 'error',
      headers: { 'Cache-Control': 'no-cache', Accept: 'application/vnd.github.raw+json',
        'User-Agent': 'arena-context-fingerprint', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`model_policy_http_${response.status}`);
    if (response.url && new URL(response.url).origin !== 'https://api.github.com') throw new Error('unexpected_policy_redirect');
    const text = await response.text();
    if (Buffer.byteLength(text) > 65536) throw new Error('model_policy_too_large');
    let document = JSON.parse(text);
    // Some API gateways return the Contents envelope despite the raw media type.
    // Decode the inline bytes only; do not follow its forbidden download_url.
    if (document.type === 'file' && document.path === '.github/fingerprint-policy.json' && document.encoding === 'base64' && typeof document.content === 'string') {
      document = JSON.parse(Buffer.from(document.content, 'base64').toString('utf8'));
    }
    const policy = validatePolicy(document);
    return { ...policy, source: POLICY_URL, transport: response.transport || 'fetch',
      sha256: policyHash(policy), fetched_at: new Date().toISOString() };
  } catch (cause) {
    const detail = errorDetail(cause);
    const error = new Error(`github_api: ${detail}`);
    error.diagnostics = [{ endpoint: 'github_api', detail }];
    throw error;
  }
}

export function decideWork(result, policy) {
  let verified;
  try { verified = validatePolicy(policy); } catch (error) {
    return { allowed: false, action: 'END_TURN', reason: 'model_policy_unavailable', detail: error.message };
  }
  const common = { policy_sha256: policyHash(verified), accepted_model_count: verified.accepted_models.length };
  if (result?.status === 'family_only') {
    const models = result.ambiguous_models;
    if (result.identified_candidate !== null || !Array.isArray(models) || models.length < 2 ||
        models.some(id => typeof id !== 'string' || !id) || new Set(models).size !== models.length ||
        !models.includes(result.nearest_model)) {
      return { ...common, allowed: false, action: 'END_TURN', reason: 'complete_ambiguity_required' };
    }
    const rejected = models.filter(id => !verified.accepted_models.includes(id));
    if (rejected.length) {
      return { ...common, allowed: false, action: 'END_TURN', reason: 'ambiguous_model_not_accepted', models, rejected_models: rejected };
    }
    return { ...common, allowed: true, action: 'CONTINUE', reason: 'accepted_ambiguity', models };
  }
  if (result?.status !== 'match' || typeof result.identified_candidate !== 'string' || result.identified_candidate !== result.nearest_model) {
    return { ...common, allowed: false, action: 'END_TURN', reason: 'clear_match_or_accepted_ambiguity_required' };
  }
  if (!verified.accepted_models.includes(result.identified_candidate)) {
    return { ...common, allowed: false, action: 'END_TURN', reason: 'model_not_accepted', model: result.identified_candidate };
  }
  return { ...common, allowed: true, action: 'CONTINUE', reason: 'accepted_clear_match', model: result.identified_candidate };
}

export function exitCode(result) {
  return result.action === 'END_TURN' || result.gate?.action === 'END_TURN' ? STOP_EXIT_CODE : 0;
}
