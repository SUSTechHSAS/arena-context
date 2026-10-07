import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const marker = '\n__ARENA_HTTP_RESPONSE__';
const proxyKeys = ['https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY', 'all_proxy', 'ALL_PROXY'];
const safe = text => String(text || '').replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/]*@/gi, '$1[redacted]@').slice(0, 500);

export function errorDetail(error) {
  const code = error?.cause?.code || error?.code;
  return safe(`${error?.message || String(error)}${code ? ` [${code}]` : ''}`);
}

export function hasProxy(env = process.env) { return proxyKeys.some(key => Boolean(env[key])); }

export function parseCurlResponse(stdout) {
  const boundary = stdout.lastIndexOf(marker);
  if (boundary < 0) throw new Error('curl_response_metadata_missing');
  const meta = stdout.slice(boundary + marker.length);
  const separator = meta.indexOf('\t');
  const status = Number(meta.slice(0, separator)), url = meta.slice(separator + 1).trim();
  if (separator < 0 || status < 100 || status > 599 || !/^https?:\/\//.test(url)) throw new Error('curl_response_metadata_invalid');
  return { ok: status >= 200 && status < 300, status, url, transport: 'curl', text: async () => stdout.slice(0, boundary) };
}

// curl honors the sandbox's standard proxy and CA configuration. No -k, no
// credential output, no direct-connect fallback around a configured proxy.
export function makeHttpFetch({ env = process.env, nativeFetch = globalThis.fetch, runner = run } = {}) {
  return async function httpFetch(url, options = {}) {
    const target = new URL(url);
    if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password) throw new Error('unsupported_request_url');
    const limit = options.maxBytes || 8_000_000;
    const args = ['-q', '--silent', '--show-error',
      '--connect-timeout', '4', '--max-time', '9', '--max-filesize', String(limit),
      '--proto', '=http,https', '--proto-redir', target.protocol === 'https:' ? '=https' : '=http,https'];
    // API policy reads must not follow redirects onto an unapproved host.
    if (options.redirect !== 'error') args.push('--location', '--max-redirs', '3');
    for (const [name, value] of Object.entries(options.headers || {})) {
      if (/[\r\n]/.test(name + value)) throw new Error('invalid_request_header');
      args.push('--header', `${name}: ${value}`);
    }
    args.push('--write-out', `${marker}%{http_code}\t%{url_effective}`, '--', String(url));
    let curlError;
    try {
      const { stdout } = await runner('curl', args, { env, encoding: 'utf8', maxBuffer: limit + 65536,
        timeout: 11000, signal: options.signal });
      const response = parseCurlResponse(stdout);
      if (Buffer.byteLength(await response.text()) > limit) throw new Error('response_too_large');
      return response;
    } catch (error) {
      // execFile's default message includes command arguments; never surface it.
      curlError = new Error(`curl_failed${error.code === 'ENOENT' ? ': executable not found' : ''}${error.stderr ? ': ' + safe(error.stderr.trim()) : ''}`);
      curlError.code = error.code || 'CURL_ERROR';
    }
    if (hasProxy(env)) {
      const error = new Error(`proxy_transport_failed: ${errorDetail(curlError)}`);
      error.code = 'PROXY_TRANSPORT_FAILED';
      throw error;
    }
    if (typeof nativeFetch !== 'function') throw curlError;
    try {
      const response = await nativeFetch(url, options);
      const body = await response.text();
      if (Buffer.byteLength(body) > limit) throw new Error('response_too_large');
      return { ok: response.ok, status: response.status, url: response.url, transport: 'node-fetch', text: async () => body };
    } catch (error) {
      const combined = new Error(`network_request_failed: ${errorDetail(curlError)}; node: ${errorDetail(error)}`);
      combined.code = 'NETWORK_REQUEST_FAILED';
      throw combined;
    }
  };
}

export const httpFetch = makeHttpFetch();
