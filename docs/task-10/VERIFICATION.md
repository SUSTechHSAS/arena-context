# Task #10 verification ledger

This records actual local commands, not owner acceptance. Reference pin: `8d80b5a4dd3d737ed6d3060f05611eaa3de611ab`. The original 2026-10-08 fingerprint is preserved at `.context/fingerprints/20261008T080439Z-cbb0a01f/report.json`. The migration turn uses `.context/fingerprints/20261009T045933Z-88646267/report.json` (`reference_ambiguity`, `CONTINUE / primary`).

## World kernel (primary lane, PR #27) — 2026-10-10

Each unit ports unassigned main-page functions into `app/src/game/world/` and compares them with the exact source declarations, evaluated in a VM. Both realms run the same seeded world script, and packet-owned collaborators are injected as logged ports. Mutants were applied by hand and the originals restored. Preserved source quirks are DEVIATIONS SRC-01…SRC-13.

- **Unit 1** — `world/constants.ts` (cell/env/colour/effect tables, weather list, versions, DEFAULT_* tunables) and `world/cell.ts` (`单元格` data contract + `获取物品颜色`). Tests: `app/test/world-kernel.test.ts`.
  - Evidence: 23 new tests pass; each of 20 declarations is graph-equal to the exact source AST declaration; the cell is graph-equal for 5 coordinate cases and colour lookup over 460 cases. Manual mutants (`||`→`??` fallback, swapped property order) both failed the suite; originals restored. `tsc --noEmit` clean.
- **Unit 2** — `world/state.ts` — `createWorldState()` holds 98 source-named gameplay/persisted globals with fresh containers per session, plus default settings, player-attribute, custom-setting and room-map factories. DOM/input/timer/sound/camera globals are excluded by design (listed in the file header). Tests: `app/test/world-state.test.ts`. Unit 3 added `NPC互动中`/`当前NPC`, bringing it to 100 keys.
  - Evidence: 101 new tests pass; each of 98 keys is graph-equal to the value from evaluating its exact source declaration (WeakMaps checked by brand); `createRoomMap` matches the source initializer for 8 sizes, including RangeError cases; containers are unshared. Mutants (`剔除死胡同` drift, Set→Map) were detected; originals restored. `tsc --noEmit` clean.
- **Unit 3** — `world/reset.ts` — `resetAllGameState(state, ports)` ports the source `重置所有游戏状态`, with UI effects behind `ResetPorts` and statement order preserved. Source quirks are preserved and logged as SRC-01/SRC-02 in `docs/task-10/DEVIATIONS.md`. Tests: `app/test/world-reset.test.ts`.
  - Evidence: the source function runs in a VM with the exact declarations, against the same dirty-world script executed in both realms, across 4 variants (developer mode off/on/throwing, empty scroll set). The final state, the combined cross-key alias graph, the WeakMap identity rules and the ordered side-effect log all match. Four mutants of the real implementation (statement order, aliasing, settings shape, old-attribute write) each failed 4/5 tests; originals restored.
- **Unit 4** — `world/lighting.ts` — sight range, `是否在光源范围内`, `更新光源地图` (filled in place) and `获取视野内房间ID`. Line of sight, the torch type and the canvas size come in through `LightingPorts`, since those belong to the path-search and torch packets and the render layer. SRC-03 is preserved. Tests: `app/test/world-lighting.test.ts`.
  - Evidence: across 120 seeded worlds, results match the four source functions with stubbed collaborators: sight range, room-ID Set order, light-map insertion order, about 10k lit checks, and the exact sequence of line-of-sight and canvas calls. A non-vacuity guard checks for >40 nights, >500 lit cells and >8000 checks. Three mutants (the x = 0 quirk, canvas-query order, the range boundary) were detected; originals restored.
- **Unit 5** — `world/helpers.ts` — source `isObject`/`deepClone` with quirks preserved (Map keys shared, trailing holes shorten, prototypes dropped, functions passed through), `获取墙壁字符` and the `createGrid` idiom. Tests: `app/test/world-helpers.test.ts`.
  - Evidence: 23 tricky deep-clone inputs (cycles, shared aliases, holes, Map/Set, null prototype, own getters, symbol/non-enumerable/inherited keys, class instances, primitives incl. -0/NaN/bigint) are graph-equal per case and as one graph; Map-key, function and Date rules are checked in both realms. Wall glyphs match the source for every cell of 300 seeded grids, with both explicit and default grid arguments, and all 12 glyphs occur. `createGrid` matches the exact source statement for 4 sizes. Four mutants (cloned Map keys, preserved hole length, swapped glyph, boundary) were detected; originals restored.
- **Unit 6** — `world/placement.ts` — `位置是否可用`, `寻找可放置位置`, `放置物品到单元格`, `放置物品到房间`, with ports for prng, draw, cell effect, log and item-class checks. Tests: `app/test/world-placement.test.ts`. DEVIATIONS SRC-04 (room/cell placement asymmetry, preserved).
  - Evidence: 200 seeded worlds × 60 random calls; returns, prng/draw/fx/log order and the final grid/timer/portal/item graphs match the source, with tallies over 5 for every branch (including thrown errors). Seven mutants (pets, direction order, rust threshold, lava, glow rule, room-timer, blocker) were detected; originals restored.
- **Unit 7** — `world/targeting.ts` — `获取周围怪物` and `检查直线移动可行性`, with path-search/movement collaborators as ports. Tests: `app/test/world-targeting.test.ts`.
  - Evidence: 250 seeded worlds (sparse and dense, ranges up to 7, counts up to 40) match the source in results, path arrays (shifted) and collaborator call order. Nine mutants were detected (scan order, charm, weather threshold `> 3`, shift, diagonal, skeleton, stack, count, the `-1` tie branch). Two survivors are equivalent under V8: `> 1` (identical for range ≤ 2), and `return 1`→`0` for a later low-priority element, because V8 always calls the comparator as (later, earlier). The comparator is kept verbatim.
- **Unit 8** — `world/placement.ts` also ports `放置怪物到单元格`, `放置巨人`, `放置怪物到房间` and `清空房间内容`. Tests: `app/test/world-monster-placement.test.ts`. DEVIATIONS SRC-05.
  - Evidence: 200 seeded worlds × 40 ops (giants, invalid rooms, out-of-bounds throws, duplicate timers) match the source in returns, prng/draw/console order, final grid, `所有怪物` (including replacement identity) and timers. Eight mutants detected; originals restored.
- **Unit 9** — `world/generation.ts` — `生成钥匙` (key class and room placement as ports) and the cave helper `放置地牢出入口`. Tests: `app/test/world-generation.test.ts`.
  - Evidence: 300 seeded room lists and 400 score maps match the source (calls, graphs, aliasing, throws). Five mutants detected; `best = 0` for the exit search is equivalent (the entry always ends at score 0). Test prng seeds are now scrambled and warmed up in the placement and generation tests, because a near-zero first draw had hidden the clearing-window mutant.
- **Unit 10** — `world/cave.ts` — `使用评分图放置物品`, `生成路障`, `生成并放置洞穴配方卷轴`, with a source-shaped `CaveCatalog` (packet-owned classes) and path/fusion ports. Tests: `app/test/world-cave.test.ts`. DEVIATIONS SRC-06.
  - Evidence: 150 seeded worlds (20% at cave scale, 60–110) composed with the ported placement functions match the source: constructor calls and options, prng order, grid, monsters, timers and score maps. Twelve mutants detected. One survivor is unobservable: `状态` on a monster whose placement failed, because that monster is unreachable.
- **Unit 11** — `world/features.ts` — `生成时间随机数` (clock port), `生成水怪`, `生成毒气陷阱群`, `揭示并激活陷阱群`, `创建楼梯实例`. Tests: `app/test/world-features.test.ts`.
  - Evidence: 200 seeded worlds composed with the ported placement functions match the source (constructor options, prng/clock/notify/floor-change order, grid, monsters, timers, stair objects, `颜色表` identity). Eight mutants detected. The two survivors are equivalent and show unreachable source code (trap-size threshold, arm-length re-roll).
- **Unit 12** — `world/cave-dungeon.ts` — the async `生成洞穴地牢` orchestrator. Pure helpers are called directly; the cave kernel, fallback, placement, weather, walls, viewport and UI are ports. Tests: `app/test/world-cave-dungeon.test.ts`. FEATURE-MATRIX row updated.
  - Evidence: 120 seeds match the source in state rebuild (including position-object identity and a fresh `所有怪物`), call and prng order, the fallback path with `await`, coin draws (x and y taken from different points), shared trap-room identity and the density lookup. Nine mutants detected after stubs were made to log the state visible at call time.
- **Unit 13** — `world/room-content.ts` — `生成陷阱` and `刷新房间内容`. Tests: `app/test/world-room-content.test.ts`. DEVIATIONS SRC-07.
  - Evidence: 200 seeded worlds match the source (random-comparator shuffle, density lookup, locked-room empowerment, key/stair skip, timer, inventory and status cleanup, weighted respawn, coin/item fallback). Nine mutants detected; `<=`→`<` on a continuous roll is equivalent.
- **Unit 14** — `world/special-rooms.ts` — `连接特殊房间`, `尝试进入特殊房间`, `处理单向房间`. Tests: `app/test/world-special-rooms.test.ts`. DEVIATIONS SRC-08.
  - Evidence: 300 seeded worlds match the source (nearest-room ties, loose id matching, ring consumption, multiplayer guard, entrance reopening, first-entry door choice, pair handling, throws). Nine mutants detected; the `oldX !== undefined` guard is equivalent for in-range targets.
- **Unit 15** — `world/drops.ts`: `克隆物品`, `怪物放置物品`, `玩家放置物品`. Tests: `app/test/world-drops.test.ts`.
  - Evidence: 300 seeded worlds match the source, including originals kept in the graph so Map aliasing is observable. Eight mutants detected.
- **Unit 16** — `world/item-generation.ts`: `物品生成配置` (graph-equal to the source declaration), `生成物品`, `检查防化服防护`. Tests: `app/test/world-item-generation.test.ts`.
  - Evidence: 300 seeded worlds match the source (locked multi-roll, clamp, depth weight, early room return, half-weight endpoints, empty room arrays, placement-failure diagnostics, suit durability, unbreakable suits, page slots, pet slot break). Thirteen mutants detected. DEVIATIONS SRC-09.
- **Unit 17** — `world/special-rooms.ts`: `生成特殊房间` (async orchestrator). Geometry, weighted pick and theme generators are ports. Tests: `app/test/world-special-room-generation.test.ts`.
  - Evidence: 400 seeded worlds match the source (theme drawn once, square 7–9 sizes, negative ranges on small maps, exhausted 100 attempts, id-then-sort with duplicate ids, unknown themes, sokoban push, rejection when a generator throws, thenable return). Nine mutants detected, including making the function synchronous.
- **Unit 18** — `world/monster-generation.ts`: `生成怪物`, plus the constant `最大怪物数` (declaration-checked in `world-kernel.test.ts`). The patrol class and icon table come from a catalog port. Tests: `app/test/world-monster-generation.test.ts`.
  - Evidence: 250 seeded worlds match the source, covering:
    - schedule dedupe by class name, with string keys skipped
    - room 0 skip, dark-room minimum, `<=` weight pick, NaN weights reaching a null-pick TypeError, out-of-bounds rooms
    - level/elite roll order, potions, maze patrol density
    - crowded corridors, splice
    - the implicit `生成成功` flag
  - Mutation: 16 mutants run, 15 detected; the 16th was an intentional no-op control and passed as expected. DEVIATIONS SRC-10.
- **Unit 19** — `world/theme-rooms.ts`: `生成罐子房间内容`, `生成植物房间内容`, `生成药水房内容`, `生成书库房间内容`. Packet classes come from a catalog. Tests: `app/test/world-theme-rooms.test.ts`.
  - Evidence: 300 seeded room sets match the source (negative coordinates, null weighted picks, sparse and empty potion pools, constructor-versus-prng order, every class reached). Eleven mutants run, nine detected; the two survivors are equivalent. `Math.abs` parity is equivalent because `-2 % 2 === -0 === 0` and odd sums stay non-zero. Inlining the stack count keeps the same evaluation order.
- **Unit 20** — `world/theme-rooms.ts`: `生成推箱子谜题` (async). Solver, walls, box/target classes, the sift flag and notices are ports. Tests: `app/test/world-sokoban-room.test.ts`.
  - Evidence: 400 seeded runs match the source:
    - null/absent rooms, small rooms, editor and sift fallbacks
    - generator constructor throws (rejects) versus solver throws, rejections, sync results, `成功` falsy or missing level (fallback)
    - short boards (TypeError caught), off-grid carving, wall count at `生成墙壁`, target-before-box order, placement throws inside the try, room mutation before clearing failures
  - Mutation: 13 mutants run, 12 detected; the 13th was a no-op control and passed as expected.
- **Unit 21** — `world/puzzle-board.ts`: `生成解谜棋盘`. Time-budgeted restart beam search; the clock, piece classes and the packet-owned `可以放置` / `计算新增威胁格子数` are ports. Tests: `app/test/world-puzzle-board.test.ts`.
  - Evidence: 250 seeded runs with a deterministic stepping clock (steps 0.05–20) match the source:
    - every prng draw, the clock-call count, timeouts versus completed searches
    - the board digest passed to the solver, and the `__权重` descriptor flags and value
    - best-board copies, empty or zero-area rooms, `棋子数量` order
  - Mutation: 15 mutants run, 14 detected; the 15th was invalid because it referenced an undefined variable. The area-64 beam boundary needed a boundary room and a fine clock step before it was detected.
- **Unit 22** — `world/turn.ts`: `处理回合逻辑`, `玩家等待`, `开始休息`, `停止休息`. Rest timer and interval live in a `RestSession` with timer ports; DOM bars go through `renderVitalBars`. Tests: `app/test/world-turn.test.ts`.
  - Evidence: 300 seeded sessions (14 ops each, including firing queued rest ticks) match the source:
    - guards (online, movement lock, grid-size mismatch), turn counter visible to the victory display, loose pet-floor equality
    - energy/health defaults, `|| 100`, energy roll below 70 and drain, light refresh at night or in dark rooms
    - monster-turn skip, floor-5 top-up, survival stele search with nested break, equipped and active pet healing
    - challenge-wave filtering and timers, bar widths and warning classes
    - rest denial reasons, the tick/timer order, the stop-rest guard
  - Mutation: 18 mutants run, 16 detected; the 2 survivors are equivalent controls. DEVIATIONS SRC-11.
- **Unit 23** — `world/landing.ts`: `处理玩家着陆效果`, `更新洞穴视野`. Class checks, DOM lookups, auto-move and tutorial flags are ports. Tests: `app/test/world-landing.test.ts`.
  - Evidence: 400 seeded sessions match the source:
    - terrain: lava resistance/shoes, water soaking (scrolls, wood, torches, silence, timers), rust/destroy, fire quench, blood-water percentage heal
    - dialogue and challenges: forced-dialogue NPC break, challenge exit failure
    - items: sign and hidden-item order, pickup with dropped flag
    - floors: tutorial staircase (array identity, monster cleanup), stairs `使用`, floor arguments, warp gates
    - rooms: one-way hand-off, room entry energy, challenge start, tutorial hint; cave vision radius and the editor guard; throwing old coordinates
  - Mutation: 21 mutants detected after the stubs were made to expose array identity and sign state. DEVIATIONS SRC-12.
- **Unit 24** — `world/floor-switch.ts`: `切换楼层` (async). Timers, socket, DOM, generators and class checks are ports; `deepClone` is `world/helpers.ts`. Tests: `app/test/world-floor-switch.test.ts`.
  - Evidence: 400 seeded sessions (3 switches each, timers fired manually) match the source:
    - online paths, title texts, locator-map consumption, mercenary carry/expiry including the old minion array
    - floor save/restore, the full-respawn and null-floor portal reset, target placement
    - boss/final/sunken floors, prng burn, weather schedules, awaited `生成地牢`, blink pets, the completion callback, level-up gating, the 500 ms mercenary re-entry
    - settle outcomes `ok` / `rejected` / `pending`
  - Mutation: 24 mutants run, 22 detected; the 2 survivors are equivalent (the unused snapshot clone; optional-call on a non-function callback). DEVIATIONS SRC-13.
- **Unit 25** — `world/respawn.ts`: `处理重生(保留物品)`. Phantom-room refresh, challenge failure/restore, socket, buffs, position checks, path search, floor switch, tutorial entry, DOM mask and UI refreshes are ports; class checks (`挑战石碑`, `王座守护者`) are injected. Tests: `app/test/world-respawn.test.ts`.
  - Evidence: 400 seeded sessions (3 deaths each) match the source:
    - editor/victory/codex guards, challenge failure by array index, `typeof socket` + `connected` short-circuit, survival-stele reward and room flag reset
    - death record, HP/energy reset, status removal, scroll unequip during `forEach`, buff application order (state logged at call time)
    - cave/maze random respawn (checkpoint, revealed cells, visited rooms), floor-5 corridor search, floor-15 room search incl. the 50-rejection fallback, weapon cooldown reset
    - full reset path (`切换楼层(0, true, …)` with callback, tutorial entry), off-grid throws
  - Mutation: 33 mutants run, 31 detected (removing the floor-15 `i++` hangs the worker); the 2 survivors are equivalent (the editor `return` is repeated by the next guard; `房间列表[-1]` is undefined). DEVIATIONS SRC-14.
- **Unit 26** — `world/move.ts`: `移动玩家(dx, dy, 冷却, 剩余步数)` (async). Camera/animation/hook/auto-move globals live in a `MoveSession`; movement checks, landing, digging energy, Sokoban completion, sound, events, distance map, special-room entry, turn processing, item placement/drop and rendering are ports; class checks (`栅栏`, `推箱子箱子`, `压感开关`, `推箱子目标`, `折跃门`, `寻宝戒指`) and the debug item class list are injected. Tests: `app/test/world-move.test.ts`.
  - Evidence: 500 seeded sessions (2 setups × 4 moves, fake clock) match the source:
    - editor camera moves, state/cooldown gating, online emit, fences, stun random direction, ice/blood-ice slides, bounds
    - hook cancel, wall digging (energy ok/short, survival challenge), one-way doors, Sokoban pushes onto plates/targets/floor with covered items
    - landing interrupts, scroll energy, animation state, distance map, warp gates, move history and the debug sequence reward, treasure rings on the current equipment page
    - phantom weather refresh, auto-move cancel, cursed random drop, rejected moves, history array identity
  - Mutation: 64 mutants run, 61 detected; the 3 survivors are equivalent (both `缓慢` sign normalisations, see SRC-15; `targetX - 玩家.x` equals `Math.sign(dx)`).
- **Unit 27** — `world/interact.ts`: `尝试互动()`. Editor UI state lives in an `InteractSession`; DOM, socket, energy, landing, pickup, events, item destruction, line checks, nearby-monster search and burst attacks are ports; class checks (`陷阱基类`, `隐形毒气陷阱`, `祭坛类`, `充能魔杖`, `金币手枪`, `宠物`) and the seed class pool are injected. Tests: `app/test/world-interact.test.ts`.
  - Evidence: 600 seeded sessions (2 setups × 3 interactions) match the source:
    - death/online/auto-move guards, editor teleport toggle with DOM writes and missing elements
    - hidden-trap search (energy ok/short), water search and underground-river teleport, grass seed search with full backpack refund
    - pickups, chess pieces, NPCs, `尝试互动` hooks, placed pets (`==` floor match), strength-trial altars, locked doors with keys and paired cells, line-checked neighbours
    - weapon attacks with dead-target refiltering, burst enchantments, pet follow-up attacks, the always-run monster search, off-grid sizes, missing player cells
  - Mutation: 67 mutants run, all detected. DEVIATIONS SRC-16.
- **Unit 28** — `world/dungeon.ts`: `生成地牢(编辑器模式)` (async) and `生成寻宝戒指()`. Every callee (room placement and connection, corridors, special rooms, walls, locks/keys, barricades, coins, items, red-blue puzzles, distance maps, monsters, recipe scrolls, environment, water monsters, traps, stairs, waiting UI, console) is a port; the grid and room map use `createGrid` / `createRoomMap`. Tests: `app/test/world-dungeon.test.ts`.
  - Evidence: 300 seeded sessions (two generations each without reset, async sokoban tasks) match the source:
    - cave/maze dispatch, room-chain geometry in all four directions, clamping, room kinds and challenge state, string-sorted pair keys, extra corridors
    - placement failures (blocked 300-call bursts) and the stale-room `回溯` path, special rooms with treasure rings, locked rooms, red-blue puzzles on floors 7/11, starter sword on floor 0
    - farthest-room stairs with `undefined`/`Infinity` distances and locked rooms, the random fallback, up stairs, patrol initialisation, the single-room throw, direct ring generation with empty/no-`房间` pools
  - Mutation: 59 mutants run, 57 detected; the 2 survivors are equivalent (`return` vs `return await` on the cave branch; a room pair cannot repeat within one call, so the `已连接房间对` guard is never false). DEVIATIONS SRC-17.
- **Unit 29** — `world/dungeon-support.ts`: `计算距离图`, `处理上锁的门`, `生成并放置随机配方卷轴`, `检查推箱子解谜完成`, `解谜成功_推箱子`. Recipe generation, scroll construction, item placement, rewards, notifications, drawing, console and `window[类名]` are ports; Sokoban class checks are injected. Tests: `app/test/world-dungeon-support.test.ts`.
  - Evidence: 500 seeded sessions (3 setups × 4 random operations on one mutable world) match the source:
    - BFS distances with wall flags, locked doors, `开关砖`, missing rows/cells, smaller logical sizes and off-grid starts (throws)
    - room locking with shared door ids, door instances, colour wrap past 6 locks, single-room and large lists, `null` rooms
    - recipe scroll counts for `null`/negative/string floors, failed placements and the no-room warning
    - Sokoban completion (covered/uncovered/target-free rooms, finished rooms, loose ids) and rewards (custom classes, missing classes, default reward)
  - Mutation: 49 mutants run, 47 detected; the 2 survivors are equivalent (BFS neighbour order does not change distances; `break` after the first uncovered target). DEVIATIONS SRC-18.
- **Unit 30** — `world/red-blue-puzzle.ts`: `生成红蓝开关谜题(距离图)`. Path tracing (`回溯路径`, `t10-path-primitives`), switch/brick construction, placement and console are ports. Tests: `app/test/world-red-blue-puzzle.test.ts`.
  - Evidence: 600 seeded sessions (3 grids × 3 calls) match the source: farthest-room choice with `Infinity`/missing distances, short and long traced paths, corridor candidates, the random-comparator shuffle, switch rooms off the path and nearer than the barrier, pre-existing switches, vertical/horizontal walls, failed brick placements, missing distance rows (throws).
  - Mutation: 29 mutants run, all detected. DEVIATIONS SRC-19.
- **Unit 31** — `world/chess-puzzle.ts`: `检查解谜是否成功(棋子数量)` and `解谜成功(房间)`. Rewards, notifications, drawing and `window[类名]` are ports; the `棋子` class check is injected and pieces keep their own `可攻击位置`. Tests: `app/test/world-chess-puzzle.test.ts`.
  - Evidence: 800 seeded sessions match the source: off-board players, rooms by array index with shuffled ids, non-board rooms, stacked pieces, piece counts (`0`, `undefined`, above/below present), attack-board contents and mutual attacks, custom/missing/default rewards.
  - Mutation: 20 mutants run, 19 detected; the survivor is equivalent (optional chaining on an off-grid room-map row still throws a `TypeError` one read later). DEVIATIONS SRC-20.
- **Unit 32** — `world/weather.ts`: `处理天气效果`, `生成天气效果`, `是否靠近火源`, `解冻药水` and `处理严寒效果` (the weather-terrain audit's core ranges). Thunderstorm/wind handlers, status effects, icons, logs, notifications and inventory refresh are ports; class checks are injected. Tests: `app/test/world-weather.test.ts`.
  - Evidence: 800 seeded sessions × 3 worlds × 5 random operations match the source, including the injected `prng` call sequence: weather off/on, every notification, water freezing over sparse/short grids, burning player or equipped torch (with and without `自定义数据`), equipment pages, fire items, dropped/held floor torches, burning monsters, off-grid targets, potion freezing/thawing.
  - Mutation: 31 mutants run, 30 detected; the survivor is equivalent (swapping the two side-effect-free conditions before the freeze roll). DEVIATIONS SRC-21.
- **Unit 33** — `processThunderstorm` in `world/weather.ts` (source `处理雷暴效果`). Cell effects, logs, item destruction, notifications, drawing, status effects, player damage, free-cell checks, fire creation/placement and `console.warn` are ports. Tests: `app/test/world-thunderstorm.test.ts`.
  - Evidence: 800 seeded sessions × 3 worlds × 8 turns match the source, including the injected `prng` sequence: copper/other gear on both equipment pages, corridor and room strikes, missing/thin rooms, off-map blocks, sparse grids, stairs, challenge steles, timers, carried items, empowered/plain monsters, the player, sleeping/unplaced/other-floor pets with string floors, fire placement failures, off-grid players.
  - Mutation: 37 mutants run, all detected. DEVIATIONS SRC-22.
- **Unit 34** — `world/environment.ts`: `全局生成环境` and `生成环境簇`. Shrub/fire construction and cell placement are ports. Tests: `app/test/world-environment.test.ts`.
  - Evidence: 600 seeded sessions × 3 worlds × 3 calls match the source, including the injected `prng` sequence: floors 0–4 (lava at ≥3), corridor/room/wall backgrounds, every environment plus `undefined`/`false`/`0`, room maps with -1/0/ids/`'0'`/`null`, numeric and string room ids, room types, sparse grids, items/monsters, direct cluster calls off the map, placement failures.
  - Mutation: 26 mutants run, all detected (the `!环境` vs `== null` and `!= 0` vs `!== 0` mutants needed falsy environments and string room ids). DEVIATIONS SRC-23.
- **Unit 35** — `world/hazards.ts`: `引燃烟雾网络`, `引爆烟雾网络` and `触发药水水域效果`. Fire/bomb/status construction, placement, damage, notifications, sounds, cell effects, item destruction, logs, equipment refresh and potion-class lookups are ports; class checks are injected. Tests: `app/test/world-hazards.test.ts`.
  - Evidence: 800 seeded sessions × 3 worlds × 6 operations match the source: smoke/smoke-bomb networks with shared ids, missing rows/cells (throws), map sizes smaller than the grid, monsters and the player on smoke, placement failures, null starts; pools hit by the player (equipment pages), pets with/without gear, other entities, fragile/indestructible/breaking suits, named/missing potion classes with all eight effect fallbacks and unknown effects, missing colours and non-pool cells.
  - Mutation: 41 mutants run, all detected (the pet check needed a non-pet entity with gear). DEVIATIONS SRC-24.
- **Unit 36** — `world/wind.ts`: `处理大风效果` and `尝试执行吹动` (the wind helper the weather audit calls). Canvas size, camera, cell size, line-of-movement checks, landing, logs, indicators, animations, the clock and `console.error` are ports; class checks are injected. Tests: `app/test/world-wind.test.ts`.
  - Evidence: 800 seeded sessions × 3 worlds × 4 wind turns plus direct `尝试执行吹动` calls with crafted plans and done-sets match the source, including the injected `prng` sequence: fractional cameras, canvas sizes, visited/unvisited rooms, walls/locked doors, sparse grids and missing rows (throws), immovable/unpickable/plain occupants, fire items, triggered poison-gas traps, chained pushes, sleeping monsters, monster hook failures, the player's blocked/unblocked moves.
  - Mutation: 48 mutants run, 47 detected; the survivor is equivalent (the player is never in the done-set before the final player move). Direct helper calls were added for guard mutants unreachable through the planner. DEVIATIONS SRC-25.
- **Unit 37** — `world/victory.ts`: `检查胜利条件` (creative-level victory gate). Notification and the victory screen are ports. Tests: `app/test/world-victory.test.ts`.
  - Evidence: 1500 seeded runs × 12 checks match the source: disabled/negative/string/missing limits, values exactly at each boundary, fractional damage and health formatting, negative health, all four failure messages combined.
  - Mutation: 14 mutants run, all detected (the minimum-health guard needed negative health). DEVIATIONS SRC-26.
- **Unit 38** — `world/easter-eggs.ts`: `检查Q字形彩蛋` and `触发Q字形彩蛋`, plus the `Q字形图案` constant (checked in `world-kernel.test.ts`). Timer, compass creation, collection, cell effects and notifications are ports. Tests: `app/test/world-easter-eggs.test.ts`.
  - Evidence: 1000 seeded sessions × 4 drops match the source: stamped Q patterns (clean, with unpickable `X` items or stray items in blanks) at several offsets, drops on every `X` and off-pattern/off-map, smaller maps, sparse grids, `undefined` items (throws), already-triggered flags, successful/failed/truthy pickups after the timer.
  - Mutation: 18 mutants run, all detected. DEVIATIONS SRC-27.
- **Unit 39** — `world/equipment-page.ts`: `切换装备页`. Online flag, socket emit, equipment refresh, the `.装备栏` element and the timer are ports. Tests: `app/test/world-equipment-page.test.ts`.
  - Evidence: 1500 seeded sessions × 6 switches match the source: online/offline, capacities 0–30, page limits, per-page sizes, out-of-range and string starting pages, directions ±1/2/-3/0/`'1'`/0.5, present/missing bar element, timers run or pending.
  - Mutation: 14 mutants run, 13 detected; the survivor is equivalent (lowering the inner page floor to -1 is undone by the outer `Math.max(0, …)`). DEVIATIONS SRC-28.
- **Unit 40** — `world/chess-debug.ts`: `调试_输出当前谜题答案`, `获取当前玩家棋盘房间`, `收集房间内棋子`, `收集背包棋子类`, `_打印棋盘方案到控制台` and `db`. `_求解棋盘布局`/`_棋子难度值` (packet `t10-chess-solver`), console, debug-tool creation and collection are ports; both realms use the same logged solver/difficulty stubs. Tests: `app/test/world-chess-debug.test.ts`.
  - Evidence: 1000 seeded sessions × 4 operations match the source, with internal helper calls logged: missing globals, off-grid players, null/undefined/-1 room-map values, rooms by id vs index with string/number id collisions, three room types, stacked/odd stack sizes, Map/object/wrapped/null/empty backpacks, limits (`undefined`, ∞, 0, 2.9, -1, NaN), solved/unsolved layouts, option combinations including `null` (throws), grid printing.
  - Mutation: 34 mutants run, 33 detected; the survivor is equivalent (dropping the early `break` when nothing remains still takes 0 per entry). DEVIATIONS SRC-29.
- **Unit 41** — `world/utils.ts`: `深度比较`, `获取方向中文`, `哈希字符串`, `种子伪随机数`, `获取爆炸颜色`, `净化HTML`, `生成签名` (WebCrypto SHA-256 with the `数据完整性密钥` constant, checked in `world-kernel.test.ts`), `寻找最近的房间` and `处理房间状态`. Tests: `app/test/world-utils.test.ts`.
  - Evidence: 600 seeded runs × 40 calls match the source: random nested values (NaN, -0, arrays vs objects, aliases, JSON copies, null-prototype and overridden `hasOwnProperty`), direction inputs, hash/signature texts (empty, unicode, HTML, non-strings), seeds (negative, ≥2³², fractional, strings, NaN), distances, rooms with gaps and ties, editor/non-editor room sync.
  - Mutation: 26 mutants run, 24 detected; the 2 survivors are equivalent (an empty-length guard that the loop already covers, and a pre-truncation that later bitwise operations repeat). DEVIATIONS SRC-30.
- **Unit 42** — `world/fusion-slots.ts`: `添加到融合区`, `从融合区移除`, `清空融合区` and `处理燃烧木质卷轴`. Socket, notifications, cloning, animation, DOM elements, `typeof gsap`, the timer, gold creation, collection, `检查融合配方` (packet `t10-fusion-engine-audit`) and display refreshes are ports. Tests: `app/test/world-fusion-slots.test.ts`.
  - Evidence: 1000 seeded sessions × 6 operations match the source: online/offline, gsap present/missing with/without command-line mode, 4- and 5-slot areas, gold stacks at 0/1/63/64, single/stacked/equipped items with display elements, full areas, out-of-range indices, failed collections, backpacks keyed by objects (reaching the clear-gold branch), wooden/iron scrolls in backpack and equipment.
  - Mutation: 35 mutants run, all detected (clone ids and the hidden flag needed slot objects in the snapshot). DEVIATIONS SRC-31.
- **Unit 43** — `world/fusion-recipes.ts`: `生成单个随机融合配方`, `是否为有效融合武器` and `是否为有效融合材料` (ranges of the audit-only packet `t10-fusion-engine-audit`), plus the `融合配方列表` constant (checked in `world-kernel.test.ts`). Tests: `app/test/world-fusion-recipes.test.ts`.
  - Evidence: 800 seeded sessions × 3 calls match the source, including the injected `prng` sequence and every temporary item construction (count and order): random item pools with excluded classes, abnormal items, duplicate display names, negative/zero/high minimum floors, config quality differing from instance quality, empty pools, floors -1/0/1/3/`'2'`, gold/key inputs, 3-input recipes, existing and hard-coded duplicates; class checks on every bucket/weapon/material kind, plain potions, `null` (throws) and a scroll whose `类型` getter throws.
  - Mutation: 29 mutants run, 24 detected; the 5 survivors are equivalent (3 branches unreachable behind the pool-size guard, in-place vs copied input sort, and `输出类名称 ||` on hard-coded recipes that have none).
- **Unit 44** — recorded upstream fixes under the owner rule of 2026-10-10 (`.context/DECISIONS.md`): SRC-03, SRC-11, SRC-18 (null rooms), SRC-20, SRC-24 (row guard), SRC-27 (undefined item), SRC-30 (`净化HTML`), SRC-31 (emit null check, out-of-range slot). `app/test/oracle/source-patches.ts` holds 10 literal patches. `declaration()` applies them to main-page top-level declarations, and `originalDeclaration()` returns the untouched text. The rewrite modules (lighting, turn, dungeon-support, chess-puzzle, hazards, easter-eggs, utils, fusion-slots) follow the patched source.
  - Evidence: `test/source-patches.test.ts` checks, for every patch, that each edit matches exactly once, that undoing the edits restores the exact source, that the result parses, and that a DEVIATIONS row marks it Fixed. The 8 existing differential suites pass against the patched oracle, and each also requires the unpatched source to differ on more than 5 seeds, so the random inputs reach every bug. Throw guards that only the old bugs produced were removed.
  - Mutation: 12 revert mutants (each restoring one source defect in the rewrite, plus a wrong quote entity), all detected.
  - Follow-up: SRC-01 patch on `重置所有游戏状态` (3 edits: reset settings in declaration shape) and `world/reset.ts`. `world-reset.test.ts` compares the rewrite and patched source with the evaluated `自定义全局设置` declaration over 4 dirty variants, and requires the unpatched source to differ. A revert mutant (`死亡次数限制` back under `玩家属性`) fails 5 tests.
  - Follow-up: SRC-22 patch on `处理雷暴效果` (room by id with index fallback) and `world/weather.ts`. `world-thunderstorm.test.ts` now gives rooms ids that differ from their indices (800 sessions) and requires the unpatched source to differ on more than 5 seeds. The index-only revert mutant is detected.
- **Unit 45** — `world/fusion-check.ts`: `检查融合配方` (fusion preview; listed only by the audit-only packet `t10-fusion-engine-audit`). Class checks, DOM, cloning, constructors, `window` lookup, `Date.now`, the timer, `执行融合`, the list-merge helpers and `计算融合Buff` (packet `t10-fusion-buff-engine`) are ports. `是否为有效融合武器/材料` use the unit-43 ports. Tests: `app/test/world-fusion-check.test.ts`.
  - Evidence: 1200 seeded sessions × 4 checks match the source: every DOM write (including the onclick setter observing `融合结果`), clone, construction config (identity included), preview symbol, click-through to `执行融合`, the final item graph, and throws. Every rule is reached more than 5 times: sharpen, lava, dilution, potion bucket, rust, potion bomb, glass/iron, enchant, gold extension, procedural/fixed recipes (with discovered-vs-fixed collisions and missing classes), equipment merge, buff fusion, wood conversion, no match, plus throws.
  - Mutation: 37 mutants, 35 detected. The 2 survivors are equivalent: the extension loop with `> 0` (a single counted entry cannot reach gold) and a removed `break` (the loop has no side effects once the flag is false). DEVIATIONS SRC-32.
- **Unit 46** — `world/fusion-exec.ts`: `执行融合` (fusion commit; listed only by the audit-only packet `t10-fusion-engine-audit`). Online emit, class checks, notifications, log, `扣除能量`, cloning, collection, destruction, the empty-bucket constructor, cell placement, `prng`, `Date.now`, `从融合区移除`, `合并Buff列表`, the fusion validity checks and the refresh calls are ports. Tests: `app/test/world-fusion-exec.test.ts`.
  - Evidence: 1200 seeded sessions × 4 commits match the source on every port call (with arguments), energy changes and refunds, slot and gold state, the result and recipe reset, created/cloned items and throws. Every recipe branch, including recipe objects, unknown/null recipes, missing inputs, online play and a missing preview, and each of 25 notification texts is reached more than 5 times.
  - Mutation: 48 mutants, 44 detected. The 4 survivors are equivalent: `.call(scroll, x)` vs `scroll.method(x)`; equipment-merge consumption order, since the failure path returns before cleanup; the `!金币` material guard, since gold is never a material; and the `gold > 0` guard, since slot 0 cannot be gold for a valid fusion base. DEVIATIONS SRC-33.
- **Unit 47** — `world/tutorial-nav.ts` (`获取上一个有效阶段`, `获取下一个有效阶段`; `获取教程文本` is a port of the audit-only packet `t10-tutorial-professions-audit`) and `world/wrench.ts` (`应用扳手规则`; `应用单个扳手规则` and `绘制` are ports of the audit-only packet `t10-editor-tools-audit`). Tests: `app/test/world-tutorial-wrench.test.ts`.
  - Evidence: 600 seeded runs × 12 rounds match the source, covering random known-stage sets, stages -1/0/0.5/2/2.5/2.4/3.7/6/7/`NaN`/`'2'`/`'3'`, rule lists null/empty/arrays/array-likes/strings, and targets with a name, a type, falsy values or `null`. Every result kind is reached, including throws.
  - Mutation: 12 mutants, 11 detected; the survivor (`Math.max(0, x)` vs `x < 0 ? 0 : x`) is equivalent for every value the loop can produce. DEVIATIONS SRC-34.
- **Unit 48** — `world/edge-indicator.ts`: `计算精确边缘位置` as a pure function of camera, cell size, canvas rect and player (the camera belongs to the audit-only area `t10-minimap-camera-audit`). Tests: `app/test/world-edge-indicator.test.ts`.
  - Evidence: 20 000 random cases match the source exactly (`Object.is` on both coordinates). They include zero/negative cell sizes, zero-size canvases, fractional rects and offsets, a monster on the player and `NaN` positions; more than 500 cases each give `null`, a point and in-view.
  - Mutation: 12 mutants, 7 detected. The 5 survivors are equivalent: `!length` vs `=== 0` (a `NaN` length ends in `null` either way); `min` on the right edge (left and right are exclusive); the `Infinity` sentinel vs `> 1e9`; and two boundary ties at exact corners, where the adjacent edge yields the same `t`. DEVIATIONS SRC-35.
- **Unit 49** — `world/editor-template.ts`: `generateDungeonTemplate` (the editor's floor-template generator). `保存编辑器状态` is a port of the packet `t10-editor-history`. The special-floor generators (audit `t10-special-floors-audit`), `生成地牢`, `重置所有游戏状态` and the editor UI refreshers are ports too. Tests: `app/test/world-editor-template.test.ts`.
  - Evidence: 400 seeded async runs × 6 sessions match the source (call order, final state, dungeon and rooms). They cover prompt cancel, invalid, negative, fractional and suffixed input, confirm refusal, floors 5/10/15 and generic floors, the awaited generator changing the floor, start-room id present or absent, all six special item classes, stairs with and without items, and `null` cells that throw.
  - Mutation: 21 mutants, all detected (after one stub was widened so the merchant's `Math.max` clamp is reachable). DEVIATIONS SRC-36.
- **Unit 50** — `world/path-overlay.ts`: `drawPath` (the dashed click-move path overlay) with canvas, camera, cell size, device pixel ratio and player as explicit inputs (the camera belongs to the audit-only area `t10-minimap-camera-audit`). Tests: `app/test/world-path-overlay.test.ts`.
  - Evidence: 3 000 random paths of length 0–6 drawn on a recording canvas produce the same sequence of method calls and property writes as the source; numbers are compared exactly, including `-0` and `NaN`. Inputs include tiny, huge and fractional coordinates, zero/negative cell sizes and a zero DPR; over 500 cases each draw and skip.
  - Mutation: 10 mutants, all detected (after the value ranges were widened so reassociating `+ 0.5` changes rounding). No source quirk recorded.

## Work-pool expansion — later primary turn, 2026-10-09

Current expansion fingerprint: `.context/fingerprints/20261009T091343Z-0e4cf368/report.json`, `reference_ambiguity / primary / CONTINUE`. Introduced 110 new definitions at `4cc1298712ebfffcdd2bd1beb9ce4c8e046bd596`, retaining the original four unchanged. All 110 official CLI create commands succeeded; 503 source anchors matched exact AST declarations, the dependency graph had no missing IDs/cycles, and all new/old packet task scopes were disjoint.

After commit/push and remote-head verification, `collaboration.mjs status` returned **114 packets: 73 available, 41 waiting for required primary dependency review, zero other blockers**. That checkpoint's [arena/protocol](https://github.com/SUSTechHSAS/arena-context/actions/runs/37916813252) passed. Status output, catalog, creation results and checksums are saved in [packet-pool/verification.json](packet-pool/verification.json).

The shared ItemCore action/timer/collection signatures now allow source numeric/empty results and action arguments; the existing bush collection annotation uses the same hook result. Runtime return values/state updates remain unchanged. At `0ec3698`, **8 source hashes, 5 integrity tests, strict types, 110 domain tests and the build passed**, and a separate compiler fixture accepted representative polymorphic subclasses. The initial check exposed the narrow bush annotation; it was corrected before the successful run. No extra browser run was needed for this type/interface change; the browser results below remain historical. New packets are assignments, not executed implementations or secondary approvals.

## Collaboration migration regression — 2026-10-09

At integration commit `a66127756132e0e9852bc6021519a0bbd828e075`, reran the inherited suites on Linux x64, Node v24.16.0 and npm 12.0.2: **72 protocol tests, 8 reference hashes, 5 integrity tests, strict types, 110 domain tests, production build and 4 real Chromium tests passed**. This includes equality of all 16 viewer canvas PNGs. `npm ci --ignore-scripts` used the unchanged dependency lock. No application, test, reference, or shared protocol changes were needed for this run.

Original outputs, exact commands, tested commit and SHA-256 values are saved in [migration-2026-10-09/verification.json](migration-2026-10-09/verification.json). See [MIGRATION.md](MIGRATION.md) for the accepted base, preservation checks and bounded packet handoff. No secondary packet has been executed or primary-reviewed by this migration; the full game remains incomplete.

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

## U01 initial validation — 2026-10-08

- `npm install --ignore-scripts --no-fund` in app: 66 packages installed, lockfile saved, audit reported zero vulnerabilities. No browser/CDN download from an unlisted host.
- First `npm run check`: eight reference hashes and five integrity tests passed; strict TypeScript passed; Vitest **29/30 passed**, one failed assertion, so build did not run.
- Failed assertion was in the test, not production: original hash(42) reads an absent .length and returns zero, rather than throwing. Verified against original AST body; test changed to compare non-string zero behavior and genuine positive-length/charCodeAt errors. The original/candidate source was not changed to satisfy an invented contract. Corrected rerun and Chromium validation are not yet claimed.

## U01 corrected checks — 2026-10-08

- `npm run check` in app passed: 8 source hashes, 5 integrity tests, strict TypeScript, **30 Vitest tests**, Vite production build.
- 20 seeds × 1000 exact draws plus states; 1024 exhaustive two-by-two map/start combinations; asymmetric walls, instanceof/subclasses, JS truthiness, Infinity and distance-100 tested.
- Actual TypeScript candidate text compiled with `> 99` changed to `>= 99` differs from the original oracle; unmodified implementation matches. This is primitive mutation coverage, not a gameplay trajectory.
- `npm run test:e2e` failed before page assertions: npm-hosted Chromium executable extracted successfully but libnspr4.so, libnss3.so and libnssutil3.so missing. The package also contains al2023.tar.br; investigate local library extraction. No browser pass claimed.

## U01 browser recovery — 2026-10-08

- Playwright config now explicitly inflates al2023.tar.br already inside the locked npm browser package and calls its library-path helper. No OS-package download or fabricated AWS environment.
- `npm run typecheck && npm run test:e2e`: strict types pass; **1 real Chromium test passes** (offline network intercept, honest incomplete-scope label, Unicode seed state replay, zero page errors). This is engine-lab browser coverage, not original gameplay coverage.
- Browser binary/dependencies are ephemeral and reproducible from package-lock; setup instructions recorded in app/README.md. Firefox/WebKit, other operating systems, live workshop/socket remain untested.

## U02a viewer engine — 2026-10-08

- Full original viewer algorithm independently ported to ViewerGenerator/ViewerCell/ViewerDoor and deterministic rendering modules. Main-game generation is still unported and is a distinct contract.
- Strict TypeScript passed. Targeted `npm test -- --testNamePattern="viewer|graph diagnostics"`: **8 tests passed**, 30 unrelated tests explicitly skipped, ~77 seconds.
- Four seeds × floors 0–15 compare outcomes (including any original exceptions), every random draw and identity-aware full state: cells, walls, rooms, room map, locks, door Map/Symbols/aliases, stairs and player start.
- Six exact ordered canvas-command comparisons (floors 0/1/15 × square/non-square), session reuse alias, empty renderer, diagnostic sparse holes/non-finite/accessor handling. No whole-game parity claimed.
- An earlier preparation command used an incorrect cwd and ran no viewer tests; corrected files to the intended paths, then actually ran the 8 tests above. That earlier empty/filtered run is not verification evidence.
- React viewer UI, complete-suite rerun, final build and original-vs-candidate real browser pixels remain pending.

## U02b first full checks — 2026-10-08

- `npm run check`: passed eight hashes, five integrity tests, strict types, **39 domain tests** and production build. Tagged graph equality optimization retained all explicit identity/non-finite/descriptor data and reduced viewer test time from ~75s to ~22s.
- First combined Chromium run: **2/3 passed** (engine lab, blank time seed/mobile/Enter); source/candidate PNG comparison timed out during page/context setup, before any comparison assertion. No PNG match claimed.
- Removed @sparticuz/chromium’s Lambda-specific --single-process flag for normal multi-context browser testing; rerun pending. No test scope/count/timeout was weakened.

## U02 complete browser verification — 2026-10-08

- `npm run test:e2e` after normal multi-process launch: **3/3 real Chromium tests pass**. One original page and one React candidate page render all 16 floors; every canvas toDataURL PNG is exactly equal, with deterministic time, trimmed generation seed, preserved raw input and zero page errors.
- Offline lab state replay passes; blank seed uses time and mobile/Enter flow generates 16 maps without horizontal overflow.
- Untouched original viewer served only in ORACLE_TEST_MODE=1 dev mode. Production source boundary test passes; build contains no original HTML/script/oracle imports.
- UI count correction/navigation/form/busy/error feedback proposals are recorded in DEVIATIONS.md; tests do not establish owner approval. The full main game remains pending.

## U03a isolated main-game status lifecycle — 2026-10-08

- Complete source 状态效果 class ported with explicit typed actor/item/UI/random/state ports, no DOM/global dependency. Prototype/class name mapping is explicit in diagnostics; source/private port data is not silently normalized.
- Strict types and **9 targeted tests passed**, 39 unrelated tests explicitly skipped. 324 effect-type/duration/remaining/actor trajectories + 12 stack/resistance sequences + 3 specific frozen/fire, permanent immunity and pet-corrosion sequences = **339 isolated trajectories**.
- Source class runs directly from its exact AST range; both implementations receive matching deterministic actor/item/UI doubles. Compare every event/state/alias/graph, non-finite/falsy durations, repeated expiry, constructor stacking, strength cap, destruction/drying duplicates and random draw order.
- Preserved source quirks: remaining zero defaults to duration; actor-stack constructor ticks the new unregistered instance; frozen effects reference player fire even for pets; expiry/progress use the pre-extra-decrement local count. No unreviewed correction.
- This is NOT gameplay integration: real monster/pet/item factories, their side effects, HUD and the main engine remain pending.

### U03a structural-state correction

Moved label formatting to a pure helper so a pre-existing structural player-effect object does not need a candidate-only method. New exact-source test covers this boundary. Strict types and **10 targeted status tests pass**, **340 isolated trajectories** total; 39 unrelated tests skipped. No original-source change or test weakening.

## U03b item core and main doors — 2026-10-08

- Base item DATA/lifecycle ported; the two legacy DOM-rendering methods are explicitly not implemented. Full source main-door registration and unlock predicate ported separately from viewer doors (main uses Symbol.for, viewer uses local Symbols).
- Strict types and targeted item/door/status run: **32 tests passed**, 39 unrelated tests skipped. Includes 21 item/comparator tests, 1 main-door test and 10 status tests.
- Constructor fields/defaults/material draw/date/Symbol calls, independently cloned input graphs with shallow aliases, equipment presence/page/NaN fallback, consume underflow, drying/timer identity and weapon-classification branch, hints, stacks/global caps, removal/destruction and short-circuit unlock are compared against exact original declarations.
- Preserved source behavior: x/y zero default to null; slot initializes from 已装备, not a slot field; item material is omitted from stack comparison; deep comparator ignores Map/prototype/symbol contents and calls the target hasOwnProperty directly. This comparator is not substituted with the richer graph diagnostic.
- WeaponStub only tests base-class instanceof timer classification; it is not the source weapon implementation. Live actors, derived items, main-game integration, saves and item UI remain pending.

## U03b combined verification / diagnostic safety — 2026-10-08

- `npm run check && npm run test:e2e`: all eight source hashes, 5 integrity tests, strict types, **71 domain tests**, production build, **3 real Chromium tests passed**.
- Viewer preview starts at 0.0.0.0:5173, permits .e2b.app, and returns app HTML with a simulated preview Host header. Preview is a viewer/lab, not the unported full game.
- Subsequent test-only graph hardening avoids user toStringTag/iterator/name getters with Node intrinsic brands/iterators and descriptor inspection; rejects Proxies/unsupported types rather than executing code or discarding data. Strict types and the focused diagnostic test passed (70 other tests intentionally skipped); next full rerun will include it.

## U05a shared codec/signature contracts — 2026-10-08

- Independently ported original main/manager URI/Base64 codecs and SHA-256(dataString + public client integrity key). Native coercion, surrogate errors, invalid Base64/UTF-8 identity fallback, main warning vs manager silence, key/JSON order and UTF-8 replacement are preserved. Not HMAC/authentication or full save compatibility.
- Original manager declarations selected by explicit AST DOM-ready scope without executing DOM/Supabase bootstrap.
- Strict types and first **7 targeted codec tests passed**, 71 unrelated tests skipped. Targeted **1 real Chromium WebCrypto/Unicode/fallback test passed**, using the exact original function as expected signer.
- Independently inspected original NPC fixture metadata: no signature field, game version 1532, ordinary v1-style state. Added exact-source signing comparison for its raw parsed payload; no execution of NPC scripts and no cross-load claim. Final combined test count pending.
- Package engine range tightened to the installed dependency intersection (^22.17 / ^24 / >=26); actual tested Node remains 22.22.3.

## U05a full verification — 2026-10-08

`npm run check && npm run test:e2e` passed with **8 original hashes, 5 integrity tests, strict TypeScript, 79 domain tests, production build and 4 real Chromium tests**. Includes the new codec/nested-oracle/getter/proxy changes and actual unsigned-NPC payload signing comparison against both source functions. No cross-load, actor/script integration or authentication claim. Production UI remains the viewer/lab; next unit is defensive-equipment contracts.

## U03c defensive-equipment logic — 2026-10-08

- Independently ported full defense constructor/getters/attack/hint/use logic on ItemCore, with explicit actor/status/player/destroy/UI ports. Base-item DOM methods and concrete actors/derived subclasses remain pending.
- Strict types and **15 targeted tests passed**, 79 unrelated tests skipped; **438 isolated trajectories** (12 constructor profiles + 420 profile/damage/attacker cases + 1 repeated attack sequence + 5 ordered/energy cases). Exact source base + defense class execute with matched doubles; copied input graphs retain aliases.
- Preserve first duplicate enchant selection after any-positive test; ordered fusion additions/multipliers/first synergy; post-dodge chip draw; poison draw gated on healthy source monster; repeated destroyed callbacks; unbreakable durability still becomes a decimal string; upper-only energy clamp including zero/NaN denominator. Compare every state/event/draw and hint/error result.
- Initial TypeScript errors (structural ctor narrowing to never and deliberate explicit-undefined raw profile) were corrected without weakening strict options or bypassing logical tests.

## U03d all defensive subclasses — 2026-10-08

- Ported all 12 direct source defensive subclasses: 引雷针护符/守卫者盔甲/灌木丛/水鞋/秘银锁甲/防化服/钢制板甲/锅盖/冰盾/纵火狂/潜行靴子/灵能盾牌. Retain Chinese constructor names; source-visible no-port constructor facade remains pending.
- Full class-specific constructors/getters/attack/collection/removal/effect-source callbacks are ported; movement/weather/immunity interactions implemented elsewhere in the original game are not claimed by constructor descriptions.
- Strict types and **31 combined targeted tests passed** (15 defense + 16 subclasses), 79 unrelated tests skipped. Subclasses: **257 isolated trajectories** (12×6 constructors/hints/inherited actions + 12×5×3 attack/draw cases + charged identity sequence + 2 bush sequences + 2 destroyed post-super branches).
- Preserve config spread vs deliberately ignored config distinctions, overridden Map-data spread, guardian/pyromaniac zero-defense falling back through base class, unconditional post-super ice/psychic draws, lightning source identity/effect lookup, bush clearing/paint without base timer cleanup. Actor/status factories and icon lookups remain explicit doubles.

## U03d complete regression — 2026-10-08

`npm run check && npm run test:e2e` passed: **8 reference hashes, 5 integrity tests, strict types, 110 domain tests, production build, 4 real Chromium tests**. Defense base and all twelve subclasses are included; their **695 isolated trajectories** use explicit actor/status/icon/UI doubles. Full game/actions/movement/weather/equipment policy and save/script integration remain unimplemented, not established by this result.
