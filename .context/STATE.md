# Current handoff

- Task: #10
- Unit: U05a — shared save/workshop codec contracts
- Work branch / PR: arena/db5ddb58-arena-context / https://github.com/SUSTechHSAS/arena-context/pull/19
- Accepted base at unit start: task/10/main@adccae2f9fbc13b9ffd7a5a97b9150d24409f166
- Fingerprint: .context/fingerprints/20261008T080439Z-cbb0a01f/report.json
- Updated: 2026-10-08
- Candidate stage: codec targeted/browser checks pass; final combined rerun pending; main game incomplete

This card does not establish approval; only Kibiandkimi decides acceptance.

## Current objective

Fresh modern-framework rewrite with independent original-source consistency tests, without weakening TASK.md. Owner selected fresh work; prior candidates #14/#15 are not inherited.

## Candidate progress

All eight upstream root files are frozen at independently resolved 8d80b5a with GPL and checksums. React/strict TypeScript/Vite client has an engine lab and complete rewritten viewer (separate from main-game generation). Hash/LCG/fusion/player-distance primitives are ported. Original code executes only in AST/VM test oracles and an explicitly enabled test-dev fixture route, not production.

Viewer preserves every field/alias/door Symbol and random draw. Source-style ordered rendering and all 16 real browser canvas PNGs match. Responsive controls, navigation/count/error-handling differences are explicit unaccepted proposals in DEVIATIONS.md. Full matrix, staged plan and evidence: docs/task-10/.

U03a ports the complete 状态效果 lifecycle into a typed domain class with explicit actor/item/RNG/UI ports, retaining constructor merges, fire immunity, damage/corrosion, progress/expiry and original quirks. Ten targeted differential tests cover 340 deterministic isolated trajectories against the exact original class with matched service doubles. Stacking also accepts pre-existing structural effect data, without requiring an extra candidate-only helper method. This is not a whole game/actor/item implementation.

U03b ports base-item DATA/lifecycle (constructor, equip/unequip, countdown, hints, consume/stack/comparison/removal/destruction) and full main-door registration/unlock. Source Map/Symbol.for, shallow aliases, falsy coordinates/flags, slot behavior and original deep-comparator quirks are retained. Legacy item DOM rendering and concrete derived entities are NOT implemented. Item/status ports accommodate nullable destroyed identities and arbitrary Map keys.

U05a independently extracts shared Base64/URI codecs and SHA-256(data + public client key) from both main-game and manager sources. It preserves native coercion/errors, malformed fallback identity, main-game warning vs manager silence, raw JSON ordering and UTF-8 replacement semantics. Manager declarations are read from an explicit AST DOM-ready scope; no DOM/service bootstrap executes. The original NPC fixture is unsigned, game version 1532; signing its payload is not save cross-load or authentication proof.

## Verification

- Full `npm run check && npm run test:e2e` after U03b: eight original hashes, 5 integrity tests, strict types, 71 domain tests, production build and 3 real Chromium tests all passed.
- `npm run test:e2e` after removing Lambda single-process mode: 3/3 actual Chromium tests passed, including untouched-original/candidate 16-PNG equality, offline lab replay and mobile/time-seed/keyboard flow.
- Primitive evidence: 20×1000 draws plus states, 1024 exhaustive small-map/start combinations and actual wrong-boundary candidate-source mutation detection.
- Viewer evidence: 4 seeds×16 floor trajectories, all random draws/full identity-aware graphs, six render-command comparisons, session aliases/empty rendering.
- Last verified remote checkpoint before this checkpoint: 5d33aa46c6a59dfa77ff4baec6dfc0d184291780. Worktree and STATE are committed/pushed together at every checkpoint.
- U03b strict typecheck and combined targeted item/door/status run passed 32 tests (39 unrelated tests explicitly skipped). 21 item/comparator tests, 1 door test, 10 status tests; independent copied input graphs expose shallow aliases and prevent source/candidate shared mutations. Full 71-test suite/build/browser rerun subsequently passed. Additional graph hardening now uses intrinsic brands/iterators and rejects Proxies/accessors, including Symbol.toStringTag/iterator getters; strict types and the focused diagnostic test passed. Full suite will rerun with the next unit.
- Codec’s initial 7 targeted tests passed, 71 others skipped; 1 targeted actual-browser WebCrypto/codec test passed. Added real unsigned-NPC payload signing test awaits the final combined run (79 domain tests / 4 browser tests expected, not yet claimed).
- No main-game trajectories, save cross-load, full entity/UI/editor or live service parity yet. Firefox/WebKit and other OS untested. Actions logs inaccessible; API status metadata accessible.

## Blockers and unresolved owner feedback

No routing/environment blocker remains. Main gameplay and the rest of the matrix are unfinished, so PR stays Draft. No intentional deviation is declared owner-approved.

## Next action

Run the complete suite/build/all four Chromium flows with the new codec/diagnostic changes, record evidence, checkpoint and continue main-game derived entities/actions and save cross-load integration. Viewer-only preview remains on 0.0.0.0:5173; do not infer full game completion or live service verification. Source constructor/tick quirks remain deliberately preserved; do not claim fake actor/UI doubles establish gameplay parity. Preserve source semantics and document gaps; update STATE, commit, push and verify actual remote head before long work/each checkpoint. No merge or auto-merge.
