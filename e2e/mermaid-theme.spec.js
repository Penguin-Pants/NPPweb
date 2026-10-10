import { expect, login, openDocs, test } from './fixtures.js';

/** Counts requests for the diagram frame script, which loads Mermaid. */
function countLoads(page) {
  const counter = { count: 0 };
  page.on('request', (req) => /\/mermaid-frame\.js$/.test(req.url()) && (counter.count += 1));
  return counter;
}

/** Puts the cursor on the last line, so blocks above it are drawn. */
const leaveBlocks = (page) => page.locator('.cm-line', { hasText: /^end$/ }).click();

const DIAGRAM = '```mermaid\ngraph TD\n  A[Start] --> B[End]\n```';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test('a mermaid block shows as a diagram and its source shows when the cursor is inside (MDV-12)', async ({ page, api }) => {
  const loads = countLoads(page);
  await openDocs(page, api, [['a.md', `${DIAGRAM}\n\nend`]]);
  await leaveBlocks(page);
  const diagram = page.locator('.cm-md-mermaid img');
  await expect(diagram).toBeVisible({ timeout: 15_000 });
  expect(await diagram.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  expect(loads.count).toBe(1);
  await expect(page.locator('.cm-line', { hasText: 'graph TD' })).toHaveCount(0);
  await page.locator('.cm-md-mermaid').click();
  await expect(page.locator('.cm-line', { hasText: 'graph TD' })).toBeVisible();
});

test('the arrow keys move into a diagram, so its source shows (MDV-12)', async ({ page, api }) => {
  await openDocs(page, api, [['a.md', `above\n${DIAGRAM}\nbelow\n\nend`]]);
  await leaveBlocks(page);
  await expect(page.locator('.cm-md-mermaid img')).toBeVisible({ timeout: 15_000 });
  await page.locator('.cm-line', { hasText: /^above$/ }).click();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.cm-activeLine')).toHaveText('```mermaid');
  await leaveBlocks(page);
  await expect(page.locator('.cm-md-mermaid img')).toBeVisible();
  await page.locator('.cm-line', { hasText: /^below$/ }).click();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.cm-activeLine')).toHaveText('```');
  await expect(page.locator('.cm-line', { hasText: 'graph TD' })).toBeVisible();
});

test('Mermaid loads only for a diagram shown in Visual mode (MDV-13)', async ({ page, api }) => {
  const loads = countLoads(page);
  await openDocs(page, api, [
    ['plain.md', '# No diagram\n\ntext'],
    ['code.py', 'x = 1'],
  ]);
  await page.getByRole('tab', { name: 'code.py' }).click();
  await page.getByRole('tab', { name: 'plain.md' }).click();
  await page.waitForTimeout(500);
  expect(loads.count).toBe(0);
  await expect(page.locator('iframe.mermaid-frame')).toHaveCount(0);
});

test('a diagram in Raw mode stays source and loads nothing (MDV-13)', async ({ page, api }) => {
  const loads = countLoads(page);
  await openDocs(page, api, [['a.md', `${DIAGRAM}\n\nend`]], { mode: 'raw' });
  await leaveBlocks(page);
  await expect(page.locator('.cm-line', { hasText: 'graph TD' })).toBeVisible();
  await page.waitForTimeout(500);
  expect(loads.count).toBe(0);
  await expect(page.locator('.cm-md-mermaid')).toHaveCount(0);
});

test('a diagram with a syntax error shows the error, keeps the source and leaves nothing on the page (EDGE-15)', async ({ page, api }) => {
  const bad = (n) => `\`\`\`mermaid\ngraph TD\n  A${n} -->\n\`\`\``;
  const [id] = await openDocs(page, api, [['a.md', `${bad(1)}\n\n${bad(2)}\n\n${DIAGRAM}\n\nend`]]);
  await leaveBlocks(page);
  await expect(page.locator('.cm-md-mermaid-error')).toHaveCount(2, { timeout: 15_000 });
  await expect(page.locator('.cm-md-mermaid-error').first()).toContainText('Diagram error');
  await expect(page.locator('.cm-md-mermaid img')).toBeVisible();
  // Mermaid marks each SVG it draws. None stays in the page, also after errors.
  await expect(page.locator('[aria-roledescription]')).toHaveCount(0);
  expect((await (await api.get(`/api/documents/${id}`)).json()).content).toContain('A1 -->');
});

test('a failed load says so, and the diagram loads when it shows again', async ({ page, api }) => {
  let fail = true;
  await page.route('**/mermaid-frame.js', (route) => (fail ? route.fulfill({ status: 401, body: '' }) : route.continue()));
  await openDocs(page, api, [['a.md', `${DIAGRAM}\n\nend`]]);
  await leaveBlocks(page);
  await expect(page.locator('.cm-md-mermaid')).toContainText('Could not load the diagram tool', { timeout: 15_000 });
  fail = false;
  await page.locator('.cm-md-mermaid').click();
  await leaveBlocks(page);
  await expect(page.locator('.cm-md-mermaid img')).toBeVisible({ timeout: 15_000 });
});

// Each way a diagram could name a remote image or stylesheet (MDV-14).
const REMOTE = [
  ['image node', 'flowchart TD\n  A@{ img: "https://img.example/1.png", label: "pic", pos: "t", h: 60, constraint: "off" }\n  A --> B'],
  ['unquoted image key', 'flowchart TD\n  A@{ img: https://img.example/2.png, h: 60 }\n  A --> B'],
  ['quoted image key', 'flowchart TD\n  A@{ "img": "https://img.example/3.png", h: 60 }\n  A --> B'],
  ['label img', 'flowchart TD\n  A["<img src=\'https://img.example/4.png\' width=20>"] --> B'],
  ['label srcset', 'flowchart TD\n  A["<img srcset=\'https://img.example/5.png 1x\'>"] --> B'],
  ['label style', 'flowchart TD\n  A["<span style=\'background:url(https://img.example/6.png)\'>x</span>"] --> B'],
  ['themeCSS', '%%{init: {"themeCSS": ".node rect { fill: url(https://img.example/7.png) }"}}%%\nflowchart TD\n  A --> B'],
  ['classDef', 'flowchart TD\n  A --> B\n  classDef c fill:url(https://img.example/8.png)\n  class A c'],
];

test('no image or stylesheet in a diagram loads in Visual mode (MDV-14)', async ({ page, api }) => {
  const hits = [];
  await page.route('https://img.example/**', (route) => {
    hits.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  });
  const blocks = REMOTE.map(([, source]) => `\`\`\`mermaid\n${source}\n\`\`\``).join('\n\n');
  await openDocs(page, api, [['a.md', `${blocks}\n\nend`]]);
  await leaveBlocks(page);
  await expect(page.locator('.cm-md-mermaid img, .cm-md-mermaid-error')).toHaveCount(REMOTE.length, { timeout: 30_000 });
  await page.waitForTimeout(1000);
  expect(hits).toEqual([]);
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

test('a quick second theme switch leaves no page error, and diagrams follow the theme (THM-1, MDV-12)', async ({ page, api }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await openDocs(page, api, [['a.md', `${DIAGRAM}\n\nend`]]);
  await leaveBlocks(page);
  const image = page.locator('.cm-md-mermaid img');
  await expect(image).toBeVisible({ timeout: 15_000 });
  const darkImage = await image.getAttribute('src');
  await page.locator('#theme-toggle').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => image.getAttribute('src'), { timeout: 15_000 }).not.toBe(darkImage);
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test('more diagrams than the renderer keeps are not drawn again when one of them changes (MDV-12)', async ({ page, api }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 6000 });
  const blocks = Array.from({ length: 34 }, (_, i) => `\`\`\`mermaid\ngraph LR\n  N${i} --> M${i}\n\`\`\``).join('\n\n');
  await openDocs(page, api, [['a.md', `end\n\n${blocks}`]]);
  await page.locator('.cm-line', { hasText: /^end$/ }).click();
  await expect(page.locator('.cm-md-mermaid img')).toHaveCount(34, { timeout: 60_000 });
  await page.evaluate(() => {
    window.__redraws = 0;
    new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) if (node.classList?.contains('cm-md-mermaid')) window.__redraws += 1;
    }).observe(document.querySelector('.cm-content'), { childList: true, subtree: true });
  });
  // A new source pushes the oldest kept result out of the renderer.
  await page.locator('.cm-md-mermaid').last().click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await expect(page.locator('.cm-activeLine')).toHaveText('  N33 --> M33X');
  await page.locator('.cm-line', { hasText: /^end$/ }).click();
  await expect(page.locator('.cm-md-mermaid img')).toHaveCount(34, { timeout: 30_000 });
  await page.waitForTimeout(2000);
  // Only the changed diagram: once while it draws and once with its result.
  expect(await page.evaluate(() => window.__redraws)).toBeLessThanOrEqual(2);
});
