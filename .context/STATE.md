# Current handoff

- Task: #10
- Unit: Post-#27 primary planning — integration coverage audit
- Work branch / PR: arena/5d1da57f-arena-context / https://github.com/SUSTechHSAS/arena-context/pull/30
- Accepted base at unit start: task/10/main@380470815a435dbe7f9a28f8ce2dffb9bfc14761 (PR #27 merged)
- Inherited candidate at unit start: ebd5eb0642e730030c6656e26a34fb704602e176 (PR #30 review checkpoint, merged with the accepted head)
- Updated: 2026-10-10
- Fingerprint: .context/fingerprints/20261010T151532Z-b995752e/report.json
- Model role: primary
- Work packet: none; primary lane outside all packet paths (DECISIONS 2026-10-10)
- Primary review: not applicable; no secondary run exists in this history
- Candidate stage: in progress; Draft

Only Kibiandkimi decides acceptance; this card is not approval.

## Current objective

Modern rewrite of chinese-dungeon with source-consistency tests (TASK.md). PR #27's world kernel is accepted into `task/10/main` (3804708). This primary session (Draft PR #30) plans and builds the integration layer that no packet owns: runtime composition, save model, turn actors, inventory verbs, game start, rendering/input — phases P1–P8 in PLAN.md "Integration plan after PR #27". The 114-packet pool stays with secondaries.

## Candidate progress

- PR #27 review report (docs/task-10/reviews/pr27-quality-review.md) — previous turn.
- Integration coverage audit: `scripts/task10-coverage.mjs` → docs/task-10/COVERAGE.md + coverage-ledger.json. 757 main-page declarations: 16.4 % of lines ported, 49.4 % open implementation packets, 26.7 % audit-only, 7.5 % unassigned. Overlap found: `是否为有效融合武器/材料` (ported) inside `t10-fusion-buff-engine`.
- PLAN.md: phases P1–P8 and key constraints K1 (Vite 8 minifier erases class names; keepNames + explicit registry), K2 (session-owned source-name registry with ports bound at registration), K3 (packet overlap reuse).

## Verification

- Coverage generator: `node scripts/task10-coverage.mjs --check` passes (deterministic outputs).
- K1 evidence: a probe build with the repo's Vite 8.3.3 emitted `var e=class{constructor(e){this.c=e}}` for `class 物品`; with `build.rolldownOptions.output.keepNames: true` it emitted `var 物品=class{...}` and `物品.name === '物品'`.
- Last full app check: PR #27 head (68 files / 320 tests) in the previous turn; rerun after the next code unit.

## Blockers and unresolved owner feedback

No owner response yet to the PR #27 review comment (process questions: oracle patch authority, commit style, possibly missed fingerprints). Owner merging #27 placed the upstream-fix rule into the accepted base; new fixes still get SRC entries. Full game, UI, saves and services unfinished. Draft.

## Next action

P1: implement the session source-name class registry (`app/src/game/runtime/`), set keepNames in vite.config.ts, and add differential tests against `注册全局类`/`获取所有可用的定义` shapes. Then P2 item/cell save codec.
