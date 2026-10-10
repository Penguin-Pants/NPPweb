// Document list (DOC-4, T18) in a top-bar dropdown (LAY-3, LAY-4): name and
// last modified date, newest first. Open, rename and delete. Open closes the
// dropdown. Delete is permanent and closes the tab.
import { choose, formDialog } from './dialogs.js';
import { createDropdown } from './dropdown.js';
import { emit } from './events.js';

/**
 * @param {object} deps
 * @param {typeof import('./api.js').api} deps.api
 * @param {ReturnType<typeof import('./tabs.js').createTabs>} deps.tabs
 * @param {HTMLElement} deps.root Holds the button and the dropdown panel.
 * @param {HTMLButtonElement} deps.button The Documents button.
 * @param {HTMLElement} deps.panel The dropdown panel.
 * @param {(text: string) => void} deps.showMessage
 */
export function createDocList({ api, tabs, root, button, panel, showMessage }) {
  const list = document.createElement('ul');
  list.className = 'doc-rows';
  panel.append(list);
  const dropdown = createDropdown({
    root,
    button,
    panel,
    items: () => [...list.querySelectorAll('.doc-open')],
    onOpen: () => refresh(),
  });

  function row(doc) {
    const item = document.createElement('li');
    item.className = 'doc-row';
    item.dataset.id = doc.id;
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'doc-open';
    open.title = `Open ${doc.name}`;
    const name = document.createElement('span');
    name.className = 'doc-name';
    name.textContent = doc.name;
    const date = document.createElement('span');
    date.className = 'doc-date';
    date.textContent = new Date(doc.updatedAt).toLocaleString();
    open.append(name, date);
    open.dataset.action = 'open';
    open.addEventListener('click', () => {
      dropdown.close();
      tabs.open(doc.id, doc.name);
    });
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.textContent = 'Rename';
    rename.dataset.action = 'rename';
    rename.setAttribute('aria-label', `Rename ${doc.name}`);
    rename.addEventListener('click', () => renameDocument(doc));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger';
    remove.textContent = 'Delete';
    remove.dataset.action = 'delete';
    remove.setAttribute('aria-label', `Delete ${doc.name}`);
    remove.addEventListener('click', () => deleteDocument(doc));
    item.append(open, rename, remove);
    return item;
  }

  async function refresh() {
    if (!dropdown.isOpen()) return;
    const { status, data } = await api.listDocuments();
    if (status !== 200) return;
    // A re-render drops the focus, so it goes back to the same button of the
    // same row when that row is still there.
    const focused = /** @type {HTMLElement | null} */ (list.contains(document.activeElement) ? document.activeElement : null);
    const focusId = focused?.closest('.doc-row')?.getAttribute('data-id');
    const focusAction = focused?.dataset.action;
    if (data.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'doc-empty';
      empty.textContent = 'No documents yet.';
      list.replaceChildren(empty);
    } else {
      list.replaceChildren(...data.map(row));
    }
    if (focusId) {
      const again = [...list.querySelectorAll('.doc-row')].find((item) => item.getAttribute('data-id') === focusId);
      /** @type {HTMLElement | null | undefined} */ (again?.querySelector(`[data-action="${focusAction}"]`))?.focus();
    }
  }

  async function renameDocument(doc) {
    const result = await formDialog({
      title: 'Rename document',
      fields: [{ name: 'name', label: 'Name', value: doc.name }],
      submitLabel: 'Rename',
      onSubmit: async ({ name }) => {
        const { status, data } = await api.updateDocument(doc.id, { name });
        if (status === 200) {
          emit('doc-renamed', { id: doc.id, name: data.name });
          return null;
        }
        if (data?.error === 'invalid_name') return 'Use 1 to 255 characters and no control characters.';
        if (status === 404) return 'This document no longer exists.';
        if (status === 0) return 'Cannot connect to the server. Try again.';
        return 'Rename failed. Try again.';
      },
    });
    if (result === null) return;
    await refresh();
  }

  async function deleteDocument(doc) {
    const answer = await choose({
      title: 'Delete document',
      message: `Delete "${doc.name}" permanently? You cannot undo this.`,
      choices: [
        { value: 'delete', label: 'Delete permanently', kind: 'danger' },
        { value: 'cancel', label: 'Cancel' },
      ],
      defaultValue: 'cancel',
      cancelValue: 'cancel',
    });
    if (answer !== 'delete') return;
    // Close the tab first, so no pending save reaches the deleted document.
    tabs.removeTab(doc.id);
    const { status } = await api.deleteDocument(doc.id);
    if (status !== 204 && status !== 404) showMessage('Delete failed. Try again.');
    await refresh();
  }

  return {
    /** Opens the dropdown and reloads the list. */
    show: () => dropdown.open(),
    /** Reloads the list when the dropdown is open. */
    refresh,
  };
}
