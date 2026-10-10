// Chromium runs every spec. Firefox and WebKit run the @smoke specs (section 6).
// The perf spec runs last and alone, because other tests running beside it
// change its times. `--project=perf --no-deps` runs only the perf spec.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.js',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /perf\.spec/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grep: /@smoke/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grep: /@smoke/ },
    {
      name: 'perf',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /perf\.spec/,
      fullyParallel: false,
      dependencies: ['chromium', 'firefox', 'webkit'],
    },
  ],
});
