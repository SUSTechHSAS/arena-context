import { createHash } from 'node:crypto';
import { httpFetch, errorDetail } from './http-client.mjs';

// Arena permits api.github.com; raw.githubusercontent.com is not an allowed
// egress host in the reported sandbox. Never request or follow a raw download URL.
export const POLICY_URL = 'https://api.github.com/repos/SUSTechHSAS/arena-context/contents/.github/fingerprint-policy.json?ref=main';
export const STOP_EXIT_CODE = 20;
// Local work policy, NOT an upstream acceptance threshold or identity accuracy.
// Include the smallest complete set carrying at least 95% of the calibrated
// reference-bank mass, then require every concrete member to be accepted.
export const REFERENCE_MASS_MIN = 0.95;
// Reviewed aliases only. A merged fingerprint class requires ALL of its
// concrete members; do not turn a class label into a single-model identity.
const MEMBERS = {
  'claude-opus-5.5': ['claude-opus-5-5'],
  'claude-sonnet-5.5': ['claude-sonnet-5-5'],
  'claude-fable-5.1': ['claude-fable-5-1'],
  'claude-haiku-5.5': ['claude-haiku-5-5'],
  'gpt-6-astra': ['gpt-6-astra', 'gpt-6.1-sol'],
};
export const modelMembers = id => [...(Object.hasOwn(MEMBERS, id) ? MEMBERS[id] : [id])];

export function validatePolicy(value) {
  const keys = value?.schema === 1 ? ['accepted_models'] : value?.schema === 2 ? ['primary_models', 'secondary_models'] : [];
  if (!keys.length || keys.some(key => !Array.isArray(value[key]))) throw new Error('invalid_model_policy');
  const ids = keys.flatMap(key => value[key]);
  if (ids.some(id => typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error('policy_models_must_be_unique_disjoint_exact_model_ids');
  }
  return Object.fromEntries([['schema', value.schema], ...keys.map(key => [key, [...value[key]]])]);
}

export function policyTiers(value) {
  const policy = validatePolicy(value);
  return { primary: policy.primary_models || policy.accepted_models, secondary: policy.secondary_models || [] };
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
  const tiers = policyTiers(verified), accepted = [...tiers.primary, ...tiers.secondary];
  const common = { policy_sha256: policyHash(verified), accepted_model_count: accepted.length };
  // A mixed reference set receives only the intersection of its capabilities.
  // An unknown member is always denied before this helper can grant a role.
  const permit = (models, reason, evidence) => {
    const role = models.every(id => tiers.primary.includes(id)) ? 'primary' : 'secondary';
    return { ...common, allowed: true, action: role === 'primary' ? 'CONTINUE' : 'CONTINUE_SUBTASK',
      role, scope: role === 'primary' ? 'task' : 'assigned_subtask', reason, ...evidence };
  };
  if (['reference_match', 'reference_ambiguity'].includes(result?.status)) {
    const models = result.reference_models, classes = result.reference_classes;
    if (result.provider !== 'fingerpoint' || result.identified_candidate !== null ||
        result.identity_verified !== false || result.arena_protocol_calibrated !== false ||
        result.probability_scope !== 'reference-closed-set' || result.upstream_decision !== 'not_confirmed' ||
        result.reference_mass_min !== REFERENCE_MASS_MIN || !Number.isFinite(result.reference_mass) ||
        result.reference_mass < REFERENCE_MASS_MIN || result.reference_mass > 1 || result.sample_count !== 3 ||
        !Array.isArray(models) || !models.length || models.some(id => typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(id)) ||
        new Set(models).size !== models.length || !models.includes(result.nearest_model) ||
        !Array.isArray(classes) || !classes.length || new Set(classes).size !== classes.length ||
        classes.some(id => typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(id)) ||
        !classes.includes(result.nearest_class) || modelMembers(result.nearest_class)[0] !== result.nearest_model ||
        JSON.stringify(models) !== JSON.stringify([...new Set(classes.flatMap(modelMembers))]) ||
        (result.status === 'reference_match') !== (models.length === 1)) {
      return { ...common, allowed: false, action: 'END_TURN', reason: 'complete_reference_set_required' };
    }
    const rejected = models.filter(id => !accepted.includes(id));
    if (rejected.length) return { ...common, allowed: false, action: 'END_TURN', reason: 'reference_model_not_accepted', models, rejected_models: rejected };
    return permit(models, 'accepted_reference_set', { models });
  }
  if (result?.provider === 'fingerpoint') return { ...common, allowed: false, action: 'END_TURN', reason: 'calibrated_reference_set_required' };
  if (result?.status === 'family_only') {
    const models = result.ambiguous_models;
    if (result.identified_candidate !== null || !Array.isArray(models) || models.length < 2 ||
        models.some(id => typeof id !== 'string' || !id) || new Set(models).size !== models.length ||
        !models.includes(result.nearest_model)) {
      return { ...common, allowed: false, action: 'END_TURN', reason: 'complete_ambiguity_required' };
    }
    const rejected = models.filter(id => !accepted.includes(id));
    if (rejected.length) {
      return { ...common, allowed: false, action: 'END_TURN', reason: 'ambiguous_model_not_accepted', models, rejected_models: rejected };
    }
    return permit(models, 'accepted_ambiguity', { models });
  }
  if (result?.status !== 'match' || typeof result.identified_candidate !== 'string' || result.identified_candidate !== result.nearest_model) {
    return { ...common, allowed: false, action: 'END_TURN', reason: 'clear_match_or_accepted_ambiguity_required' };
  }
  if (!accepted.includes(result.identified_candidate)) {
    return { ...common, allowed: false, action: 'END_TURN', reason: 'model_not_accepted', model: result.identified_candidate };
  }
  return permit([result.identified_candidate], 'accepted_clear_match', { model: result.identified_candidate });
}

export function exitCode(result) {
  return result.action === 'END_TURN' || result.gate?.action === 'END_TURN' ? STOP_EXIT_CODE : 0;
}
