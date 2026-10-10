# Proposed behavioral/UX deviations — not owner approval

The original source and consistency acceptance are unchanged. Logic ports must preserve behavior; any intentional difference remains reviewable. No entry below has been accepted by Kibiandkimi merely because it is recorded here.

| ID | Source evidence | Candidate difference | Rationale / status |
|---|---|---|---|
| UI-01 | Viewer loops `i=0; i<=15` but status says “生成了15层” | Viewer correctly reports 16 layers (0–15) | Obvious count-text defect; proposed and exposed in browser comparison; map generation unchanged |
| UI-02 | Viewer controls are not a form; generate clicks queue timers and button remains enabled | Accessible form allows Enter and disables submit during a generation | New framework UI/accessibility and prevention of queued concurrent work; proposed, not source logic parity |
| UI-03 | A source generator exception escapes the timer handler after partially appending cards | Candidate displays the unchanged generator failure and only successfully generated maps | Does not substitute another algorithm; explicit error feedback/partial-layout difference, proposed |
| UI-04 | Original separate standalone pages | New app tabs and responsive card layout | Framework navigation/visual redesign, proposed; exact viewer canvas pixels are compared separately |
| BUG-01 | Manager launches missing `Chinese Dungeon v1516.html` | No manager launch port yet | Route correction proposal pending, no invented approval |
| SRC-01 | Main `重置所有游戏状态` (HTML L55057+) rebuilds `自定义全局设置` in a different shape from its declaration (L7566): `死亡次数限制` moves under `玩家属性`, `胜利条件` loses it, and `禁用大地图` disappears | **No difference: preserved** in `world/reset.ts` and covered by the differential test | Likely an upstream defect: after any reset, readers of `胜利条件.死亡次数限制` / `禁用大地图` see `undefined`. Recorded for review; correcting it would be a proposed deviation, not done silently |
| SRC-02 | Same reset: `玩家属性 = { ...初始玩家属性 }` is a shallow copy | **No difference: preserved**; `已获得神龛效果` is shared between both objects after a reset | Currently unobservable: the source only reassigns the array (L54656), never mutates it in place. Identity preserved so saves/scripts see the same graph; recorded for review |
| SRC-03 | Main `更新光源地图` (HTML L49526+) only adds timer light sources when `计时器?.x` is truthy | **No difference: preserved** in `world/lighting.ts` (mutation-tested) | Probable upstream defect: a lit torch/flare timer on column x = 0 casts no light. Recorded for review |

Unintentional drift is fixed against the original, not reclassified as a deviation to make a test pass. Main-game/save/service boundaries remain pending; no blanket deviation authorization.
