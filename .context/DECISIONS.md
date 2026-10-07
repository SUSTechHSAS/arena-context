# Decisions and rationale

## 2026-10-07 — Candidate rewrite plan; awaiting approval

- Task base verified as `task/10/main @ 4bfcad36bd762e206576387038836f8848fc40ee`; actual Arena branch retained as `arena/0bbc694b-arena-context`.
- User explicitly permitted continuation without a new fingerprint after independent sequence verification. This is recorded as a turn-specific user instruction, not a statistical pass, central-policy update or exemption from automated checks. Previous raw/manifest/report/bank remain append-only and unchanged.
- Earlier request to submit concrete plan and acceptance metrics before implementation still governs. This turn prepares only documentation; approval to continue is not treated as approval of a plan not yet presented.
- Proposal: freeze upstream `SUSTechHSAS/Chinese-Dungeon @ 8d80b5a4dd3d737ed6d3060f05611eaa3de611ab`; modern React/TypeScript/Vite UI with a separate engine and a differential legacy test oracle. Not an iframe wrapper. Vitest and Playwright proposed, not installed or executed yet.
- Full rewrite includes gameplay, editor, viewer, manager and network contracts rather than silently narrowing to a playable demo. Network mocks are not proof of production integration; no production writes without separate authorization.
- Detailed scope, phased deliverables, evidence limits and proposed metrics: [TASK-10-PLAN.md](../docs/TASK-10-PLAN.md). No architecture, exception or behavior deviation has been approved yet.

## 2026-10-07 — Owner approval and continuation instruction

- User approved the submitted plan and instructed continuous small-unit implementation/checkpoints. This approves the plan, not completed code or future behavior deviations.
- User again independently verified the denied sequence and explicitly permitted continuation, additionally requesting automatic continuation for future `family_only` cases involving `gpt-6-astra` / `gpt-6.1-sol`. Recorded as an owner instruction only; no fingerprint report, central policy, gate code, accepted AGENTS or workflow was changed. CI may still deny these checkpoints.
- Unit A1 freezes seven upstream source/runtime/documentation files byte-for-byte, with Git blob SHA-1 and SHA-256 verification; excludes workflows and non-runtime screenshot. GPL-3.0 and attribution are retained. Browser/network tests must not access legacy production services.
