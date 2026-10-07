import { createHash } from 'node:crypto';

export const POLICY_URL = 'https://raw.githubusercontent.com/SUSTechHSAS/arena-context/main/.github/fingerprint-policy.json';
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

export async function loadLivePolicy(fetcher = fetch) {
  const response = await fetcher(POLICY_URL, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`model_policy_http_${response.status}`);
  if (response.url && new URL(response.url).origin !== 'https://raw.githubusercontent.com') throw new Error('unexpected_policy_redirect');
  const text = await response.text();
  if (Buffer.byteLength(text) > 65536) throw new Error('model_policy_too_large');
  const policy = validatePolicy(JSON.parse(text));
  return { ...policy, source: POLICY_URL, sha256: policyHash(policy), fetched_at: new Date().toISOString() };
}

export function decideWork(result, policy) {
  let verified;
  try { verified = validatePolicy(policy); } catch (error) {
    return { allowed: false, action: 'END_TURN', reason: 'model_policy_unavailable', detail: error.message };
  }
  const common = { policy_sha256: policyHash(verified), accepted_model_count: verified.accepted_models.length };
  if (result.status !== 'match' || typeof result.identified_candidate !== 'string' || result.identified_candidate !== result.nearest_model) {
    return { ...common, allowed: false, action: 'END_TURN', reason: 'clear_match_required' };
  }
  if (!verified.accepted_models.includes(result.identified_candidate)) {
    return { ...common, allowed: false, action: 'END_TURN', reason: 'model_not_accepted', model: result.identified_candidate };
  }
  return { ...common, allowed: true, action: 'CONTINUE', reason: 'accepted_clear_match', model: result.identified_candidate };
}

export function exitCode(result) {
  return result.action === 'END_TURN' || result.gate?.action === 'END_TURN' ? STOP_EXIT_CODE : 0;
}
