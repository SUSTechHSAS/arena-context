# Current handoff

- Task: #10
- Unit: U01 — modern scaffold and primitive parity candidate
- Work branch / PR: arena/db5ddb58-arena-context / https://github.com/SUSTechHSAS/arena-context/pull/19
- Accepted base at unit start: task/10/main@adccae2f9fbc13b9ffd7a5a97b9150d24409f166
- Fingerprint: .context/fingerprints/20261008T080439Z-cbb0a01f/report.json
- Updated: 2026-10-08
- Candidate stage: U01 dependencies locked; initial test-assumption correction awaiting rerun

This card does not establish approval; only Kibiandkimi decides acceptance.

## Current objective

Implement a fresh modern-framework rewrite with independent original-source consistency tests, retaining the accepted TASK.md behavior contract.

## Candidate progress

The owner chose a fresh implementation from the accepted task head; #14/#15 are not inherited. U00 froze all eight root application/reference files from independently resolved upstream `8d80b5a4dd3d737ed6d3060f05611eaa3de611ab`, including license, viewer, manager and NPC example. `reference/manifest.json` records exact SHA-256 and size. Verification code rejects changed bytes, identity, duplicate and escaping paths.

`docs/task-10/PLAN.md` stages a React/TypeScript/Vite rewrite; `FEATURE-MATRIX.md` tracks the entire source surface and `SOURCE-INVENTORY.md` provides a lexical declaration audit. Every domain category remains unported. Proposed source defects/deviations are not approved. Recovery inputs and environment limits are recorded in RESOURCES.md and ENVIRONMENT.md.

The exact current-turn fingerprint and cached bank are preserved; CONTINUE is accepted complete ambiguity, not unique identity certification.

U01 prepares a strict TypeScript/React/Vite client, AST-range exact-source test oracle, independent UTF-16 hash/LCG/fusion modules and a distance-map primitive with injected source-compatible item classes. Candidate tests cover exact draws/states, exhaustive small maps, walls/items/truthiness and a real source-code boundary mutant. Browser tooling is configured via an npm-hosted Chromium package. Dependencies installed with lifecycle scripts disabled and package-lock saved. Initial strict typecheck passed; 29/30 Vitest tests passed. One test incorrectly expected numeric hash input to throw; the exact original actually returns zero when .length is absent. Candidate production behavior was already correct; the test now compares that behavior and tests genuinely invalid positive-length objects. Corrected full suite/build/browser validation remains pending.

## Verification

- `node scripts/verify-reference.mjs`: all eight original files unchanged.
- `node --test tests/reference.test.mjs`: 5/5 passed, including deliberate one-byte source mutation detection; not gameplay parity.
- `git diff --check`: passed. Detailed evidence: `docs/task-10/VERIFICATION.md`.
- Last verified remote checkpoint before this checkpoint: `89930f95d352ff3926741c8300632aa132bcbf70`. Startup checkpoint 3b3ad88 passed arena/protocol; later domain CI/results are not inferred.
- No rewritten gameplay or real-browser tests yet. Node/npm available; no system browser. Actions logs inaccessible, API check metadata accessible.

## Blockers and unresolved owner feedback

No routing blocker. Full implementation and parity coverage remain pending. Record suspected defects and behavioral differences for Kibiandkimi review instead of silently changing behavior.

## Next action

Rerun the corrected reference/typecheck/differential suite, production build and real Chromium test; record actual evidence, checkpoint U01, then continue U02. Commit/push/verify each useful unit and automatically continue. Keep PR #19 Draft and do not merge.
