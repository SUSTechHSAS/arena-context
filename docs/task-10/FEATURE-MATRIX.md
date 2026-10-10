# Complete source feature surface — candidate coverage ledger

Original pin: `8d80b5a4dd3d737ed6d3060f05611eaa3de611ab`. Anchors refer to `reference/chinese-dungeon/` HTML lines. The complete lexical declaration index is `SOURCE-INVENTORY.md`; entries here are categories, not a claim that every method has been audited or ported.

| Surface | Original evidence | Candidate implementation / actual verification |
|---|---|---|
| RNG, hashing, fusion random, seed searching | Main `哈希字符串`, `种子伪随机数`, `初始化随机数生成器`, `开始筛选种子`; Viewer L129–149 | Primitive hash/LCG/fusion ported; 24 tests pass, 20×1000 draws/states; full seed-search/game integration pending |
| Cell types, walls, doors, locks/keys, pathfinding and visibility | Main classes `单元格`, `门`, `生成玩家距离图`, `计算距离图`, lighting functions; Viewer L105+ | Player-distance primitive ported; 6 tests including 1024 map/start cases and a detected boundary mutant; main-door constructor/unlock contract also ported (1 differential test). World kernel (2026-10-10): main constants and the `单元格` data contract (23 tests); lighting/visibility (`获取玩家视野范围`, `是否在光源范围内`, `更新光源地图`, `获取视野内房间ID`) matches the source over 120 seeded worlds, with path-search/torch collaborators as ports. Obstacle/obsidian lifecycle, cell rendering and game integration pending |
| Rooms, corridors, caves, floors, stairs, transitions | Main `生成地牢`, `生成洞穴地牢`, `切换楼层`; Viewer `generateDungeonForLevel` | World kernel (2026-10-10): the `生成洞穴地牢` orchestrator and its unassigned leaves are ported, each with a seeded source differential test and mutation checks. Leaves: entrances, score-map placement, barricades, recipe scrolls, water monsters, gas-trap clusters, stairs, keys, item/monster placement, room clearing, wall glyphs, grids, `deepClone`. The cave kernel, room geometry, `生成地牢`, `切换楼层` and the Viewer generator are pending (packets / later units) |
| Tutorial, professions/custom mode, resume, death/victory | Main `应用职业效果`, `显示职业选择界面`, menus and game handlers | Session world state (100 source globals, graph-equal initial values) and `重置所有游戏状态` (ordered side-effect parity, 4 variants) ported; profession, menus, tutorial and victory flow pending |
| Combat/AI and all monster subclasses | Main classes from `怪物` through specialized monsters, minions and bosses | Not ported |
| Status effects, environment, time, weather, terrain | Main `状态效果`, flame/water/lava/ice/poison/smoke classes and weather handlers | Complete status-class contract port, 10 tests / 340 isolated trajectories with explicit doubles; real actor/item/environment integration and other terrain/weather logic pending |
| Items, weapon/armor, potion/scroll, traps/projectiles, durability and fusion | Main `物品`, `武器类`, `防御装备类`, subclasses and fusion handlers | Base-item DATA/lifecycle/hints/stacking ported, 21 tests; full defensive-equipment logic ported, 15 tests / 438 isolated trajectories; all 12 direct defensive subclasses ported, 16 tests / 257 trajectories; derived classes, concrete weapon/armor/potion/trap/fusion integration and item DOM/React UI pending |
| Inventory/equipment, stack/sort, coins, crafting, merchant/altar/reforge/well | Main inventory/shop/reforge/altar functions and classes | Not ported |
| Pets, vehicles, summoned allies and NPCs | Main `宠物`, `马`, `熊猫`, `水母`, `火蜥蜴`, `自定义NPC`, `佣兵单位` | Not ported |
| Chess, Sokoban, switches, conveyors, puzzles and level quality solver | Main chess classes, switch classes, `推箱子关卡生成器`, `_求解棋盘布局` | Not ported |
| Save/load/import/export, signatures, versions and settings | Main save handlers, `存档版本`, `数据完整性密钥`; Manager `generateSignature` | Shared codecs/signature format ported against both sources, Node/browser contracts tested; unsigned version-1532 fixture identified. Integration (PR #30): source-name class registry replacing `window[类名]`/`constructor.name` (241 names, build keeps names) and item/cell save records (`序列化物品`, `恢复物品`, `序列化单元格`, `恢复单元格`; 400 seeded sessions, 9/9 mutants), monster records (`序列化怪物`, `恢复怪物`; 300 sessions, 12/12 mutants) floor records (`序列化楼层`, `恢复楼层`; 200 sessions, 39/41 probes killed, 1 equivalent) and the save envelope (`保存游戏状态`, `恢复游戏状态`, `导出存档`, `导入存档`; 200 sessions, 45/47 probes killed, 2 equivalent). Settings windows and save/load UI are still pending (P6) |
| Custom NPC demo, custom UI and scripting | `自定义NPC演示.json`; Main custom-NPC/editor/UI element handlers | Not ported |
| Map/camera/minimap, icons/local text and canvas effects | Main map handlers, icon tables, zoom/swipe, `绘制大地图` | Not ported |
| Keyboard, touch, swipe, on-screen controls, wait/rest, hotkeys | Main input listeners, `玩家等待`, `开始休息` | Not ported |
| Editor creation/tools, placement, room edit, undo/copy, NPC config | Main editor handlers, settings and tool classes | Not ported |
| Viewer page (distinct generator), seeds/floor range and canvases | Entire ChineseDungeon-Viewer.html | Complete typed generator/React viewer: 4×16 full graph/draw comparisons, six renderer traces, 16 real PNGs exactly match untouched source; UI proposals listed separately |
| Level Manager list/search/details/upload/delete/launch/minimap | Entire LevelManager.html | Not ported |
| In-game creative workshop/local import, upload, clearance and fallback | Main workshop methods and `初始化创意工坊` | Not ported |
| Socket multiplayer, item syncing, login and server-driven UI | Main `执行联机连接`, `初始化Socket连接`, final event handlers | Not ported |
| Asset/CDN/bootstrap behavior and redirect landing page | External Supabase/GSAP/Socket/emoji/font URLs, index.html | Not ported |

## Boundaries and suspected defects requiring review

- Level Manager launches `Chinese Dungeon v1516.html`, a file absent from this pinned repository (Manager inline JS around L164; HTML around L407). A modern route correction would be a proposed behavior deviation, not silently declared approved.
- Workshop uses client-side signature/key and public client configuration. Reproducing the format is necessary for compatibility, not a security endorsement. Hardening server trust is outside a silent rewrite change.
- Multiplayer asks for a server URL and dynamically loads Socket.io. The rewrite must not introduce a hard-coded browser call to sandbox localhost. Live multiplayer/server behavior cannot be established without an accessible service.
- A modern module's strictness, Unicode seed handling and numeric optimizations can change source behavior. Tests must catch these; do not substitute an optimized algorithm on intuition alone.

Rows are updated only with actual candidate verification. Preserving the reference or listing a source function is not evidence of rewrite coverage.
