# Task #10 environment

Observed 2026-10-08: Node 22.22.3, npm 10.9.8, Python 3.11.2. No system Chromium/Chrome/Firefox binary found at startup.

Source-integrity checks require only Node. The modern app's dependencies and reproducible install commands will be recorded alongside its lockfile. Browser tests must use an explicitly available browser; do not claim a browser run from jsdom or a curl response. npm-hosted browser packages are a possible allowed installation path; browser downloads from unlisted hosts are not permitted.

GitHub authentication is configured as SUSTechHSAS. Shell git commit/push and GitHub API calls through gh work. `gh pr edit` uses a deprecated GraphQL Projects field in this environment; use `gh api repos/SUSTechHSAS/arena-context/pulls/19 --method PATCH` for PR summaries. Actions log redirects to results-receiver.actions.githubusercontent.com are not accessible; use API check/status metadata, not guessed logs.

Servers must bind `0.0.0.0` and allow `.e2b.app` preview hosts. Browser code must use relative app URLs, not sandbox localhost. No live workshop/socket writes are authorized as part of local validation.

## U01 browser/tooling recovery

Application dependencies are locked in app/package-lock.json. Run `npm ci --ignore-scripts` in app, then `npm run check` and `npm run test:e2e`. Real Chromium 153 from the npm-hosted @sparticuz/chromium package is available. Its bundled al2023 shared-library archive is explicitly inflated in app/playwright.config.ts, resolving missing NSS/NSPR libraries without apt or an unlisted download. This configuration actually passed on Linux x64; other OS/browser engines are unverified. Temporary /tmp extraction is reproducible and is not the only copy of a deliverable.

Chromium multi-context testing requires filtering out the package’s Lambda-specific --single-process flag. The actual three-test browser suite (including two pages) passed after this change. No test scope was reduced.
