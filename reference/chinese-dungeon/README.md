# Pinned upstream reference (not the rewritten application)

Source: https://github.com/SUSTechHSAS/chinese-dungeon/tree/8d80b5a4dd3d737ed6d3060f05611eaa3de611ab

`ChineseDungeon.html` and `LICENSE` are byte-for-byte files fetched through the
GitHub contents API at that commit. `manifest.json` records SHA-256 and byte size.
Do not reformat, patch, or run the full HTML in the test harness. It contains
external service/CDN dependencies. The tests extract only named declarations and
run the distance-map function in an isolated, offline context.

This snapshot is deliberately committed (about 2.8 MB) so tests remain reproducible
without network access after dependency installation. It is outside the Vite app
root and must not be bundled into the rewritten app. Keep the upstream GPL license
and attribution with redistributed source. Other upstream files are not vendored
or claimed as migrated by this unit.
