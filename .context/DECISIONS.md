# Decisions and rationale

Record consequential choices, alternatives, evidence, and owner instructions. Candidate implementation decisions remain unreviewed.

## Task #10 routing — owner instruction, 2026-10-08

After checking the current accepted task head and the two unassigned Draft candidates (#14 and #15), the owner explicitly selected “fresh from the accepted task head.” Continue only on `arena/db5ddb58-arena-context`, with successor Draft PR #19 targeting `task/10/main`. Do not inherit, combine or rely on the prior candidates' code, plans or claimed verification. This selection does not constitute approval of any new implementation or a change to TASK.md.

Independently query the original `SUSTechHSAS/Chinese-Dungeon` repository, pin its current source commit, preserve its license and construct a new audit and consistency suite. The upstream HEAD independently observed at startup is `8d80b5a4dd3d737ed6d3060f05611eaa3de611ab`.

## Fingerprint ambiguity maintenance (proposed)

The owner requested continuation when all statistically indistinguishable models are explicitly accepted. Use the existing fit/separation/family thresholds and the complete bank, not the three display candidates or a model-family wildcard. Preserve family_only and identified_candidate=null; any unaccepted candidate or missing evidence still denies work. CI independently recomputes the set. Previously denied turns remain denied. See docs/FINGERPRINT.md and shared PR #16 for the exact user regression sample and validation. This proposal needs owner review and does not change the domain task contract.
