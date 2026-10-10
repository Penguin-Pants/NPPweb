// Visual mode for Markdown (MDV-3 to MDV-8, MDV-14): a live preview inside the
// editor. Decorations hide Markdown marks and style the text in place, so the
// document text never changes. Lines that the cursor or selection touch show
// their marks (MDV-5). Raw HTML stays source text (MDV-8).
import { syntaxTree } from '@codemirror/language';
import { Facet, MapMode, Prec, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, keymap, ViewPlugin, WidgetType } from '@codemirror/view';
import { languageId } from './languages.js';
import { decodeEntity, isDrawnMermaid, linkTarget, normalizeLabel, referenceDefinitions } from './markdown-syntax.js';
import { renderedText } from './markdown-text.js';
import { mermaidRenderer } from './mermaid-render.js';
import { isMac } from './shortcuts.js';

/**
 * @typedef {{ kind: 'hide', from: number, to: number }
 *   | { kind: 'line', from: number, cls: string }
 *   | { kind: 'mark', from: number, to: number, cls: string, href?: string }
 *   | { kind: 'bullet', from: number, to: number }
 *   | { kind: 'task', from: number, to: number, checked: boolean }
 *   | { kind: 'image', from: number, to: number, alt: string, url: string }
 *   | { kind: 'text', from: number, to: number, value: string }} VisualSpec
 */

const INLINE_STYLES = {
  StrongEmphasis: 'cm-md-strong',
  Emphasis: 'cm-md-em',
  Strikethrough: 'cm-md-strike',
  InlineCode: 'cm-md-inline-code',
};
const LINK_PARENTS = new Set(['Link', 'Image', 'LinkReference']);

/** The editor theme, so diagrams match it. */
export const diagramTheme = Facet.define({ combine: (values) => values[0] ?? 'dark' });

/** Line ranges that the selection touches (MDV-5). */
const shownRanges = (state) => state.selection.ranges.map((range) => [state.doc.lineAt(range.from).from, state.doc.lineAt(range.to).to]);

/** A line that can open a mermaid block. The syntax tree decides. */
const MERMAID_FENCE = /^ {0,3}(?:`{3,}|~{3,})[ \t]*mermaid/i;

/** The start of each line in `from` to `to` that can open a mermaid block. */
function fenceLines(doc, from = 0, to = doc.length) {
  const starts = [];
  for (let line = doc.lineAt(from); ; line = doc.line(line.number + 1)) {
    if (MERMAID_FENCE.test(line.text)) starts.push(line.from);
    if (line.to >= to || line.number === doc.lines) return starts;
  }
}

/**
 * The start of each line that can open a mermaid block, in the order of the
 * document.
 * @param {import('@codemirror/state').Text} doc
 */
export const mermaidFences = (doc) => fenceLines(doc);

/**
 * The fence lines after a change, without a scan of the whole document
 * (NFR-2): old lines move with the change, and changed lines are read again.
 * @param {number[]} fences From mermaidFences or mapFences.
 * @param {import('@codemirror/state').ChangeSet} changes
 * @param {import('@codemirror/state').Text} doc The new document.
 */
export function mapFences(fences, changes, doc) {
  /** @type {[number, number][]} Changed lines in the new document. */
  const changed = [];
  changes.iterChangedRanges((_fromA, _toA, fromB, toB) => changed.push([doc.lineAt(fromB).from, doc.lineAt(toB).to]));
  const inChanged = (pos) => changed.some(([from, to]) => pos >= from && pos <= to);
  const next = [];
  for (const pos of fences) {
    const mapped = changes.mapPos(pos, 1, MapMode.TrackDel);
    if (mapped !== null && !inChanged(mapped)) next.push(mapped);
  }
  for (const [from, to] of changed) next.push(...fenceLines(doc, from, to));
  return [...new Set(next)].sort((a, b) => a - b);
}

/**
 * The mermaid blocks that Visual mode draws (MDV-12): whole lines, with their
 * source. A block whose lines the selection touches shows its source instead.
 * @param {import('@codemirror/state').EditorState} state
 * @param {number[]} [fences] From mermaidFences or mapFences.
 * @returns {{ from: number, to: number, source: string }[]}
 */
export function collectMermaid(state, fences = mermaidFences(state.doc)) {
  const { doc } = state;
  const shown = shownRanges(state);
  const top = syntaxTree(state).topNode;
  const slice = (a, b) => doc.sliceString(a, b);
  const blocks = [];
  for (const start of fences) {
    const node = top.childAfter(start);
    if (!node || doc.lineAt(node.from).from !== start || !isDrawnMermaid(node, slice)) continue;
    const to = doc.lineAt(node.to).to;
    if (shown.some(([a, b]) => a <= to && b >= start)) continue;
    const code = node.getChild('CodeText');
    blocks.push({ from: start, to, source: code ? doc.sliceString(code.from, code.to) : '' });
  }
  return blocks;
}

/**
 * What Visual mode shows for the part of the document from `from` to `to`.
 * Pure: it reads the state's syntax tree and selection. A hide never covers
 * a line break and a widget stays on one line, because CodeMirror does not
 * let a plugin replace line breaks.
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} from
 * @param {number} to
 * @returns {VisualSpec[]}
 */
export function collectVisual(state, from, to) {
  const { doc } = state;
  const tree = syntaxTree(state);
  // Lines that the selection touches show their marks (MDV-5).
  const shown = shownRanges(state);
  const isRevealed = (pos) => shown.some(([a, b]) => pos >= a && pos <= b);
  const oneLine = (a, b) => doc.lineAt(a).number === doc.lineAt(b).number;
  /** @type {VisualSpec[]} */
  const specs = [];
  const text = (a, b) => doc.sliceString(a, b);
  const hide = (a, b) => {
    for (let start = a; start < b; ) {
      const line = doc.lineAt(start);
      const end = Math.min(b, line.to);
      if (end > start && !isRevealed(start)) specs.push({ kind: 'hide', from: start, to: end });
      start = line.to + 1;
    }
  };
  const widget = (spec) => {
    if (oneLine(spec.from, spec.to) && !isRevealed(spec.from)) specs.push(spec);
  };
  const mark = (a, b, cls, href) => specs.push({ kind: 'mark', from: a, to: b, cls, ...(href && { href }) });
  const line = (pos, cls) => {
    const start = doc.lineAt(pos).from;
    if (start >= from && start <= to) specs.push({ kind: 'line', from: start, cls });
  };
  // The mark plus one following space, as in "# " or "> ".
  const withSpace = (node) => node.to + (text(node.to, node.to + 1) === ' ' ? 1 : 0);
  /** The URL of a link or image: its own, else the one of its reference definition. */
  const target = (node, marks) => {
    const url = node.getChild('URL');
    if (url) return linkTarget(text(url.from, url.to));
    const label = node.getChild('LinkLabel');
    const key = label && label.to - label.from > 2 ? text(label.from, label.to) : text(marks[0].to, marks[1].from);
    return referenceDefinitions(tree, text).get(normalizeLabel(key));
  };

  tree.iterate({
    from,
    to,
    enter(ref) {
      const { name, node } = ref;
      const heading = /^(ATX|Setext)Heading(\d)$/.exec(name);
      if (heading) {
        const level = heading[2];
        if (heading[1] === 'ATX') {
          line(node.from, `cm-md-h${level}`);
        } else {
          const underline = node.getChild('HeaderMark');
          for (let pos = node.from; pos < (underline?.from ?? node.to); pos = doc.lineAt(pos).to + 1) line(pos, `cm-md-h${level}`);
          if (underline) line(underline.from, 'cm-md-setext-underline');
        }
        return;
      }
      if (name in INLINE_STYLES) {
        mark(node.from, node.to, INLINE_STYLES[name]);
        return;
      }
      switch (name) {
        case 'HeaderMark': {
          const parent = node.parent;
          if (parent?.name.startsWith('Setext')) hide(node.from, node.to);
          else if (node.from === parent?.from) hide(node.from, withSpace(node));
          else hide(text(node.from - 1, node.from) === ' ' ? node.from - 1 : node.from, node.to);
          return;
        }
        case 'EmphasisMark':
        case 'StrikethroughMark':
        case 'CodeMark':
          hide(node.from, node.to);
          return;
        case 'Escape':
          hide(node.from, node.from + 1);
          return;
        case 'Entity': {
          const value = decodeEntity(text(node.from, node.to));
          if (value !== null) widget({ kind: 'text', from: node.from, to: node.to, value });
          return;
        }
        case 'FencedCode':
        case 'CodeBlock': {
          // A drawn diagram covers the whole block (collectMermaid).
          if (isDrawnMermaid(node, text)) {
            const blockFrom = doc.lineAt(node.from).from;
            const blockTo = doc.lineAt(node.to).to;
            if (!shown.some(([a, b]) => a <= blockTo && b >= blockFrom)) return false;
          }
          // Only the lines in the range, so a long block costs nothing off screen.
          const marks = name === 'FencedCode' ? node.getChildren('CodeMark') : [];
          const open = marks[0];
          const close = marks.length > 1 ? marks.at(-1) : null;
          const first = Math.max(doc.lineAt(node.from).number, doc.lineAt(from).number);
          const last = Math.min(doc.lineAt(node.to).number, doc.lineAt(to).number);
          const onLine = (mark, current) => mark && current.from <= mark.from && mark.from <= current.to;
          for (let n = first; n <= last; n += 1) {
            const current = doc.line(n);
            const fence = onLine(open, current) ? open : onLine(close, current) ? close : null;
            line(current.from, fence ? 'cm-md-codeblock cm-md-fence' : 'cm-md-codeblock');
            if (fence) hide(fence.from, current.to);
          }
          // A block inside a quote holds the quote marks of its lines.
          for (const quote of node.getChildren('QuoteMark')) {
            if (quote.from >= from && quote.from <= to) {
              line(quote.from, 'cm-md-quote');
              hide(quote.from, withSpace(quote));
            }
          }
          return false;
        }
        case 'Link': {
          const marks = node.getChildren('LinkMark');
          if (marks.length < 2) return;
          const href = target(node, marks);
          if (href === undefined) return; // [text] with no definition stays plain text.
          hide(node.from, marks[0].to);
          hide(marks[1].from, node.to);
          mark(marks[0].to, marks[1].from, 'cm-md-link', href);
          return;
        }
        case 'Autolink': {
          const url = node.getChild('URL');
          for (const linkMark of node.getChildren('LinkMark')) hide(linkMark.from, linkMark.to);
          if (url) mark(url.from, url.to, 'cm-md-link', linkTarget(text(url.from, url.to)));
          return false;
        }
        case 'URL':
          if (!LINK_PARENTS.has(node.parent?.name ?? '')) mark(node.from, node.to, 'cm-md-link', linkTarget(text(node.from, node.to)));
          return;
        case 'Image': {
          const marks = node.getChildren('LinkMark');
          if (marks.length >= 2) {
            // The description shows as plain text, as in .txt export.
            const alt = renderedText(doc, tree, marks[0].to, marks[1].from, node);
            widget({ kind: 'image', from: node.from, to: node.to, alt, url: target(node, marks) ?? '' });
          }
          return false;
        }
        case 'QuoteMark':
          line(node.from, 'cm-md-quote');
          hide(node.from, withSpace(node));
          return;
        case 'ListMark': {
          const item = node.parent;
          if (item?.parent?.name === 'OrderedList') mark(node.from, node.to, 'cm-md-list-number');
          else if (item?.getChild('Task')) hide(node.from, withSpace(node));
          else widget({ kind: 'bullet', from: node.from, to: node.to });
          return;
        }
        case 'TaskMarker':
          widget({ kind: 'task', from: node.from, to: node.to, checked: /x/i.test(text(node.from, node.to)) });
          return;
        case 'HorizontalRule':
          line(node.from, 'cm-md-hr');
          hide(node.from, node.to);
          return;
        case 'TableHeader':
          line(node.from, 'cm-md-table cm-md-table-header');
          return;
        case 'TableRow':
          line(node.from, 'cm-md-table');
          return;
        case 'TableDelimiter':
          if (node.parent?.name === 'Table') {
            line(node.from, 'cm-md-table cm-md-table-delimiter');
            hide(node.from, node.to);
          } else {
            mark(node.from, node.to, 'cm-md-table-pipe');
          }
          return;
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
  return specs;
}

// Remote images loaded with a click, until the page reloads (MDV-14). An
// image that fails to load leaves the set, so it needs another click.
const loadedImages = new Set();
const imagesLoaded = StateEffect.define();

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const dot = document.createElement('span');
    dot.className = 'cm-md-bullet';
    dot.textContent = '•';
    return dot;
  }
}

class TaskWidget extends WidgetType {
  constructor(checked) {
    super();
    this.checked = checked;
  }

  eq(other) {
    return other.checked === this.checked;
  }

  toDOM() {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-md-task';
    box.checked = this.checked;
    box.setAttribute('aria-label', this.checked ? 'Done task' : 'Open task');
    // Out of the tab order: from the keyboard, the task text [ ] or [x] is edited.
    box.tabIndex = -1;
    return box;
  }

  // The editor's mousedown handler toggles the task in the text.
  ignoreEvent() {
    return false;
  }
}

/** Text in place of source, such as the character of an entity. */
class TextWidget extends WidgetType {
  constructor(value) {
    super();
    this.value = value;
  }

  eq(other) {
    return other.value === this.value;
  }

  toDOM() {
    const span = document.createElement('span');
    span.textContent = this.value;
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

/** The alt text in a box. Only remote https: images get a Load button. */
function imagePlaceholder(alt, onLoad) {
  const box = document.createElement('span');
  box.className = 'cm-md-image-placeholder';
  const label = document.createElement('span');
  label.textContent = alt || 'Image';
  box.append(label);
  if (onLoad) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-md-image-load';
    button.textContent = 'Load image';
    button.addEventListener('click', onLoad);
    box.append(button);
  }
  return box;
}

class ImageWidget extends WidgetType {
  constructor(alt, url) {
    super();
    this.alt = alt;
    this.url = url;
    this.loaded = loadedImages.has(url);
  }

  eq(other) {
    return other.alt === this.alt && other.url === this.url && other.loaded === this.loaded;
  }

  toDOM(view) {
    const wrap = document.createElement('span');
    wrap.className = 'cm-md-image';
    const isData = /^data:image\//i.test(this.url);
    const isRemote = /^https:\/\//i.test(this.url);
    if (isData || (isRemote && this.loaded)) {
      const img = document.createElement('img');
      img.alt = this.alt;
      img.src = this.url;
      img.addEventListener('error', () => {
        loadedImages.delete(this.url);
        img.replaceWith(imagePlaceholder(this.alt)); // EDGE-25
      });
      wrap.append(img);
    } else if (isRemote) {
      wrap.append(
        imagePlaceholder(this.alt, () => {
          loadedImages.add(this.url);
          view.dispatch({ effects: imagesLoaded.of(null) });
        }),
      );
    } else {
      wrap.append(imagePlaceholder(this.alt)); // EDGE-25: relative or http: URLs never load.
    }
    return wrap;
  }
}

/** Diagram boxes that left the editor, so their render can be skipped. */
const goneBoxes = new WeakSet();

/**
 * A diagram finished. The field then draws its widget again with the result,
 * so the editor measures the new height.
 */
const diagramsDrawn = StateEffect.define();

/** Shows a render result in a diagram box. */
function showDiagram(box, result) {
  if ('svg' in result) {
    // As an image, the SVG can load nothing (MDV-14), and its ids stay its own.
    // Width and height give the box its size before the image decodes.
    const image = document.createElement('img');
    image.alt = 'Diagram';
    if (result.width > 0 && result.height > 0) {
      image.width = Math.round(result.width);
      image.height = Math.round(result.height);
    }
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`;
    box.replaceChildren(image);
  } else {
    box.classList.add('cm-md-mermaid-error'); // EDGE-15
    box.textContent = result.error;
  }
}

class MermaidWidget extends WidgetType {
  /** @param {object} [result] A result the widget had before this change. */
  constructor(source, theme, result) {
    super();
    this.source = source;
    this.theme = theme;
    this.result = result ?? mermaidRenderer.peek(source, theme);
  }

  eq(other) {
    return other.source === this.source && other.theme === this.theme && other.result === this.result;
  }

  get estimatedHeight() {
    return 160;
  }

  toDOM(view) {
    const box = document.createElement('div');
    box.className = 'cm-md-mermaid';
    if (this.result) {
      showDiagram(box, this.result);
      return box;
    }
    box.textContent = 'Drawing the diagram...';
    mermaidRenderer.render(this.source, this.theme, () => !goneBoxes.has(box)).then((result) => {
      if (!result || goneBoxes.has(box)) return;
      if (mermaidRenderer.peek(this.source, this.theme)) {
        view.dispatch({ effects: diagramsDrawn.of(null) });
      } else {
        showDiagram(box, result); // A failed load is not kept. The next widget tries again.
        view.requestMeasure();
      }
    });
    return box;
  }

  destroy(box) {
    goneBoxes.add(box);
  }

  // A click on the diagram puts the cursor in the block, which shows its source.
  ignoreEvent() {
    return false;
  }
}

const isMarkdown = (state) => state.facet(languageId) === 'markdown';

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number[]} fences
 * @param {import('@codemirror/view').DecorationSet} [previous] Its results carry over, so a
 *   diagram in the document keeps its result when the renderer drops it.
 */
function mermaidDecorations(state, fences, previous = Decoration.none) {
  if (!isMarkdown(state)) return Decoration.none;
  const theme = state.facet(diagramTheme);
  const known = new Map();
  for (const iter = previous.iter(); iter.value; iter.next()) {
    const { widget } = iter.value.spec;
    if (widget.result) known.set(`${widget.theme}\n${widget.source}`, widget.result);
  }
  return Decoration.set(
    collectMermaid(state, fences).map(({ from, to, source }) =>
      Decoration.replace({ block: true, widget: new MermaidWidget(source, theme, known.get(`${theme}\n${source}`)) }).range(from, to),
    ),
  );
}

// Diagrams replace whole lines, which only a state field may do. The field
// keeps the fence lines up to date, so an edit never scans the document.
const mermaidField = StateField.define({
  create(state) {
    const fences = mermaidFences(state.doc);
    return { fences, decorations: mermaidDecorations(state, fences) };
  },
  update(value, tr) {
    const fences = tr.docChanged ? mapFences(value.fences, tr.changes, tr.newDoc) : value.fences;
    const changed =
      tr.docChanged ||
      tr.selection ||
      tr.reconfigured ||
      syntaxTree(tr.startState) !== syntaxTree(tr.state) ||
      tr.effects.some((effect) => effect.is(diagramsDrawn));
    return changed ? { fences, decorations: mermaidDecorations(tr.state, fences, value.decorations) } : value;
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

/**
 * ArrowDown on the line above a diagram, or ArrowUp on the line below it,
 * moves into the block, so its source shows (MDV-12). Otherwise the cursor
 * would jump over it.
 * @param {1 | -1} dir
 */
const enterDiagram = (dir) => (view) => {
  const { state } = view;
  const range = state.selection.main;
  if (state.selection.ranges.length > 1 || !range.empty) return false;
  const line = state.doc.lineAt(range.head);
  const edge = dir > 0 ? line.to + 1 : line.from - 1;
  if (edge < 0 || edge > state.doc.length) return false;
  let target = null;
  state.field(mermaidField).decorations.between(edge, edge, (from, to) => {
    if (dir > 0 ? from === edge : to === edge) target = dir > 0 ? from : state.doc.lineAt(to).from;
  });
  if (target === null) return false;
  view.dispatch({ selection: { anchor: target }, scrollIntoView: true });
  return true;
};

const diagramKeys = Prec.high(
  keymap.of([
    { key: 'ArrowDown', run: enterDiagram(1) },
    { key: 'ArrowUp', run: enterDiagram(-1) },
  ]),
);

/** Builds the decorations for the visible part of the document. */
function buildDecorations(view) {
  if (!isMarkdown(view.state)) return Decoration.none;
  const ranges = [];
  /** @type {Map<number, Set<string>>} */
  const lineClasses = new Map();
  for (const { from, to } of view.visibleRanges) {
    for (const spec of collectVisual(view.state, from, to)) {
      if (spec.kind === 'line') {
        const set = lineClasses.get(spec.from) ?? new Set();
        for (const cls of spec.cls.split(' ')) set.add(cls);
        lineClasses.set(spec.from, set);
      } else if (spec.kind === 'hide') {
        ranges.push(Decoration.replace({}).range(spec.from, spec.to));
      } else if (spec.kind === 'mark') {
        const attributes = spec.href ? { 'data-href': spec.href } : undefined;
        ranges.push(Decoration.mark({ class: spec.cls, attributes }).range(spec.from, spec.to));
      } else {
        const widget =
          spec.kind === 'bullet'
            ? new BulletWidget()
            : spec.kind === 'task'
              ? new TaskWidget(spec.checked)
              : spec.kind === 'text'
                ? new TextWidget(spec.value)
                : new ImageWidget(spec.alt, spec.url);
        ranges.push(Decoration.replace({ widget }).range(spec.from, spec.to));
      }
    }
  }
  for (const [from, classes] of lineClasses) ranges.push(Decoration.line({ class: [...classes].join(' ') }).range(from));
  return Decoration.set(ranges, true);
}

const visualPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildDecorations(view);
    }

    update(update) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        syntaxTree(update.startState) !== syntaxTree(update.state) ||
        update.transactions.some((tr) => tr.effects.some((effect) => effect.is(imagesLoaded)))
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const SAFE_LINK = /^(https?:|mailto:)/i;

// A left click on a task box switches [ ] and [x]. Ctrl+click (Cmd+click on
// macOS, where Ctrl+click opens the context menu) opens a link in a new
// browser tab (MDV-7). Other clicks place the cursor.
const clickHandlers = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0 || !isMarkdown(view.state) || !(event.target instanceof Element)) return false;
    const box = event.target.closest('.cm-md-task');
    if (box) {
      const pos = view.posAtDOM(box);
      const marker = view.state.sliceDoc(pos, pos + 3);
      if (!/^\[[ xX]\]$/.test(marker)) return false;
      view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: marker[1] === ' ' ? 'x' : ' ' }, userEvent: 'input' });
      event.preventDefault();
      return true;
    }
    const link = event.target.closest('.cm-md-link');
    const href = link?.getAttribute('data-href');
    if ((isMac() ? event.metaKey : event.ctrlKey) && href && SAFE_LINK.test(href)) {
      window.open(href, '_blank', 'noopener,noreferrer');
      event.preventDefault();
      return true;
    }
    return false;
  },
});

// Prose in Visual mode uses the interface font. Code keeps the mono font.
const visualContent = EditorView.contentAttributes.compute([languageId], (state) =>
  isMarkdown(state) ? { class: 'cm-md-visual' } : {},
);

/** The Visual mode extension. It only acts on Markdown documents. */
export const visualMode = [visualPlugin, mermaidField, diagramKeys, clickHandlers, visualContent];
