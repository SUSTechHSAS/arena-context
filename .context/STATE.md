# Current handoff

- Task: #10
- Unit: U02 — complete viewer and original-browser parity
- Work branch / PR: arena/db5ddb58-arena-context / https://github.com/SUSTechHSAS/arena-context/pull/19
- Accepted base at unit start: task/10/main@adccae2f9fbc13b9ffd7a5a97b9150d24409f166
- Fingerprint: .context/fingerprints/20261008T080439Z-cbb0a01f/report.json
- Updated: 2026-10-08
- Candidate stage: U00/U01/U02 complete; full main-game rewrite pending

This card does not establish approval; only Kibiandkimi decides acceptance.

## Current objective

Fresh modern-framework rewrite with independent original-source consistency tests, without weakening TASK.md. Owner selected fresh work; prior candidates #14/#15 are not inherited.

## Candidate progress

All eight upstream root files are frozen at independently resolved 8d80b5a with GPL and checksums. React/strict TypeScript/Vite client has an engine lab and complete rewritten viewer (separate from main-game generation). Hash/LCG/fusion/player-distance primitives are ported. Original code executes only in AST/VM test oracles and an explicitly enabled test-dev fixture route, not production.

Viewer preserves every field/alias/door Symbol and random draw. Source-style ordered rendering and all 16 real browser canvas PNGs match. Responsive controls, navigation/count/error-handling differences are explicit unaccepted proposals in DEVIATIONS.md. Full matrix, staged plan and evidence: docs/task-10/.

## Verification

- `npm run check` in app: eight original hashes, 5 integrity tests, strict types, 39 domain tests and production build passed.
- `npm run test:e2e` after removing Lambda single-process mode: 3/3 actual Chromium tests passed, including untouched-original/candidate 16-PNG equality, offline lab replay and mobile/time-seed/keyboard flow.
- Primitive evidence: 20×1000 draws plus states, 1024 exhaustive small-map/start combinations and actual wrong-boundary candidate-source mutation detection.
- Viewer evidence: 4 seeds×16 floor trajectories, all random draws/full identity-aware graphs, six render-command comparisons, session aliases/empty rendering.
- Last verified remote checkpoint before this unit: 53effee8cad720ba0f3e36897081fc6045e40eb3. Worktree and STATE are committed/pushed together at every checkpoint.
- No main-game trajectories, save cross-load, full entity/UI/editor or live service parity yet. Firefox/WebKit and other OS untested. Actions logs inaccessible; API status metadata accessible.

## Blockers and unresolved owner feedback

No routing/environment blocker remains. Main gameplay and the rest of the matrix are unfinished, so PR stays Draft. No intentional deviation is declared owner-approved.

## Next action

Continue independently audited main-game entities/status/action/save or service modules, with exact-source tests for each small unit. Preserve source semantics and document gaps; update STATE, commit, push and verify actual remote head before long work/each checkpoint. No merge or auto-merge.
