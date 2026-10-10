import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { drop, expect, login, openDocs, test } from './fixtures.js';

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

test('an .html tab that is not Markdown exports its own source (EXP-2)', async ({ page, api }) => {
  await openDocs(page, api, [['page.html', '<h1>Hi</h1>']]);
  await exportButton(page).click();
  await expect(formats(page)).toHaveText(['Original (.html)', 'Plain text (.txt)']);
  await page.keyboard.press('Escape');
  const source = await exportAs(page, 'Original');
  expect(source).toEqual({ name: 'page.html', text: '<h1>Hi</h1>' });
});

test('the Export menu works from the keyboard and gives the focus back to its button (NFR-5)', async ({ page, api }) => {
  await openDocs(page, api, [['k.md', '# K']]);
  await exportButton(page).focus();
  await page.keyboard.press('ArrowDown');
  await expect(formats(page).first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  const downloading = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  expect((await downloading).suggestedFilename()).toBe('k.txt');
  await expect(exportButton(page)).toBeFocused();
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

test('a saved html export shows a relative image next to it (EXP-4)', async ({ page, api }, testInfo) => {
  await openDocs(page, api, [['pic.md', '![a pic](pic.png)']]);
  const html = await exportAs(page, 'Web page');
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  await writeFile(testInfo.outputPath('pic.png'), Buffer.from(png, 'base64'));
  await writeFile(testInfo.outputPath('pic.html'), html.text);
  const view = await page.context().newPage();
  await view.goto(pathToFileURL(testInfo.outputPath('pic.html')).href);
  await expect.poll(() => view.locator('img').evaluate((img) => img.naturalWidth)).toBe(1);
});

test('PDF export prints the rendered page from a frame titled with the PDF name, then cleans up (EXP-5, EXP-6)', async ({ page, api }) => {
  await page.addInitScript(() => {
    window.print = () => {
      const { top } = window;
      top.__printed = { title: document.title, appTitle: top.document.title, heading: document.querySelector('h1')?.textContent };
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  await openDocs(page, api, [['p.md', '# Printed\n\ntext']]);
  await exportButton(page).click();
  await formats(page).filter({ hasText: 'PDF' }).click();
  await expect.poll(() => page.evaluate(() => window.__printed)).toEqual({ title: 'p', appTitle: 'p', heading: 'Printed' });
  await expect(page).toHaveTitle('Personal - Notepad');
  await expect(page.locator('#print-frame')).toHaveCount(0);
});

/** Drops files on the page: name, text and optional raw bytes. */
test('a status message that wraps to its own row stays at the right end (STB-2)', async ({ page, api }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await openDocs(page, api, [['notes.md', 'old']]);
  await drop(page, [{ name: 'report.pdf', text: 'x' }]);
  const message = page.locator('#status-message');
  await expect(message).toHaveText('Not opened: report.pdf (only .md, .txt and .html files).');
  const bar = await page.locator('.statusbar').boundingBox();
  const box = await message.boundingBox();
  const language = await page.getByRole('combobox', { name: 'Language' }).boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(language.y + language.height); // It is on the second row.
  expect(box.x + box.width).toBeGreaterThan(bar.x + bar.width - 16);
});

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
  // The message shows at the right end of the status bar, after the language list (STB-2).
  const message = await page.locator('#status-message').boundingBox();
  const language = await page.getByRole('combobox', { name: 'Language' }).boundingBox();
  expect(message.x).toBeGreaterThan(language.x + language.width);
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

/** Real browser drag events for one file on disk, through the DevTools protocol. */
async function fileDrag(page, path) {
  const cdp = await page.context().newCDPSession(page);
  const data = { items: [], files: [path], dragOperationsMask: 1 };
  return (type) => cdp.send('Input.dispatchDragEvent', { type, x: 300, y: 300, data });
}

test('a cancelled file drag hides the overlay (DRP-5)', async ({ page, api }, testInfo) => {
  await openDocs(page, api, [['a.md', 'keep']]);
  await writeFile(testInfo.outputPath('c.md'), 'x');
  const drag = await fileDrag(page, testInfo.outputPath('c.md'));
  await drag('dragEnter');
  await expect(page.locator('#drop-overlay')).toBeVisible();
  await drag('dragCancel');
  await expect(page.locator('#drop-overlay')).toBeHidden();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
});

test('while a dialog is open, a file drag shows no overlay and a drop opens nothing (DRP-5)', async ({ page, api }, testInfo) => {
  await openDocs(page, api, [['a.md', 'keep']]);
  await page.getByRole('button', { name: 'Close a.md' }).click();
  const dialog = page.getByRole('dialog', { name: 'Close document' });
  await expect(dialog).toBeVisible();
  await writeFile(testInfo.outputPath('d.md'), 'x');
  const drag = await fileDrag(page, testInfo.outputPath('d.md'));
  await drag('dragEnter');
  await drag('dragOver');
  await expect(page.locator('#drop-overlay')).toBeHidden();
  await drag('drop');
  await page.waitForTimeout(300);
  await expect(page.locator('#drop-overlay')).toBeHidden();
  expect(new URL(page.url()).protocol).toBe('http:');
  await dialog.getByRole('button', { name: 'Keep' }).click();
  await expect(page.getByRole('tab')).toHaveCount(0);
  expect((await (await api.get('/api/documents')).json()).map((doc) => doc.name)).toEqual(['a.md']);
});

test('a drop without a session creates nothing and says so (EDGE-14)', async ({ page, api }) => {
  await login(page);
  await page.route('**/api/documents', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' }));
  await drop(page, [{ name: 'a.md', text: 'x' }]);
  await expect(page.locator('#status-message')).toHaveText('Could not open the dropped files. Check the connection or sign in, then drop them again.');
  await page.unroute('**/api/documents');
  expect(await (await api.get('/api/documents')).json()).toEqual([]);
});
