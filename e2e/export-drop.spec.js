import { readFile } from 'node:fs/promises';
import { expect, login, openDocs, test } from './fixtures.js';

const exportButton = (page) => page.getByRole('button', { name: 'Export', exact: true });
const formats = (page) => page.getByRole('group', { name: 'Export formats' }).getByRole('button');

/** Exports the active tab in a format and returns the download's name and text. */
async function exportAs(page, label) {
  await exportButton(page).click();
  const downloading = page.waitForEvent('download');
  await formats(page).filter({ hasText: label }).click();
  const download = await downloading;
  return { name: download.suggestedFilename(), text: await readFile(await download.path(), 'utf8') };
}

test('the Export menu offers the formats of the active tab, and hides with no tab (EXP-1, EXP-2) @smoke', async ({ page, api }) => {
  await openDocs(page, api, [
    ['notes.md', '# Notes'],
    ['app.py', 'x = 1'],
    ['Untitled 3', 'plain'],
  ]);
  await exportButton(page).click();
  await expect(formats(page)).toHaveText(['Markdown (.md)', 'Plain text (.txt)', 'Web page (.html)', 'PDF (print dialog)']);
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'app.py' }).click();
  await exportButton(page).click();
  await expect(formats(page)).toHaveText(['Original (.py)', 'Plain text (.txt)']);
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Untitled 3' }).click();
  await exportButton(page).click();
  await expect(formats(page)).toHaveText(['Plain text (.txt)']);
  await page.keyboard.press('Escape');
  for (const name of ['notes.md', 'app.py', 'Untitled 3']) {
    await page.getByRole('button', { name: `Close ${name}` }).click();
    await page.getByRole('dialog', { name: 'Close document' }).getByRole('button', { name: 'Keep' }).click();
  }
  await expect(exportButton(page)).toBeHidden();
});

test('md, txt and html exports download at once with the unsaved text (EXP-1, EXP-3, EXP-4, EXP-6, EXP-7)', async ({ page, api }) => {
  await openDocs(page, api, [['a/b notes.md', '# Title\n\n**bold** [link](https://x.y)\n\n```python\ndef f(): pass\n```']]);
  await page.locator('.cm-line', { hasText: 'bold' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' typed now');
  const md = await exportAs(page, 'Markdown');
  expect(md.name).toBe('a_b notes.md');
  expect(md.text).toContain('[link](https://x.y) typed now');
  const txt = await exportAs(page, 'Plain text');
  expect(txt.name).toBe('a_b notes.txt');
  expect(txt.text).toBe('Title\n\nbold link typed now\n\ndef f(): pass');
  const html = await exportAs(page, 'Web page');
  expect(html.name).toBe('a_b notes.html');
  expect(html.text).toContain('<title>a/b notes.md</title>');
  expect(html.text).toContain('<a href="https://x.y">link</a> typed now');
  expect(html.text).toContain('<span class="tok-keyword">def</span>');
  expect(html.text).not.toMatch(/<script|<link /i);
});

test('an html export draws Mermaid inline and opens with no network (EXP-4, MDV-12, NFR-4)', async ({ page, api, browser }) => {
  await openDocs(page, api, [['d.md', '# D\n\n```mermaid\ngraph TD\n  A --> B\n```\n\n```mermaid\ngraph TD\n  A -->\n```']], { mode: 'raw' });
  const html = await exportAs(page, 'Web page');
  expect(html.text).toMatch(/<figure class="diagram"><svg[^>]*id="diagram-\d+"/);
  expect(html.text).toContain('<pre><code class="language-mermaid">graph TD\n  A --&gt;</code></pre>'); // EDGE-15
  const offline = await browser.newContext({ offline: true });
  const view = await offline.newPage();
  const requests = [];
  view.on('request', (req) => !req.url().startsWith('data:') && requests.push(req.url()));
  await view.setContent(html.text);
  await expect(view.locator('h1')).toHaveText('D');
  await expect(view.locator('figure.diagram svg')).toBeVisible();
  expect(requests).toEqual([]);
  await offline.close();
});

test('PDF export prints the rendered page from a frame (EXP-5)', async ({ page, api }) => {
  await page.addInitScript(() => {
    window.print = () => {
      window.top.__printed = { title: document.title, heading: document.querySelector('h1')?.textContent };
    };
  });
  await openDocs(page, api, [['p.md', '# Printed\n\ntext']]);
  await exportButton(page).click();
  await formats(page).filter({ hasText: 'PDF' }).click();
  await expect.poll(() => page.evaluate(() => window.__printed)).toEqual({ title: 'p.md', heading: 'Printed' });
});

/** Drops files on the page: name, text and optional raw bytes. */
async function drop(page, files) {
  const transfer = await page.evaluateHandle((list) => {
    const data = new DataTransfer();
    for (const { name, text, bytes } of list) data.items.add(new File([bytes ? new Uint8Array(bytes) : text], name));
    return data;
  }, files);
  await page.dispatchEvent('body', 'dragenter', { dataTransfer: transfer });
  await expect(page.locator('#drop-overlay')).toBeVisible();
  await page.dispatchEvent('#drop-overlay', 'drop', { dataTransfer: transfer });
  await expect(page.locator('#drop-overlay')).toBeHidden();
}

test('dropped files open as new documents in drop order, with free names, and rejects are named (DRP-1 to DRP-4, DRP-6)', async ({ page, api }) => {
  await openDocs(page, api, [['notes.md', 'old']]);
  await drop(page, [
    { name: 'notes.md', text: '# New' },
    { name: 'report.pdf', text: 'x' },
    { name: 'README.MD', text: 'readme' },
    { name: 'page.html', bytes: [0xef, 0xbb, 0xbf, ...Buffer.from('<p>a</p>\r\n<p>b</p>')] },
  ]);
  await expect(page.getByRole('tab')).toHaveText([/notes\.md/, /notes \(2\)\.md/, /README\.MD/, /page\.html/]);
  await expect(page.getByRole('tab', { name: 'page.html' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.cm-content')).toHaveAttribute('data-language', 'html');
  await expect(page.locator('#status-message')).toHaveText('Not opened: report.pdf (only .md, .txt and .html files).');
  const docs = (await (await api.get('/api/documents')).json()).map((doc) => doc.name).sort();
  expect(docs).toEqual(['README.MD', 'notes (2).md', 'notes.md', 'page.html']);
  const page2 = (await (await api.get('/api/documents')).json()).find((doc) => doc.name === 'page.html');
  expect((await (await api.get(`/api/documents/${page2.id}`)).json()).content).toBe('<p>a</p>\n<p>b</p>');
});

test('a drag of text shows no overlay, and a file drop never inserts into the editor (DRP-5)', async ({ page, api }) => {
  await openDocs(page, api, [['a.md', 'keep']]);
  const text = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'dragged');
    return data;
  });
  await page.dispatchEvent('.cm-content', 'dragenter', { dataTransfer: text });
  await expect(page.locator('#drop-overlay')).toBeHidden();
  const files = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['inserted?'], 'b.md'));
    return data;
  });
  await page.dispatchEvent('.cm-content', 'drop', { dataTransfer: files });
  await expect(page.getByRole('tab', { name: 'b.md' })).toBeVisible();
  await page.getByRole('tab', { name: 'a.md' }).click();
  await expect(page.locator('.cm-content')).toHaveText('keep');
});

test('a drop without a session creates nothing and says so (EDGE-14)', async ({ page, api }) => {
  await login(page);
  await page.route('**/api/documents', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' }));
  await drop(page, [{ name: 'a.md', text: 'x' }]);
  await expect(page.locator('#status-message')).toHaveText('Could not open the dropped files. Check the connection or sign in, then drop them again.');
  await page.unroute('**/api/documents');
  expect(await (await api.get('/api/documents')).json()).toEqual([]);
});
