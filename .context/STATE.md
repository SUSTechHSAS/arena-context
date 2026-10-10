# Current handoff

- Task: #10
- Unit: Successor of PR #19 — primary world-kernel lane
- Work branch / PR: arena/e4cc53a2-arena-context / https://github.com/SUSTechHSAS/arena-context/pull/27 (successor of PR #19, whose head stays at 9539c29)
- Accepted base at unit start: task/10/main@45f8811ce9c7ec910ff6346d7c6b489fb1cf8f5e
- Inherited candidate at unit start: 9539c29c65b763d95613265c20b570a4394c2c4c (fast-forwarded from PR #19; unreviewed)
- Updated: 2026-10-10
- Fingerprint: .context/fingerprints/20261010T070506Z-fd179489/report.json
- Model role: primary
- Work packet: none; primary lane outside all packet paths (see DECISIONS 2026-10-10)
- Primary review: not applicable; no secondary run exists yet in this history
- Candidate stage: in progress; Draft

Only Kibiandkimi decides acceptance; this card is not approval.

## Current objective

Modern rewrite of chinese-dungeon with source-consistency tests (TASK.md). The 114-packet pool from PR #19 remains for secondaries (73 available, 41 dependency-blocked). This primary session builds the non-packet main-game world kernel under `app/src/game/world/` that integration will need.

## Candidate progress

This session: took over PR #19 on this successor branch (fast-forward only, all inherited files preserved), then built the main-game **world kernel** in `app/src/game/world/`, 31 units so far:
- constants, cell, state, reset, lighting, helpers
- placement (items and monsters), targeting, generation, cave, features, cave-dungeon (the `生成洞穴地牢` orchestrator)
- room-content, special-rooms (incl. `生成特殊房间`), drops, item-generation (`生成物品`, `物品生成配置`, `检查防化服防护`), monster-generation (`生成怪物`), theme-rooms (jar/plant/potion/library content, `生成推箱子谜题`), puzzle-board (`生成解谜棋盘`), turn (`处理回合逻辑`, `玩家等待`, `开始休息`, `停止休息`), landing (`处理玩家着陆效果`, `更新洞穴视野`), floor-switch (`切换楼层`), respawn (`处理重生`), move (`移动玩家`), interact (`尝试互动`), dungeon (`生成地牢`, `生成寻宝戒指`), dungeon-support (`计算距离图`, `处理上锁的门`, `生成并放置随机配方卷轴`, `检查推箱子解谜完成`, `解谜成功_推箱子`), red-blue-puzzle (`生成红蓝开关谜题`), chess-puzzle (`检查解谜是否成功`, `解谜成功`)

Each module has an `app/test/world-*.test.ts` differential test against the exact source declarations, with mutation checks. Per-unit evidence is in `docs/task-10/VERIFICATION.md` § World kernel. Preserved source quirks are DEVIATIONS SRC-01…SRC-20. Packet-owned collaborators stay behind typed ports.

## Verification

- Latest full `npm run check` with unit 27 (52c5c9d): reference hashes, integrity tests, strict types, 37 files / 272 tests and build all passed. Remote protocol check passed on 3d15539.
- Per-unit evidence and mutation results are in VERIFICATION.md.

## Blockers and unresolved owner feedback

No owner comments on PR #19 or #27. Full game, UI, saves and services remain unfinished. Draft.

## Next action

Continue the world kernel with the remaining unassigned logic (next: remaining unassigned main-game glue such as saves/load wiring and the session shell that composes these modules), checking packet anchors first. RNG wiring (`初始化随机数生成器`) belongs to `t10-seed-search` and is left there.
