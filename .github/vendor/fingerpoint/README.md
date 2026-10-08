# Fingerpoint runtime snapshot

Source: https://github.com/Ikaleio/lm-detector, MIT; see `LICENSE` and `provenance.json`.

The three runtime modules retain the upstream implementation. TypeScript types are stripped, local import extensions become `.mjs`, and trailing source whitespace is removed. No remote code is executed by `prepare`, `score`, `refresh`, or protocol CI. The source SHA-256, Git blob IDs, and generated module SHA-256 are recorded separately.

`seed.json.gz` contains a gzip-compressed schema 2 package with the exact upstream bank and detector bytes (individually gzip/base64 encoded), original SHA-256 and Git blob IDs, source commit, and fixed `environment-06` probes. Compression is lossless; no model, reference vector, precision, or calibration parameter is removed. `probes.json` contains only prompts, not example answers.

For an explicit maintenance update, review the upstream code and dataset changes first. With Node 24 and a checkout at the reviewed commit:

```sh
node .github/scripts/vendor-fingerpoint.mjs /path/to/lm-detector FULL_COMMIT_SHA
node --test .github/scripts/*.test.mjs .github/scripts/*.test.cjs
```

An API-downloaded source directory can instead supply `UPSTREAM_COMMIT` containing that exact commit and the same source paths. The command does not download files. Commit the generated modules, probes, provenance, seed, updated regression evidence, and documentation together. Changed algorithms or model groupings need integration review; do not merely replace the accepted hashes.

The test fixture `../../scripts/fixtures/fingerpoint.json` contains numeric runs from six reference-library groups, with source/sample IDs and upstream ranking expectations. It tests integration and deterministic replay, not held-out accuracy or the identity of a live Arena model.
