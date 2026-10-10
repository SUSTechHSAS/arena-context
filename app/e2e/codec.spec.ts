import { expect, test } from '@playwright/test';
import { webcrypto } from 'node:crypto';
import { createOracle } from '../test/oracle/source';

test('actual browser WebCrypto and Unicode codecs match the exact original contract', async ({ page }) => {
  const value = '中文🌋\ud800';
  const original = createOracle(['生成签名', '数据完整性密钥'], { TextEncoder, crypto: webcrypto });
  const expectedSignature = await original.invoke<Promise<string>>('生成签名', value);
  await page.goto('/');
  const actual = await page.evaluate(async input => {
    const url = '/src/storage/codec.ts';
    const module = await import(url) as typeof import('../src/storage/codec');
    const warnings: { message: string; name: string }[] = [];
    const raw = '!!malformed';
    const result = module.safeDecode(raw, (message, _value, failure) => warnings.push({ message, name: (failure as Error).name }));
    return {
      signature: await module.generateSignature(input),
      roundTrip: module.safeDecodeQuiet(module.safeEncode('中文🌋')),
      fallback: result, warnings,
    };
  }, value);
  expect(actual.signature).toBe(expectedSignature);
  expect(actual.roundTrip).toBe('中文🌋');
  expect(actual.fallback).toBe('!!malformed');
  expect(actual.warnings).toHaveLength(1);
  expect(actual.warnings[0]!.message).toBe('Base64解码失败，返回原始字符串:');
});
