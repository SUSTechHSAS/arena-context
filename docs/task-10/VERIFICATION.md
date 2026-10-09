# Task #10 verification ledger

This records actual local commands, not owner acceptance. Reference pin: `8d80b5a4dd3d737ed6d3060f05611eaa3de611ab`. The original 2026-10-08 fingerprint is preserved at `.context/fingerprints/20261008T080439Z-cbb0a01f/report.json`. The migration turn uses `.context/fingerprints/20261009T045933Z-88646267/report.json` (`reference_ambiguity`, `CONTINUE / primary`).

## Collaboration migration regression — 2026-10-09

At integration commit `a66127756132e0e9852bc6021519a0bbd828e075`, reran the inherited suites on Linux x64, Node v24.16.0 and npm 12.0.2: **72 protocol tests, 8 reference hashes, 5 integrity tests, strict types, 110 domain tests, production build and 4 real Chromium tests passed**. This includes equality of all 16 viewer canvas PNGs. `npm ci --ignore-scripts` used the unchanged dependency lock. No application, test, reference, or shared protocol changes were needed for this run.

Original outputs, exact commands, tested commit and SHA-256 values are saved in [migration-2026-10-09/verification.json](migration-2026-10-09/verification.json). See [MIGRATION.md](MIGRATION.md) for the accepted base, preservation checks and bounded packet handoff. No secondary packet has been executed or primary-reviewed by this migration; the full game remains incomplete.

## U00 — 2026-10-08

- Independently read Issue #10, actual branch, accepted task head, account identity and earlier PR discussions. Owner selected a fresh implementation. No earlier candidate code/tests were reused.
- Downloaded the pinned GitHub API archive. All eight root files retained unchanged; source workflows excluded and recorded.
- `node scripts/verify-reference.mjs` — passed, eight SHA-256/size matches.
- `node --test tests/reference.test.mjs` — passed, **5 tests**. Includes an actual one-byte mutation of a temporary source copy, wrong pin, duplicate names and path traversal.
- `git diff --check` — passed.
- U00's declaration counts are lexical (including nested named declarations, excluding arrow functions/methods), not full AST coverage.

Not run: domain parity, candidate types/build, original or candidate browser/gameplay, production workshop/socket integrations. Source-integrity mutation detection does not establish gameplay mutation coverage.

## Protocol / environment

- Fingerprint was scored once this user turn: `family_only`, `identified_candidate=null`, exact 301-number sample, complete ambiguity accepted, `CONTINUE`; cached bank labelled `cached-fallback` because only allowed network hosts were used.
- Full startup checkpoint `3b3ad8837f4ad1be023a5ad8a38830d076535994` has successful `arena/protocol` and Protocol statuses through GitHub API.
- `gh pr edit` cannot run with this gh version's deprecated Projects GraphQL field; PR summaries can be updated using `gh api .../pulls/19 --method PATCH`.
- Actions log downloads redirect to an unlisted host and are inaccessible. No retry/bypass or inferred log content.

## U01 initial validation — 2026-10-08

- `npm install --ignore-scripts --no-fund` in app: 66 packages installed, lockfile saved, audit reported zero vulnerabilities. No browser/CDN download from an unlisted host.
- First `npm run check`: eight reference hashes and five integrity tests passed; strict TypeScript passed; Vitest **29/30 passed**, one failed assertion, so build did not run.
- Failed assertion was in the test, not production: original hash(42) reads an absent .length and returns zero, rather than throwing. Verified against original AST body; test changed to compare non-string zero behavior and genuine positive-length/charCodeAt errors. The original/candidate source was not changed to satisfy an invented contract. Corrected rerun and Chromium validation are not yet claimed.

## U01 corrected checks — 2026-10-08

- `npm run check` in app passed: 8 source hashes, 5 integrity tests, strict TypeScript, **30 Vitest tests**, Vite production build.
- 20 seeds × 1000 exact draws plus states; 1024 exhaustive two-by-two map/start combinations; asymmetric walls, instanceof/subclasses, JS truthiness, Infinity and distance-100 tested.
- Actual TypeScript candidate text compiled with `> 99` changed to `>= 99` differs from the original oracle; unmodified implementation matches. This is primitive mutation coverage, not a gameplay trajectory.
- `npm run test:e2e` failed before page assertions: npm-hosted Chromium executable extracted successfully but libnspr4.so, libnss3.so and libnssutil3.so missing. The package also contains al2023.tar.br; investigate local library extraction. No browser pass claimed.

## U01 browser recovery — 2026-10-08

- Playwright config now explicitly inflates al2023.tar.br already inside the locked npm browser package and calls its library-path helper. No OS-package download or fabricated AWS environment.
- `npm run typecheck && npm run test:e2e`: strict types pass; **1 real Chromium test passes** (offline network intercept, honest incomplete-scope label, Unicode seed state replay, zero page errors). This is engine-lab browser coverage, not original gameplay coverage.
- Browser binary/dependencies are ephemeral and reproducible from package-lock; setup instructions recorded in app/README.md. Firefox/WebKit, other operating systems, live workshop/socket remain untested.

## U02a viewer engine — 2026-10-08

- Full original viewer algorithm independently ported to ViewerGenerator/ViewerCell/ViewerDoor and deterministic rendering modules. Main-game generation is still unported and is a distinct contract.
- Strict TypeScript passed. Targeted `npm test -- --testNamePattern="viewer|graph diagnostics"`: **8 tests passed**, 30 unrelated tests explicitly skipped, ~77 seconds.
- Four seeds × floors 0–15 compare outcomes (including any original exceptions), every random draw and identity-aware full state: cells, walls, rooms, room map, locks, door Map/Symbols/aliases, stairs and player start.
- Six exact ordered canvas-command comparisons (floors 0/1/15 × square/non-square), session reuse alias, empty renderer, diagnostic sparse holes/non-finite/accessor handling. No whole-game parity claimed.
- An earlier preparation command used an incorrect cwd and ran no viewer tests; corrected files to the intended paths, then actually ran the 8 tests above. That earlier empty/filtered run is not verification evidence.
- React viewer UI, complete-suite rerun, final build and original-vs-candidate real browser pixels remain pending.

## U02b first full checks — 2026-10-08

- `npm run check`: passed eight hashes, five integrity tests, strict types, **39 domain tests** and production build. Tagged graph equality optimization retained all explicit identity/non-finite/descriptor data and reduced viewer test time from ~75s to ~22s.
- First combined Chromium run: **2/3 passed** (engine lab, blank time seed/mobile/Enter); source/candidate PNG comparison timed out during page/context setup, before any comparison assertion. No PNG match claimed.
- Removed @sparticuz/chromium’s Lambda-specific --single-process flag for normal multi-context browser testing; rerun pending. No test scope/count/timeout was weakened.

## U02 complete browser verification — 2026-10-08

- `npm run test:e2e` after normal multi-process launch: **3/3 real Chromium tests pass**. One original page and one React candidate page render all 16 floors; every canvas toDataURL PNG is exactly equal, with deterministic time, trimmed generation seed, preserved raw input and zero page errors.
- Offline lab state replay passes; blank seed uses time and mobile/Enter flow generates 16 maps without horizontal overflow.
- Untouched original viewer served only in ORACLE_TEST_MODE=1 dev mode. Production source boundary test passes; build contains no original HTML/script/oracle imports.
- UI count correction/navigation/form/busy/error feedback proposals are recorded in DEVIATIONS.md; tests do not establish owner approval. The full main game remains pending.

## U03a isolated main-game status lifecycle — 2026-10-08

- Complete source 状态效果 class ported with explicit typed actor/item/UI/random/state ports, no DOM/global dependency. Prototype/class name mapping is explicit in diagnostics; source/private port data is not silently normalized.
- Strict types and **9 targeted tests passed**, 39 unrelated tests explicitly skipped. 324 effect-type/duration/remaining/actor trajectories + 12 stack/resistance sequences + 3 specific frozen/fire, permanent immunity and pet-corrosion sequences = **339 isolated trajectories**.
- Source class runs directly from its exact AST range; both implementations receive matching deterministic actor/item/UI doubles. Compare every event/state/alias/graph, non-finite/falsy durations, repeated expiry, constructor stacking, strength cap, destruction/drying duplicates and random draw order.
- Preserved source quirks: remaining zero defaults to duration; actor-stack constructor ticks the new unregistered instance; frozen effects reference player fire even for pets; expiry/progress use the pre-extra-decrement local count. No unreviewed correction.
- This is NOT gameplay integration: real monster/pet/item factories, their side effects, HUD and the main engine remain pending.

### U03a structural-state correction

Moved label formatting to a pure helper so a pre-existing structural player-effect object does not need a candidate-only method. New exact-source test covers this boundary. Strict types and **10 targeted status tests pass**, **340 isolated trajectories** total; 39 unrelated tests skipped. No original-source change or test weakening.

## U03b item core and main doors — 2026-10-08

- Base item DATA/lifecycle ported; the two legacy DOM-rendering methods are explicitly not implemented. Full source main-door registration and unlock predicate ported separately from viewer doors (main uses Symbol.for, viewer uses local Symbols).
- Strict types and targeted item/door/status run: **32 tests passed**, 39 unrelated tests skipped. Includes 21 item/comparator tests, 1 main-door test and 10 status tests.
- Constructor fields/defaults/material draw/date/Symbol calls, independently cloned input graphs with shallow aliases, equipment presence/page/NaN fallback, consume underflow, drying/timer identity and weapon-classification branch, hints, stacks/global caps, removal/destruction and short-circuit unlock are compared against exact original declarations.
- Preserved source behavior: x/y zero default to null; slot initializes from 已装备, not a slot field; item material is omitted from stack comparison; deep comparator ignores Map/prototype/symbol contents and calls the target hasOwnProperty directly. This comparator is not substituted with the richer graph diagnostic.
- WeaponStub only tests base-class instanceof timer classification; it is not the source weapon implementation. Live actors, derived items, main-game integration, saves and item UI remain pending.

## U03b combined verification / diagnostic safety — 2026-10-08

- `npm run check && npm run test:e2e`: all eight source hashes, 5 integrity tests, strict types, **71 domain tests**, production build, **3 real Chromium tests passed**.
- Viewer preview starts at 0.0.0.0:5173, permits .e2b.app, and returns app HTML with a simulated preview Host header. Preview is a viewer/lab, not the unported full game.
- Subsequent test-only graph hardening avoids user toStringTag/iterator/name getters with Node intrinsic brands/iterators and descriptor inspection; rejects Proxies/unsupported types rather than executing code or discarding data. Strict types and the focused diagnostic test passed (70 other tests intentionally skipped); next full rerun will include it.

## U05a shared codec/signature contracts — 2026-10-08

- Independently ported original main/manager URI/Base64 codecs and SHA-256(dataString + public client integrity key). Native coercion, surrogate errors, invalid Base64/UTF-8 identity fallback, main warning vs manager silence, key/JSON order and UTF-8 replacement are preserved. Not HMAC/authentication or full save compatibility.
- Original manager declarations selected by explicit AST DOM-ready scope without executing DOM/Supabase bootstrap.
- Strict types and first **7 targeted codec tests passed**, 71 unrelated tests skipped. Targeted **1 real Chromium WebCrypto/Unicode/fallback test passed**, using the exact original function as expected signer.
- Independently inspected original NPC fixture metadata: no signature field, game version 1532, ordinary v1-style state. Added exact-source signing comparison for its raw parsed payload; no execution of NPC scripts and no cross-load claim. Final combined test count pending.
- Package engine range tightened to the installed dependency intersection (^22.17 / ^24 / >=26); actual tested Node remains 22.22.3.

## U05a full verification — 2026-10-08

`npm run check && npm run test:e2e` passed with **8 original hashes, 5 integrity tests, strict TypeScript, 79 domain tests, production build and 4 real Chromium tests**. Includes the new codec/nested-oracle/getter/proxy changes and actual unsigned-NPC payload signing comparison against both source functions. No cross-load, actor/script integration or authentication claim. Production UI remains the viewer/lab; next unit is defensive-equipment contracts.

## U03c defensive-equipment logic — 2026-10-08

- Independently ported full defense constructor/getters/attack/hint/use logic on ItemCore, with explicit actor/status/player/destroy/UI ports. Base-item DOM methods and concrete actors/derived subclasses remain pending.
- Strict types and **15 targeted tests passed**, 79 unrelated tests skipped; **438 isolated trajectories** (12 constructor profiles + 420 profile/damage/attacker cases + 1 repeated attack sequence + 5 ordered/energy cases). Exact source base + defense class execute with matched doubles; copied input graphs retain aliases.
- Preserve first duplicate enchant selection after any-positive test; ordered fusion additions/multipliers/first synergy; post-dodge chip draw; poison draw gated on healthy source monster; repeated destroyed callbacks; unbreakable durability still becomes a decimal string; upper-only energy clamp including zero/NaN denominator. Compare every state/event/draw and hint/error result.
- Initial TypeScript errors (structural ctor narrowing to never and deliberate explicit-undefined raw profile) were corrected without weakening strict options or bypassing logical tests.

## U03d all defensive subclasses — 2026-10-08

- Ported all 12 direct source defensive subclasses: 引雷针护符/守卫者盔甲/灌木丛/水鞋/秘银锁甲/防化服/钢制板甲/锅盖/冰盾/纵火狂/潜行靴子/灵能盾牌. Retain Chinese constructor names; source-visible no-port constructor facade remains pending.
- Full class-specific constructors/getters/attack/collection/removal/effect-source callbacks are ported; movement/weather/immunity interactions implemented elsewhere in the original game are not claimed by constructor descriptions.
- Strict types and **31 combined targeted tests passed** (15 defense + 16 subclasses), 79 unrelated tests skipped. Subclasses: **257 isolated trajectories** (12×6 constructors/hints/inherited actions + 12×5×3 attack/draw cases + charged identity sequence + 2 bush sequences + 2 destroyed post-super branches).
- Preserve config spread vs deliberately ignored config distinctions, overridden Map-data spread, guardian/pyromaniac zero-defense falling back through base class, unconditional post-super ice/psychic draws, lightning source identity/effect lookup, bush clearing/paint without base timer cleanup. Actor/status factories and icon lookups remain explicit doubles.

## U03d complete regression — 2026-10-08

`npm run check && npm run test:e2e` passed: **8 reference hashes, 5 integrity tests, strict types, 110 domain tests, production build, 4 real Chromium tests**. Defense base and all twelve subclasses are included; their **695 isolated trajectories** use explicit actor/status/icon/UI doubles. Full game/actions/movement/weather/equipment policy and save/script integration remain unimplemented, not established by this result.
