// Markdown formatting commands for the toolbar and keys (MDV-9, MDV-10). Each
// command takes an editor state and returns a transaction spec, or null when
// it changes nothing. `run` turns one into a CodeMirror command.
import { EditorSelection } from '@codemirror/state';

const BULLET = /^(\s*)[-*+][ \t]+/;
const NUMBER = /^(\s*)\d+[.)][ \t]+/;
const QUOTE = /^(\s*)>[ \t]?/;
const HEADING = /^#{1,6}[ \t]+/;
const FENCE = /^\s*(```|~~~)/;

/** The run of `char` that ends at `pos` (dir -1) or starts at it (dir 1). */
function runLength(text, pos, dir, char) {
  let length = 0;
  for (let i = dir < 0 ? pos - 1 : pos; i >= 0 && i < text.length && text[i] === char; i += dir) length += 1;
  return length;
}

// For stars, bold needs at least two on each side and italic an odd count,
// so ***x*** is both and **x** is only bold.
function hasMarker(left, right, marker) {
  if (marker === '**') return left >= 2 && right >= 2;
  if (marker === '*') return left % 2 === 1 && right % 2 === 1;
  return left >= marker.length && right >= marker.length;
}

/** Wraps each selection in `marker`, or removes it when it is there. */
function toggleInline(state, marker) {
  const size = marker.length;
  const char = marker[0];
  const doc = state.doc.toString();
  return state.changeByRange((range) => {
    const { from, to } = range;
    if (hasMarker(runLength(doc, from, -1, char), runLength(doc, to, 1, char), marker)) {
      return {
        changes: [
          { from: from - size, to: from },
          { from: to, to: to + size },
        ],
        range: EditorSelection.range(from - size, to - size),
      };
    }
    const text = doc.slice(from, to);
    if (text.length >= 2 * size && hasMarker(runLength(text, 0, 1, char), runLength(text, text.length, -1, char), marker)) {
      return {
        changes: [
          { from, to: from + size },
          { from: to - size, to },
        ],
        range: EditorSelection.range(from, to - 2 * size),
      };
    }
    return {
      changes: [
        { from, insert: marker },
        { from: to, insert: marker },
      ],
      range: EditorSelection.range(from + size, to + size),
    };
  });
}

export const toggleBold = (state) => toggleInline(state, '**');
export const toggleItalic = (state) => toggleInline(state, '*');
export const toggleInlineCode = (state) => toggleInline(state, '`');

/** The lines that the selection touches, in order, without repeats. */
function selectedLines(state) {
  const seen = new Map();
  for (const range of state.selection.ranges) {
    const last = state.doc.lineAt(range.to).number;
    for (let n = state.doc.lineAt(range.from).number; n <= last; n += 1) seen.set(n, state.doc.line(n));
  }
  return [...seen.values()].sort((a, b) => a.number - b.number);
}

/** Changes for each line from `edit(line, index)`, or null when nothing changes. */
function editLines(lines, edit) {
  const changes = lines.map(edit).filter(Boolean);
  return changes.length === 0 ? null : { changes };
}

/**
 * Sets the heading level (1 to 6) of each selected line. 0 makes it a normal line.
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} level
 */
export function setHeading(state, level) {
  const prefix = level > 0 ? `${'#'.repeat(level)} ` : '';
  return editLines(selectedLines(state), (line) => {
    const old = HEADING.exec(line.text)?.[0] ?? '';
    return old === prefix ? null : { from: line.from, to: line.from + old.length, insert: prefix };
  });
}

// List and quote toggles skip blank lines. When every other line already has
// the marker, they remove it. Otherwise they add it where it is missing.
function contentLines(state) {
  const lines = selectedLines(state);
  const filled = lines.filter((line) => line.text.trim() !== '');
  return filled.length > 0 ? filled : lines;
}

/** Replaces the part of `line` that `pattern` matches after the indent. */
function replaceMarker(line, pattern, insert) {
  const match = pattern.exec(line.text);
  const indent = match ? match[1].length : (/^\s*/.exec(line.text)?.[0].length ?? 0);
  const end = match ? match[0].length : indent;
  return { from: line.from + indent, to: line.from + end, insert };
}

export function toggleBulletList(state) {
  const lines = contentLines(state);
  if (lines.every((line) => BULLET.test(line.text))) return editLines(lines, (line) => replaceMarker(line, BULLET, ''));
  return editLines(lines, (line) => {
    if (BULLET.test(line.text)) return null;
    return replaceMarker(line, NUMBER.test(line.text) ? NUMBER : /^(\s*)/, '- ');
  });
}

export function toggleNumberedList(state) {
  const lines = contentLines(state);
  if (lines.every((line) => NUMBER.test(line.text))) return editLines(lines, (line) => replaceMarker(line, NUMBER, ''));
  return editLines(lines, (line, index) => {
    const pattern = NUMBER.test(line.text) ? NUMBER : BULLET.test(line.text) ? BULLET : /^(\s*)/;
    return replaceMarker(line, pattern, `${index + 1}. `);
  });
}

export function toggleQuote(state) {
  const lines = contentLines(state);
  if (lines.every((line) => QUOTE.test(line.text))) return editLines(lines, (line) => replaceMarker(line, QUOTE, ''));
  return editLines(lines, (line) => (QUOTE.test(line.text) ? null : { from: line.from, insert: '> ' }));
}

/** Turns each selection into a link and selects the URL to type over. */
export function insertLink(state) {
  const url = 'https://';
  return state.changeByRange(({ from, to }) => {
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

/** Puts fences around the selected lines, or removes the fences around them. */
export function toggleCodeBlock(state) {
  const { from, to } = state.selection.main;
  const first = state.doc.lineAt(from);
  const last = state.doc.lineAt(to);
  const before = first.number > 1 ? state.doc.line(first.number - 1) : null;
  const after = last.number < state.doc.lines ? state.doc.line(last.number + 1) : null;
  if (before && after && FENCE.test(before.text) && FENCE.test(after.text)) {
    return {
      changes: [
        { from: before.from, to: first.from },
        { from: last.to, to: after.to },
      ],
    };
  }
  return {
    changes: [
      { from: first.from, insert: '```\n' },
      { from: last.to, insert: '\n```' },
    ],
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
