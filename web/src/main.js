// Editor app entry: wires the modules together.
import { api } from './api.js';
import { createAutosave } from './autosave.js';
import { formDialog } from './dialogs.js';
import { createEditor, languageExtension } from './editor.js';
import { emit } from './events.js';
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
const accountButton = $('account-button');
const accountMenu = $('account-menu');
function setMenuOpen(open) {
  accountMenu.hidden = !open;
  accountButton.setAttribute('aria-expanded', String(open));
}
accountButton.addEventListener('click', () => setMenuOpen(accountMenu.hidden));
document.addEventListener('click', (event) => {
  if (!accountMenu.hidden && !accountButton.parentElement.contains(/** @type {Node} */ (event.target))) {
    setMenuOpen(false);
  }
});
accountMenu.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setMenuOpen(false);
    accountButton.focus();
  }
});

$('logout').addEventListener('click', async () => {
  setMenuOpen(false);
  const { status } = await api.logout();
  if (status === 204 || status === 401) location.replace('/login');
  else showMessage('Sign-out failed. Try again.');
});

$('change-password').addEventListener('click', async () => {
  setMenuOpen(false);
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
  languageFor: () => languageExtension('plain'),
  onActiveChange: renderSaveStatus,
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

$('new-doc').addEventListener('click', () => tabs.newDocument());
$('empty-new').addEventListener('click', () => tabs.newDocument());
// TD-15: clean tabs refresh when the window gets focus.
window.addEventListener('focus', () => tabs.refresh());
tabs.boot();
