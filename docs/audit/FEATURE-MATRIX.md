# Migration matrix (candidate, 2026-10-07)

Frozen reference `8d80b5a4`. Exact declaration/global/listener locations and class inheritance: `source-inventory.json`, reproducible with `npm run audit:source`; `audit:check` detects stale inventory. AST declarations replace the earlier approximate regex count. Window assignments include helper functions as well as entities; do not equate 244 assignments with 244 entity classes.

| Domain / legacy entry | New module / intended tests | Status |
|---|---|---|
| 哈希字符串 / 初始化随机数生成器 / 种子伪随机数 | engine/random; 20 seeds × 1000 draws/state, UTF-16, collision, fusion cases | migrated/tested |
| 单元格 / 门 / 单元格类型 / 环境类型 | engine/world; constructor/reference/door interaction tests | pending |
| 生成地牢 / 生成迷宫地牢 / 生成洞穴地牢 / special generators | engine/generation; seed × mode × floor snapshots | pending |
| 移动玩家 / 玩家等待 / 处理回合逻辑 / 伤害玩家 | engine/commands/turn; command/event/state trajectories | pending |
| path, wall, one-way, reachability and sight helpers | engine/navigation; edge/corner/obstacle fixtures | pending |
| monster subclasses / AI / minions / bosses | engine/entities; all class inventory normal+boundary cases | pending |
| items / equipment / fusion / potions / buffs / pets / NPC | engine/items/effects; inventory and combination traces | pending |
| puzzles / switches / chess / sokoban / challenges | engine/puzzles; trigger order and success/failure | pending |
| tutorials / classes / modes / weather / endings / stairs | engine/session; transitions and persistence | pending |
| 保存游戏状态 / 恢复游戏状态 / serialization helpers | engine/save; identity-preserving cross-version round trips | pending |
| 导入地图 / 导出地图 / NPC JSON | engine/map; fixture round trips and malformed input | pending |
| editor brush/property/undo/redo/copy/paste/play | ui/editor + engine/editor; operation trajectories | pending |
| menus / HUD / inventory / map / keyboard/touch / settings | ui; Playwright browser flows | scaffold only |
| seed filtering / encyclopedia / debugging utilities | engine/tools + ui; source parity fixtures | pending |
| ChineseDungeon-Viewer.html | ui/viewer; generation parity with this independent source | pending |
| LevelManager.html / integrated workshop | adapters/workshop; mock request contracts | pending |
| 初始化Socket连接 / socket event handlers | adapters/multiplayer; protocol fixtures | pending |
| index.html redirect / all entry routes | ui/router; entry smoke tests | pending |

This is a domain matrix, not a completed per-entity coverage claim. Every class/function/global has an AST location, but semantic grouping and registered-definition coverage still need audit. All pending rows remain acceptance blockers. No game is playable yet.

## Observed semantics

Dungeon randomness is an LCG `(state * 9301 + 49297) % 233280`, initialized from absolute signed UTF-16 string hash. Fusion uses a separate one-shot integer-mixing function. IDs use Date.now + PRNG via Symbol.for (see door constructor); therefore timestamps, identity, PRNG consumption and collection insertion order cannot be silently omitted from snapshots.

Legacy save packs inventory, equipment ID references, status source identity, active scrolls and floors. Save routines may mutate floor data; a raw save is not automatically a complete or side-effect-free snapshot. The oracle bridge must be tested before using it to judge gameplay.
