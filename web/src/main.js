// Editor app entry: wires the modules together.
import { api } from './api.js';
import { createAutosave } from './autosave.js';
import { setupConflictHandling } from './conflict.js';
import { formDialog } from './dialogs.js';
import { createDocList } from './doclist.js';
import { createDropdown } from './dropdown.js';
import { createEditor } from './editor.js';
import { emit, on } from './events.js';
import { LANGUAGES } from './languages.js';
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
const editor = createEditor($('editor'), {
  theme: theme.get(),
  onChange: () => {
    const id = tabs.shownId();
    if (id) autosave.edited(id);
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
tabs = createTabs({
  editor,
  autosave,
  api,
  getStorage: () => localStorage,
  elements: { strip: $('tabstrip'), editor: $('editor'), empty: $('empty-state') },
  onActiveChange: () => {
    renderSaveStatus();
    renderLanguage();
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
// CON-1 and EDGE-1: a 412 or 404 save opens a dialog with the choices.
setupConflictHandling({ api, autosave, tabs });

// A rename can change the language when no override is set.
on('doc-renamed', ({ id, name }) => tabs.rename(id, name));

setupSessionRecovery({
  onSignedIn: () => {
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
