Refs #10

## Purpose and routing

- Base: `task/10/main`; head: `arena/db5ddb58-arena-context`.
- The user explicitly chose a fresh implementation from accepted task head `adccae2f9fbc13b9ffd7a5a97b9150d24409f166`. No code/plan/test claims from #14 or #15 are inherited.
- Full Task #10 is **incomplete**. This Draft contains independently reviewable source, viewer and domain-foundation units; it is not a full playable rewrite.

## Candidate changes

- Freeze all eight original root files at independently resolved upstream `8d80b5a4dd3d737ed6d3060f05611eaa3de611ab`, with GPL license, SHA-256 manifest and integrity/mutation checks.
- Strict TypeScript/React/Vite client, complete rewritten viewer, offline seed lab, responsive/keyboard controls; source HTML/script never executes in production.
- Test-only exact-AST original oracles and identity/non-finite/descriptor-aware diagnostics.
- Hash/LCG/fusion/player-distance primitives, full isolated status lifecycle, base-item data/lifecycle and distinct main-door contracts. Shared main/manager codecs/signature-format contracts also pass Node/browser checks. Real actors/derived items/whole-game/save integration remain pending.

## Actual verification

`npm ci --ignore-scripts`, then `npm run check && npm run test:e2e` in app.

- 8 unchanged reference files; 5 integrity tests; strict types; 110 domain tests; production build; 4 actual Chromium tests passed after U03d.
- 20 seeds × 1000 draws/states; 1024 exhaustive small-map/start cases; real wrong-boundary candidate-source mutation rejected.
- 4 seeds × 16 viewer floor trajectories compare full state/identity graphs and every draw; six ordered renderer traces; every one of 16 real canvas PNGs exactly equals untouched source viewer.
- Status has 340 isolated trajectories with explicitly matched actor/item/UI doubles, not gameplay parity. Item constructors/equipment/slots/maps/timers/stacking/destruction and door short-circuit behavior match exact source contracts. Defense base + all 12 direct defensive subclasses pass 31 tests / 695 isolated trajectories with explicit doubles; concrete game interactions are pending.
- Reproducible npm-hosted Chromium/libs, no forbidden CDN/apt download; preview binds 0.0.0.0 and accepts .e2b.app.
- Getter/proxy-safe graph diagnostics and shared-codec/nested-oracle changes are included in the full 110-test/4-browser run. The original NPC example is unsigned version 1532; signing it is not save cross-load or authentication proof.

## Protocol and review boundaries

Current-turn offline fingerprint: `.context/fingerprints/20261008T080439Z-cbb0a01f/report.json`, `family_only`, `identified_candidate=null`, complete ambiguity accepted, `CONTINUE`; exact raw/manifest/report/bank preserved. Statistical evidence, not identity certification or owner approval. Shared rules/workflows/policy and TASK.md unchanged.

Main-game generation/combat/derived entities/inventory/UI/editor, save cross-load/custom NPC, full level manager/workshop/socket, Firefox/WebKit and live integrations are not complete/verified. UI proposals in `docs/task-10/DEVIATIONS.md` require review; no self-approved scope reduction. Source quirks are preserved, not quietly fixed.

Evidence/coverage: `docs/task-10/VERIFICATION.md`, `FEATURE-MATRIX.md`, `PLAN.md`. Handoff: `.context/STATE.md`; environment/recovery: `.context/ENVIRONMENT.md`, `.context/RESOURCES.md`, `app/README.md`. Keep Draft. No merge or auto-merge requested.
