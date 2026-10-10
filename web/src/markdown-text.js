// Markdown as plain text (EXP-3), and the counts (CNT-5) and outline (OUT-1,
// OUT-5) that read it. One set of rules serves .txt export and the
// syntax-excluded counts (CNT-6). The functions take the Markdown syntax tree
// of the text, so the editor can pass the tree it already has.

import { decodeEntity, normalizeLabel, referenceDefinitions } from './markdown-syntax.js';

/** @typedef {{ from: number, to: number, insert: string }} Edit */
/** @typedef {{ words: number, characters: number }} Counts */
/** @typedef {{ level: number, text: string, from: number }} Heading */

const lineStartOf = (text, pos) => text.lastIndexOf('\n', pos - 1) + 1;
function lineEndOf(text, pos) {
  const end = text.indexOf('\n', pos);
  return end === -1 ? text.length : end;
}

/**
 * The edits that turn Markdown into plain text, for the nodes that touch
 * `from` to `to`, sorted by position. Each edit stays inside the lines of
 * its top-level block, so blocks can be rendered one at a time.
 * @param {string} text
 * @param {import('@lezer/common').Tree} tree
 * @returns {Edit[]}
 */
function syntaxEdits(text, tree, from = 0, to = text.length) {
  /** @type {Edit[]} */
  const edits = [];
  const remove = (a, b) => a < b && edits.push({ from: a, to: b, insert: '' });
  const lineStart = (pos) => lineStartOf(text, pos);
  const lineEnd = (pos) => lineEndOf(text, pos);
  const isSpace = (char) => char === ' ' || char === '\t';
  const spacesAfter = (pos) => {
    while (isSpace(text[pos])) pos += 1;
    return pos;
  };
  const spacesBefore = (pos) => {
    while (pos > 0 && isSpace(text[pos - 1])) pos -= 1;
    return pos;
  };
  // Indentation before a mark at the start of a line goes with the mark.
  // After a list or quote mark, the space stays.
  const indentBefore = (pos) => (spacesBefore(pos) === lineStart(pos) ? lineStart(pos) : pos);
  // A quote mark takes one space or tab after it.
  const removeQuoteMark = (mark) => remove(mark.from, mark.to + (isSpace(text[mark.to]) ? 1 : 0));
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
        case 'HeaderMark': {
          const heading = node.parent;
          if (heading.name.startsWith('Setext')) remove(lineStart(node.from) - 1, lineEnd(node.from));
          else if (node.from === heading.from) remove(indentBefore(node.from), spacesAfter(node.to));
          else remove(spacesBefore(node.from), lineEnd(node.from));
          return;
        }
        case 'EmphasisMark':
        case 'StrikethroughMark':
          remove(node.from, node.to);
          return;
        case 'InlineCode': {
          const [open, close] = node.getChildren('CodeMark');
          if (!close) return false;
          const code = text.slice(open.to, close.from);
          // One space on each side is padding, unless the code is only spaces (CommonMark 6.1).
          const pad = code.length > 1 && code[0] === ' ' && code.at(-1) === ' ' && code.trim() !== '' ? 1 : 0;
          remove(open.from, open.to + pad);
          remove(close.from - pad, close.to);
          return false;
        }
        case 'Escape':
          remove(node.from, node.from + 1);
          return;
        case 'HardBreak':
          remove(node.from, node.to - 1); // The spaces or the backslash. The line break stays.
          return;
        case 'Entity': {
          const char = decodeEntity(text.slice(node.from, node.to));
          if (char !== null) edits.push({ from: node.from, to: node.to, insert: char });
          return;
        }
        case 'QuoteMark':
          removeQuoteMark(node);
          return;
        case 'HorizontalRule':
          remove(node.from, node.to);
          return;
        case 'FencedCode': {
          // Only marks are read, so a nested code language is never walked.
          for (const mark of node.getChildren('QuoteMark')) removeQuoteMark(mark);
          const [open, ...rest] = node.getChildren('CodeMark');
          // The opening line goes with its line break. After a list mark, the
          // indentation of the next line goes too, so the code joins the mark.
          const openEnd = lineEnd(open.from);
          let end = Math.min(openEnd + 1, node.to);
          if (indentBefore(open.from) === open.from && open.from > lineStart(open.from)) {
            const column = open.from - lineStart(open.from);
            while (end < node.to && end - openEnd - 1 < column && text[end] === ' ') end += 1;
          }
          remove(indentBefore(open.from), end);
          // An unclosed fence has no closing mark, so its last line stays.
          const close = rest.at(-1);
          if (close) remove(lineStart(close.from) - 1, lineEnd(close.from));
          return false;
        }
        case 'HTMLBlock':
        case 'CommentBlock':
        case 'ProcessingInstructionBlock':
          // Raw HTML stays as it is (MDV-8). Only its quote marks go. The
          // nested HTML parse is never walked.
          for (const mark of node.getChildren('QuoteMark')) removeQuoteMark(mark);
          return false;
        case 'HTMLTag':
        case 'Comment':
        case 'ProcessingInstruction':
          return false;
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
          // The delimiter row, with the line break before it.
          if (node.parent?.name === 'Table') remove(lineStart(node.from) - 1, lineEnd(node.from));
          return;
        case 'TableHeader':
        case 'TableRow': {
          // A pipe between cells becomes a tab, also around an empty cell.
          // Outer pipes go. The spaces around a pipe go with it.
          const pipes = node.getChildren('TableDelimiter');
          let last = node.from;
          pipes.forEach((pipe, i) => {
            const before = Math.max(spacesBefore(pipe.from), last);
            const after = Math.min(spacesAfter(pipe.to), node.to);
            if (i === 0 && before === node.from) remove(node.from, after);
            else if (i === pipes.length - 1 && after === node.to) remove(before, node.to);
            else edits.push({ from: before, to: after, insert: '\t' });
            last = after;
          });
          return;
        }
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
 * has one character per code unit, so only text with other characters is
 * segmented.
 * @param {string} text
 * @returns {Counts}
 */
export function countText(text) {
  let words = 0;
  for (const segment of WORDS.segment(text)) if (segment.isWordLike) words += 1;
  let characters = text.length;
  if (/[^\x00-\x7F]/.test(text)) {
    characters = 0;
    for (const _ of GRAPHEMES.segment(text)) characters += 1;
  }
  for (const _ of text.matchAll(/\n/g)) characters -= 1;
  return { words, characters };
}

/**
 * A countText with a cache per line, for raw text in long documents (CNT-7).
 * Words never span a line break and line breaks do not count, so the sum
 * over the lines equals countText of the whole text. After an edit, only new
 * lines are segmented again.
 * @returns {(text: string) => Counts}
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

const HEADING = /^(?:ATX|Setext)Heading(\d)$/;
const CONTAINERS = new Set(['Document', 'Blockquote', 'BulletList', 'OrderedList', 'ListItem']);

/**
 * The headings in the lines `from` to `to`: level, plain text on one line
 * and start (OUT-1). Code blocks are not walked (OUT-5).
 * @param {string} text
 * @param {import('@lezer/common').Tree} tree
 * @returns {Heading[]}
 */
function headingsIn(text, tree, from, to) {
  const list = [];
  tree.iterate({
    from,
    to,
    enter({ name, node }) {
      const match = HEADING.exec(name);
      if (!match) return CONTAINERS.has(name);
      const underline = name.startsWith('Setext') ? node.getChild('HeaderMark') : null;
      const end = underline ? lineStartOf(text, underline.from) - 1 : node.to;
      const plain = renderedText(text, tree, node.from, end).replace(/\s+/g, ' ').trim();
      list.push({ level: Number(match[1]), text: plain, from: node.from });
      return false;
    },
  });
  return list;
}

/** Counts of text between blocks: blank lines, so no words. */
function countGap(text) {
  if (!/^[ \t\n]*$/.test(text)) return countText(text);
  let characters = text.length;
  for (const _ of text.matchAll(/\n/g)) characters -= 1;
  return { words: 0, characters };
}

/**
 * Plain-text counts and headings of Markdown with a cache per top-level
 * block, for long documents (CNT-7, NFR-2). A block is a run of whole lines,
 * and no rule reaches across blocks, so the sum over the blocks equals
 * countText(renderedText(...)). After an edit, only changed blocks are read
 * again. Link definitions can change any block, so new definitions clear
 * the cache.
 */
export function createSummary() {
  /** @type {Map<string, { counts: Counts, headings: Heading[] }>} */
  let cache = new Map();
  let definitions = '';

  /** Clears the cache when the link definitions changed. */
  function checkDefinitions(text, tree) {
    const key = JSON.stringify([...referenceDefinitions(tree, (a, b) => text.slice(a, b))]);
    if (key === definitions) return;
    definitions = key;
    cache = new Map();
  }

  /** The result of the block in lines `from` to `to`, stored in `next`. Headings are relative to `from`. */
  function block(text, tree, from, to, next) {
    const key = text.slice(from, to);
    let value = next.get(key) ?? cache.get(key);
    if (!value) {
      const headings = headingsIn(text, tree, from, to).map((h) => ({ ...h, from: h.from - from }));
      value = { counts: countText(renderedText(text, tree, from, to)), headings };
    }
    next.set(key, value);
    return value;
  }

  /** Calls visit for each top-level block, with its whole lines, in order. */
  function eachBlock(text, tree, visit) {
    for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
      visit(lineStartOf(text, node.from), lineEndOf(text, node.to));
    }
  }

  /** @param {Counts} counts */
  const adder = (counts) => (part) => {
    counts.words += part.words;
    counts.characters += part.characters;
  };

  return {
    /**
     * Counts and headings of the whole text. The cache then holds only the
     * current blocks.
     * @param {string} text
     * @param {import('@lezer/common').Tree} tree
     * @returns {{ counts: Counts, headings: Heading[] }}
     */
    all(text, tree) {
      checkDefinitions(text, tree);
      const next = new Map();
      const counts = { words: 0, characters: 0 };
      const add = adder(counts);
      const headings = [];
      let pos = 0;
      eachBlock(text, tree, (from, to) => {
        add(countGap(text.slice(pos, from)));
        const value = block(text, tree, from, to, next);
        add(value.counts);
        for (const heading of value.headings) headings.push({ ...heading, from: heading.from + from });
        pos = to;
      });
      add(countGap(text.slice(pos)));
      cache = next;
      return { counts, headings };
    },

    /**
     * Counts of `from` to `to`, the same as countText(renderedText(text,
     * tree, from, to)). Whole blocks come from the cache (CNT-3).
     * @param {string} text
     * @param {import('@lezer/common').Tree} tree
     * @returns {Counts}
     */
    range(text, tree, from, to) {
      checkDefinitions(text, tree);
      const counts = { words: 0, characters: 0 };
      const add = adder(counts);
      let pos = from;
      eachBlock(text, tree, (start, end) => {
        if (end < from || start > to) return;
        if (start > pos) add(countGap(text.slice(pos, start)));
        if (start >= from && end <= to) add(block(text, tree, start, end, cache).counts);
        else add(countText(renderedText(text, tree, Math.max(start, from), Math.min(end, to))));
        pos = Math.min(end, to);
      });
      if (pos < to) add(countGap(text.slice(pos, to)));
      return counts;
    },
  };
}
