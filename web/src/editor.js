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

/**
 * The language part of a state. T20 adds parsers. data-language on the
 * content element lets tests read the active language.
 * @param {string} name
 * @param {import('@codemirror/state').Extension} [support]
 */
export function languageExtension(name, support = []) {
  return [support, EditorView.contentAttributes.of({ 'data-language': name })];
}

/**
 * @param {HTMLElement} parent
 * @param {object} options
 * @param {'dark' | 'light'} options.theme
 * @param {(update: import('@codemirror/view').ViewUpdate) => void} options.onChange Runs on every document change.
 */
export function createEditor(parent, { theme, onChange }) {
  const themeSlot = new Compartment();
  const languageSlot = new Compartment();
  let currentTheme = theme;

  const extensions = (language) => [
    lineNumbers(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    highlightActiveLine(),
    EditorState.allowMultipleSelections.of(false),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    baseTheme,
    themeSlot.of(themeExtension(currentTheme)),
    languageSlot.of(language),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update);
    }),
  ];

  const view = new EditorView({ parent });

  return {
    view,
    /**
     * @param {string} doc
     * @param {import('@codemirror/state').Extension} [language]
     */
    createState: (doc, language = languageExtension('plain')) => EditorState.create({ doc, extensions: extensions(language) }),
    /** Shows a tab's state. A stored state may have an older theme. */
    show(state) {
      view.setState(state);
      view.dispatch({ effects: themeSlot.reconfigure(themeExtension(currentTheme)) });
    },
    /** @param {'dark' | 'light'} next */
    setTheme(next) {
      currentTheme = next;
      view.dispatch({ effects: themeSlot.reconfigure(themeExtension(next)) });
    },
    /** @param {import('@codemirror/state').Extension} language */
    setLanguage(language) {
      view.dispatch({ effects: languageSlot.reconfigure(language) });
    },
    content: () => view.state.doc.toString(),
    focus: () => view.focus(),
  };
}
