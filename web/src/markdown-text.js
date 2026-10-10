// Markdown as plain text (EXP-3), and the counts (CNT-5) and outline (OUT-1,
// OUT-5) that read it. One set of rules serves .txt export and the
// syntax-excluded counts (CNT-6). The functions take the Markdown syntax tree
// of the text, so the editor can pass the tree it already has.

import { decodeEntity, FENCE, normalizeLabel, referenceDefinitions } from './markdown-syntax.js';

/** @typedef {{ from: number, to: number, insert: string }} Edit */

/**
 * The edits that turn Markdown into plain text, for the nodes that touch
 * `from` to `to`, sorted by position.
 * @param {string} text
 * @param {import('@lezer/common').Tree} tree
 * @returns {Edit[]}
 */
function syntaxEdits(text, tree, from = 0, to = text.length) {
  /** @type {Edit[]} */
  const edits = [];
  const remove = (a, b) => a < b && edits.push({ from: a, to: b, insert: '' });
  const withSpace = (node) => node.to + (text[node.to] === ' ' ? 1 : 0);
  const lineStart = (pos) => text.lastIndexOf('\n', pos - 1) + 1;
  const lineEnd = (pos) => {
    const end = text.indexOf('\n', pos);
    return end === -1 ? text.length : end;
  };
  // A [text] with no URL and no matching definition is plain text, as in Visual mode.
  const isLink = (node, marks) => {
    if (node.getChild('URL')) return true;
    const label = node.getChild('LinkLabel');
    const key = label && label.to - label.from > 2 ? text.slice(label.from, label.to) : text.slice(marks[0].to, marks[1].from);
    return referenceDefinitions(tree, (a, b) => text.slice(a, b)).has(normalizeLabel(key));
  };

  tree.iterate({
    from,
    to,
    enter({ name, node }) {
      switch (name) {
        case 'HeaderMark':
          if (node.parent?.name.startsWith('Setext')) remove(node.from - 1, node.to);
          else if (node.from === lineStart(node.from)) remove(node.from, withSpace(node));
          else remove(text[node.from - 1] === ' ' ? node.from - 1 : node.from, node.to);
          return;
        case 'EmphasisMark':
        case 'StrikethroughMark':
          remove(node.from, node.to);
          return;
        case 'CodeMark':
          if (node.parent?.name === 'InlineCode') remove(node.from, node.to);
          return;
        case 'Escape':
          remove(node.from, node.from + 1);
          return;
        case 'Entity': {
          const char = decodeEntity(text.slice(node.from, node.to));
          if (char !== null) edits.push({ from: node.from, to: node.to, insert: char });
          return;
        }
        case 'QuoteMark':
          remove(node.from, withSpace(node));
          return;
        case 'HorizontalRule':
          remove(node.from, node.to);
          return;
        case 'FencedCode': {
          const openEnd = lineEnd(node.from);
          remove(node.from, Math.min(openEnd + 1, node.to));
          const closeStart = lineStart(node.to);
          if (closeStart > openEnd && FENCE.test(text.slice(closeStart, node.to))) remove(closeStart - 1, node.to);
          return false;
        }
        case 'Link':
        case 'Image': {
          const marks = node.getChildren('LinkMark');
          if (marks.length < 2 || !isLink(node, marks)) return;
          remove(node.from, marks[0].to);
          remove(marks[1].from, node.to);
          return;
        }
        case 'Autolink':
          for (const mark of node.getChildren('LinkMark')) remove(mark.from, mark.to);
          return false;
        case 'TableDelimiter':
          if (node.parent?.name === 'Table') remove(node.from - 1, node.to);
          return;
        case 'TableHeader':
        case 'TableRow': {
          const cells = node.getChildren('TableCell');
          if (cells.length === 0) return;
          remove(node.from, cells[0].from);
          for (let i = 1; i < cells.length; i += 1) edits.push({ from: cells[i - 1].to, to: cells[i].from, insert: '\t' });
          remove(cells.at(-1).to, node.to);
          return;
        }
        case 'HTMLBlock':
        case 'HTMLTag':
        case 'Comment':
        case 'ProcessingInstruction':
          return false;
        default:
          return;
      }
    },
  });
  return edits.sort((a, b) => a.from - b.from || a.to - b.to);
}

/**
 * The plain text of `from` to `to` (EXP-3). An edit cut by the range is
 * dropped for its part inside the range, so a cut mark disappears.
 * @param {string} text
 * @param {import('@lezer/common').Tree} tree
 */
export function renderedText(text, tree, from = 0, to = text.length) {
  let out = '';
  let pos = from;
  for (const edit of syntaxEdits(text, tree, from, to)) {
    const start = Math.max(edit.from, from);
    const end = Math.min(edit.to, to);
    if (end < pos || start > to || (start === end && edit.insert === '')) continue;
    out += text.slice(pos, Math.max(start, pos));
    if (edit.from >= from && edit.to <= to) out += edit.insert;
    pos = Math.max(pos, end);
  }
  return out + text.slice(pos, to);
}

const WORDS = new Intl.Segmenter(undefined, { granularity: 'word' });
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * Words are word-like segments. Characters are user-perceived characters
 * (grapheme clusters), spaces included, line breaks not (CNT-5). ASCII text
 * has one character per code unit, so only non-ASCII runs are segmented: each
 * with the character before it, which a combining mark can join.
 * @param {string} text
 * @returns {{ words: number, characters: number }}
 */
export function countText(text) {
  let words = 0;
  for (const segment of WORDS.segment(text)) if (segment.isWordLike) words += 1;
  let characters = text.length;
  for (const match of text.matchAll(/\n/g)) characters -= match[0].length;
  for (const match of text.matchAll(/[^\x00-\x7F]+/g)) {
    const before = match.index > 0 ? text[match.index - 1] : '';
    let clusters = 0;
    for (const _ of GRAPHEMES.segment(before + match[0])) clusters += 1;
    characters += clusters - (before ? 1 : 0) - match[0].length;
  }
  return { words, characters };
}

/**
 * A countText with a cache per line, for long documents (CNT-7). Words never
 * span a line break and line breaks do not count, so the sum over the lines
 * equals countText of the whole text. After an edit, only new lines are
 * segmented again.
 * @returns {(text: string) => { words: number, characters: number }}
 */
export function createCounter() {
  let cache = new Map();
  return (text) => {
    const next = new Map();
    let words = 0;
    let characters = 0;
    for (const line of text.split('\n')) {
      const counts = next.get(line) ?? cache.get(line) ?? countText(line);
      next.set(line, counts);
      words += counts.words;
      characters += counts.characters;
    }
    cache = next;
    return { words, characters };
  };
}

/**
 * The headings in document order: level 1 to 6, plain text and start (OUT-1).
 * @param {string} text
 * @param {import('@lezer/common').Tree} tree
 * @returns {{ level: number, text: string, from: number }[]}
 */
export function headings(text, tree) {
  const list = [];
  tree.iterate({
    enter({ name, node }) {
      const match = /^(?:ATX|Setext)Heading(\d)$/.exec(name);
      if (!match) return name === 'Document' || name === 'Blockquote' || name === 'ListItem' || name.endsWith('List');
      const underline = name.startsWith('Setext') ? node.getChild('HeaderMark') : null;
      const end = underline ? underline.from - 1 : node.to;
      list.push({ level: Number(match[1]), text: renderedText(text, tree, node.from, end).trim(), from: node.from });
      return false;
    },
  });
  return list;
}
