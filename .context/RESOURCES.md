# Task #10 resources

- Upstream: https://github.com/SUSTechHSAS/Chinese-Dungeon
- Independently pinned commit: `8d80b5a4dd3d737ed6d3060f05611eaa3de611ab`.
- Recoverable source snapshot: `reference/chinese-dungeon/` (all eight root files, unchanged).
- SHA-256 / size manifest: `reference/manifest.json`; license: `reference/chinese-dungeon/LICENSE` (GPL-3.0).
- Retrieval: `gh api repos/SUSTechHSAS/Chinese-Dungeon/tarball/8d80b5a4dd3d737ed6d3060f05611eaa3de611ab`; allowed GitHub/codeload hosts only.
- Validation: `node scripts/verify-reference.mjs`; no network required.
- Audit/plan: `docs/task-10/PLAN.md`, `docs/task-10/FEATURE-MATRIX.md`, `docs/task-10/SOURCE-INVENTORY.md`.

Temporary archive and extracted scratch scripts under `.cache/` are not recovery inputs. No prior candidate implementation or prior fingerprint sample was used.

## Collaboration migration — 2026-10-09

- Session entry, packet list and preserved-candidate provenance: `docs/task-10/MIGRATION.md`.
- Immutable primary-issued definitions: `.context/collaboration/packets/` (one packet per later secondary PR).
- Fresh regression outputs, exact commands and SHA-256 manifest: `docs/task-10/migration-2026-10-09/verification.json`.
- Current primary evidence: `.context/fingerprints/20261009T045933Z-88646267/` and its referenced bank snapshot.
