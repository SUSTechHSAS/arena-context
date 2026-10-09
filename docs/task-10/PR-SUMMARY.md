## Purpose

Refs #10

The partial modern rewrite in this PR now inherits the accepted primary/secondary collaboration mechanism. Existing viewer and domain foundations are preserved, and four bounded work packets provide a concrete starting point for later secondary sessions.

- Base: `task/10/main`, migration baseline `45f8811ce9c7ec910ff6346d7c6b489fb1cf8f5e`.
- Head: `arena/db5ddb58-arena-context`; keep this existing PR Draft.
- Inherited unreviewed work: this PR at `ee84f0e05f38df931f769511cc99c54d9dbde6c0`. Other independent candidates are not dependencies.
- Model role: primary. Current [fingerprint](https://github.com/SUSTechHSAS/arena-context/blob/arena/db5ddb58-arena-context/.context/fingerprints/20261009T045933Z-88646267/report.json): `reference_ambiguity`, `CONTINUE`; the complete reference set is `gpt-6-astra` / `gpt-6.1-sol`. Statistical evidence, not identity certification.
- Packet source checkpoint: `04c2f6dcfd2e4b7436f3bfdd82e5df1ae8938377`, pushed and verified; all four packets are available.
- Primary review of secondary work: not applicable; this migration issues packets and does not claim any completed secondary run.

## Changes

- Preserve the eight-file GPL source snapshot at `8d80b5a4dd3d737ed6d3060f05611eaa3de611ab`, the React/TypeScript/Vite viewer, and original-source differential foundations for random/path, status, items, doors, armor and codecs.
- Merge the already accepted task protocol, resolve the stale handoff, and retain historical fingerprint evidence. Shared rules/workflows/TASK match the accepted task base exactly; application, source and existing tests are unchanged by migration.
- Publish four independent packets with disjoint task paths: AST source inventory, accessory contracts, potion base contracts, and the full weapon source-contract audit. Each includes bounded outputs, acceptance, verification and the current primary issuing fingerprint.
- Document how new sessions start from this primary checkpoint, obtain their own role and claim one packet per separate branch/PR. [Migration and handoff](https://github.com/SUSTechHSAS/arena-context/blob/arena/db5ddb58-arena-context/docs/task-10/MIGRATION.md); exact definitions: `.context/collaboration/packets/`.

## Evidence and validation

Fresh local regression at integration commit `a66127756132e0e9852bc6021519a0bbd828e075`:

- `node --test .github/scripts/*.test.*`: 72 passed.
- In app, `npm ci --ignore-scripts`, then `npm run check`: 8 reference hashes, 5 integrity tests, strict types, 110 domain tests and production build passed.
- `npm run test:e2e`: 4 actual Chromium tests passed, including equality of all 16 viewer canvas PNGs against the untouched original.
- Source/protocol preservation and all four primary packet-creation commands passed. Logs and checksums: [verification.json](https://github.com/SUSTechHSAS/arena-context/blob/arena/db5ddb58-arena-context/docs/task-10/migration-2026-10-09/verification.json).
- At published packet checkpoint `04c2f6d`, `collaboration.mjs status` verified all four original primary introductions and returned `available` for each. Its [arena/protocol](https://github.com/SUSTechHSAS/arena-context/actions/runs/37888625642) passed.

## Gaps and review focus

Full Task #10 remains incomplete. Existing domain tests use explicit doubles and do not prove full gameplay, concrete actor integration, save cross-load, custom NPC scripting, editor/workshop/socket compatibility, or Firefox/WebKit behavior. The four packets are future assignments, not completed features. UI deviations remain review proposals in `docs/task-10/DEVIATIONS.md`.

Review the preserved foundations and the packet boundaries. Later primary turns review actual secondary outputs; Kibiandkimi retains human approval and final merge.

## Handoff

- [x] Work files and `.context/STATE.md` describe the same migration and packet checkpoint.
- [x] Packet publication checkpoint was pushed and its remote head verified.
- [x] Supporting decisions, reproducibility evidence and recovery/session instructions were updated.

These checkboxes are author reports, not owner acceptance. PR #19 remains Draft while the full rewrite continues.
