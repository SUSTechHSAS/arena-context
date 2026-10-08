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

## Fingerprint ambiguity maintenance (historical proposal, merged in PR #18)

The owner requested continuation when all statistically indistinguishable models are explicitly accepted. Use the existing fit/separation/family thresholds and the complete bank, not the three display candidates or a model-family wildcard. Preserve family_only and identified_candidate=null; any unaccepted candidate or missing evidence still denies work. CI independently recomputes the set. Previously denied turns remain denied. See docs/FINGERPRINT.md and shared PR #16 for the exact user regression sample and validation. This proposal needs owner review and does not change the domain task contract.
