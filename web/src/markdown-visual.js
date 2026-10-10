// Visual mode for Markdown (MDV-3 to MDV-8, MDV-14): a live preview inside the
// editor. Decorations hide Markdown marks and style the text in place, so the
// document text never changes. Lines that the cursor or selection touch show
// their marks (MDV-5). Raw HTML stays source text (MDV-8).
import { syntaxTree } from '@codemirror/language';
import { StateEffect } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import { languageId } from './languages.js';

/**
 * @typedef {{ kind: 'hide', from: number, to: number }
 *   | { kind: 'line', from: number, cls: string }
 *   | { kind: 'mark', from: number, to: number, cls: string, href?: string }
 *   | { kind: 'bullet', from: number, to: number }
 *   | { kind: 'task', from: number, to: number, checked: boolean }
 *   | { kind: 'image', from: number, to: number, alt: string, url: string }} VisualSpec
 */

const INLINE_STYLES = {
  StrongEmphasis: 'cm-md-strong',
  Emphasis: 'cm-md-em',
  Strikethrough: 'cm-md-strike',
  InlineCode: 'cm-md-inline-code',
};
const LINK_PARENTS = new Set(['Link', 'Image', 'Autolink', 'LinkReference']);
const FENCE = /^\s*(```|~~~)/;

/** Line numbers that a selection range touches (MDV-5). */
function revealedLines(state) {
  const lines = new Set();
  for (const range of state.selection.ranges) {
    const last = state.doc.lineAt(range.to).number;
    for (let n = state.doc.lineAt(range.from).number; n <= last; n += 1) lines.add(n);
  }
  return lines;
}

/**
 * What Visual mode shows for the part of the document from `from` to `to`.
 * Pure: it reads the state's syntax tree and selection.
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} from
 * @param {number} to
 * @returns {VisualSpec[]}
 */
export function collectVisual(state, from, to) {
  const { doc } = state;
  const revealed = revealedLines(state);
  const isRevealed = (pos) => revealed.has(doc.lineAt(pos).number);
  /** @type {VisualSpec[]} */
  const specs = [];
  const text = (a, b) => doc.sliceString(a, b);
  const hide = (a, b) => {
    if (a < b && !isRevealed(a)) specs.push({ kind: 'hide', from: a, to: b });
  };
  const mark = (a, b, cls, href) => specs.push({ kind: 'mark', from: a, to: b, cls, ...(href && { href }) });
  const line = (pos, cls) => {
    const start = doc.lineAt(pos).from;
    if (start >= from && start <= to) specs.push({ kind: 'line', from: start, cls });
  };
  // The mark plus one following space, as in "# " or "> ".
  const withSpace = (node) => node.to + (text(node.to, node.to + 1) === ' ' ? 1 : 0);

  syntaxTree(state).iterate({
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
          if (node.parent?.name.startsWith('Setext')) hide(node.from, node.to);
          else if (node.from === doc.lineAt(node.from).from) hide(node.from, withSpace(node));
          else hide(text(node.from - 1, node.from) === ' ' ? node.from - 1 : node.from, node.to);
          return;
        }
        case 'EmphasisMark':
        case 'StrikethroughMark':
        case 'Escape':
          hide(node.from, name === 'Escape' ? node.from + 1 : node.to);
          return;
        case 'CodeMark':
          if (node.parent?.name === 'InlineCode') hide(node.from, node.to);
          return;
        case 'FencedCode':
        case 'CodeBlock': {
          const first = doc.lineAt(node.from);
          const last = doc.lineAt(node.to);
          for (let n = first.number; n <= last.number; n += 1) {
            const current = doc.line(n);
            const fence = name === 'FencedCode' && (n === first.number || (n === last.number && FENCE.test(current.text)));
            line(current.from, fence ? 'cm-md-codeblock cm-md-fence' : 'cm-md-codeblock');
            if (fence) hide(current.from, current.to);
          }
          return false;
        }
        case 'Link': {
          const marks = node.getChildren('LinkMark');
          if (marks.length < 2) return;
          const href = node.getChild('URL');
          hide(node.from, marks[0].to);
          hide(marks[1].from, node.to);
          mark(marks[0].to, marks[1].from, 'cm-md-link', href ? text(href.from, href.to) : undefined);
          return;
        }
        case 'Autolink': {
          const url = node.getChild('URL');
          for (const linkMark of node.getChildren('LinkMark')) hide(linkMark.from, linkMark.to);
          if (url) mark(url.from, url.to, 'cm-md-link', text(url.from, url.to));
          return false;
        }
        case 'URL': {
          if (LINK_PARENTS.has(node.parent?.name ?? '')) return;
          const url = text(node.from, node.to);
          mark(node.from, node.to, 'cm-md-link', url.startsWith('www.') ? `https://${url}` : url);
          return;
        }
        case 'Image': {
          const marks = node.getChildren('LinkMark');
          const url = node.getChild('URL');
          if (!isRevealed(node.from) && marks.length >= 2) {
            specs.push({
              kind: 'image',
              from: node.from,
              to: node.to,
              alt: text(marks[0].to, marks[1].from),
              url: url ? text(url.from, url.to) : '',
            });
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
          else if (!isRevealed(node.from)) specs.push({ kind: 'bullet', from: node.from, to: node.to });
          return;
        }
        case 'TaskMarker':
          if (!isRevealed(node.from)) {
            specs.push({ kind: 'task', from: node.from, to: node.to, checked: /x/i.test(text(node.from, node.to)) });
          }
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

// Remote images loaded with a click, until the page reloads (MDV-14).
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
    return box;
  }

  // The editor's mousedown handler toggles the task in the text.
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
      img.addEventListener('error', () => img.replaceWith(imagePlaceholder(this.alt))); // EDGE-25
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

const isMarkdown = (state) => state.facet(languageId) === 'markdown';

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

// A click on a task box switches [ ] and [x]. Ctrl+click (Cmd+click on macOS)
// opens a link in a new browser tab (MDV-7). Other clicks place the cursor.
const clickHandlers = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!isMarkdown(view.state) || !(event.target instanceof Element)) return false;
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
    if ((event.ctrlKey || event.metaKey) && href && SAFE_LINK.test(href)) {
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
export const visualMode = [visualPlugin, clickHandlers, visualContent];
