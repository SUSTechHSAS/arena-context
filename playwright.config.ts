import { defineConfig } from '@playwright/test';
import chromium from '@sparticuz/chromium';
export default defineConfig({
  testDir: './tests/e2e', workers: 1, timeout: 30000,
  use: { baseURL: 'http://localhost:5173', browserName: 'chromium',
    launchOptions: { executablePath: await chromium.executablePath(), args: chromium.args.filter(arg => arg !== "--single-process") } },
  webServer: { command: 'npm run dev -- --port 5173', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI },
});
