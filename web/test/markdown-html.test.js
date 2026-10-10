import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { languageSupport } from '../src/languages.js';
import { exportPage, markdownToHtml, mermaidSources } from '../src/markdown-html.js';

function treeOf(text) {
  const state = EditorState.create({ doc: text, extensions: languageSupport('markdown') });
  return ensureSyntaxTree(state, text.length, 5000);
}
const html = (text, diagrams) => markdownToHtml(text, treeOf(text), { diagrams });

test('headings, paragraphs, emphasis and breaks become HTML', () => {
  assert.equal(html('# One\n\nSetext\n---\n\n###### Six ##'), '<h1>One</h1>\n<h2>Setext</h2>\n<h6>Six</h6>');
  assert.equal(html('a **b** *c* ~~d~~ `e <f>`'), '<p>a <strong>b</strong> <em>c</em> <del>d</del> <code>e &lt;f&gt;</code></p>');
  assert.equal(html('line one  \nline two\\\nthree'), '<p>line one<br>\nline two<br>\nthree</p>');
  assert.equal(html('a \\*b\\* &amp; &copy;'), '<p>a *b* &amp; ©</p>');
});

test('links and images keep safe URLs only', () => {
  assert.equal(html('[t](https://x.y/a?b=1&c=2 "T")'), '<p><a href="https://x.y/a?b=1&amp;c=2">t</a></p>');
  assert.equal(html('[ref][r] and [sic]\n\n[r]: https://r.s'), '<p><a href="https://r.s">ref</a> and [sic]</p>');
  assert.equal(html('<https://a.b> and www.c.d'), '<p><a href="https://a.b">https://a.b</a> and <a href="https://www.c.d">www.c.d</a></p>');
  assert.equal(html('[x](javascript:alert(1))'), '<p><a>x</a></p>');
  assert.equal(html('![a "cat"](https://i.example/c.png)'), '<p><img src="https://i.example/c.png" alt="a &quot;cat&quot;"></p>');
  assert.equal(html('![d](data:image/png;base64,AA) ![e](javascript:x)'), '<p><img src="data:image/png;base64,AA" alt="d"> <img alt="e"></p>');
});

test('raw HTML stays visible text and never becomes markup (MDV-8, EXP-4)', () => {
  assert.equal(html('a <b onclick="x()">b</b>'), '<p>a &lt;b onclick=&quot;x()&quot;&gt;b&lt;/b&gt;</p>');
  assert.equal(html('<script>alert(1)</script>'), '<pre class="raw-html">&lt;script&gt;alert(1)&lt;/script&gt;</pre>');
});

test('lists, tasks, quotes and rules', () => {
  assert.equal(html('- a\n- [x] b\n- [ ] c'), '<ul>\n<li>a</li>\n<li><input type="checkbox" disabled checked> b</li>\n<li><input type="checkbox" disabled> c</li>\n</ul>');
  assert.equal(html('3. a\n4. b'), '<ol start="3">\n<li>a</li>\n<li>b</li>\n</ol>');
  assert.equal(html('> quote\n> more'), '<blockquote>\n<p>quote\nmore</p>\n</blockquote>');
  assert.equal(html('a\n\n---\n\nb'), '<p>a</p>\n<hr>\n<p>b</p>');
});

test('tables keep their alignment', () => {
  assert.equal(
    html('| a | b | c |\n|:--|:-:|--:|\n| 1 | **2** | 3 |'),
    '<table>\n<thead><tr><th style="text-align:left">a</th><th style="text-align:center">b</th><th style="text-align:right">c</th></tr></thead>\n<tbody><tr><td style="text-align:left">1</td><td style="text-align:center"><strong>2</strong></td><td style="text-align:right">3</td></tr></tbody>\n</table>',
  );
});

test('code blocks are highlighted for known languages and plain for others (MDV-11)', () => {
  const py = html('```python\ndef f(): return 1\n```');
  assert.match(py, /^<pre><code class="language-python">/);
  assert.match(py, /<span class="tok-keyword">def<\/span>/);
  assert.equal(html('```rust\nfn <main>\n```'), '<pre><code class="language-rust">fn &lt;main&gt;</code></pre>');
  assert.equal(html('    indented\n      more'), '<pre><code>indented\n  more</code></pre>');
});

test('mermaid blocks become their diagram when one is given, else code (MDV-12)', () => {
  const text = '```mermaid\ngraph TD\nA-->B\n```';
  assert.deepEqual(mermaidSources(text, treeOf(text)), ['graph TD\nA-->B']);
  assert.equal(html(text, new Map([['graph TD\nA-->B', '<svg>d</svg>']])), '<figure class="diagram"><svg>d</svg></figure>');
  assert.equal(html(text), '<pre><code class="language-mermaid">graph TD\nA--&gt;B</code></pre>');
});

test('the export page is self-contained: escaped title, inline styles, no scripts (EXP-4)', () => {
  const page = exportPage('a <b>.md', '<p>x</p>');
  assert.match(page, /^<!doctype html>/);
  assert.match(page, /<title>a &lt;b&gt;\.md<\/title>/);
  assert.match(page, /<style>[\s\S]+\.tok-keyword[\s\S]+<\/style>/);
  assert.match(page, /<main class="doc">\n<p>x<\/p>\n<\/main>/);
  assert.doesNotMatch(page, /<script|<link /i);
});

test('lists are tight or loose, nest, and an empty table cell keeps its column', () => {
  assert.equal(html('- a\n\n- b'), '<ul>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n</ul>');
  assert.equal(html('- a\n  - b'), '<ul>\n<li>a\n<ul>\n<li>b</li>\n</ul>\n</li>\n</ul>');
  assert.equal(html('1. a'), '<ol>\n<li>a</li>\n</ol>');
  assert.equal(html('| a | | c |\n|---|---|---|\n| 1 | 2 |'), '<table>\n<thead><tr><th>a</th><th></th><th>c</th></tr></thead>\n<tbody><tr><td>1</td><td>2</td><td></td></tr></tbody>\n</table>');
});

test('quotes hold code and HTML without their marks, and [text] without a target stays text', () => {
  assert.equal(html('> ```py\n> x = 1\n> ```'), '<blockquote>\n<pre><code class="language-py"><span class="tok-variableName">x</span> <span class="tok-operator">=</span> <span class="tok-number">1</span></code></pre>\n</blockquote>');
  assert.equal(html('> <div>\n> x'), '<blockquote>\n<pre class="raw-html">&lt;div&gt;\nx</pre>\n</blockquote>');
  assert.equal(html('see [sic] and [a][b]'), '<p>see [sic] and [a][b]</p>');
  assert.equal(html('![no target]'), '<p>![no target]</p>');
  assert.equal(html('[rel](docs/a.html) [mail](mailto:a@b.c)'), '<p><a href="docs/a.html">rel</a> <a href="mailto:a@b.c">mail</a></p>');
});

const ALLOWED_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'em', 'strong', 'del', 'code', 'pre', 'a', 'img', 'br', 'ul', 'ol', 'li', 'input', 'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span']);
const ALLOWED_ATTRS = new Set(['href', 'src', 'alt', 'class', 'style', 'start', 'type', 'disabled', 'checked']);

test('hostile input gives only known tags and attributes, and no script URL (EXP-4)', () => {
  const hostile = [
    '<img src=x onerror=alert(1)>',
    '<script>alert(1)</script> and <a href="javascript:x">y</a>',
    '[a](javascript:alert(1)) [b](JaVaScRiPt:alert(1)) [c](<java\tscript:alert(1)>) [d](data:text/html,x)',
    '[e](javascript&#58;alert(1)) [f](&#x6A;avascript:alert(1))',
    '![g](javascript:alert(1)) ![h](data:text/html,x) ![i](" onerror="alert(1))',
    '<https://x.y/"onmouseover="alert(1)> `<b>` **<i>x</i>**',
    '| <b> | x |\n|---|---|\n| <script> | [j](vbscript:x) |',
    '```html\n<script>alert(1)</script>\n```\n\n    <iframe>',
    '```"><script>\nx\n```',
  ].join('\n\n');
  const out = html(hostile);
  for (const [, tag, attrs] of out.matchAll(/<\/?([a-z0-9]+)([^>]*)>/gi)) {
    assert.ok(ALLOWED_TAGS.has(tag.toLowerCase()), `tag ${tag}`);
    for (const [, name] of attrs.matchAll(/([a-z-]+)(?:="[^"]*")?/gi)) assert.ok(ALLOWED_ATTRS.has(name.toLowerCase()), `attribute ${name}`);
  }
  for (const [, url] of out.matchAll(/(?:href|src)="([^"]*)"/g)) {
    assert.doesNotMatch(url.replace(/[\x00-\x20]/g, ''), /^(javascript|vbscript|data:text)/i, url);
  }
});
