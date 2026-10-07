# Reforged Chinese Dungeon — unit 01

A **candidate, partial rewrite**, not a playable complete game. React is only the
view layer; `src/domain/distance-map.ts` contains the deterministic logic.

## Run and verify

Requires Node.js >=22.12.0 (tested: 22.22.3) and npm (tested: 10.9.8).
From the repository root:

```sh
cd app
npm ci
npm run check       # pinned hashes, types, parity tests, mutation check, build
npm run dev         # http://<host>:5173; binds 0.0.0.0
```

The lockfile and exact dependency versions are committed. After installation,
checks require no network. The development server allows `.e2b.app` preview hosts;
all browser URLs are same-origin. No original Supabase/CDN scripts are loaded.
For production smoke testing: `npm run build && npm run preview`.

The demo edits a 7×7 map. Pick a tool and click a cell (or Tab, Enter/Space).
Reset restores the wall-with-a-gap example. It is not a monster/player movement
implementation. A 102-cell corridor test, not the UI, exercises the 100-step cap.

## What is tested

- The oracle verifies the pinned reference and parses exact original declarations
  using Acorn; it does **not** implement a second hand-translated BFS.
- A fresh Node VM executes the original `生成玩家距离图` with adapted fixture data.
  No original startup/network/browser code executes. Node VM is a test isolation
  aid, not a security sandbox for arbitrary untrusted code.
- Original obstacle/obsidian class prototypes supply `instanceof` identities.
  Their base class is stubbed; instances are created with `Object.create`, not by
  invoking constructors. This tests only the distance predicate, not item lifecycle.
- The new engine's tagged item kinds correspond to those identities; translation
  from a future real game state is not yet implemented/tested.
- Output comparison retains `Infinity`. Each case checks input data remains
  unchanged; legacy data is writable and checked before/after, and new-engine
  inputs are frozen and checked before/after.
- Forty domain cases include all 512 3×3 wall layouts × 9 start positions. There
  are also reference-integrity tests and a deliberate off-by-one mutation check.
- `test:mutation` temporarily changes `> 99` to `>= 99` in the actual new source,
  requires the horizon parity test to fail, then restores the source in `finally`.
  Run it without an active test watcher. It is not a full mutation score.

Malformed/nonsquare grids, invalid coordinates, item construction, save/load,
random generation, combat, browser integration and the other tools remain outside
this unit. A passing slice is **not evidence of whole-game equivalence**.

## Source and license

Behavior is ported from SUSTechHSAS/chinese-dungeon commit
`8d80b5a4dd3d737ed6d3060f05611eaa3de611ab`, original author © SUSTechHSAS,
under GPL-3.0. This `app/` candidate is distributed under GPL-3.0-only; it is not a
relicensing of the repository's existing protocol files. Full license is in
`public/LICENSE.txt` and included in production output. No warranty is provided.

Changes: independent TypeScript distance-map engine, React demonstration, and a
pinned-source differential harness. Review scope and evidence:
[`../docs/task-10/unit-01.md`](../docs/task-10/unit-01.md).
