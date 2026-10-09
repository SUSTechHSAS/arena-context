# Decisions and rationale

No task-specific decisions yet. Record consequential choices, alternatives, evidence, and owner instructions. Candidate decisions remain unreviewed.

## Fingerprint ambiguity maintenance (proposed)

The owner requested continuation when all statistically indistinguishable models are explicitly accepted. Use the existing fit/separation/family thresholds and the complete bank, not the three display candidates or a model-family wildcard. Preserve family_only and identified_candidate=null; any unaccepted candidate or missing evidence still denies work. CI independently recomputes the set. Previously denied turns remain denied. See docs/FINGERPRINT.md and shared PR #16 for the exact user regression sample and validation. This proposal needs owner review and does not change the domain task contract.

## 2026-10-09: Primary and secondary model collaboration (proposed)

- Owner-directed scope: retain the current six-model list as primary; add only Haiku 5.5, Opus 5, Fable 5, GPT-5.6 Sol and GPT-6 Luna as secondary. All other models remain rejected.
- Choice: route a fully listed mixed reference set to secondary permissions. Primary turns issue bounded candidate work packets and review the exact current outputs; secondary turns execute one packet per PR and record each turn separately.
- Reason: reuse sessions assigned to the additional five models while reserving task decisions, delegation and output review for primary turns. Human acceptance and merge remain with Kibiandkimi.
- Evidence: shared PR #23, docs/COLLABORATION.md, and the role, scope, handoff and fingerprint regression tests. This maintenance does not decide the domain task's plan or acceptance criteria.
- Migration: update existing task code before enabling schema 2 on main; schema 1 remains compatible during the transition. Do not reuse a previous turn's role or retroactively promote a denied/secondary fingerprint.
