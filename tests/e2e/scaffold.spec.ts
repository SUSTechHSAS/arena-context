import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DungeonRandom } from '../../src/engine/random';
const legacyHtml = readFileSync('tests/reference/chinese-dungeon/ChineseDungeon.html', 'utf8');
const gsap = readFileSync('node_modules/gsap/dist/gsap.min.js', 'utf8');
test('modern scaffold renders and computes engine samples', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '重铸 · 中文地牢' })).toBeVisible();
  await page.getByLabel('世界种子').fill('test');
  await page.getByRole('button', { name: '检查随机序列' }).click();
  const rng = new DungeonRandom('test');
  await expect(page.locator('output')).toHaveText(Array.from({ length: 5 }, rng.next).map(n => n.toFixed(8)).join(' · '));
  expect(errors).toEqual([]);
});
test('frozen full legacy script boots offline and exposes PRNG bridge', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // No external request is allowed. GSAP is loaded from npm, remote workshop is intentionally offline.
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url === 'http://localhost:5173/legacy') return route.fulfill({ contentType: 'text/html', body: legacyHtml });
    if (url.includes('/gsap/')) return route.fulfill({ contentType: 'application/javascript', body: gsap });
    if (url.includes('@supabase')) return route.fulfill({ contentType: 'application/javascript', body: 'window.supabase={createClient(){return null}};' });
    return route.abort();
  });
  await page.goto('/legacy');
  await expect(page.locator('#主菜单容器')).toBeVisible();
  const values = await page.evaluate(() => {
    // Evaluate in the classic-script global lexical scope; no alteration of frozen fixture.
    return window.eval("初始化随机数生成器('test'); Array.from({length:20},()=>prng())") as number[];
  });
  const rng = new DungeonRandom('test');
  expect(values).toEqual(Array.from({ length: 20 }, rng.next));
  expect(errors).toEqual([]);
});
