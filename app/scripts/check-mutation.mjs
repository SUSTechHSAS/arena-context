import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Deliberately introduce the tempting off-by-one "fix" in the actual new module.
// Always restore bytes; a passing mutant or infrastructure error is a failure.
const path = new URL('../src/domain/distance-map.ts', import.meta.url);
const original = readFileSync(path, 'utf8');
const needle = 'if (distance > 99) continue;';
assert.equal(original.split(needle).length, 2, 'Mutation anchor must occur exactly once');
try {
  writeFileSync(path, original.replace(needle, 'if (distance >= 99) continue;'));
  const result = spawnSync(process.execPath, [
    'node_modules/vitest/vitest.mjs', 'run', 'tests/distance-map.test.ts',
    '-t', 'distance 100 is reachable but 101 is not',
  ], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  assert.equal(result.error, undefined, 'Vitest must start successfully');
  assert.equal(result.status, 1, `Mutant should fail a test, not pass or crash:\n${output}`);
  assert.match(output, /AssertionError/, 'Failure must be an assertion, not a build error');
  assert.match(output, /distance 100 is reachable but 101 is not/);
  console.log('Mutation killed: > 99 → >= 99 failed the distance-horizon parity test.');
} finally {
  writeFileSync(path, original);
  assert.equal(readFileSync(path, 'utf8'), original);
  console.log('Original implementation restored byte-for-byte.');
}
