import { expect, login, openDocs, test } from './fixtures.js';

/** Counts requests for Mermaid's entry chunk. A tiny shared runtime chunk loads with main.js. */
function countChunks(page) {
  const counter = { count: 0 };
  page.on('request', (req) => /\/chunks\/mermaid\./.test(req.url()) && (counter.count += 1));
  return counter;
}

/** Puts the cursor on the last line, so blocks above it are drawn. */
const leaveBlocks = (page) => page.locator('.cm-line', { hasText: /^end$/ }).click();

const DIAGRAM = '```mermaid\ngraph TD\n  A[Start] --> B[End]\n```';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test('a mermaid block shows as a diagram and its source shows when the cursor is inside (MDV-12)', async ({ page, api }) => {
  const chunks = countChunks(page);
  await openDocs(page, api, [['a.md', `${DIAGRAM}\n\nend`]]);
  await leaveBlocks(page);
  const diagram = page.locator('.cm-md-mermaid svg');
  await expect(diagram).toBeVisible({ timeout: 15_000 });
  expect(chunks.count).toBeGreaterThan(0);
  await expect(page.locator('.cm-line', { hasText: 'graph TD' })).toHaveCount(0);
  await page.locator('.cm-md-mermaid').click();
  await expect(page.locator('.cm-line', { hasText: 'graph TD' })).toBeVisible();
});

test('Mermaid loads only for a diagram shown in Visual mode (MDV-13)', async ({ page, api }) => {
  const chunks = countChunks(page);
  await openDocs(page, api, [
    ['plain.md', '# No diagram\n\ntext'],
    ['code.py', 'x = 1'],
  ]);
  await page.getByRole('tab', { name: 'code.py' }).click();
  await page.getByRole('tab', { name: 'plain.md' }).click();
  await page.waitForTimeout(500);
  expect(chunks.count).toBe(0);
});

test('a diagram in Raw mode stays source and loads nothing (MDV-13)', async ({ page, api }) => {
  const chunks = countChunks(page);
  await openDocs(page, api, [['a.md', `${DIAGRAM}\n\nend`]], { mode: 'raw' });
  await leaveBlocks(page);
  await expect(page.locator('.cm-line', { hasText: 'graph TD' })).toBeVisible();
  await page.waitForTimeout(500);
  expect(chunks.count).toBe(0);
  await expect(page.locator('.cm-md-mermaid')).toHaveCount(0);
});

test('a diagram with a syntax error shows the error and keeps the source (EDGE-15)', async ({ page, api }) => {
  const [id] = await openDocs(page, api, [['a.md', '```mermaid\ngraph TD\n  A -->\n```\n\nend']]);
  await leaveBlocks(page);
  await expect(page.locator('.cm-md-mermaid-error')).toContainText('Diagram error', { timeout: 15_000 });
  expect((await (await api.get(`/api/documents/${id}`)).json()).content).toContain('A -->');
});

test('an image in a diagram never loads (MDV-14)', async ({ page, api }) => {
  let imageRequests = 0;
  await page.route('https://img.example/**', (route) => {
    imageRequests += 1;
    return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  });
  const source = '```mermaid\nflowchart TD\n  A@{ img: "https://img.example/x.png", label: "pic", pos: "t", h: 60, constraint: "off" }\n  A --> B\n```';
  await openDocs(page, api, [['a.md', `${source}\n\nend`]]);
  await leaveBlocks(page);
  await expect(page.locator('.cm-md-mermaid svg')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  expect(imageRequests).toBe(0);
  await expect(page.locator('.cm-md-mermaid image, .cm-md-mermaid img')).toHaveCount(0);
});

/** Records calls to startViewTransition and root animations. */
async function spyOnTransitions(page) {
  await page.addInitScript(() => {
    window.__transitions = 0;
    window.__animations = [];
    if (document.startViewTransition) {
      const original = document.startViewTransition.bind(document);
      document.startViewTransition = (update) => {
        window.__transitions += 1;
        return original(update);
      };
    }
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      window.__animations.push(options?.pseudoElement ?? null);
      return animate.call(this, keyframes, options);
    };
  });
}

test('the theme switch animates as a circle with View Transitions (THM-1) @smoke', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Checks the animation path where the API exists.');
  await spyOnTransitions(page);
  await login(page);
  await page.getByRole('button', { name: 'Light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => window.__transitions)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__animations)).toContain('::view-transition-new(root)');
});

test('with reduced motion or without the API, the theme switches at once (THM-2)', async ({ page, browser, server }) => {
  await spyOnTransitions(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  await page.getByRole('button', { name: 'Light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => window.__transitions)).toBe(0);

  const other = await browser.newContext({ baseURL: server.url });
  const noApi = await other.newPage();
  await noApi.addInitScript(() => {
    delete Document.prototype.startViewTransition;
  });
  await login(noApi);
  await noApi.getByRole('button', { name: 'Light theme' }).click();
  await expect(noApi.locator('html')).toHaveAttribute('data-theme', 'light');
  await other.close();
});
