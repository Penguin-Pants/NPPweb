// Markdown to HTML for .html and .pdf export (EXP-4, EXP-5, MDV-11,
// MDV-12). It walks the editor's Markdown syntax tree, so export agrees with
// Visual mode, the outline and the counts. All text is escaped. Raw HTML stays
// visible text (MDV-8), and links and images keep only safe URLs, so the
// output needs no sanitizer.
import { classHighlighter, highlightCode } from '@lezer/highlight';
import { codeLanguage } from './languages.js';
import { decodeEntity, linkTarget, normalizeLabel, referenceDefinitions } from './markdown-syntax.js';
import { renderedText } from './markdown-text.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escape = (text) => text.replace(/[&<>"]/g, (char) => ESCAPES[char]);

/**
 * The URL when it is safe to keep, else null. Browsers drop spaces and
 * control characters inside a scheme, so the check reads the URL without
 * them. Relative URLs stay. Images may also use data:image/.
 */
function safeUrl(url, image) {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url.replace(/[\x00-\x20\x7f]/g, ''))?.[1].toLowerCase();
  if (scheme === undefined || scheme === 'http' || scheme === 'https') return url;
  if (!image && scheme === 'mailto') return url;
  if (image && /^\s*data:image\//i.test(url)) return url;
  return null;
}

/** First word of a fence's info string, lower case. */
const infoWord = (node, text) => {
  const info = node.getChild('CodeInfo');
  return info ? text.slice(info.from, info.to).trim().split(/\s+/, 1)[0].toLowerCase() : '';
};

/** The code of a fenced or indented block, without its fences or container marks. */
function codeOf(node, text) {
  let code = '';
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (!['CodeMark', 'CodeInfo', 'QuoteMark'].includes(child.name)) code += text.slice(child.from, child.to);
  }
  return code.replace(/\n+$/, '');
}

const isClosed = (node) => node.getChildren('CodeMark').length > 1;

/**
 * The source of each closed fenced block tagged mermaid, once each, for the
 * caller to render before markdownToHtml (MDV-12).
 * @param {string} text
 * @param {import('@lezer/common').Tree} tree
 * @returns {string[]}
 */
export function mermaidSources(text, tree) {
  const sources = new Set();
  tree.iterate({
    enter({ name, node }) {
      if (name !== 'FencedCode') return;
      if (infoWord(node, text) === 'mermaid' && isClosed(node)) sources.add(codeOf(node, text));
      return false;
    },
  });
  return [...sources];
}

/** Code as HTML, with token classes for a known language (MDV-11). */
function highlighted(code, word) {
  const language = codeLanguage(word);
  if (!language) return escape(code);
  let out = '';
  highlightCode(
    code,
    language.parser.parse(code),
    classHighlighter,
    (part, classes) => (out += classes ? `<span class="${classes}">${escape(part)}</span>` : escape(part)),
    () => (out += '\n'),
  );
  return out;
}

/**
 * The cells of a table row by its pipes, so an empty cell keeps its column.
 * Outer pipes have no cell outside them. Each cell is its node or null.
 */
function rowCells(row, text) {
  const segments = [];
  let start = row.from;
  for (const pipe of row.getChildren('TableDelimiter')) {
    segments.push([start, pipe.from]);
    start = pipe.to;
  }
  segments.push([start, row.to]);
  const blank = ([a, b]) => text.slice(a, b).trim() === '';
  if (segments.length > 1 && blank(segments[0])) segments.shift();
  if (segments.length > 1 && blank(segments.at(-1))) segments.pop();
  const cells = row.getChildren('TableCell');
  return segments.map(([a, b]) => cells.find((cell) => cell.from >= a && cell.to <= b) ?? null);
}

/** Column alignments from the delimiter row, such as :--, :-: and --:. */
function alignments(delimiter, text) {
  return text
    .slice(delimiter.from, delimiter.to)
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => {
      const spec = cell.trim();
      if (/^:-+:$/.test(spec)) return 'center';
      if (/^:-+$/.test(spec)) return 'left';
      if (/^-+:$/.test(spec)) return 'right';
      return null;
    });
}

// A blank line, also one that holds only quote marks.
const BLANK_LINE = /\n[ \t]*(?:>[ \t]*)*\n/;

/**
 * The document as HTML: one element per block, joined by line breaks.
 * @param {string} text
 * @param {import('@lezer/common').Tree} tree
 * @param {{ diagrams?: Map<string, string> }} [options] Rendered Mermaid SVG by source.
 */
export function markdownToHtml(text, tree, { diagrams = new Map() } = {}) {
  const slice = (a, b) => text.slice(a, b);
  const definitions = referenceDefinitions(tree, slice);

  /** The URL of a link or image, its own or its definition's, or undefined. */
  function target(node, marks) {
    const url = node.getChild('URL');
    if (url) return linkTarget(slice(url.from, url.to));
    const label = node.getChild('LinkLabel');
    const key = label && label.to - label.from > 2 ? slice(label.from, label.to) : slice(marks[0].to, marks[1].from);
    return definitions.get(normalizeLabel(key));
  }

  /** The children of `parent` from `from` to `to` as HTML, with the text between them. */
  function inline(parent, from = parent.from, to = parent.to) {
    let out = '';
    let pos = from;
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (child.to <= from || child.from >= to) continue;
      out += escape(slice(pos, child.from)) + inlineNode(child);
      pos = child.to;
    }
    return out + escape(slice(pos, to));
  }

  // Paragraph lines lose their indentation and trailing spaces.
  const lines = (html) => html.replace(/[ \t]*\n[ \t]*/g, '\n').trim();

  function inlineNode(node) {
    switch (node.name) {
      case 'Emphasis':
        return `<em>${inline(node)}</em>`;
      case 'StrongEmphasis':
        return `<strong>${inline(node)}</strong>`;
      case 'Strikethrough':
        return `<del>${inline(node)}</del>`;
      case 'InlineCode': {
        const [open, close] = node.getChildren('CodeMark');
        if (!close) return escape(slice(node.from, node.to));
        let code = slice(open.to, close.from).replace(/\n/g, ' ');
        if (code.length > 1 && code[0] === ' ' && code.at(-1) === ' ' && code.trim() !== '') code = code.slice(1, -1);
        return `<code>${escape(code)}</code>`;
      }
      case 'Link': {
        const marks = node.getChildren('LinkMark');
        if (marks.length < 2) return inline(node);
        const content = inline(node, marks[0].to, marks[1].from);
        const href = target(node, marks);
        if (href === undefined) return `[${content}${escape(slice(marks[1].from, node.to))}`; // [text] with no target
        const safe = safeUrl(href, false);
        return safe === null ? `<a>${content}</a>` : `<a href="${escape(safe)}">${content}</a>`;
      }
      case 'Image': {
        const marks = node.getChildren('LinkMark');
        const url = marks.length < 2 ? undefined : target(node, marks);
        if (url === undefined) return escape(slice(node.from, node.to));
        const alt = escape(renderedText(text, tree, marks[0].to, marks[1].from));
        const src = safeUrl(url, true);
        return src === null ? `<img alt="${alt}">` : `<img src="${escape(src)}" alt="${alt}">`;
      }
      case 'Autolink': {
        const url = node.getChild('URL');
        return url ? inlineNode(url) : escape(slice(node.from, node.to));
      }
      case 'URL': {
        const shown = slice(node.from, node.to);
        const safe = safeUrl(linkTarget(shown), false);
        return safe === null ? escape(shown) : `<a href="${escape(safe)}">${escape(shown)}</a>`;
      }
      case 'Escape':
        return escape(slice(node.from + 1, node.to));
      case 'Entity':
        return escape(decodeEntity(slice(node.from, node.to)) ?? slice(node.from, node.to));
      case 'HardBreak':
        return '<br>\n';
      case 'TaskMarker':
        return /x/i.test(slice(node.from, node.to)) ? '<input type="checkbox" disabled checked>' : '<input type="checkbox" disabled>';
      case 'EmphasisMark':
      case 'StrikethroughMark':
      case 'CodeMark':
      case 'LinkMark':
      case 'HeaderMark':
      case 'QuoteMark':
      case 'ListMark':
        return '';
      default:
        // Raw inline HTML, comments and anything else: visible text (MDV-8).
        return escape(slice(node.from, node.to));
    }
  }

  // A diagram shown again gets its own ids, so its styles and markers do not
  // point at the first copy.
  const shown = new Map();
  function diagram(code) {
    const svg = diagrams.get(code);
    const count = (shown.get(code) ?? 0) + 1;
    shown.set(code, count);
    const id = /^<svg\b[^>]*\bid="([^"]+)"/.exec(svg)?.[1];
    return count === 1 || !id ? svg : svg.replaceAll(id, `${id}-${count}`);
  }

  function codeBlock(node) {
    const code = codeOf(node, text);
    const word = node.name === 'FencedCode' ? infoWord(node, text) : '';
    if (word === 'mermaid' && isClosed(node) && diagrams.has(code)) return `<figure class="diagram">${diagram(code)}</figure>`;
    const attr = word ? ` class="language-${escape(word)}"` : '';
    return `<pre><code${attr}>${highlighted(code, word)}</code></pre>`;
  }

  function table(node) {
    const header = node.getChild('TableHeader');
    if (!header) return escape(slice(node.from, node.to));
    const delimiter = node.getChildren('TableDelimiter')[0];
    const align = delimiter ? alignments(delimiter, text) : [];
    const columns = rowCells(header, text).length;
    const row = (rowNode, tag) => {
      const cells = rowCells(rowNode, text);
      return `<tr>${Array.from({ length: columns }, (_, i) => {
        const style = align[i] ? ` style="text-align:${align[i]}"` : '';
        const cell = cells[i];
        return `<${tag}${style}>${cell ? lines(inline(cell)) : ''}</${tag}>`;
      }).join('')}</tr>`;
    };
    const body = node.getChildren('TableRow').map((rowNode) => row(rowNode, 'td'));
    return ['<table>', `<thead>${row(header, 'th')}</thead>`, ...(body.length ? [`<tbody>${body.join('\n')}</tbody>`] : []), '</table>'].join('\n');
  }

  /** Whether a list has a blank line between its items or their blocks. */
  function isLoose(list) {
    const gap = (a, b) => BLANK_LINE.test(slice(a.to, b.from));
    for (let item = list.firstChild; item; item = item.nextSibling) {
      if (item.nextSibling && gap(item, item.nextSibling)) return true;
      for (let child = item.firstChild; child; child = child.nextSibling) {
        if (child.name !== 'ListMark' && child.nextSibling && gap(child, child.nextSibling)) return true;
      }
    }
    return false;
  }

  function list(node) {
    const loose = isLoose(node);
    const items = node.getChildren('ListItem').map((item) => {
      const parts = [];
      for (let child = item.firstChild; child; child = child.nextSibling) {
        if (child.name === 'ListMark') continue;
        const html = block(child, !loose);
        if (html) parts.push(html);
      }
      const first = item.firstChild?.nextSibling;
      const inlineFirst = !loose && (first?.name === 'Paragraph' || first?.name === 'Task');
      if (parts.length === 0) return '<li></li>';
      if (inlineFirst) return `<li>${parts[0]}${parts.length > 1 ? `\n${parts.slice(1).join('\n')}\n` : ''}</li>`;
      return `<li>\n${parts.join('\n')}\n</li>`;
    });
    if (node.name === 'OrderedList') {
      const start = Number.parseInt(slice(node.firstChild.firstChild.from, node.firstChild.firstChild.to), 10);
      return `<ol${start !== 1 ? ` start="${start}"` : ''}>\n${items.join('\n')}\n</ol>`;
    }
    return `<ul>\n${items.join('\n')}\n</ul>`;
  }

  /**
   * One block as HTML, or '' for a block that shows nothing.
   * @param {boolean} [tight] In a tight list, paragraphs lose their <p>.
   */
  function block(node, tight = false) {
    const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(node.name);
    if (heading) return `<h${heading[1]}>${lines(inline(node))}</h${heading[1]}>`;
    switch (node.name) {
      case 'Paragraph':
      case 'Task':
        return tight ? lines(inline(node)) : `<p>${lines(inline(node))}</p>`;
      case 'Blockquote':
        return `<blockquote>\n${blocks(node)}\n</blockquote>`;
      case 'BulletList':
      case 'OrderedList':
        return list(node);
      case 'FencedCode':
      case 'CodeBlock':
        return codeBlock(node);
      case 'HorizontalRule':
        return '<hr>';
      case 'Table':
        return table(node);
      case 'HTMLBlock':
      case 'CommentBlock':
      case 'ProcessingInstructionBlock':
        return `<pre class="raw-html">${escape(renderedText(text, tree, node.from, node.to))}</pre>`;
      default:
        return ''; // Link definitions and marks show nothing.
    }
  }

  function blocks(parent) {
    const out = [];
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      const html = block(child);
      if (html) out.push(html);
    }
    return out.join('\n');
  }

  return blocks(tree.topNode);
}

// Light theme for exports (EXP-4, EXP-5), with the token colors of the
// classHighlighter classes.
const EXPORT_CSS = `
:root { color-scheme: light; }
body { margin: 0; background: #fff; color: #1f2328; font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.doc { max-width: 52rem; margin: 0 auto; padding: 2rem 1.5rem; overflow-wrap: break-word; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.5em 0 0.5em; }
h1 { font-size: 2em; border-bottom: 1px solid #d1d9e0; padding-bottom: 0.3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid #d1d9e0; padding-bottom: 0.3em; }
p, ul, ol, blockquote, pre, table, figure { margin: 0 0 1em; }
a { color: #0969da; }
blockquote { padding: 0 1em; color: #59636e; border-left: 0.25em solid #d1d9e0; }
code, pre { font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace; font-size: 0.9em; }
code { background: #f6f8fa; padding: 0.15em 0.35em; border-radius: 4px; }
pre { background: #f6f8fa; padding: 1em; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; }
pre code { background: none; padding: 0; }
pre.raw-html { white-space: pre-wrap; }
table { border-collapse: collapse; }
th, td { border: 1px solid #d1d9e0; padding: 0.4em 0.8em; }
th { background: #f6f8fa; }
img { max-width: 100%; }
hr { border: 0; border-top: 1px solid #d1d9e0; margin: 1.5em 0; }
li > input[type="checkbox"] { margin-right: 0.4em; }
figure.diagram { margin-left: 0; margin-right: 0; }
figure.diagram svg { max-width: 100%; height: auto; }
.tok-keyword { color: #cf222e; }
.tok-atom, .tok-bool, .tok-literal { color: #0550ae; }
.tok-number { color: #0550ae; }
.tok-string, .tok-string2 { color: #0a3069; }
.tok-comment { color: #59636e; font-style: italic; }
.tok-variableName.tok-definition, .tok-definition { color: #6639ba; }
.tok-typeName, .tok-className, .tok-namespace { color: #953800; }
.tok-propertyName { color: #0550ae; }
.tok-operator, .tok-punctuation { color: #1f2328; }
.tok-meta, .tok-macroName, .tok-labelName { color: #8250df; }
.tok-heading { font-weight: bold; color: #0550ae; }
.tok-emphasis { font-style: italic; }
.tok-strong { font-weight: bold; }
.tok-strikethrough { text-decoration: line-through; }
.tok-link, .tok-url { color: #0969da; text-decoration: underline; }
.tok-invalid { color: #cf222e; }
@media print {
  .doc { max-width: none; padding: 0; }
  pre, figure, table, img { break-inside: avoid; }
}
`;

// The exported file allows no scripts, connections or fonts. Images may
// load, because exports keep remote image tags (EXP-4).
const EXPORT_CSP = "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'";

/**
 * A self-contained HTML page for export (EXP-4): inline CSS, light theme, no
 * scripts, and the document name as its title.
 * @param {string} name
 * @param {string} body From markdownToHtml.
 */
export function exportPage(name, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${EXPORT_CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(name)}</title>
<style>${EXPORT_CSS}</style>
</head>
<body>
<main class="doc">
${body}
</main>
</body>
</html>
`;
}
