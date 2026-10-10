# Current handoff

- Task: #10
- Unit: Successor of PR #19 — primary world-kernel lane
- Work branch / PR: arena/e4cc53a2-arena-context / https://github.com/SUSTechHSAS/arena-context/pull/27 (successor of PR #19, whose head stays at 9539c29)
- Accepted base at unit start: task/10/main@45f8811ce9c7ec910ff6346d7c6b489fb1cf8f5e
- Inherited candidate at unit start: 9539c29c65b763d95613265c20b570a4394c2c4c (fast-forwarded from PR #19; unreviewed)
- Updated: 2026-10-10
- Fingerprint: .context/fingerprints/20261010T101013Z-3c436878/report.json
- Model role: primary
- Work packet: none; primary lane outside all packet paths (see DECISIONS 2026-10-10)
- Primary review: not applicable; no secondary run exists yet in this history
- Candidate stage: in progress; Draft

Only Kibiandkimi decides acceptance; this card is not approval.

## Current objective

Modern rewrite of chinese-dungeon with source-consistency tests (TASK.md). The 114-packet pool from PR #19 remains for secondaries (73 available, 41 dependency-blocked). This primary session builds the non-packet main-game world kernel under `app/src/game/world/` that integration will need.

## Candidate progress

This session: took over PR #19 on this successor branch (fast-forward only, all inherited files preserved), then built the main-game **world kernel** in `app/src/game/world/`, 52 units so far:
- constants, cell, state, reset, lighting, helpers
- placement (items and monsters), targeting, generation, cave, features, cave-dungeon (the `生成洞穴地牢` orchestrator)
- room-content, special-rooms (incl. `生成特殊房间`), drops, item-generation (`生成物品`, `物品生成配置`, `检查防化服防护`), monster-generation (`生成怪物`), theme-rooms (jar/plant/potion/library content, `生成推箱子谜题`), puzzle-board (`生成解谜棋盘`), turn (`处理回合逻辑`, `玩家等待`, `开始休息`, `停止休息`), landing (`处理玩家着陆效果`, `更新洞穴视野`), floor-switch (`切换楼层`), respawn (`处理重生`), move (`移动玩家`), interact (`尝试互动`), dungeon (`生成地牢`, `生成寻宝戒指`), dungeon-support (`计算距离图`, `处理上锁的门`, `生成并放置随机配方卷轴`, `检查推箱子解谜完成`, `解谜成功_推箱子`), red-blue-puzzle (`生成红蓝开关谜题`), chess-puzzle (`检查解谜是否成功`, `解谜成功`), weather core (`处理天气效果`, `生成天气效果`, `是否靠近火源`, `解冻药水`, `处理严寒效果`), thunderstorm (`处理雷暴效果`), environment (`全局生成环境`, `生成环境簇`), hazards (`引燃烟雾网络`, `引爆烟雾网络`, `触发药水水域效果`), wind (`处理大风效果`, `尝试执行吹动`), victory (`检查胜利条件`), Q easter egg (`检查Q字形彩蛋`, `触发Q字形彩蛋`), equipment page (`切换装备页`), chess debug helpers (`调试_输出当前谜题答案`, `获取当前玩家棋盘房间`, `收集房间内棋子`, `收集背包棋子类`, `_打印棋盘方案到控制台`, `db`), utilities (`深度比较`, `获取方向中文`, `哈希字符串`, `种子伪随机数`, `获取爆炸颜色`, `净化HTML`, `生成签名`, `寻找最近的房间`, `处理房间状态`), fusion slots (`添加到融合区`, `从融合区移除`, `清空融合区`) and `处理燃烧木质卷轴`, fusion recipe helpers (`生成单个随机融合配方`, `是否为有效融合武器`, `是否为有效融合材料`)
- units 45–46: fusion preview (`检查融合配方`) and commit (`执行融合`); unit 47: tutorial replay stage navigation and `应用扳手规则`; unit 48: off-screen monster edge indicator (`计算精确边缘位置`); unit 49: editor floor template (`generateDungeonTemplate`); unit 50: click-move path overlay (`drawPath`); unit 51: creative-level death markers (`处理创意关卡死亡事件`); unit 52: developer creative-level export (`导出当前状态为创意关卡`)
- unit 44: recorded upstream fixes under the owner rule of 2026-10-10 (DECISIONS). The oracle applies literal patches from `app/test/oracle/source-patches.ts` (SRC-01/03/11/18/20/22/24/27/30/31)

Each module has an `app/test/world-*.test.ts` differential test against the exact source declarations, with mutation checks. Per-unit evidence is in `docs/task-10/VERIFICATION.md` § World kernel. Source quirks are DEVIATIONS SRC-01…SRC-38; evident ones are fixed with a recorded oracle patch (owner rule), the rest are preserved. Packet-owned collaborators stay behind typed ports.

## Verification

- Latest full `npm run check` with unit 50 (86ea31b): reference hashes, integrity tests, strict types, 60 files / 311 tests and build all passed. Remote protocol check passed through 22dc1eb; no remote workflow runs app tests (tests.yml covers `.github/scripts` only).
- Per-unit evidence and mutation results are in VERIFICATION.md.

## Blockers and unresolved owner feedback

No owner comments on PR #19 or #27. Full game, UI, saves and services remain unfinished. Draft.

## Next action

Continue the world kernel with the remaining unassigned logic (next: remaining unassigned main-game glue such as saves/load wiring and the session shell that composes these modules), checking packet anchors first. RNG wiring (`初始化随机数生成器`) belongs to `t10-seed-search` and is left there.
