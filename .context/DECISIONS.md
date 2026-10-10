# Decisions and rationale

Record consequential choices, alternatives, evidence, and owner instructions. Candidate implementation decisions remain unreviewed.

## Task #10 routing — owner instruction, 2026-10-08

After checking the current accepted task head and the two unassigned Draft candidates (#14 and #15), the owner explicitly selected “fresh from the accepted task head.” Continue only on `arena/db5ddb58-arena-context`, with successor Draft PR #19 targeting `task/10/main`. Do not inherit, combine or rely on the prior candidates' code, plans or claimed verification. This selection does not constitute approval of any new implementation or a change to TASK.md.

Independently query the original `SUSTechHSAS/Chinese-Dungeon` repository, pin its current source commit, preserve its license and construct a new audit and consistency suite. The upstream HEAD independently observed at startup is `8d80b5a4dd3d737ed6d3060f05611eaa3de611ab`.

## U00 architecture proposal — 2026-10-08

Use React/TypeScript/Vite for the new client, keeping domain modules independent of UI and comparing them against the immutable original in test-only oracles. Preserve the source's numeric, RNG, identity, save and action-order semantics; do not claim a complete rewrite from an iframe/eval wrapper or a single map demo. Inventory the game, viewer, editor, level manager, NPC and service boundaries separately. The plan and coverage ledger are in `docs/task-10/`; these are candidate implementation choices, not owner approval or a reduced acceptance scope.

Pin all eight upstream root application/reference files at the independently resolved commit. Retain the original GPL-3.0 license in the snapshot; derivative app code will use the same license and attribution without relicensing the repository's separate Arena protocol. Source workflows are excluded because their behavior is not application functionality. SHA-256 and byte lengths are reviewable in `reference/manifest.json`.

## U03a status-domain ports — candidate design

Move the entire status class’s global actor/item/UI/RNG dependencies behind typed ports. Private port state is not an enumerable save field. Compare the exact original class with matching doubles; do not infer full actor/item/game integration from isolated contract tests. Preserve non-obvious source behavior (zero remaining defaults, newly allocated actor-stack tick, player-fire coupling, local expiry count) until explicitly reviewed. Pure label formatting must accept structural pre-existing state rather than requiring a new candidate-only method.

## U03b item core and source comparison — candidate design

Separate base-item data/lifecycle from its two unported legacy DOM-rendering methods. Preserve material draw order, Symbol.for identities, shallow Map copies, slot/falsy defaults and source stack/comparator quirks. A more correct diagnostic graph comparator must not silently replace the original item-stacking comparator. Main doors and viewer doors have different Symbol contracts and remain separate. Tests clone inputs independently while retaining each input graph’s internal aliases, avoiding shared-mutation false positives. Derived-item/actor factories and concrete UI integration are not established by a base-class marker double.

## U05a independent codec extraction and integration boundary

Extract dependency-free shared codecs/signatures before larger actor/save/service integration, without reducing scope or claiming complete U05. Keep main warning behavior separate from manager silence and sign exact input bytes/order, not canonical JSON or a stronger invented authentication format. The public client-side key is format data, not a user credential. The original NPC example has no signature and game version 1532; do not assert signed-file compatibility merely from its presence.

Typed item/status constructors take explicit ports and have modern class names. Full v1/custom-script integration will need source-visible constructor/name/global API adapters and real hydration; current graph name mapping/tests do not establish that compatibility. No complete save/script integration is self-approved.

## Fingerprint ambiguity maintenance (historical proposal, merged in PR #18)

The owner requested continuation when all statistically indistinguishable models are explicitly accepted. Use the existing fit/separation/family thresholds and the complete bank, not the three display candidates or a model-family wildcard. Preserve family_only and identified_candidate=null; any unaccepted candidate or missing evidence still denies work. CI independently recomputes the set. Previously denied turns remain denied. See docs/FINGERPRINT.md and shared PR #16 for the exact user regression sample and validation. This proposal needs owner review and does not change the domain task contract.

## 2026-10-09: Primary and secondary model collaboration (proposed)

- Owner-directed scope: retain the current six-model list as primary; add only Haiku 5.5, Opus 5, Fable 5, GPT-5.6 Sol and GPT-6 Luna as secondary. All other models remain rejected.
- Choice: route a fully listed mixed reference set to secondary permissions. Primary turns issue bounded candidate work packets and review the exact current outputs; secondary turns execute one packet per PR and record each turn separately.
- Reason: reuse sessions assigned to the additional five models while reserving task decisions, delegation and output review for primary turns. Human acceptance and merge remain with Kibiandkimi.
- Evidence: shared PR #23, docs/COLLABORATION.md, and the role, scope, handoff and fingerprint regression tests. This maintenance does not decide the domain task's plan or acceptance criteria.
- Migration: update existing task code before enabling schema 2 on main; schema 1 remains compatible during the transition. Do not reuse a previous turn's role or retroactively promote a denied/secondary fingerprint.

## 2026-10-09: Migrate the owner-assigned PR #19

- The owner confirmed that collaboration PRs #23, #24 and #25 were merged and explicitly assigned migration of the partial work in #19. The current accepted task head is `45f8811ce9c7ec910ff6346d7c6b489fb1cf8f5e`; the inherited candidate is `ee84f0e05f38df931f769511cc99c54d9dbde6c0`.
- Continue `arena/db5ddb58-arena-context` and its existing Draft PR #19. Merge only the accepted task base, preserving candidate implementation and historical evidence. Do not import the independent candidates #14/#15 or the waiting-only secondary history in #26.
- Before new task work, bring in the already accepted fingerprint/collaboration scripts and obtain a fresh current-turn role. The current fingerprint permits primary work; it does not retroactively change earlier reports or certify model identity.
- Issue new bounded packets in ordinary commits after the base integration, so the collaboration verifier can trace each original primary introduction. Different secondary packets must fork this published primary checkpoint into separate work branches/PRs; #19 remains the migration and foundation candidate, not a mixed secondary-work branch.
- This is a workflow migration and preparation for continued implementation, not completion of the rewrite or approval of inherited architecture, UI deviations, or test claims. Rerun the existing verification before relying on it in the new handoff. Human review and merge remain with Kibiandkimi.
- Initial packet boundaries: a reproducible AST inventory closes the explicit U00 evidence gap; accessory and potion-base contracts reuse the already tested ItemCore pattern in separate new files; a complete weapon source audit supplies the missing evidence for a later primary implementation decision. All four depend only on this PR's published foundation, have disjoint allowed task paths and no inter-packet dependencies. They are a first batch, not a reduction of the remaining task scope.

## 2026-10-09: Expand the work pool for scarce primary turns

- Owner instruction: four packets are too few; allocate substantially more while a primary turn is available.
- Preserve the original four immutable packet definitions and their issuing evidence. Prepare additional bounded packets from the frozen source and current foundation, with exact paths, acceptance and verification; publish dependencies explicitly where concrete predecessor outputs are required.
- Prioritize a broad set of useful independent assignments so a secondary session can work without waiting for a new primary allocation. Reserve architectural and integration decisions for primary turns, while gathering source contracts and isolated implementation evidence in advance.
- Current-turn authority comes from `.context/fingerprints/20261009T091343Z-0e4cf368/report.json`; the previous turn's role is not reused. All task acceptance criteria, shared protocol files, human ownership and review requirements remain those of the accepted task branch.

- Shared typing prerequisite: original 武器类.使用 has three parameters and numeric results; 迅捷卷轴/配方卷轴 can return zero; 刷怪笼/岩浆/火把 timers and several collection hooks can return undefined. The previous ItemCore boolean-only/no-argument declarations would block otherwise independent subclasses. Export ItemUseResult (boolean | number | void) and ItemHookResult (boolean | void), allow action arguments, and retain all existing return values/state updates. New base-class packets must also preserve descendant-compatible virtual signatures rather than narrowing them to their own current return values.
- New isolated classes retain original class/member names, use an explicit ports-first constructor, and store ports privately as in the current armor implementation. Existing ItemCore/ArmorItem and reviewed packet superclasses are real dependencies; external game actors/services remain explicit ports until a separately reviewed integration. Headless function packets expose a named create... factory returning the original function names. This specifies candidate module boundaries without claiming legacy no-port/script/save compatibility.

- Prepared pool: preserve 4 original packets and add 110 (68 class-contract implementations, 16 algorithm/data-interface implementations, 26 executable source audits). Across all 114, 73 have no predecessor packet and 41 have real superclass/audit dependencies. Parent implementations are required for inheritance; unrelated game services/actors remain explicit ports, not hidden packet dependencies.
- Validation before issuance: 503 declaration anchors match exact source AST ranges; all referenced packet IDs exist in the planned graph; no cycle or allowed-task-path overlap exists. Every original main-page class maps to an existing implementation or an existing/new implementation or audit assignment. This is assignment coverage, not completed implementation coverage.
- Keep the pool below the protocol's 300-file comparison boundary; the current PR plus these definitions and evidence remains below that bound. Use the latest published primary checkpoint and inspect open packet PRs before selecting work, because status is branch-local rather than a global claim lock.

- Publication: all 110 additions were created through the accepted CLI and introduced in ordinary commit `4cc1298712ebfffcdd2bd1beb9ce4c8e046bd596`. After push/remote verification, CLI status found 73 available packets and 41 waits exclusively for primary-reviewed dependencies, with no other blocker. Original four definitions remain byte-identical at their original introduction. Remote arena/protocol passed for the pool checkpoint.

## 2026-10-10: Primary lane for the world kernel (candidate, primary turn 20261010T052904Z-330f7ea6)

- Context: the 114-packet pool assigns class contracts and source audits to secondaries; dependency checks accept only a primary review of an actual secondary run, so a primary implementing a packet's own scope would leave its descendants blocked and duplicate available work.
- Choice: primary turns work in a separate, non-overlapping lane — the main-game world kernel under `app/src/game/world/` with tests `app/test/world-*.test.ts` — covering integration pieces that no packet implements: source constants/tunables, the `单元格` data contract, the session-owned global world state, and later the generation/turn orchestration that consumes reviewed packet outputs. No packet definition or allowed path is touched.
- Contract rules: constants stay unfrozen plain objects (freezing changes descriptors compared by the oracle); immutability comes from readonly types. Source `let` tunables are DEFAULT_* values copied into a session, never module-level mutable state. Canvas methods of `单元格` belong to the rendering layer (audited by `t10-main-canvas-audit`).
- Alternatives rejected: implementing pool packets directly (blocks dependency chains); a global mutable module mirroring source globals (prevents parallel sessions/tests and deterministic replay).
- Status: unreviewed candidate; Kibiandkimi decides acceptance.
