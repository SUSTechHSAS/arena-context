# Current handoff

- Task: #10
- Unit: U02a — complete viewer domain and renderer
- Work branch / PR: arena/db5ddb58-arena-context / https://github.com/SUSTechHSAS/arena-context/pull/19
- Accepted base at unit start: task/10/main@adccae2f9fbc13b9ffd7a5a97b9150d24409f166
- Fingerprint: .context/fingerprints/20261008T080439Z-cbb0a01f/report.json
- Updated: 2026-10-08
- Candidate stage: viewer engine/renderer parity validated; React viewer UI next

This card does not establish approval; only Kibiandkimi decides acceptance.

## Current objective

Implement a fresh modern-framework rewrite with independent original-source consistency tests, retaining the accepted TASK.md behavior contract.

## Candidate progress

The owner chose a fresh implementation from the accepted task head; #14/#15 are not inherited. U00 froze all eight root application/reference files from independently resolved upstream `8d80b5a4dd3d737ed6d3060f05611eaa3de611ab`, including license, viewer, manager and NPC example. `reference/manifest.json` records exact SHA-256 and size. Verification code rejects changed bytes, identity, duplicate and escaping paths.

`docs/task-10/PLAN.md` stages a React/TypeScript/Vite rewrite; `FEATURE-MATRIX.md` tracks the entire source surface and `SOURCE-INVENTORY.md` provides a lexical declaration audit. Every domain category remains unported. Proposed source defects/deviations are not approved. Recovery inputs and environment limits are recorded in RESOURCES.md and ENVIRONMENT.md.

The exact current-turn fingerprint and cached bank are preserved; CONTINUE is accepted complete ambiguity, not unique identity certification.

U01 independently ports UTF-16 hash, dungeon LCG, stateless fusion random and the player distance-map primitive. React/TypeScript/Vite boot has no original-script execution. A test-only AST oracle reads exact original declarations. Corrected domain suite is 30/30; 20 seeds compare 1000 draws/states each, 1024 small-map/start combinations match, and a real >=99 candidate-source mutant is rejected. Source integrity remains 5/5. Strict typecheck and production build pass. The initial real-browser launch failed on missing libraries; explicitly inflating the npm package’s bundled al2023 archive fixed it. Real Chromium now passes the offline boot/seed replay test (1/1), with zero page errors. No system dependency or unlisted download was used.

U02a independently implements the complete original viewer in typed, stateful modules (not the main-game generator). It preserves cells/rooms/locks/stairs, mutable aliases, Symbols/door maps and random-call order. Rendering is a deterministic adapter with source-identical ordered canvas commands. A diagnostic graph distinguishes identity, missing/undefined, sparse holes, non-finite numbers, descriptors and symbols without invoking accessors. Production does not execute the original script.

## Verification

- `node scripts/verify-reference.mjs`: all eight original files unchanged.
- `node --test tests/reference.test.mjs`: 5/5 passed, including deliberate one-byte source mutation detection; not gameplay parity.
- `git diff --check`: passed. Detailed evidence: `docs/task-10/VERIFICATION.md`.
- Last verified remote checkpoint before this checkpoint: `033be544f248d7fd9f093b0591cc653e0a406672`. Startup checkpoint 3b3ad88 passed arena/protocol; later domain CI/results are not inferred.
- U02a strict typecheck passed; targeted `viewer|graph diagnostics` run passed 8 tests (30 unrelated tests deliberately skipped), including 4 seeds × floors 0–15, every draw and complete state graph, six ordered-render cases, reuse/empty-render diagnostics. Runtime was ~77 seconds. Full combined suite/build/React viewer browser checks are not yet run.
- U01 `npm run typecheck && npm run test:e2e` after the library fix: passed strict types and 1 real Chromium test. No rewritten gameplay/other browser engines/live services yet. Actions logs inaccessible, API check metadata accessible.

## Blockers and unresolved owner feedback

No routing blocker. Full implementation and parity coverage remain pending. Record suspected defects and behavioral differences for Kibiandkimi review instead of silently changing behavior.

## Next action

U02b builds the React viewer controls/cards with the source’s 0–15 floor range and exact renderer; compare real canvas pixels against the untouched original viewer in a test-only dev route. Optimize tagged graph comparisons without losing data, rerun the full suite/build/E2E, document UI deviations and checkpoint. Continue checkpoints without changing the accepted behavior contract. Commit/push/verify each useful unit and automatically continue. Keep PR #19 Draft and do not merge.
