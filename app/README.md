# Reforged Chinese Dungeon — Task #10 candidate

Independent React 19 / TypeScript / Vite rewrite of the pinned Chinese Dungeon source. GPL-3.0-only; see LICENSE and NOTICE.md.

**Incomplete:** the complete viewer and engine lab are not a playable main-game replacement. Track actual feature coverage and remaining work in `../docs/task-10/FEATURE-MATRIX.md` and `PLAN.md`. Original source runs only in the test oracle, never in the production bundle.

## Reproduce

Tested in Linux x64 with Node 22.22.3 and npm 10.9.8; package engines allow Node ^22.17.0 / ^24.0.0 / >=26.0.0. The lockfile pins dependencies.

```sh
npm ci --ignore-scripts
npm run check       # original hashes, integrity tests, strict types, parity tests, build
npm run test:e2e    # real Chromium/Playwright, no external requests
npm run dev        # 0.0.0.0:5173; .e2b.app preview hosts allowed
```

`npm run preview` serves the production build on 0.0.0.0:4173. No localhost/127.0.0.1 URLs are embedded in the app. Loopback in the browser-test configuration is only the local test runner's base URL, not a user-facing API endpoint.

## Browser setup

Arena permits npm/GitHub hosts, not Playwright's browser-download host. `@sparticuz/chromium` ships the executable, fonts, SwiftShader and Linux shared libraries inside its npm tarball. The Playwright config explicitly inflates the bundled `al2023.tar.br` and configures its library path: no fake AWS environment, apt download or unlisted host is used. It works on the tested Linux x64 sandbox; other OS/browser engines have not been verified. Extracted binaries, npm caches, reports and dist are ignored and can be recreated from the lockfile.

## Consistency tests

`test/oracle/source.ts` uses TypeScript AST ranges to execute exact original declarations in isolated Node VM contexts. Production `src/` cannot import this module. Hash/LCG/fusion tests check outputs **and** stream state; path tests preserve Infinity, JS truthiness, item constructor identity and the source's distance-100 boundary. Mutation tests compile the actual candidate with a deliberately wrong boundary and verify that the original oracle distinguishes it. Viewer tests also compare complete graphs and every draw across four seeds × sixteen floors, and real-browser tests compare every PNG against the untouched original viewer. These are primitive/viewer contracts, not full main-game parity.

## Current verified checkpoint

`npm run check && npm run test:e2e` passed: eight unchanged original hashes, **5 integrity tests, 110 domain tests, strict types, production build and 4 actual Chromium flows**. Main/manager codecs and defensive-equipment/base/subclass contracts are included, with explicitly matched actor/status/UI doubles. These contracts do not establish a playable main game, save cross-load/custom scripts or live service parity. The full feature matrix remains the acceptance scope.
