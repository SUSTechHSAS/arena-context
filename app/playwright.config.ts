import { defineConfig } from '@playwright/test';
import chromium, { inflate, setupLambdaEnvironment } from '@sparticuz/chromium';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

// Local Linux lacks NSS/NSPR. Use libraries already shipped in the locked npm
// package, without pretending to run on AWS or downloading an external browser.
const require = createRequire(import.meta.url);
await inflate(join(dirname(require.resolve('@sparticuz/chromium')), '../bin/al2023.tar.br'));
setupLambdaEnvironment(join(tmpdir(), 'al2023', 'lib'));

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    launchOptions: { executablePath: await chromium.executablePath(), args: chromium.args },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
