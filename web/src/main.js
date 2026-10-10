// Editor app entry: wires the modules together.
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { api } from './api.js';
import { createAutosave } from './autosave.js';
import { setupConflictHandling } from './conflict.js';
import { formDialog } from './dialogs.js';
import { createDocList } from './doclist.js';
import { createDropdown } from './dropdown.js';
import { createEditor } from './editor.js';
import { emit, on } from './events.js';
import { LANGUAGES } from './languages.js';
import { createCounter, headings, renderedText } from './markdown-text.js';
import { createToolbar } from './markdown-toolbar.js';
import { createOutline, formatCounts } from './outline.js';
import { createStoredChoice } from './stored-choice.js';
import { createOutlinePanel } from './outline-panel.js';
import { openFind, openReplace } from './search-panel.js';
import { modName, setupShortcuts } from './shortcuts.js';
import { setupSessionRecovery } from './session.js';
import { createTabs } from './tabs.js';
import { createTheme } from './theme.js';

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

// Theme (EDT-6).
const themeButton = $('theme-toggle');
const theme = createTheme({
  getStorage: () => localStorage,
  root: document.documentElement,
  onChange: (next) => {
    showTheme(next);
    editor.setTheme(next);
  },
});
function showTheme(current) {
  themeButton.textContent = current === 'dark' ? 'Light theme' : 'Dark theme';
}
showTheme(theme.get());
themeButton.addEventListener('click', () => theme.toggle());

// Status bar message for one-off notices.
let messageTimer;
function showMessage(text) {
  clearTimeout(messageTimer);
  $('status-message').textContent = text;
  messageTimer = setTimeout(() => ($('status-message').textContent = ''), 5000);
}

// Account menu.
const accountButton = /** @type {HTMLButtonElement} */ ($('account-button'));
const accountMenu = $('account-menu');
const account = createDropdown({
  root: accountButton.parentElement,
  button: accountButton,
  panel: accountMenu,
  items: () => [...accountMenu.querySelectorAll('button')],
});

// Outline panel (LAY-2, LAY-5).
createOutlinePanel({ getStorage: () => localStorage, root: document.documentElement, toggle: $('toggle-outline') });

$('logout').addEventListener('click', async () => {
  account.close();
  const { status } = await api.logout();
  if (status === 204 || status === 401) location.replace('/login');
  else showMessage('Sign-out failed. Try again.');
});

// Settings (SAV-2 to SAV-4): the autosave delay, one value on the server for
// every device. It is read at startup, after a re-login and when the dialog
// opens. The newest read or save wins, so a slow read cannot undo it.
let delayRequest = 0;
async function loadSettings() {
  const request = (delayRequest += 1);
  const result = await api.getSettings();
  if (result.status === 200 && request === delayRequest) autosave.setDelay(result.data.autosaveSeconds * 1000);
  return result;
}
$('settings').addEventListener('click', async () => {
  account.close();
  const current = await loadSettings();
  if (current.status !== 200) {
    showMessage('Could not load the settings. Try again.');
    return;
  }
  await formDialog({
    title: 'Settings',
    fields: [{ name: 'seconds', label: 'Autosave delay in seconds (1 to 60)', value: String(current.data.autosaveSeconds) }],
    submitLabel: 'Save',
    onSubmit: async ({ seconds }) => {
      // The server checks the rule (whole number, 1 to 60). '' becomes 0 and
      // text becomes NaN, which it rejects too.
      const { status, data } = await api.saveSettings({ autosaveSeconds: Number(seconds.trim()) });
      if (status === 200) {
        delayRequest += 1;
        autosave.setDelay(data.autosaveSeconds * 1000);
        return null;
      }
      if (data?.error === 'invalid_autosave_seconds') return 'Use a whole number from 1 to 60.';
      if (status === 0) return 'Cannot connect to the server. Try again.';
      return 'Saving the settings failed. Try again.';
    },
  });
});

$('change-password').addEventListener('click', async () => {
  account.close();
  const changed = await formDialog({
    title: 'Change password',
    fields: [
      { name: 'current', label: 'Current password', type: 'password', autocomplete: 'current-password' },
      { name: 'next', label: 'New password (12 to 256 characters)', type: 'password', autocomplete: 'new-password' },
      { name: 'confirm', label: 'New password again', type: 'password', autocomplete: 'new-password' },
    ],
    submitLabel: 'Change password',
    onSubmit: async ({ current, next, confirm }) => {
      if (next !== confirm) return 'The new passwords are not the same.';
      const { status, data } = await api.changePassword(current, next);
      if (status === 204) return null;
      if (data?.error === 'wrong_current_password') return 'The current password is wrong.';
      if (data?.error === 'weak_password') return 'The new password must have 12 to 256 characters.';
      if (status === 0) return 'Cannot connect to the server. Try again.';
      return 'Password change failed. Try again.';
    },
  });
  if (changed) showMessage('Password changed. Other devices are signed out.');
});

// Editor, autosave and tabs.
/** @type {ReturnType<typeof createTabs>} */
let tabs;
// Markdown mode (MDV-1, MDV-2): one mode for every Markdown tab, per browser.
const markdownMode = createStoredChoice({
  getStorage: () => localStorage,
  key: 'pn.markdownMode',
  values: ['visual', 'raw'],
  onChange: (next) => {
    editor.setMarkdownMode(next);
    renderMarkdownUi();
  },
});
const editor = createEditor($('editor'), {
  theme: theme.get(),
  markdownMode: markdownMode.get(),
  onUpdate: (update) => {
    if (update.docChanged) {
      const id = tabs.shownId();
      if (id) autosave.edited(id);
    }
    if (update.selectionSet) outline.setActive(update.state.selection.main.head);
    if (update.docChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) scheduleTotals();
    if (update.docChanged || update.selectionSet) scheduleSelection();
  },
  // DOC-8, EDGE-3: the edit is not applied, so the content stays unchanged.
  onTooLarge: () => showMessage('Document limit is 1 MB. The change was not applied.'),
});
const autosave = createAutosave({
  save: (id, content, version) => api.saveContent(id, content, version),
  onStatus: () => {
    tabs.render();
    renderSaveStatus();
  },
  onEvent: emit,
});
loadSettings();
tabs = createTabs({
  editor,
  autosave,
  api,
  getStorage: () => localStorage,
  elements: { strip: $('tabstrip'), editor: $('editor'), empty: $('empty-state') },
  onActiveChange: () => {
    renderSaveStatus();
    renderLanguage();
    renderMarkdownUi();
    // The tab paints first; outline and counts follow 100 ms later.
    outline.show(undefined);
    scheduleTotals();
    scheduleSelection();
  },
  showMessage,
});

// Save status label (DOC-3) for the active tab. Until T23, a conflict or a
// remote delete only shows an error and keeps the text.
const ERROR_TEXT = {
  network: 'Save failed. Retrying.',
  conflict: 'Not saved: changed on another device.',
  deleted: 'Not saved: deleted on another device.',
  'too-large': 'Not saved: larger than 1 MB.',
};
const STATUS_TEXT = { saved: 'Saved', unsaved: 'Unsaved changes', saving: 'Saving...' };
function renderSaveStatus() {
  const label = $('save-status');
  const id = tabs.active()?.id;
  const status = id ? autosave.status(id) : undefined;
  label.dataset.status = status ?? '';
  label.textContent = status === 'error' ? ERROR_TEXT[autosave.reason(id)] : (STATUS_TEXT[status] ?? '');
}

// Language selector (EDT-4): Auto plus the 11 languages. The choice is stored
// with the document, so it follows it to other devices.
const languageSelect = document.createElement('select');
languageSelect.setAttribute('aria-label', 'Language');
languageSelect.append(new Option('Auto (detected)', ''), ...LANGUAGES.map(({ id, label }) => new Option(label, id)));
$('language-slot').append(languageSelect);
function renderLanguage() {
  const tab = tabs.active();
  languageSelect.hidden = !tab;
  if (!tab) return;
  languageSelect.value = tab.language ?? '';
  const detected = LANGUAGES.find(({ id }) => id === tabs.languageOf(tab.id))?.label;
  languageSelect.title = `Language: ${detected}`;
}
languageSelect.addEventListener('change', async () => {
  const tab = tabs.active();
  if (!tab) return;
  if (!(await tabs.setLanguage(tab.id, languageSelect.value || null))) {
    showMessage('Could not change the language. Try again.');
    renderLanguage();
  }
});
// Mode toggle and formatting toolbar, on Markdown tabs only (MDV-1, MDV-9).
const modeButton = $('mode-toggle');
const toolbar = $('md-toolbar');
createToolbar({ element: toolbar, getView: () => (tabs.shownId() ? editor.view : null), modName: modName() });
function renderMarkdownUi() {
  const tab = tabs.active();
  const isMarkdown = tab !== null && tabs.languageOf(tab.id) === 'markdown';
  modeButton.hidden = !isMarkdown;
  toolbar.hidden = !isMarkdown;
  modeButton.setAttribute('aria-pressed', String(markdownMode.get() === 'visual'));
}
// The editor keeps its cursor across a toggle (MDV-6), so the focus goes back to it.
modeButton.addEventListener('click', () => {
  markdownMode.toggle();
  if (tabs.shownId()) editor.focus();
});

// Outline (OUT-1 to OUT-6) and counts (CNT-1 to CNT-7) of the shown tab. They
// read the editor's own syntax tree, which parses in the background, and
// refresh 100 ms after the last change. Totals and the selection refresh apart,
// so moving the cursor never recounts a long document.
const outline = createOutline({
  element: $('outline-body'),
  onSelect: (pos) => {
    editor.view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start' }) });
    editor.focus();
  },
});
const countButton = $('count-syntax');
const countSyntax = createStoredChoice({
  getStorage: () => localStorage,
  key: 'pn.countSyntax',
  values: ['excluded', 'included'],
  onChange: () => {
    refreshTotals();
    refreshSelection();
  },
});
countButton.addEventListener('click', () => countSyntax.toggle());
const countTotals = createCounter();
const countSelection = createCounter();

/** The shown tab's state, and its Markdown tree once parsed to the end. */
function shownInfo() {
  const tab = tabs.active();
  if (!tab || tabs.shownId() !== tab.id) return null;
  const { state } = editor.view;
  const markdown = tabs.languageOf(tab.id) === 'markdown';
  const tree = markdown ? ensureSyntaxTree(state, state.doc.length, 40) : null;
  return { state, markdown, tree, exclude: markdown && countSyntax.get() === 'excluded' };
}

let totalsTimer;
let selectionTimer;
function scheduleTotals() {
  clearTimeout(totalsTimer);
  totalsTimer = setTimeout(refreshTotals, 100);
}
function scheduleSelection() {
  clearTimeout(selectionTimer);
  selectionTimer = setTimeout(refreshSelection, 100);
}

function refreshTotals() {
  const info = shownInfo();
  countButton.hidden = !info?.markdown; // CNT-4
  countButton.setAttribute('aria-pressed', String(countSyntax.get() === 'included'));
  if (!info) {
    outline.show(undefined);
    $('counts').textContent = '';
    return;
  }
  if (info.markdown && !info.tree) {
    scheduleTotals(); // Still parsing: the next try continues the parse.
    return;
  }
  const text = info.state.doc.toString();
  outline.show(info.markdown ? headings(text, info.tree) : null);
  outline.setActive(info.state.selection.main.head);
  $('counts').textContent = formatCounts(countTotals(info.exclude ? renderedText(text, info.tree) : text));
}

function refreshSelection() {
  const info = shownInfo();
  const label = $('selection-counts');
  const range = info?.state.selection.main;
  if (!info || range.empty) {
    label.hidden = true;
    return;
  }
  if (info.exclude && !info.tree) {
    scheduleSelection();
    return;
  }
  const part = info.exclude
    ? renderedText(info.state.doc.toString(), info.tree, range.from, range.to)
    : info.state.sliceDoc(range.from, range.to);
  label.hidden = false;
  label.textContent = `Selection: ${formatCounts(countSelection(part))}`;
}

// CON-1 and EDGE-1: a 412 or 404 save opens a dialog with the choices.
setupConflictHandling({ api, autosave, tabs });

// A rename can change the language when no override is set.
on('doc-renamed', ({ id, name }) => tabs.rename(id, name));

setupSessionRecovery({
  onSignedIn: () => {
    loadSettings();
    autosave.resumeAll();
    tabs.refresh();
  },
});

// EDGE-2: warn before the page closes with text that is not saved.
window.addEventListener('beforeunload', (event) => {
  if (!autosave.hasUnsaved()) return;
  event.preventDefault();
  event.returnValue = '';
});

const doclist = createDocList({
  api,
  tabs,
  root: $('doclist-menu'),
  button: /** @type {HTMLButtonElement} */ ($('toggle-doclist')),
  panel: $('doclist'),
  showMessage,
});

$('new-doc').addEventListener('click', () => tabs.newDocument());
$('empty-new').addEventListener('click', () => tabs.newDocument());
$('empty-list').addEventListener('click', () => doclist.show());
$('find').addEventListener('click', () => tabs.shownId() && openFind(editor.view));

// Shortcuts (EDT-7, EDT-9). Ctrl+N and Ctrl+W reach the page only in the
// installed app window. Alt+N and Alt+W work everywhere.
setupShortcuts({
  new: () => tabs.newDocument(),
  close: () => {
    const tab = tabs.active();
    if (tab) tabs.close(tab.id);
  },
  save: () => {
    const id = tabs.shownId();
    if (id) autosave.flush(id);
  },
  find: () => tabs.shownId() && openFind(editor.view),
  replace: () => tabs.shownId() && openReplace(editor.view),
});
$('new-doc').title = `New document (${modName()}+N in the installed app, Alt+N)`;
$('find').title = `Find (${modName()}+F) and replace (${modName()}+H)`;
// TD-15: clean tabs and the open document list refresh on window focus.
window.addEventListener('focus', () => {
  tabs.refresh();
  doclist.refresh();
});
tabs.boot();
