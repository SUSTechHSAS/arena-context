# Proposed behavioral/UX deviations — not owner approval

The original source and consistency acceptance are unchanged. Logic ports must preserve behavior; any intentional difference remains reviewable. No entry below has been accepted by Kibiandkimi merely because it is recorded here.

| ID | Source evidence | Candidate difference | Rationale / status |
|---|---|---|---|
| UI-01 | Viewer loops `i=0; i<=15` but status says “生成了15层” | Viewer correctly reports 16 layers (0–15) | Obvious count-text defect; proposed and exposed in browser comparison; map generation unchanged |
| UI-02 | Viewer controls are not a form; generate clicks queue timers and button remains enabled | Accessible form allows Enter and disables submit during a generation | New framework UI/accessibility and prevention of queued concurrent work; proposed, not source logic parity |
| UI-03 | A source generator exception escapes the timer handler after partially appending cards | Candidate displays the unchanged generator failure and only successfully generated maps | Does not substitute another algorithm; explicit error feedback/partial-layout difference, proposed |
| UI-04 | Original separate standalone pages | New app tabs and responsive card layout | Framework navigation/visual redesign, proposed; exact viewer canvas pixels are compared separately |
| BUG-01 | Manager launches missing `Chinese Dungeon v1516.html` | No manager launch port yet | Route correction proposal pending, no invented approval |

Unintentional drift is fixed against the original, not reclassified as a deviation to make a test pass. Main-game/save/service boundaries remain pending; no blanket deviation authorization.
