// One CodeMirror view for the app (section 2.8). Each tab keeps its own
// EditorState, so undo history stays per tab. Custom minimal setup: no
// basicSetup, no multiple selections (TD-8, NG-1).
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { visualMode } from './markdown-visual.js';
import { searchExtension } from './search-panel.js';
import { sizeLimit } from './size-limit.js';

const baseTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace' },
});

const lightTheme = [
  EditorView.theme({
    '&': { backgroundColor: 'var(--surface)', color: 'var(--fg)' },
    '.cm-gutters': { backgroundColor: 'var(--surface-2)', color: 'var(--muted)', borderRight: '1px solid var(--border)' },
    '.cm-activeLine': { backgroundColor: 'rgb(0 0 0 / 0.04)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgb(0 0 0 / 0.06)' },
  }),
  syntaxHighlighting(defaultHighlightStyle),
];

const themeExtension = (theme) => (theme === 'dark' ? oneDark : lightTheme);
// Visual mode acts only on Markdown documents (MDV-1).
const modeExtension = (mode) => (mode === 'visual' ? visualMode : []);

/**
 * @param {HTMLElement} parent
 * @param {object} options
 * @param {'dark' | 'light'} options.theme
 * @param {'visual' | 'raw'} options.markdownMode
 * @param {(update: import('@codemirror/view').ViewUpdate) => void} options.onUpdate Runs on every view update.
 * @param {() => void} options.onTooLarge Runs when a change is rejected by the 1 MB limit.
 */
export function createEditor(parent, { theme, markdownMode, onUpdate, onTooLarge }) {
  const themeSlot = new Compartment();
  const languageSlot = new Compartment();
  const modeSlot = new Compartment();
  let currentTheme = theme;
  let currentMode = markdownMode;

  const extensions = (language) => [
    lineNumbers(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    highlightActiveLine(),
    EditorState.allowMultipleSelections.of(false),
    sizeLimit(onTooLarge),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    searchExtension(),
    baseTheme,
    themeSlot.of(themeExtension(currentTheme)),
    modeSlot.of(modeExtension(currentMode)),
    languageSlot.of(language),
    EditorView.updateListener.of(onUpdate),
  ];

  // Shown when no tab owns the view (while a tab loads, or with no tab open).
  // It is read-only, so no keystroke can go to the wrong document or nowhere.
  const blankState = () =>
    EditorState.create({
      extensions: [EditorView.editable.of(false), EditorState.readOnly.of(true), baseTheme, themeSlot.of(themeExtension(currentTheme))],
    });

  const view = new EditorView({ parent, state: blankState() });

  return {
    view,
    /**
     * @param {string} doc
     * @param {import('@codemirror/state').Extension} language From languageSupport in languages.js.
     */
    createState: (doc, language) => EditorState.create({ doc, extensions: extensions(language) }),
    /** Shows a tab's state. A stored state may have an older theme or mode. */
    show(state) {
      view.setState(state);
      view.dispatch({
        effects: [themeSlot.reconfigure(themeExtension(currentTheme)), modeSlot.reconfigure(modeExtension(currentMode))],
      });
    },
    /** Shows the read-only blank state. */
    showBlank: () => view.setState(blankState()),
    /** @param {'dark' | 'light'} next */
    setTheme(next) {
      currentTheme = next;
      view.dispatch({ effects: themeSlot.reconfigure(themeExtension(next)) });
    },
    /**
     * Switches Markdown between Visual and Raw. The text, undo history and
     * selection stay the same (MDV-3, MDV-6).
     * @param {'visual' | 'raw'} next
     */
    setMarkdownMode(next) {
      currentMode = next;
      view.dispatch({ effects: modeSlot.reconfigure(modeExtension(next)) });
    },
    /** @param {import('@codemirror/state').Extension} language */
    setLanguage(language) {
      view.dispatch({ effects: languageSlot.reconfigure(language) });
    },
    content: () => view.state.doc.toString(),
    focus: () => view.focus(),
  };
}
