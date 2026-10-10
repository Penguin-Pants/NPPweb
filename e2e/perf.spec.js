import { expect, login, test } from './fixtures.js';

// NFR-1 targets (T25): open and render under 2 s, 200 typed characters under
// 3 s, Ctrl+End under 0.5 s, no console errors. NFR-2 holds a 1 MB Markdown
// document of notes in Visual mode to the same targets. Dense Markdown adds
// counts within 300 ms (CNT-7) and the outline within 500 ms (OUT-2) after
// the last change. Runs with the default 5-second autosave delay (SAV-2), as
// in production.
const TARGET_BYTES = 1_048_000;

// No trace: its page snapshots take up to 200 ms each with a long outline,
// which is test time, not app time.
test.use({ autosaveSeconds: null, trace: 'off' });

/** Repeats blocks up to just under 1 MB, then pads the last line to exactly TARGET_BYTES. */
function bigText(block, pad) {
  const parts = [];
  let bytes = 0;
  for (let i = 0; bytes < TARGET_BYTES - 2000; i += 1) {
    const part = block(i);
    parts.push(part);
    bytes += Buffer.byteLength(part);
  }
  const text = parts.join('');
  return text + pad.repeat(TARGET_BYTES - Buffer.byteLength(text) - 1) + '\n';
}

const pythonText = () =>
  bigText((i) => `def function_${i}(value, other=None):\n    """Docstring ${i}."""\n    return value * ${i} + len(str(other))  # note\n\n`, '#');

// Notes: prose paragraphs, headings, lists and some code. About 4,000
// top-level blocks.
const notesText = () =>
  bigText(
    (i) =>
      `## Section ${i}\n\n` +
      `${'Plain prose with **bold** and a [link](https://example.com) in it, as notes often have. '.repeat(4)}\n\n`.repeat(3) +
      `- first point ${i}\n- second point\n- third point\n\n` +
      (i % 4 === 0 ? '```js\nconst a = 1;\n```\n\n' : ''),
    'z',
  );

// Dense Markdown: a top-level block every 40 bytes, about 26,000 of them.
const markdownText = () =>
  bigText(
    (i) =>
      `## Section ${i}\n\nSome **bold** text with a [link](https://example.com/${i}) and \`code\`, plus *emphasis* ${i}.\n\n` +
      `- item one\n- [x] task two\n\n\`\`\`js\nconst x${i} = ${i};\n\`\`\`\n\n| a | b |\n|---|---|\n| ${i} | y |\n\n`,
    'z',
  );

/** Stores the document, opens it as the only tab and returns the open time in ms. */
async function openBig(page, api, name, text, firstLine) {
  expect(Buffer.byteLength(text)).toBe(TARGET_BYTES);
  const res = await api.post(`/api/documents?name=${name}`, { data: text, headers: { 'Content-Type': 'text/plain' } });
  const { id } = await res.json();
  await login(page);
  await page.evaluate((docId) => localStorage.setItem('pn.openTabs.v1', JSON.stringify({ ids: [docId], activeId: docId })), id);
  const start = Date.now();
  await page.reload();
  await expect(page.locator('.cm-line').first()).toContainText(firstLine);
  return Date.now() - start;
}

/** Types 200 characters at the start of the first line, then goes to the end. */
async function typeAndScroll(page, lastLine) {
  await page.locator('.cm-line').first().click();
  await page.keyboard.press('Home');
  const typeStart = Date.now();
  await page.keyboard.type('x'.repeat(200));
  await expect(page.locator('.cm-line').first()).toContainText('x'.repeat(200));
  const typeMs = Date.now() - typeStart;
  const endStart = Date.now();
  await page.keyboard.press('ControlOrMeta+End');
  await expect(page.locator('.cm-line', { hasText: lastLine })).toBeVisible();
  return { typeMs, endMs: Date.now() - endStart };
}

function watchErrors(page) {
  const errors = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test('a 1 MB document opens, types and scrolls within the targets', async ({ page, api, browserName }) => {
  test.skip(browserName !== 'chromium', 'Performance targets are measured in Chromium.');
  const errors = watchErrors(page);
  const openMs = await openBig(page, api, 'big.py', pythonText(), 'def function_0');
  await expect(page.locator('.cm-content')).toHaveAttribute('data-language', 'python');
  const { typeMs, endMs } = await typeAndScroll(page, '#'.repeat(50));

  console.log(`perf: open ${openMs} ms, type 200 chars ${typeMs} ms, Ctrl+End ${endMs} ms`);
  expect(openMs).toBeLessThan(2000);
  expect(typeMs).toBeLessThan(3000);
  expect(endMs).toBeLessThan(500);
  await expect(page.locator('#save-status')).toHaveText('Saved', { timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('a 1 MB Markdown document of notes in Visual mode opens, types and scrolls within the targets (NFR-2)', async ({ page, api, browserName }) => {
  test.skip(browserName !== 'chromium', 'Performance targets are measured in Chromium.');
  const errors = watchErrors(page);
  const openMs = await openBig(page, api, 'notes.md', notesText(), 'Section 0');
  await expect(page.getByRole('button', { name: 'Visual' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#counts')).toHaveText(/words/, { timeout: 10_000 });
  const { typeMs, endMs } = await typeAndScroll(page, 'z'.repeat(50));
  console.log(`perf notes: open ${openMs} ms, type 200 chars ${typeMs} ms, Ctrl+End ${endMs} ms`);
  expect(openMs).toBeLessThan(2000);
  expect(typeMs).toBeLessThan(3000);
  expect(endMs).toBeLessThan(500);
  await expect(page.locator('#save-status')).toHaveText('Saved', { timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('a dense 1 MB Markdown document in Visual mode opens, scrolls and keeps counts and the outline in time (CNT-7, OUT-2)', async ({
  page,
  api,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Performance targets are measured in Chromium.');
  const errors = watchErrors(page);
  const openMs = await openBig(page, api, 'big.md', markdownText(), 'Section 0');
  await expect(page.getByRole('button', { name: 'Visual' })).toHaveAttribute('aria-pressed', 'true');
  const counts = page.locator('#counts');
  await expect(counts).toHaveText(/words/, { timeout: 10_000 });
  const { typeMs, endMs } = await typeAndScroll(page, 'z'.repeat(50));

  // Times from the last key press to the change on screen.
  await page.keyboard.press('ControlOrMeta+Home');
  await page.locator('.cm-line', { hasText: 'Section 1' }).first().click();
  await page.keyboard.press('End');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const times = { key: 0, counts: 0, outline: 0 };
    window.__times = times;
    document.addEventListener('keydown', () => (times.key = performance.now()), true);
    const watch = (id, onChange) =>
      new MutationObserver(onChange).observe(document.getElementById(id), { childList: true, characterData: true, subtree: true });
    watch('counts', () => (times.counts = performance.now()));
    watch('outline-body', () => {
      if (!times.outline && [...document.querySelectorAll('.outline-entry')].some((e) => e.textContent === 'Fresh heading')) {
        times.outline = performance.now();
      }
    });
  });
  const before = await counts.textContent();
  await page.keyboard.type(' word');
  await expect(counts).not.toHaveText(before);
  await page.waitForTimeout(500);
  const countsMs = await page.evaluate(() => window.__times.counts - window.__times.key);
  await page.keyboard.type('\n\n## Fresh heading');
  await expect(page.locator('.outline-entry', { hasText: 'Fresh heading' })).toHaveCount(1);
  const outlineMs = await page.evaluate(() => window.__times.outline - window.__times.key);

  console.log(
    `perf md: open ${openMs} ms, type 200 chars ${typeMs} ms, Ctrl+End ${endMs} ms, counts ${Math.round(countsMs)} ms, outline ${Math.round(outlineMs)} ms`,
  );
  expect(openMs).toBeLessThan(2000);
  // Typing is logged, not held to 3 s: here each key costs a Markdown parse
  // step that grows with the number of top-level blocks (PLAN_REVIEW.md
  // section 12, M16 row 3).
  expect(endMs).toBeLessThan(500);
  expect(countsMs).toBeLessThan(300);
  expect(outlineMs).toBeLessThan(500);
  await expect(page.locator('#save-status')).toHaveText('Saved', { timeout: 10_000 });
  expect(errors).toEqual([]);
});
