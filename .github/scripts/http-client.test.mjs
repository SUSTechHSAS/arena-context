import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { makeHttpFetch, parseCurlResponse, errorDetail } from './http-client.mjs';
import { loadLivePolicy, POLICY_URL } from './model-gate.mjs';

const payload = '{"schema":1,"accepted_models":["gpt-6-astra"]}\n';
const wire = (body, status = 200, url = POLICY_URL) => `${body}\n__ARENA_HTTP_RESPONSE__${status}\t${url}`;

test('curl response parsing preserves exact body bytes and does not follow policy redirects', async () => {
  let args;
  const request = makeHttpFetch({ env: {}, runner: async (command, argv) => { assert.equal(command, 'curl'); args = argv; return { stdout: wire(payload) }; } });
  const response = await request(POLICY_URL, { redirect: 'error', headers: { Accept: 'application/vnd.github.raw+json' } });
  assert.equal(await response.text(), payload); assert.equal(response.transport, 'curl');
  assert.ok(!args.includes('--location')); assert.ok(!args.includes('--insecure')); assert.ok(!args.includes('-k'));
  assert.equal(args.at(-1), POLICY_URL);
  assert.equal(parseCurlResponse(wire('denied', 403)).ok, false);
});
test('configured proxy is respected: failing curl never falls back to a direct native connection', async () => {
  let nativeCalls = 0;
  const request = makeHttpFetch({ env: { https_proxy: 'http://user:secret@proxy.invalid' },
    runner: async () => { const e = new Error('Command may contain secrets'); e.code = 5; e.stderr = "Unsupported proxy syntax: http://user:secret@proxy.invalid"; throw e; },
    nativeFetch: async () => { nativeCalls++; } });
  await assert.rejects(request(POLICY_URL), error => error.code === 'PROXY_TRANSPORT_FAILED' && !error.message.includes('secret'));
  assert.equal(nativeCalls, 0);
});
test('large detector transfers opt into compression and a bounded longer timeout', async () => {
  const request = makeHttpFetch({ env: {}, runner: async (command, args, options) => {
    assert.equal(command, 'curl'); assert.ok(args.includes('--compressed'));
    assert.equal(args[args.indexOf('--max-time') + 1], '60');
    assert.equal(options.timeout, 62000);
    assert.ok(!args.includes('--location')); assert.ok(!args.includes('--insecure'));
    return { stdout: wire(payload) };
  } });
  assert.equal(await (await request(POLICY_URL, { timeoutMs: 60000, redirect: 'error' })).text(), payload);
  for (const timeoutMs of [0, -1, Infinity, 60001]) await assert.rejects(request(POLICY_URL, { timeoutMs }), /invalid_request_timeout/);
});
test('without a configured proxy, missing curl can use native fetch and retain useful cause codes', async () => {
  const unavailable = async () => { const e = new Error('missing'); e.code = 'ENOENT'; throw e; };
  const request = makeHttpFetch({ env: {}, runner: unavailable, nativeFetch: async (_, options) => {
    assert.equal(options.redirect, 'error'); return { ok: true, status: 200, url: POLICY_URL, text: async () => payload };
  } });
  assert.equal((await request(POLICY_URL, { redirect: 'error' })).transport, 'node-fetch');
  const failure = makeHttpFetch({ env: {}, runner: unavailable, nativeFetch: async () => { throw new Error('fetch failed', { cause: { code: 'ENOTFOUND' } }); } });
  await assert.rejects(failure(POLICY_URL), /ENOTFOUND/);
});
test('policy uses only the allowed API, accepts its inline Contents envelope, and never requests download_url', async () => {
  const calls = [];
  const policy = await loadLivePolicy(async (url, options) => {
    calls.push(url); assert.equal(new URL(url).hostname, 'api.github.com'); assert.equal(options.redirect, 'error');
    return { ok: true, url, text: async () => JSON.stringify({ type: 'file', path: '.github/fingerprint-policy.json', encoding: 'base64',
      content: Buffer.from(payload).toString('base64'), download_url: 'https://raw.githubusercontent.com/forbidden' }) };
  });
  assert.equal(calls.length, 1); assert.deepEqual(policy.accepted_models, ['gpt-6-astra']);
  await assert.rejects(loadLivePolicy(async () => ({ ok: true, url: 'https://raw.githubusercontent.com/forbidden', text: async () => payload })), /unexpected_policy_redirect/);
});
test('HTTP policy failure remains a policy failure, rather than a fabricated invalid-list diagnosis', async () => {
  await assert.rejects(loadLivePolicy(async () => { throw new Error('fetch failed', { cause: { code: 'ENOTFOUND' } }); }), error => {
    assert.match(error.message, /ENOTFOUND/); assert.ok(!error.message.includes('invalid_model_policy'));
    assert.equal(error.diagnostics[0].endpoint, 'github_api'); return true;
  });
  assert.ok(!errorDetail(new Error('http://user:secret@proxy.invalid')).includes('secret'));
});
test('real curl can read through a standard environment HTTP proxy without resolving the target host', async () => {
  let received;
  const server = http.createServer((req, res) => { received = req.url; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(payload); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const proxy = `http://127.0.0.1:${server.address().port}`;
    const env = { ...process.env, http_proxy: proxy, HTTP_PROXY: proxy, https_proxy: proxy, HTTPS_PROXY: proxy, all_proxy: '', ALL_PROXY: '', no_proxy: '', NO_PROXY: '' };
    const response = await makeHttpFetch({ env, nativeFetch: async () => { throw new Error('must use configured proxy'); } })('http://model-policy.invalid/policy');
    assert.equal(await response.text(), payload); assert.equal(received, 'http://model-policy.invalid/policy');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
