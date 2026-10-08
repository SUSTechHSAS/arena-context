# Task #10 verification ledger

This records actual local commands, not owner acceptance. Reference pin: `8d80b5a4dd3d737ed6d3060f05611eaa3de611ab`. Current per-turn fingerprint report: `.context/fingerprints/20261008T080439Z-cbb0a01f/report.json`.

## U00 — 2026-10-08

- Independently read Issue #10, actual branch, accepted task head, account identity and earlier PR discussions. Owner selected a fresh implementation. No earlier candidate code/tests were reused.
- Downloaded the pinned GitHub API archive. All eight root files retained unchanged; source workflows excluded and recorded.
- `node scripts/verify-reference.mjs` — passed, eight SHA-256/size matches.
- `node --test tests/reference.test.mjs` — passed, **5 tests**. Includes an actual one-byte mutation of a temporary source copy, wrong pin, duplicate names and path traversal.
- `git diff --check` — passed.
- U00's declaration counts are lexical (including nested named declarations, excluding arrow functions/methods), not full AST coverage.

Not run: domain parity, candidate types/build, original or candidate browser/gameplay, production workshop/socket integrations. Source-integrity mutation detection does not establish gameplay mutation coverage.

## Protocol / environment

- Fingerprint was scored once this user turn: `family_only`, `identified_candidate=null`, exact 301-number sample, complete ambiguity accepted, `CONTINUE`; cached bank labelled `cached-fallback` because only allowed network hosts were used.
- Full startup checkpoint `3b3ad8837f4ad1be023a5ad8a38830d076535994` has successful `arena/protocol` and Protocol statuses through GitHub API.
- `gh pr edit` cannot run with this gh version's deprecated Projects GraphQL field; PR summaries can be updated using `gh api .../pulls/19 --method PATCH`.
- Actions log downloads redirect to an unlisted host and are inaccessible. No retry/bypass or inferred log content.
