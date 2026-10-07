# Immutable legacy oracle

Source: https://github.com/SUSTechHSAS/Chinese-Dungeon/tree/8d80b5a4dd3d737ed6d3060f05611eaa3de611ab

The seven runtime/source/documentation files in `chinese-dungeon/` are byte-for-byte Git blob copies downloaded using GitHub API. `manifest.json` records their byte counts, Git blob SHA-1s and SHA-256s. Run `node scripts/verify-reference.mjs` before testing. No automatic upstream refresh is permitted.

Excluded upstream files are workflows and the README screenshot (not game assets). The self-contained HTML includes public legacy service configuration; it is kept solely as historical test evidence, not as production application configuration. Tests must block outbound traffic and must never write to the original production services.

Upstream code is GPL-3.0; see `chinese-dungeon/LICENSE`. Copyright belongs to the original authors (SUSTechHSAS and contributors). Derived engine code retains GPL-3.0 and source attribution. Do not modify these fixtures to make a test pass; test bridge/adapters live outside this directory.
