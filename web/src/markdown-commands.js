// Markdown formatting commands for the toolbar and keys (MDV-9, MDV-10). Each
// command takes an editor state and returns a transaction spec, or null when
// it changes nothing. `run` turns one into a CodeMirror command. The commands
// read the Markdown syntax tree, so they only remove marks that belong to one
// node (one emphasis, code span, link or code block).
import { syntaxTree } from '@codemirror/language';
import { EditorSelection } from '@codemirror/state';

// List marks after any quote marks, and quote marks after any list marks.
// Group 1 is the part before the mark.
const BULLET = /^((?:[ \t]*>[ \t]?)*[ \t]*)[-*+][ \t]+/;
const NUMBER = /^((?:[ \t]*>[ \t]?)*[ \t]*)\d+[.)][ \t]+/;
const QUOTE = /^((?:[ \t]*(?:[-*+]|\d+[.)])[ \t]+)*[ \t]*)>[ \t]?/;
// Where a new list mark goes: after the quote marks and the indent.
const LIST_START = /^((?:[ \t]*>[ \t]?)*[ \t]*)/;
// Quote and list marks that a heading goes after, then an old heading mark.
const CONTAINER = /^\s*(?:>[ \t]?)*(?:[-*+][ \t]+|\d+[.)][ \t]+)?/;
const HEADING = /^#{1,6}[ \t]+/;

const NODE_FOR = { '**': 'StrongEmphasis', '*': 'Emphasis', '`': 'InlineCode' };
const MARK_OF = { '**': 'EmphasisMark', '*': 'EmphasisMark', '`': 'CodeMark' };
const MARK_FOR = { StrongEmphasis: 'EmphasisMark', Emphasis: 'EmphasisMark', InlineCode: 'CodeMark', Link: 'LinkMark' };

/** The innermost node named `name` that holds from..to, or null. */
function enclosing(state, from, to, name) {
  for (let node = syntaxTree(state).resolveInner(from, 1); node; node = node.parent) {
    if (node.name === name && node.from <= from && node.to >= to) return node;
  }
  return null;
}

/**
 * The node named `name` whose content (between its first and last mark) or
 * whole range is exactly from..to, with its first and last mark.
 */
function exactNode(state, from, to, name) {
  for (let node = syntaxTree(state).resolveInner(from, 1); node; node = node.parent) {
    if (node.name !== name) continue;
    const marks = node.getChildren(MARK_FOR[name]);
    if (marks.length < 2) continue;
    const [open, close] = [marks[0], marks.at(-1)];
    if ((from === open.to && to === close.from) || (from === node.from && to === node.to)) return { node, open, close };
  }
  return null;
}

const CODE = new Set(['InlineCode', 'FencedCode', 'CodeBlock', 'HTMLBlock', 'HTMLTag']);
/** Whether `pos` is in code or raw HTML, where stars and backticks are text. */
function inCode(tree, pos) {
  for (let node = tree.resolveInner(pos, -1); node; node = node.parent) if (CODE.has(node.name)) return true;
  return false;
}

/** The run of `char` that ends at `pos` (dir -1) or starts at it (dir 1). */
function runLength(text, pos, dir, char) {
  let length = 0;
  for (let i = dir < 0 ? pos - 1 : pos; i >= 0 && i < text.length && text[i] === char; i += dir) length += 1;
  return length;
}

// For stars right beside the selection, bold needs at least two on each side
// and italic an odd count, so ***x*** is both and **x** is only bold.
function hasMarker(left, right, marker) {
  if (marker === '**') return left >= 2 && right >= 2;
  if (marker === '*') return left % 2 === 1 && right % 2 === 1;
  return left >= marker.length && right >= marker.length;
}

/** Removes the marks of one node and keeps the text between them selected. */
function unwrap({ node, open, close }, from) {
  const removed = open.to - open.from;
  const start = from === node.from ? node.from : from - removed;
  return {
    changes: [
      { from: open.from, to: open.to },
      { from: close.from, to: close.to },
    ],
    range: EditorSelection.range(start, start + (close.from - open.to)),
  };
}

/**
 * The marks to put around `text`. Code needs a backtick run longer than any
 * in the text, and a space inside when the text starts or ends with one.
 */
function wrapMarks(marker, text) {
  if (marker !== '`') return [marker, marker];
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return [fence + pad, pad + fence];
}

/** Wraps each selection in `marker`, or removes it when it is there. */
function toggleInline(state, marker) {
  const size = marker.length;
  const doc = state.doc.toString();
  const tree = syntaxTree(state);
  return state.changeByRange((range) => {
    const { from, to } = range;
    const exact = exactNode(state, from, to, NODE_FOR[marker]);
    if (exact) return unwrap(exact, from);
    // Marks right beside the selection go only when the syntax tree says they
    // are marks, so stars or backticks in code stay. An empty pair such as
    // **|** is no node, so outside code a cursor between marks unwraps too.
    const marks =
      (tree.resolveInner(from, -1).name === MARK_OF[marker] && tree.resolveInner(to, 1).name === MARK_OF[marker]) ||
      (from === to && !inCode(tree, from));
    if (marks && hasMarker(runLength(doc, from, -1, marker[0]), runLength(doc, to, 1, marker[0]), marker)) {
      return {
        changes: [
          { from: from - size, to: from },
          { from: to, to: to + size },
        ],
        range: EditorSelection.range(from - size, to - size),
      };
    }
    const [open, close] = wrapMarks(marker, doc.slice(from, to));
    return {
      changes: [
        { from, insert: open },
        { from: to, insert: close },
      ],
      range: EditorSelection.range(from + open.length, to + open.length),
    };
  });
}

export const toggleBold = (state) => toggleInline(state, '**');
export const toggleItalic = (state) => toggleInline(state, '*');
export const toggleInlineCode = (state) => toggleInline(state, '`');

/**
 * The lines that the selection touches, in order, without repeats. A
 * selection that ends at the start of a line leaves that line out.
 */
function selectedLines(state) {
  const seen = new Map();
  for (const range of state.selection.ranges) {
    const end = !range.empty && state.doc.lineAt(range.to).from === range.to ? range.to - 1 : range.to;
    const last = state.doc.lineAt(end).number;
    for (let n = state.doc.lineAt(range.from).number; n <= last; n += 1) seen.set(n, state.doc.line(n));
  }
  return [...seen.values()].sort((a, b) => a.number - b.number);
}

/** Changes for each line from `edit(line, index)`, or null when nothing changes. */
function editLines(lines, edit) {
  const changes = lines.map(edit).filter(Boolean);
  return changes.length === 0 ? null : { changes };
}

// Commands on lines skip blank lines, unless every selected line is blank.
function contentLines(state) {
  const lines = selectedLines(state);
  const filled = lines.filter((line) => line.text.trim() !== '');
  return filled.length > 0 ? filled : lines;
}

/** The heading that holds `pos`, or null. */
function headingAt(state, pos) {
  for (let node = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (/^(?:ATX|Setext)Heading/.test(node.name)) return node;
  }
  return null;
}

/**
 * Sets the heading level (1 to 6) of each selected line, after its quote or
 * list marks. 0 makes it a normal line. A setext heading loses its underline
 * and becomes ATX. Plain text also loses closing hashes.
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} level
 */
export function setHeading(state, level) {
  const { doc } = state;
  const prefix = level > 0 ? `${'#'.repeat(level)} ` : '';
  const changes = [];
  const setext = new Set();
  for (const line of contentLines(state)) {
    const start = CONTAINER.exec(line.text)[0].length;
    const heading = headingAt(state, line.from + start);
    if (heading?.name.startsWith('Setext')) {
      if (setext.has(heading.from)) continue;
      setext.add(heading.from);
      const underline = doc.lineAt(heading.getChild('HeaderMark').from);
      if (prefix) changes.push({ from: heading.from, insert: prefix });
      changes.push({ from: underline.from - 1, to: underline.to });
      continue;
    }
    const old = HEADING.exec(line.text.slice(start))?.[0] ?? '';
    if (old === prefix) continue;
    changes.push({ from: line.from + start, to: line.from + start + old.length, insert: prefix });
    const close = heading?.getChildren('HeaderMark')[1];
    if (!prefix && close) changes.push({ from: line.from + line.text.slice(0, close.from - line.from).trimEnd().length, to: line.to });
  }
  return changes.length === 0 ? null : { changes };
}

/** Replaces the part of `line` that `pattern` matches after the indent. */
function replaceMarker(line, pattern, insert) {
  const match = pattern.exec(line.text);
  const indent = match ? match[1].length : (/^\s*/.exec(line.text)?.[0].length ?? 0);
  const end = match ? match[0].length : indent;
  return { from: line.from + indent, to: line.from + end, insert };
}

// When every selected line already has the marker, it goes. Otherwise it is
// added where it is missing.
export function toggleBulletList(state) {
  const lines = contentLines(state);
  if (lines.every((line) => BULLET.test(line.text))) return editLines(lines, (line) => replaceMarker(line, BULLET, ''));
  return editLines(lines, (line) => {
    if (BULLET.test(line.text)) return null;
    return replaceMarker(line, NUMBER.test(line.text) ? NUMBER : LIST_START, '- ');
  });
}

export function toggleNumberedList(state) {
  const lines = contentLines(state);
  if (lines.every((line) => NUMBER.test(line.text))) return editLines(lines, (line) => replaceMarker(line, NUMBER, ''));
  return editLines(lines, (line, index) => {
    const pattern = NUMBER.test(line.text) ? NUMBER : BULLET.test(line.text) ? BULLET : LIST_START;
    return replaceMarker(line, pattern, `${index + 1}. `);
  });
}

export function toggleQuote(state) {
  const lines = contentLines(state);
  if (lines.every((line) => QUOTE.test(line.text))) return editLines(lines, (line) => replaceMarker(line, QUOTE, ''));
  return editLines(lines, (line) => (QUOTE.test(line.text) ? null : { from: line.from, insert: '> ' }));
}

/**
 * Turns each selection into a link and selects the URL to type over. Inside
 * a link, it removes the link and keeps its text selected (MDV-9).
 */
export function insertLink(state) {
  const url = 'https://';
  return state.changeByRange(({ from, to }) => {
    const link = enclosing(state, from, to, 'Link');
    const marks = link?.getChildren('LinkMark') ?? [];
    if (link && marks.length >= 2) {
      return {
        changes: [
          { from: link.from, to: marks[0].to },
          { from: marks[1].from, to: link.to },
        ],
        range: EditorSelection.range(link.from, link.from + (marks[1].from - marks[0].to)),
      };
    }
    const text = from === to ? 'link' : '';
    const start = to + text.length + 3;
    return {
      changes: [
        { from, insert: `[${text}` },
        { from: to, insert: `](${url})` },
      ],
      range: EditorSelection.range(start, start + url.length),
    };
  });
}

/**
 * Removes the fences of the code block that holds the selection, or whose
 * fences are the first and last selected lines. Otherwise puts fences around
 * the selected lines and keeps the selection inside.
 */
export function toggleCodeBlock(state) {
  const { doc } = state;
  const { from, to, anchor, head } = state.selection.main;
  const lines = selectedLines(state);
  const first = lines[0];
  const last = lines.at(-1);
  const around = enclosing(state, first.to, first.to, 'FencedCode');
  const block =
    enclosing(state, from, to, 'FencedCode') ??
    (around && doc.lineAt(around.from).number === first.number && doc.lineAt(around.to).number === last.number ? around : null);
  if (block) {
    const open = doc.lineAt(block.from);
    const openEnd = Math.min(open.to + 1, doc.length);
    // The closing fence is the last mark of a closed block. Its line can start with quote marks.
    const marks = block.getChildren('CodeMark');
    if (marks.length < 2) return { changes: { from: open.from, to: openEnd } };
    const close = doc.lineAt(marks.at(-1).from);
    // An empty block: both fence lines go, with one line break.
    if (close.number === open.number + 1) return { changes: { from: open.from, to: Math.min(close.to + 1, doc.length) } };
    return {
      changes: [
        { from: open.from, to: openEnd },
        { from: close.from - 1, to: close.to },
      ],
    };
  }
  return {
    changes: [
      { from: first.from, insert: '```\n' },
      { from: last.to, insert: '\n```' },
    ],
    selection: EditorSelection.single(anchor + 4, head + 4),
  };
}

/**
 * A CodeMirror command from a state command.
 * @param {(state: import('@codemirror/state').EditorState, ...args: any[]) => any} command
 * @param {...any} args
 * @returns {import('@codemirror/view').Command}
 */
export function run(command, ...args) {
  return (view) => {
    const spec = command(view.state, ...args);
    if (spec === null) return false;
    view.dispatch(view.state.update(spec, { scrollIntoView: true, userEvent: 'input' }));
    return true;
  };
}

export const markdownKeymap = [
  { key: 'Mod-b', run: run(toggleBold), preventDefault: true },
  { key: 'Mod-i', run: run(toggleItalic), preventDefault: true },
  { key: 'Mod-k', run: run(insertLink), preventDefault: true },
];
