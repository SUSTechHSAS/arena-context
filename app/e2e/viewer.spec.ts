import { expect, test } from '@playwright/test';

test('all 16 real canvas images match the untouched source viewer', async ({ page, context }) => {
  const original = await context.newPage();
  const errors: string[] = [];
  for (const target of [page, original]) {
    target.on('pageerror', error => errors.push(error.message));
    await target.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue() : route.abort());
    await target.addInitScript(() => { Date.now = () => 1720000000000; });
  }
  await original.goto('/__reference__/viewer.html');
  await original.locator('#seedInput').fill('  中文地牢  ');
  await original.getByRole('button', { name: '生成地图' }).click();
  await expect(original.locator('#status')).toContainText('生成了15层');
  await expect(original.locator('canvas')).toHaveCount(16);
  const expected = await original.locator('canvas').evaluateAll(canvases => canvases.map(canvas => (canvas as HTMLCanvasElement).toDataURL()));

  await page.goto('/');
  await page.getByLabel('地图种子').fill('  中文地牢  ');
  await page.getByRole('button', { name: '生成地图' }).click();
  await expect(page.locator('[data-testid="viewer-canvas"][data-ready="true"]')).toHaveCount(16);
  await expect(page.getByTestId('viewer-status')).toContainText('16 层');
  await expect(page.getByLabel('地图种子')).toHaveValue('  中文地牢  ');
  const actual = await page.getByTestId('viewer-canvas').evaluateAll(canvases => canvases.map(canvas => (canvas as HTMLCanvasElement).toDataURL()));
  expect(actual).toEqual(expected);
  expect(errors).toEqual([]);
  await original.close();
});

test('blank seed uses time once, supports keyboard and mobile without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { Date.now = () => 1720000000000; });
  await page.goto('/');
  await page.getByLabel('地图种子').press('Enter');
  await expect(page.getByLabel('地图种子')).toHaveValue('1720000000000');
  await expect(page.locator('[data-testid="viewer-canvas"][data-ready="true"]')).toHaveCount(16);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
