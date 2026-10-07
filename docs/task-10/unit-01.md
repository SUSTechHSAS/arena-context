# Unit 01 — pinned reference and distance-map parity

## Authorization and status

The user approved the proposed first unit and TypeScript + React + Vite + Vitest
stack in this conversation on 2026-10-07. This is implementation-plan approval,
not acceptance of the resulting code. The preceding user instruction explicitly
allowed proceeding after a manual pelican test. That is not a statistical identity
certification or a script `CONTINUE`. Existing denied fingerprint records remain
unchanged; there is no current passing fingerprint. No policy, workflow, or task
contract is changed. Protocol enforcement may therefore reject this checkpoint.

## Fixed baselines

- Task: #10, base `task/10/main` at `4bfcad36bd762e206576387038836f8848fc40ee`.
- Work: `arena/b6d0b7cd-arena-context`; authenticated submitter `SUSTechHSAS`.
- Upstream: `SUSTechHSAS/chinese-dungeon` at
  `8d80b5a4dd3d737ed6d3060f05611eaa3de611ab`.
- Reference hashes: `reference/chinese-dungeon/manifest.json`.

## Approved first-unit scope

1. Pin the original and retain license/provenance.
2. Document overall migration boundaries without claiming full parity.
3. Add a minimal TypeScript/React/Vite/Vitest application, keeping logic independent
   of UI.
4. Migrate one deterministic module and compare against execution of original code.
5. Record results, limitations, and suspected bugs; save STATE and push a checkpoint.

Acceptance: at least one real module and ten meaningful differential cases covering
normal, boundary, and unusual upstream behavior; compare output and input side
effects; demonstrate that a deliberate behavior mutation is detected; verify clean
installation, typecheck, tests and production build. Do not silently fix upstream
behavior. PR base must remain `task/10/main`; no agent merge.

## Selected module

`生成玩家距离图` at upstream `ChineseDungeon.html:9848–9902` is a bounded
four-neighbor BFS used by monster pathfinding and refreshed after player movement
(e.g. lines 10477 and 45803). Its only dependencies are the square dungeon, size,
cell-type constants and two item constructor identities. No clock, RNG, rendering,
storage, or network is needed by this function.

Observed semantics to preserve:

- Start distance is zero, even on an otherwise blocked start cell.
- Either side's wall blocks crossing; target walls and locked doors block entry.
- Placed-obstacle/obsidian instances block regardless of their `阻碍怪物` field.
- A switch brick blocks only when its `阻碍怪物` value is truthy; other items with
  that field do not block this particular function.
- A node at distance 99 expands to distance 100; distance-100 nodes do not expand.
- Unreachable entries are `Infinity`, not JSON `null`.

These are compatibility requirements, not proposed bug fixes. Invalid/malformed
maps and out-of-range coordinates are outside this first module's typed contract.

## Overall scope inventory (not completion claims)

| Upstream area | First-unit treatment | Future work |
| --- | --- | --- |
| `ChineseDungeon.html`: game state, map generation, combat, inventory, status, movement, save/load, rendering | Only distance-map function | Separate deterministic engine from UI incrementally; broaden parity fixtures |
| Workshop / Supabase / CDN integration | Not executed | Define offline test seams and review service requirements |
| `ChineseDungeon-Viewer.html` | File inventoried, not migrated | Inspect and agree viewer compatibility scope |
| `LevelManager.html` | File inventoried, not migrated | Inspect editing/import/export behavior |
| `index.html` | File inventoried, not migrated | Review entry-point routing |
| Custom NPC JSON | File inventoried, not migrated | Preserve schema and behavior after source review |
| Fonts, sound, visual assets and localization | Not migrated | License, loading, rendering and input checks |

The first-unit UI is only an interactive distance-map demo, not a playable rewritten
game. The full task remains open.

## Verification

Implementation checkpoint:

- `npm run check --prefix app`: reference hashes, TypeScript, **43 tests**, deliberate
  mutation detection, and Vite production build all passed on 2026-10-07.
- Forty domain tests include **4,608** exhaustive comparisons (512 wall layouts ×
  9 starts), plus explicit walls in both directions, terrain/item predicates,
  JS truthiness, detours, blocked starts, Infinity and distance 99/100/101 cases.
- Two tests check reference integrity/tamper rejection; one server-render smoke
  test checks 49 accessible cells, scope notice and GPL link. Real-browser input
  integration has not been tested.
- The deliberate change `> 99` → `>= 99` caused an assertion failure in the
  horizon differential test; the actual source was restored byte-for-byte.
- A fresh VM executes exact parsed original declarations, with no HTML startup.
  Original concrete class prototypes preserve instanceof checks; their parent is
  stubbed and constructors are not invoked. Item lifecycle and integration with
  real game-state objects are not covered. The new engine uses typed item tags.
- Old and new input data are checked for observable mutation. Matrices cross VM
  realms by array copying, never JSON serialization (which would lose Infinity).
- Source HTML has upstream trailing whitespace: full baseline diff whitespace
  checking fails on that unmodified file. Checking all other changed files passes;
  preserving the source checksum takes precedence over formatting vendor content.
- Dependencies installed with zero reported vulnerabilities. Clean `npm ci` and
  preview HTTP smoke verification remain to be run before final handoff.

## Remote review and protocol status

- Auto-created Draft PR: https://github.com/SUSTechHSAS/arena-context/pull/14
- Base/head confirmed: `task/10/main` ← `arena/b6d0b7cd-arena-context`.
- Baseline checkpoint `179ede80d9cc7fff793da7d50fecf7e49ce319fa` was pushed and
  verified against `git ls-remote`.
- `arena/protocol` failed. API annotation on check run `112762076334` states:
  **No current fingerprint: new task changes require Clear match from an accepted model.**
- Full Actions log archive could not be downloaded (redirected host inaccessible);
  GitHub API annotations were accessible and provided the failure reason.
- No owner comments, reviews, or unresolved review threads were present when checked.
- No checks were bypassed; no auto-merge or merge was requested. The full task,
  broad compatibility, and protocol resolution still require further work/review.
