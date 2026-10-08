import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateSignature, safeDecode, safeDecodeQuiet, safeEncode } from '../src/storage/codec';
import { createOracle, declaration } from './oracle/source';

const intrinsics = { btoa, atob, escape, unescape, encodeURIComponent, decodeURIComponent, TextEncoder, crypto: webcrypto };
const source = createOracle(['safeEncode', 'safeDecode', '生成签名', '数据完整性密钥'], intrinsics);
const manager = createOracle(['safeEncode', 'safeDecode', 'generateSignature', 'DATA_INTEGRITY_KEY'], intrinsics,
  'LevelManager.html', 'dom-ready');

function outcome(action: () => unknown) {
  try { return { value: action() }; }
  catch (failure) { return { error: (failure as Error).name, message: (failure as Error).message }; }
}

describe('source-compatible shared save/workshop codecs and signatures', () => {
  it('exact AST nested extraction selects only the explicit manager scope', () => {
    expect(() => declaration('safeEncode', 'LevelManager.html')).toThrow(/exactly one/);
    expect(declaration('safeEncode', 'LevelManager.html', 'dom-ready')).toContain('btoa(unescape(encodeURIComponent(str)))');
  });

  it('Unicode/UTF-16, native coercion and encoding exceptions match both source pages', () => {
    for (const value of ['', '中文🌋', 'ä©\r\n\0', '\ud800', '\udfff', 'a/b?%+#', null, undefined, false, 42, NaN,
      { toString: () => '自定义对象' }, Symbol('invalid')]) {
      expect(outcome(() => safeEncode(value))).toEqual(outcome(() => source.invoke('safeEncode', value)));
      expect(outcome(() => safeEncode(value))).toEqual(outcome(() => manager.invoke('safeEncode', value)));
    }
  });

  it('quiet decode preserves malformed Base64/UTF-8 fallback identity, whitespace and primitives', () => {
    for (const value of [safeEncode('中文🌋'), '', ' Zm9v \n', '!!notbase64', 'a', '/w==', null, undefined,
      false, 42, Symbol('invalid'), { raw: 'original object' }]) {
      const actual = safeDecodeQuiet(value); const expected = manager.invoke('safeDecode', value);
      expect(actual).toBe(expected);
      if (typeof value === 'object' || typeof value === 'symbol') expect(actual).toBe(value);
    }
  });

  it('main-game fallback emits the same warning before returning original input', () => {
    for (const value of ['invalid!!', '/w==', {}, Symbol('bad')]) {
      const expectedWarnings: unknown[][] = []; const actualWarnings: unknown[][] = [];
      const record = (target: unknown[][]) => (message: string, input: unknown, failure: unknown) => {
        target.push([message, input, (failure as Error).name, (failure as Error).message]);
      };
      source.context.console = { warn: record(expectedWarnings) };
      expect(safeDecode(value, record(actualWarnings))).toBe(source.invoke('safeDecode', value));
      expect(actualWarnings).toEqual(expectedWarnings);
      expect(actualWarnings).toHaveLength(1);
    }
  });

  it('warning callbacks may throw as in the source; valid decode does not call them', () => {
    const fail = () => { throw new Error('logger failed'); };
    source.context.console = { warn: fail };
    expect(() => source.invoke('safeDecode', 'invalid!!')).toThrow('logger failed');
    expect(() => safeDecode('invalid!!', fail)).toThrow('logger failed');
    expect(safeDecode(safeEncode('正常'), fail)).toBe('正常');
  });

  it('signs exact strings/coercion/UTF-8 and returns identical lower-case bytes', async () => {
    for (const value of ['', '中文🌋', '\ud800', null, undefined, 0, NaN, true,
      { valueOf: () => 7, toString: () => 'different string hint' }, '{"a":1,"b":2}', '{"b":2,"a":1}']) {
      const expected = await source.invoke<Promise<string>>('生成签名', value);
      expect(await generateSignature(value)).toBe(expected);
      expect(await manager.invoke<Promise<string>>('generateSignature', value)).toBe(expected);
      expect(expected).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(await generateSignature('{"a":1,"b":2}')).not.toBe(await generateSignature('{"b":2,"a":1}'));
  });

  it('signs the actual unsigned NPC fixture bytes without claiming save cross-load', async () => {
    const payload = JSON.parse(readFileSync(new URL('../../reference/chinese-dungeon/自定义NPC演示.json', import.meta.url), 'utf8')) as Record<string, unknown>;
    expect(payload.signature).toBeUndefined();
    expect(payload.游戏版本).toBe(1532);
    const text = JSON.stringify(payload);
    expect(await generateSignature(text)).toBe(await source.invoke<Promise<string>>('生成签名', text));
    expect(await generateSignature(text)).toBe(await manager.invoke<Promise<string>>('generateSignature', text));
  });

  it('preserves signature coercion failure, does not silently String() Symbols', async () => {
    const value = Symbol('invalid');
    await expect(generateSignature(value)).rejects.toThrow();
    await expect(source.invoke<Promise<string>>('生成签名', value)).rejects.toThrow();
    await expect(manager.invoke<Promise<string>>('generateSignature', value)).rejects.toThrow();
  });
});
