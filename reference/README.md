# Task #10 — immutable behavior reference

Original repository: https://github.com/SUSTechHSAS/Chinese-Dungeon

Pinned commit: **8d80b5a4dd3d737ed6d3060f05611eaa3de611ab** (independently resolved via `git ls-remote` on 2026-10-08).

The eight root application/reference files in `chinese-dungeon/` were downloaded from the GitHub API archive for that exact commit and are byte-for-byte unchanged. `manifest.json` records SHA-256 and byte lengths. Upstream `.github/workflows/` are excluded: they are CI configuration, not application behavior. The original screenshot and custom-NPC example are preserved as well as all HTML, README and GPL-3.0 license.

Verify without network or third-party packages:

```sh
node scripts/verify-reference.mjs
node --test tests/reference.test.mjs
```

These files are **test/audit inputs**, not a production app. Never fix a bug by editing the reference. A source change requires an explicit reviewed pin update. New application modules derived from this source retain GPL-3.0 attribution. The repository's existing Arena protocol is not relicensed by this snapshot.

The source contains public client configuration and a client-side integrity key. Those are upstream behavior, not a secure authentication scheme or credentials supplied by the user. Do not use the reference to make writes to live services. Online adapters must be testable with deterministic fixtures; production service verification is a separate explicitly reported boundary.
