# Reforged Chinese Dungeon — development

Candidate phase A only, not a playable remake. Node 22.22.3 and npm 10.9.8 tested.

```
npm ci
npm run verify:reference
npm run audit:check
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm run dev
```

Vite binds 0.0.0.0 and accepts Arena *.e2b.app preview hosts. Client only uses same-origin modules, not sandbox localhost APIs. Legacy fixtures are tests, not application runtime.

## Offline browser harness

Chromium and the missing Linux NSS/NSPR shared libraries are distributed by pinned `@sparticuz/chromium` via allowed npm registry. `run-browser-tests.mjs` extracts its bundled libraries into ignored `.cache/`; no apt/CDN download. Browser binary is extracted on demand. Multi-process mode is used because single-process Chromium crashed when reusing contexts. Current browser tests cover Chromium only; Firefox/WebKit remain pending.

All requests in the legacy test are intercepted: main HTML from immutable fixture, GSAP from pinned npm package, Supabase initialization explicitly replaced by a null-client offline adapter, other URLs aborted. The full inline legacy script is unchanged. This validates offline main-menu startup and a global lexical PRNG bridge, not workshop behavior or complete gameplay. No production read/write occurs. External resource failures are expected; uncaught script exceptions are not ignored.

## Snapshot protocol

`engine/snapshot.ts` encodes explicitly selected logical roots into ordered identity graphs. Includes every own field of those roots, shared references, cycles, symbol identity, Map/Set order and special values. No whitelist of ignored fields. Functions rejected rather than silently dropped. Save-data schema and full logical-root selection are still under audit; this diagnostic format is not yet a whole-game snapshot or a cross-version save codec.

Synthetic 20-step drift detection validates the comparator only, not gameplay parity. The phase A required 20-command gameplay differential has NOT been achieved. Generation, entity migration and save compatibility remain unimplemented; see audit matrix.
