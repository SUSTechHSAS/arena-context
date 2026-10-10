import { expect, test } from '@playwright/test';
import { DungeonRandom } from '../src/domain/random';

test('boots offline, reports incomplete scope and replays exact seed state', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: '引擎实验室' }).click();
  await expect(page.getByRole('heading', { name: '种子序列实验室' })).toBeVisible();
  await expect(page.getByText('尚未完成', { exact: true })).toBeVisible();
  await page.getByLabel('世界种子').fill('🌋中文');
  await page.getByRole('button', { name: '生成序列' }).click();
  const stream = new DungeonRandom('🌋中文');
  for (let draw = 0; draw < 8; draw++) stream.next();
  await expect(page.getByTestId('random-state')).toHaveText(String(stream.state));
  await page.getByRole('button', { name: '生成序列' }).click();
  await expect(page.getByTestId('random-state')).toHaveText(String(stream.state));
  expect(errors).toEqual([]);
});
