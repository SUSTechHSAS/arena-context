# Task #10 — independent rewrite plan (candidate, not owner acceptance)

Contract: `.context/TASK.md`, Issue #10. Human reviewer: Kibiandkimi. Base: `task/10/main`; actual work branch: `arena/db5ddb58-arena-context`; Draft PR #19.

The owner selected a **fresh implementation** on 2026-10-08. No implementation, plan or test claim from #14/#15 is inherited. The independently pinned original is `8d80b5a4dd3d737ed6d3060f05611eaa3de611ab`.

## Architecture and behavioral constraints

- React + TypeScript + Vite for the client; domain logic in framework-independent modules, stateful random streams explicitly owned by a session. UI state and canvas rendering are not the source of truth.
- Original HTML/JS is immutable and may execute only in test oracles. An iframe, `eval` of the complete original or a modern wrapper around it is **not** claimed as the completed rewrite.
- Establish exact-source differential tests, not just golden values copied from the candidate. Preserve random draw order, JS numeric/truthiness behavior, row/column order, prototype/Map/Symbol relationships, item lifecycles, timers and saves. Diagnostics must not draw random numbers or erase Infinity/NaN/undefined/reference identities.
- Main-game and viewer algorithms are separate contracts where the source differs. Do not assume viewer generation proves gameplay parity.
- Online behavior uses isolated Supabase/Socket adapters and deterministic service doubles. Do not mutate live upstream data for tests. CDN assets should be packaged/configurable rather than required for an offline boot.
- Deviations, suspected upstream bugs and security fixes are recorded for explicit review; tests do not silently bless a changed contract. Keep Draft while full scope or required verification is incomplete.

## Reviewable units

| Unit | Work and exit evidence | Status |
|---|---|---|
| U00 | Freeze all original application/reference files, preserve GPL, verify hashes, inventory complete feature surface | Complete; audit is lexical pending parser-backed inventory |
| U01 | Modern scaffold, hermetic exact-source oracle, numeric/random/path primitives with mutation-sensitive differential tests | Complete: strict types, 30 domain + 5 integrity tests/build, 1 real Chromium test |
| U02 | Complete viewer generation and rendering; seed/floor/small-map parity and real-browser interactions | Next |
| U03 | Typed entities, effects, combat, equipment, inventory/pets and deterministic action engine; class/lifecycle parity | Pending |
| U04 | Main dungeon/cave/tutorial/floor/boss/puzzle generation and seed search; maps and random-stream parity | Pending |
| U05 | Cross-load save/export/import, signatures, settings, custom NPC scripting/data; preserved object graph and version handling | Pending |
| U06 | Full React game UI/HUD/menus/canvas/touch/keyboard, map controls, editor and local custom-level workflows | Pending |
| U07 | Viewer/level manager/workshop/socket integration, offline fallback and deterministic request/event contract tests | Pending |
| U08 | End-to-end differential action transcripts, randomized replay, mutation detection, save interoperability, browser/preview verification | Pending |
| U09 | Reproducible instructions, complete matrix and reviewed deviation proposals; PR ready only if stated scope is genuinely reviewable | Pending |

Sequence may be refined as dependencies are audited, without removing original features or weakening the acceptance criterion. Every useful unit updates STATE and is committed, pushed and checked against the remote head before continuing.

## Acceptance evidence required (not yet met)

1. An actually playable rewritten game, viewer and level manager covering the source feature matrix, not a map-only demonstration.
2. Independent original-vs-candidate results for generated maps, random state, movement/turn order, combat/status/inventory, floors, puzzles, saves, local creative levels and network adapter contracts.
3. Tested mutation(s) proving that the suite rejects logical drift; finite and non-finite values and identity-sensitive state are compared faithfully.
4. Typecheck, unit/consistency suite, production build and real-browser flows, with exact commands and actual counts recorded. Report unavailable browser engines/live integrations rather than implying coverage.
5. A deviations ledger with source evidence and review status. No agent-written file or label establishes owner approval.
