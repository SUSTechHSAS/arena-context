# Current handoff

- Task: #10
- Unit: Successor of PR #19 — primary world-kernel lane
- Work branch / PR: arena/e4cc53a2-arena-context / https://github.com/SUSTechHSAS/arena-context/pull/27 (successor of PR #19, whose head stays at 9539c29)
- Accepted base at unit start: task/10/main@45f8811ce9c7ec910ff6346d7c6b489fb1cf8f5e
- Inherited candidate at unit start: 9539c29c65b763d95613265c20b570a4394c2c4c (fast-forwarded from PR #19; unreviewed)
- Updated: 2026-10-10
- Fingerprint: .context/fingerprints/20261010T052904Z-330f7ea6/report.json
- Model role: primary
- Work packet: none; primary lane outside all packet paths (see DECISIONS 2026-10-10)
- Primary review: not applicable; no secondary run exists yet in this history
- Candidate stage: in progress; Draft

Only Kibiandkimi decides acceptance; this card is not approval.

## Current objective

Modern rewrite of chinese-dungeon with source-consistency tests (TASK.md). The 114-packet pool from PR #19 remains for secondaries (73 available, 41 dependency-blocked). This primary session builds the non-packet main-game world kernel under `app/src/game/world/` that integration will need.

## Candidate progress

This session:

1. Took over PR #19 on successor branch `arena/e4cc53a2-arena-context`; fast-forward only, all inherited files preserved.
2. World kernel unit 1: `world/constants.ts` (cell/env/colour/effect tables, weather list, versions, DEFAULT_* tunables) and `world/cell.ts` (`单元格` data contract + `获取物品颜色`). Tests: `app/test/world-kernel.test.ts`.
3. World kernel unit 2: `world/state.ts` — `createWorldState()` holds 98 source-named gameplay/persisted globals with fresh containers per session, plus default settings, player-attribute, custom-setting and room-map factories. DOM/input/timer/sound/camera globals are excluded by design (listed in the file header). Tests: `app/test/world-state.test.ts`. Unit 3 added `NPC互动中`/`当前NPC`, bringing it to 100 keys.
4. World kernel unit 3: `world/reset.ts` — `resetAllGameState(state, ports)` ports the source `重置所有游戏状态`, with UI effects behind `ResetPorts` and statement order preserved. Source quirks are preserved and logged as SRC-01/SRC-02 in `docs/task-10/DEVIATIONS.md`. Tests: `app/test/world-reset.test.ts`.
5. World kernel unit 4: `world/lighting.ts` — sight range, `是否在光源范围内`, `更新光源地图` (filled in place) and `获取视野内房间ID`. Line of sight, the torch type and the canvas size come in through `LightingPorts`, since those belong to the path-search and torch packets and the render layer. SRC-03 is preserved. Tests: `app/test/world-lighting.test.ts`.
6. World kernel unit 5: `world/helpers.ts` — source `isObject`/`deepClone` with quirks preserved (Map keys shared, trailing holes shorten, prototypes dropped, functions passed through), `获取墙壁字符` and the `createGrid` idiom. Tests: `app/test/world-helpers.test.ts`.
7. World kernel unit 6: `world/placement.ts` — `位置是否可用`, `寻找可放置位置`, `放置物品到单元格`, `放置物品到房间`, with ports for prng, draw, cell effect, log and item-class checks. Tests: `app/test/world-placement.test.ts`. DEVIATIONS SRC-04 (room/cell placement asymmetry, preserved).
8. World kernel unit 7: `world/targeting.ts` — `获取周围怪物` and `检查直线移动可行性`, with path-search/movement collaborators as ports. Tests: `app/test/world-targeting.test.ts`.
9. World kernel unit 8: `world/placement.ts` also ports `放置怪物到单元格`, `放置巨人`, `放置怪物到房间` and `清空房间内容`. Tests: `app/test/world-monster-placement.test.ts`. DEVIATIONS SRC-05.
10. World kernel unit 9: `world/generation.ts` — `生成钥匙` (key class and room placement as ports) and the cave helper `放置地牢出入口`. Tests: `app/test/world-generation.test.ts`.
11. World kernel unit 10: `world/cave.ts` — `使用评分图放置物品`, `生成路障`, `生成并放置洞穴配方卷轴`, with a source-shaped `CaveCatalog` (packet-owned classes) and path/fusion ports. Tests: `app/test/world-cave.test.ts`. DEVIATIONS SRC-06.
12. World kernel unit 11: `world/features.ts` — `生成时间随机数` (clock port), `生成水怪`, `生成毒气陷阱群`, `揭示并激活陷阱群`, `创建楼梯实例`. Tests: `app/test/world-features.test.ts`.
13. World kernel unit 12: `world/cave-dungeon.ts` — the async `生成洞穴地牢` orchestrator. Pure helpers are called directly; the cave kernel, fallback, placement, weather, walls, viewport and UI are ports. Tests: `app/test/world-cave-dungeon.test.ts`. FEATURE-MATRIX row updated.

## Verification

- Full `npm run check` at 8a88707: 8 reference hashes, 5 integrity tests, strict types, 14 files / 243 tests, build all passed. Remote `arena/protocol` had failed because the STATE heading lacked the exact `## Candidate progress`; fixed in this checkpoint.

- Inherited baseline rerun at 9539c29: `npm run check` passed (8 reference hashes, 5 integrity tests, strict types, 110 tests, build).
- Unit 1: 23 new tests pass; each of 20 declarations is graph-equal to the exact source AST declaration; the cell is graph-equal for 5 coordinate cases and colour lookup over 460 cases. Manual mutants (`||`→`??` fallback, swapped property order) both failed the suite; originals restored. `tsc --noEmit` clean.
- Unit 2: 101 new tests pass; each of 98 keys is graph-equal to the value from evaluating its exact source declaration (WeakMaps checked by brand); `createRoomMap` matches the source initializer for 8 sizes, including RangeError cases; containers are unshared. Mutants (`剔除死胡同` drift, Set→Map) were detected; originals restored. `tsc --noEmit` clean.
- Unit 4: across 120 seeded worlds, results match the four source functions with stubbed collaborators: sight range, room-ID Set order, light-map insertion order, about 10k lit checks, and the exact sequence of line-of-sight and canvas calls. A non-vacuity guard checks for >40 nights, >500 lit cells and >8000 checks. Three mutants (the x = 0 quirk, canvas-query order, the range boundary) were detected; originals restored.
- Unit 12: 120 seeds match the source in state rebuild (including position-object identity and a fresh `所有怪物`), call and prng order, the fallback path with `await`, coin draws (x and y taken from different points), shared trap-room identity and the density lookup. Nine mutants detected after stubs were made to log the state visible at call time.
- Unit 11: 200 seeded worlds composed with the ported placement functions match the source (constructor options, prng/clock/notify/floor-change order, grid, monsters, timers, stair objects, `颜色表` identity). Eight mutants detected. The two survivors are equivalent and show unreachable source code (trap-size threshold, arm-length re-roll).
- Unit 10: 150 seeded worlds (20% at cave scale, 60–110) composed with the ported placement functions match the source: constructor calls and options, prng order, grid, monsters, timers and score maps. Twelve mutants detected. One survivor is unobservable: `状态` on a monster whose placement failed, because that monster is unreachable.
- Unit 9: 300 seeded room lists and 400 score maps match the source (calls, graphs, aliasing, throws). Five mutants detected; `best = 0` for the exit search is equivalent (the entry always ends at score 0). Test prng seeds are now scrambled and warmed up in the placement and generation tests, because a near-zero first draw had hidden the clearing-window mutant.
- Unit 8: 200 seeded worlds × 40 ops (giants, invalid rooms, out-of-bounds throws, duplicate timers) match the source in returns, prng/draw/console order, final grid, `所有怪物` (including replacement identity) and timers. Eight mutants detected; originals restored.
- Unit 7: 250 seeded worlds (sparse and dense, ranges up to 7, counts up to 40) match the source in results, path arrays (shifted) and collaborator call order. Nine mutants were detected (scan order, charm, weather threshold `> 3`, shift, diagonal, skeleton, stack, count, the `-1` tie branch). Two survivors are equivalent under V8: `> 1` (identical for range ≤ 2), and `return 1`→`0` for a later low-priority element, because V8 always calls the comparator as (later, earlier). The comparator is kept verbatim.
- Unit 6: 200 seeded worlds × 60 random calls; returns, prng/draw/fx/log order and the final grid/timer/portal/item graphs match the source, with tallies over 5 for every branch (including thrown errors). Seven mutants (pets, direction order, rust threshold, lava, glow rule, room-timer, blocker) were detected; originals restored.
- Unit 5: 23 tricky deep-clone inputs (cycles, shared aliases, holes, Map/Set, null prototype, own getters, symbol/non-enumerable/inherited keys, class instances, primitives incl. -0/NaN/bigint) are graph-equal per case and as one graph; Map-key, function and Date rules are checked in both realms. Wall glyphs match the source for every cell of 300 seeded grids, with both explicit and default grid arguments, and all 12 glyphs occur. `createGrid` matches the exact source statement for 4 sizes. Four mutants (cloned Map keys, preserved hole length, swapped glyph, boundary) were detected; originals restored.
- Unit 3: the source function runs in a VM with the exact declarations, against the same dirty-world script executed in both realms, across 4 variants (developer mode off/on/throwing, empty scroll set). The final state, the combined cross-key alias graph, the WeakMap identity rules and the ordered side-effect log all match. Four mutants of the real implementation (statement order, aliasing, settings shape, old-attribute write) each failed 4/5 tests; originals restored.

## Blockers and unresolved owner feedback

No owner comments on PR #19 or #27 at takeover. Full game, UI, saves and services remain unfinished. Draft.

## Next action

Continue the lane with the next uncovered world logic (next: survey the remaining unassigned orchestrators, e.g. 生成特殊房间 / 刷新房间内容 / 处理单向房间, and pick the next slice), checking packet anchors first. RNG wiring belongs to the `t10-seed-search` packet (`初始化随机数生成器`) and is left there.
