## Purpose

Refs #10

The partial rewrite now has a large, bounded work pool so secondary sessions can keep progressing between scarce primary turns. The original four assignments are preserved; 110 more have been published, for **114 packets: 73 available and 41 waiting only for primary-reviewed dependencies**.

- Base: `task/10/main`, accepted baseline `45f8811ce9c7ec910ff6346d7c6b489fb1cf8f5e`.
- Head: `arena/db5ddb58-arena-context`; continue this existing Draft PR.
- Inherited unreviewed foundation: this PR at `133f40042356f49e3f5e98dc4f3abf28ecf09197`, including the source snapshot, complete viewer and typed domain contracts. Independent candidates #14/#15 are not dependencies.
- Model role: primary. Current [fingerprint](https://github.com/SUSTechHSAS/arena-context/blob/arena/db5ddb58-arena-context/.context/fingerprints/20261009T091343Z-0e4cf368/report.json): `reference_ambiguity / primary / CONTINUE`, reference set `gpt-6-astra` and `gpt-6.1-sol`. Statistical evidence, not identity certification.
- New packet source: `4cc1298712ebfffcdd2bd1beb9ce4c8e046bd596`; original four remain unchanged at `04c2f6d`.
- Primary review of secondary work: not applicable here; the pool assigns future work and contains no completed secondary runs.

## Changes

- Retain the eight-file GPL source snapshot at `8d80b5a4dd3d737ed6d3060f05611eaa3de611ab`, the React/TypeScript/Vite viewer and existing random/path, status, item, door, armor and codec consistency foundation.
- Add 68 class-contract implementation packets, 16 algorithm/data-interface packets and 26 executable source-audit packets. Coverage spans items, weapons, monsters, pets, maps/puzzles, storage, editor, rendering/input, workshop/socket and action integration. Every named main-page class declaration in the static AST maps to existing work or an implementation/audit assignment; this is assignment coverage, not completed functionality.
- Give each packet exact source anchors, disjoint task paths, acceptance, verification and real superclass/audit dependencies. Document priority roots whose review unlocks multiple descendants, one packet per PR, and checking active PRs because status is branch-local.
- Broaden ItemCore's polymorphic action/timer/collection type signatures to match original subclass arguments and boolean/numeric/empty results; align the existing bush hook annotation. Existing runtime returns and state updates are retained, allowing independent classes to compile without each changing the shared base.
- Preserve TASK, the accepted shared protocol, all original packet definitions and historical fingerprints.

Full directory and selection instructions: [packet-pool/README.md](https://github.com/SUSTechHSAS/arena-context/blob/arena/db5ddb58-arena-context/docs/task-10/packet-pool/README.md).

## Evidence and validation

- All 110 definitions were created through the accepted collaboration CLI with the current primary fingerprint.
- 503 source anchors matched exact AST declarations. Dependency IDs exist, the graph is acyclic, and allowed task paths do not overlap between any new/old packets.
- At published `4cc1298`, `collaboration.mjs status` verified **114 packets: 73 available, 41 blocked only for required predecessor review, zero other blockers**. Its [arena/protocol](https://github.com/SUSTechHSAS/arena-context/actions/runs/37916813252) passed.
- At `0ec3698`, `npm run check` passed: 8 reference hashes, 5 integrity tests, strict types, 110 domain tests and production build. A compiler fixture also accepted the representative polymorphic subclass signatures. The first check exposed a narrow bush annotation, which was corrected before the successful run.
- Logs, creation records, packet hashes and status output: [verification.json](https://github.com/SUSTechHSAS/arena-context/blob/arena/db5ddb58-arena-context/docs/task-10/packet-pool/verification.json).
- The earlier migration's 72 protocol tests and 4 Chromium tests remain preserved historical evidence. Shared protocol/browser behavior was not changed by this expansion; no new browser run is claimed.

## Gaps and review focus

Full Task #10 remains incomplete. Packets are assignments, not implementations or approvals. Source-only audits and isolated actor/item tests cannot establish complete gameplay, real world/actor integration, save cross-load, custom scripting, UI or live services. UI deviations still require review.

Review the common subclass signature compatibility and packet boundaries/dependencies. Later primary turns inspect actual secondary outputs and their run evidence; Kibiandkimi retains human approval and final merge.

## Handoff

- [x] Work files and `.context/STATE.md` describe the published expanded pool.
- [x] Packet publication checkpoint was pushed and its remote head verified.
- [x] Supporting decisions, selection/recovery instructions and verification evidence were updated.

These checkboxes are author reports, not owner acceptance. PR #19 remains Draft while the full rewrite continues.
