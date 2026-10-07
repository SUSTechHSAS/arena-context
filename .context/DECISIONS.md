# Decisions and rationale

The implementation plan was approved in chat; implementation and compatibility decisions below remain candidates for owner review.

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

## Unit 01 implementation boundary

- Test exact Acorn-extracted upstream declarations in a fresh VM, not a separately
  translated reference algorithm. Check the entire reference file checksum first.
- Use original concrete class prototypes for legacy instanceof; do not invoke
  item constructors or original HTML startup. This intentionally leaves lifecycle,
  storage, network and real game-state translation outside unit-01 evidence.
- New logic takes a readonly typed square grid and valid in-bounds start. Item
  tags represent legacy class/type categories. Do not claim malformed-input parity
  or use this fixture adapter as a production save importer.
- Retain Infinity and the distance-100 boundary. Use a FIFO cursor instead of
  Array.shift; finite-grid differential tests cover the resulting distance maps.
- The React view is an explicitly labelled experiment. No workflow changes or
  whole-game equivalence claims accompany its locally passing tests.
