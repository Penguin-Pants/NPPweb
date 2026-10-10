import { expect, login, test } from './fixtures.js';

// NFR-1 targets (T25): open and render under 2 s, 200 typed characters under
// 3 s, Ctrl+End under 0.5 s, no console errors. Runs with the default 5-second
// autosave delay (SAV-2), as in production.
const TARGET_BYTES = 1_048_000;

test.use({ autosaveSeconds: null });

function pythonLikeText() {
  const parts = [];
  let bytes = 0;
  for (let i = 0; bytes < TARGET_BYTES - 200; i += 1) {
    const block = `def function_${i}(value, other=None):\n    """Docstring ${i}."""\n    return value * ${i} + len(str(other))  # note\n\n`;
    parts.push(block);
    bytes += Buffer.byteLength(block);
  }
  const text = parts.join('');
  return text + '#'.repeat(TARGET_BYTES - Buffer.byteLength(text) - 1) + '\n';
}

test('a 1 MB document opens, types and scrolls within the targets', async ({ page, api, browserName }) => {
  test.skip(browserName !== 'chromium', 'Performance targets are measured in Chromium.');
  const errors = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  page.on('pageerror', (err) => errors.push(err.message));

  const text = pythonLikeText();
  expect(Buffer.byteLength(text)).toBe(TARGET_BYTES);
  const res = await api.post('/api/documents?name=big.py', { data: text, headers: { 'Content-Type': 'text/plain' } });
  const { id } = await res.json();
  await login(page);
  await page.evaluate((docId) => localStorage.setItem('pn.openTabs.v1', JSON.stringify({ ids: [docId], activeId: docId })), id);

  const openStart = Date.now();
  await page.reload();
  await expect(page.locator('.cm-content')).toHaveAttribute('data-language', 'python');
  await expect(page.locator('.cm-line').first()).toContainText('def function_0');
  const openMs = Date.now() - openStart;

  await page.locator('.cm-line').first().click();
  const typeStart = Date.now();
  await page.keyboard.type('x'.repeat(200));
  await expect(page.locator('.cm-line').first()).toContainText('x'.repeat(200));
  const typeMs = Date.now() - typeStart;

  const endStart = Date.now();
  await page.keyboard.press('ControlOrMeta+End');
  await expect(page.locator('.cm-line', { hasText: '#'.repeat(50) })).toBeVisible();
  const endMs = Date.now() - endStart;

  console.log(`perf: open ${openMs} ms, type 200 chars ${typeMs} ms, Ctrl+End ${endMs} ms`);
  expect(openMs).toBeLessThan(2000);
  expect(typeMs).toBeLessThan(3000);
  expect(endMs).toBeLessThan(500);
  await expect(page.locator('#save-status')).toHaveText('Saved', { timeout: 10_000 });
  expect(errors).toEqual([]);
});
