# Current handoff

- Task: #10
- Unit: Integration P4 — inventory actions
- Work branch / PR: arena/5d1da57f-arena-context / https://github.com/SUSTechHSAS/arena-context/pull/30
- Accepted base at unit start: task/10/main@380470815a435dbe7f9a28f8ce2dffb9bfc14761 (PR #27 merged)
- Inherited candidate at unit start: ebd5eb0642e730030c6656e26a34fb704602e176 (PR #30 review checkpoint, merged with the accepted head)
- Updated: 2026-10-11
- Fingerprint: .context/fingerprints/20261011T014100Z-31047a67/report.json
- Model role: primary
- Work packet: none; primary lane outside all packet paths (DECISIONS 2026-10-10)
- Primary review: not applicable; no secondary run exists in this history
- Candidate stage: in progress; Draft

Only Kibiandkimi decides acceptance; this card is not approval.

## Current objective

Modern rewrite of chinese-dungeon with source-consistency tests (TASK.md). PR #27's world kernel is accepted into `task/10/main` (3804708). This primary session (Draft PR #30) plans and builds the integration layer that no packet owns: runtime composition, save model, turn actors, inventory verbs, game start, rendering/input — phases P1–P8 in PLAN.md "Integration plan after PR #27". The 114-packet pool stays with secondaries.

## Candidate progress

- I1 coverage audit: `scripts/task10-coverage.mjs` → docs/task-10/COVERAGE.md + coverage-ledger.json (now 22.4 % of source lines ported, 49.4 % open implementation packets, 25.7 % audit-only, 7.5 % unassigned). PLAN phases P1–P8; DECISIONS K1–K3.
- I2 (P1): `app/src/game/runtime/class-registry.ts` — session `SourceClassRegistry` replacing `window[类名]`/`constructor.name` (exact 241 names of `注册全局类`, ports bound at definition, `isA`/`nameOf`/`globals`); `vite.config.ts` keepNames (K1).
- I3 (P2): `app/src/game/runtime/save-items-cells.ts` — `序列化物品`, `恢复物品`, `序列化单元格`, `恢复单元格`. SRC-45 (registry refuses browser globals named by tampered saves) recorded as Fixed (primary decision).
- I4 (P2): `app/src/game/runtime/save-monsters.ts` — `序列化怪物`, `恢复怪物`; registry `className`. SRC-46 (cooldown key mismatch, attack fallback) preserved for owner review.
- I5 (P2): `app/src/game/runtime/save-floors.ts` — `序列化楼层`, `恢复楼层`; doors via registry `门` (GameDoor + session ports). SRC-47 (TDZ destructuring defaults drop floors missing 玩家位置/已揭示洞穴格子/地牢生成方式) preserved for owner review.
- I7 (P3): `app/src/game/runtime/turn-actors.ts` — `检查移动可行性`, `获取实际移动步数`, `更新武器冷却`, `处理宠物着陆效果`, `伤害玩家`, `处理怪物回合` over registry `isA` and the `world/move.ts` session. SRC-49 (undefined `效果颜色编号编号映射` makes pet fire/poison landing throw) and SRC-50 (damage statistic only counted while auto-move interruption is on) preserved for owner review.
- I8 (P4): `app/src/game/runtime/inventory-actions.ts` — `整理背包`, `处理丢弃物品`, `使用装备槽物品`, `卸下装备槽物品`, `处理销毁物品`, `尝试收集物品`, `使用背包物品`, `扣除金币`, `执行修复`, `执行重铸`, `尝试出售`, `尝试购买` plus the small unassigned helpers `触发游戏事件`, `执行连发攻击`, `停止自动移动`. Online-mode socket messages and DOM work are ports. SRC-51 (online reforge/buy branches always throw) and SRC-52 (buying counts hidden coins that cannot be spent, so the item is free) preserved for owner review.
- I6 (P2): `app/src/game/runtime/save-envelope.ts` — `保存游戏状态`, `恢复游戏状态`, `导出存档`, `导入存档`; `SaveEnvelopeSession` types UI/camera/editor globals. SRC-48 (monster effects on other floors lost on load, position-matched effects, guard order, unguarded editor key, dropped 已放置配方卷轴) preserved for owner review.

## Verification

- I2: 11 registry tests (source `注册全局类` executed against stubs; mutation checks) + 2 K1 build tests (app config keeps names; `keepNames:false` mutant yields `s,c,l,i`).
- I3: 400 seeded sessions equal to the source; 9/9 mutants killed (VERIFICATION.md § Integration layer).
- I4: 300 seeded sessions equal to the source; 12/12 mutants killed after strengthening one input.
- I5: 200 seeded sessions equal to the source; 39/41 probes killed (1 equivalent dead branch, 1 no-op probe).
- I6: 200 seeded sessions equal to the source; 45/47 probes killed (2 equivalent).
- I7: 300 seeded sessions equal to the source; 50/52 probes killed (2 equivalent).
- I8: 400 seeded sessions equal to the source; 68 probes, 66 killed (2 equivalent).
- Full suite with I2: 70 files / 333 tests passed; after I3: typecheck, reference checks, build and the runtime tests pass (full suite rerun next unit; it takes ~15 min on this 2-CPU sandbox).

## Blockers and unresolved owner feedback

No owner response yet to the PR #27 review comment (process questions: oracle patch authority, commit style, possibly missed fingerprints). Owner merging #27 placed the upstream-fix rule into the accepted base; new fixes still get SRC entries. Full game, UI, saves and services unfinished. Draft.

## Next action

P5 game start: first `t10-main-generation-audit` (`生成奖励`, `应用难度预设`, `放置楼梯`, `生成金币`, `生成迷宫地牢`), then the `t10-tutorial-professions-audit` logic (`启动游戏`, `应用职业效果`, `重置玩家状态`; the profession/tutorial windows go to P6). After that, a composition root that wires the P1–P5 runtime modules and world kernel into one session.
