# Task #10 environment

Observed 2026-10-08: Node 22.22.3, npm 10.9.8, Python 3.11.2. No system Chromium/Chrome/Firefox binary found at startup.

Source-integrity checks require only Node. The modern app's dependencies and reproducible install commands will be recorded alongside its lockfile. Browser tests must use an explicitly available browser; do not claim a browser run from jsdom or a curl response. npm-hosted browser packages are a possible allowed installation path; browser downloads from unlisted hosts are not permitted.

GitHub authentication is configured as SUSTechHSAS. Shell git commit/push and GitHub API calls through gh work. `gh pr edit` uses a deprecated GraphQL Projects field in this environment; use `gh api repos/SUSTechHSAS/arena-context/pulls/19 --method PATCH` for PR summaries. Actions log redirects to results-receiver.actions.githubusercontent.com are not accessible; use API check/status metadata, not guessed logs.

Servers must bind `0.0.0.0` and allow `.e2b.app` preview hosts. Browser code must use relative app URLs, not sandbox localhost. No live workshop/socket writes are authorized as part of local validation.

## U01 browser/tooling recovery

Application dependencies are locked in app/package-lock.json. Run `npm ci --ignore-scripts` in app, then `npm run check` and `npm run test:e2e`. Real Chromium 153 from the npm-hosted @sparticuz/chromium package is available. Its bundled al2023 shared-library archive is explicitly inflated in app/playwright.config.ts, resolving missing NSS/NSPR libraries without apt or an unlisted download. This configuration actually passed on Linux x64; other OS/browser engines are unverified. Temporary /tmp extraction is reproducible and is not the only copy of a deliverable.

Chromium multi-context testing requires filtering out the package’s Lambda-specific --single-process flag. The actual three-test browser suite (including two pages) passed after this change. No test scope was reduced.

## Historical viewer preview — 2026-10-08

`npm run dev -- --port 5173 --strictPort` is managed by the process tool, bound to 0.0.0.0. Host acceptance was verified using an .e2b.app Host header. It serves only the actual rewritten viewer/lab, not a completed main game. Production never enables the original test fixture route. Current functional verification remains the local 110-domain/5-integrity/4-Chromium run, separate from protocol workflow statuses.

## Migration environment — 2026-10-09

This migration ran on Linux x64 with Node v24.16.0 and npm 12.0.2. The existing `npm ci --ignore-scripts`, `npm run check` and `npm run test:e2e` commands all succeeded with the original lockfile and browser configuration. Playwright started and stopped its own local server; this does not establish a persistent viewer preview. Raw command output and checksums are preserved under `docs/task-10/migration-2026-10-09/`.

The workstation's default gh account is Kibiandkimi. Submission commands used a per-process SUSTechHSAS credential, independently checked with `gh api user`, without changing the default account. Future sessions must check their actual submission identity rather than assuming the older environment's active account. Git worktree, ordinary commit/push and GitHub API PR updates are available here.
