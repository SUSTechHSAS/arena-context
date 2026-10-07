# Decisions and rationale

No task-specific decisions yet. Record consequential choices, alternatives, evidence, and owner instructions. Candidate decisions remain unreviewed.

## 2026-10-07 — unit 01 plan approved, implementation remains candidate

- Use TypeScript + React + Vite + Vitest as approved by the user in chat. Keep the
  deterministic domain independent of React; no wholesale game/UI rewrite in unit 01.
- Pin upstream `8d80b5a4dd3d737ed6d3060f05611eaa3de611ab` and vendor only the main
  HTML plus original license for offline, unmodified-source comparison. Checksums
  are in `reference/chinese-dungeon/manifest.json`.
- Select `生成玩家距离图` as the first slice. Retain its distance-100 horizon and
  asymmetric target-entry checks, even if surprising. No bug-fix exceptions proposed.
- Chat authorization to proceed after manual pelican testing is not an automated
  fingerprint pass. Preserve historical diagnostics without reusing them; leave
  enforcement intact and report any failed protocol status.
- Full plan, migration inventory and limitations: `docs/task-10/unit-01.md`.
