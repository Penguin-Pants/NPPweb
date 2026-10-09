import { expect, login, test } from './fixtures.js';

const LIMIT = 1_048_576;
const MESSAGE = 'Document limit is 1 MB. The change was not applied.';

test('an edit that would pass 1 MB is rejected with a message and the content stays unchanged', async ({ page, api }) => {
  // 100-byte lines, then a short last line, so the document is LIMIT - 5 bytes.
  const line = `${'a'.repeat(99)}\n`;
  const lines = Math.floor((LIMIT - 5) / line.length);
  const text = line.repeat(lines) + 'b'.repeat(LIMIT - 5 - lines * line.length);
  const res = await api.post('/api/documents?name=big.txt', { data: text, headers: { 'Content-Type': 'text/plain' } });
  const { id } = await res.json();

  await login(page);
  await page.evaluate((docId) => localStorage.setItem('pn.openTabs.v1', JSON.stringify({ ids: [docId], activeId: docId })), id);
  await page.reload();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');

  await page.keyboard.insertText('123456');
  await expect(page.getByRole('status')).toHaveText(MESSAGE);
  await expect(page.locator('#save-status')).toHaveText('Saved');

  const saved = page.waitForResponse((r) => r.request().method() === 'PUT');
  await page.keyboard.insertText('12345');
  expect((await saved).status()).toBe(200);
  const stored = (await (await api.get(`/api/documents/${id}`)).json()).content;
  expect(Buffer.byteLength(stored)).toBe(LIMIT);
  expect(stored.endsWith('b12345')).toBe(true);

  await page.evaluate(() => (document.getElementById('status-message').textContent = ''));
  let puts = 0;
  page.on('request', (req) => req.method() === 'PUT' && (puts += 1));
  await page.keyboard.type('x');
  await expect(page.getByRole('status')).toHaveText(MESSAGE);
  await page.waitForTimeout(1500);
  expect(puts).toBe(0);
  await expect(page.locator('#save-status')).toHaveText('Saved');
  expect(Buffer.byteLength((await (await api.get(`/api/documents/${id}`)).json()).content)).toBe(LIMIT);
});
