import { hash, packageId } from './fingerprint-lib.mjs';
import { scoreBundle, MAX_PACKAGE_BYTES } from './fingerpoint-lib.mjs';
import { decideWork } from './model-gate.mjs';

export const TURN = '\\d{8}T\\d{6}Z-[a-f0-9]{8}';
export const FINGERPRINT = new RegExp(`^\\.context/fingerprints/(${TURN})/report\\.json$`);
export const SHA = /^[a-f0-9]{40}$/;

// Floating-point evidence can vary in its last bits between Node runtimes.
export function sameEvidence(actual, expected) {
  if (typeof expected === 'number') return Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-12;
  if (actual === expected) return true;
  if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object' || Array.isArray(actual) !== Array.isArray(expected)) return false;
  if (JSON.stringify(Object.keys(actual).sort()) !== JSON.stringify(Object.keys(expected).sort())) return false;
  return Object.keys(expected).every(key => sameEvidence(actual[key], expected[key]));
}

// Both CI and the local collaboration commands use this verifier. Candidate
// role labels never replace rescoring or the protected-main policy.
export function fingerprintVerifier({ read, policy, allowLegacy = false }) {
  const records = new Map(), bundles = new Map(), scores = new Map();
  return function verify(file, ref) {
    const key = `${ref}:${file}`;
    if (!records.has(key)) records.set(key, (async () => {
      const match = FINGERPRINT.exec(file || '');
      if (!match) throw new Error('Fingerprint must link to a per-turn report path.');
      const report = JSON.parse(await read(file, ref));
      const raw = await read(file.replace('report.json', 'raw.json'), ref);
      if (report.identity_verified !== false || report.same_model_within_turn !== 'assumed_by_user') throw new Error('Invalid fingerprint evidence labels.');
      if (report.raw_sha256 !== (raw === undefined ? null : hash(raw))) throw new Error('Fingerprint raw hash mismatch.');
      let verified = { status: 'unscored' };
      if (report.status !== 'unscored') {
        if (!/^[a-f0-9]{64}$/.test(report.package_id)) throw new Error('Invalid fingerprint package ID.');
        const bankKey = `${ref}:${report.package_id}`;
        if (!bundles.has(bankKey)) bundles.set(bankKey, (async () => {
          const bundle = JSON.parse(await read(`.context/fingerprints/banks/${report.package_id}.json`, ref, MAX_PACKAGE_BYTES));
          if (packageId(bundle) !== report.package_id) throw new Error('Fingerprint package changed.');
          return bundle;
        })());
        const bundle = await bundles.get(bankKey);
        const scoreKey = `${report.package_id}:${report.raw_sha256}`;
        if (!scores.has(scoreKey)) scores.set(scoreKey, scoreBundle(raw, bundle));
        verified = scores.get(scoreKey);
        if (report.bank_sha256 !== bundle.bank_sha256 || report.bank_version !== bundle.bank_version) throw new Error('Fingerprint bank metadata mismatch.');
        for (const key of ['status', 'nearest_model', 'identified_candidate', 'family']) {
          if (verified[key] !== report[key]) throw new Error(`Fingerprint score mismatch: ${key}`);
        }
        for (const key of ['fit', 'separation']) {
          if (verified[key] !== undefined && !sameEvidence(report[key], verified[key])) throw new Error(`Fingerprint numeric mismatch: ${key}`);
        }
        if (bundle.schema !== 2 && JSON.stringify(verified.candidates) !== JSON.stringify(report.candidates)) throw new Error('Fingerprint candidate list mismatch.');
        if (bundle.schema === 2) {
          for (const key of Object.keys(verified)) {
            if (!sameEvidence(report[key], verified[key])) throw new Error(`Fingerprint score mismatch: ${key}`);
          }
        }
        if (((verified.status === 'family_only' && report.gate) || report.ambiguous_models !== undefined) &&
            JSON.stringify(verified.ambiguous_models) !== JSON.stringify(report.ambiguous_models)) throw new Error('Fingerprint ambiguity set mismatch.');
      }
      if (!report.gate && allowLegacy) return { report, legacy: true, role: null };
      const current = decideWork(verified, policy);
      if (!current.allowed) throw new Error(`Model gate denied: ${current.reason}. End the user turn; do not perform task work.`);
      if (report.gate?.allowed !== true || !['CONTINUE', 'CONTINUE_SUBTASK'].includes(report.gate?.action)) {
        throw new Error('This report did not authorize work in its original turn. Obtain a new accepted fingerprint gate in a new user turn.');
      }
      let manifest, originalRole = 'primary';
      if (report.gate.role !== undefined) {
        manifest = JSON.parse(await read(file.replace('report.json', 'manifest.json'), ref));
        if (manifest.turn_id !== match[1] || report.turn_id !== match[1] || manifest.branch !== report.branch ||
            !SHA.test(manifest.work_head_before_probe || '') || manifest.package_id !== report.package_id) throw new Error('Fingerprint manifest binding mismatch.');
        const original = decideWork(verified, manifest.policy);
        if (!original.allowed || !sameEvidence(report.gate, original)) throw new Error('Fingerprint original role or policy mismatch.');
        originalRole = original.role;
      } else if (report.gate.action !== 'CONTINUE') throw new Error('A secondary gate requires an original policy and role.');
      // Later policy changes cannot promote an old secondary turn or resurrect
      // a denied turn. Revocation is handled by the live decision above.
      return { report, manifest, current, originalRole, role: originalRole === 'secondary' || current.role === 'secondary' ? 'secondary' : 'primary' };
    })());
    return records.get(key);
  };
}
