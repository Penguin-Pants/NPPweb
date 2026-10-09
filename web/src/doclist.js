// Document list sidebar (DOC-4, T18): name and last modified date, newest
// first. Open, rename and delete. Delete is permanent and closes the tab.
import { choose, formDialog } from './dialogs.js';
import { emit } from './events.js';

/**
 * @param {object} deps
 * @param {typeof import('./api.js').api} deps.api
 * @param {ReturnType<typeof import('./tabs.js').createTabs>} deps.tabs
 * @param {HTMLElement} deps.panel The sidebar element.
 * @param {HTMLButtonElement} deps.toggle The button that shows and hides it.
 * @param {(text: string) => void} deps.showMessage
 */
export function createDocList({ api, tabs, panel, toggle, showMessage }) {
  const heading = document.createElement('h2');
  heading.textContent = 'Documents';
  const list = document.createElement('ul');
  list.className = 'doc-rows';
  panel.append(heading, list);

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
    open.addEventListener('click', () => tabs.open(doc.id, doc.name));
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.textContent = 'Rename';
    rename.setAttribute('aria-label', `Rename ${doc.name}`);
    rename.addEventListener('click', () => renameDocument(doc));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger';
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', `Delete ${doc.name}`);
    remove.addEventListener('click', () => deleteDocument(doc));
    item.append(open, rename, remove);
    return item;
  }

  async function refresh() {
    if (panel.hidden) return;
    const { status, data } = await api.listDocuments();
    if (status !== 200) return;
    if (data.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'doc-empty';
      empty.textContent = 'No documents yet.';
      list.replaceChildren(empty);
    } else {
      list.replaceChildren(...data.map(row));
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

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) refresh();
  }
  toggle.addEventListener('click', () => setOpen(panel.hidden));

  return {
    /** Shows the sidebar and reloads the list. */
    show: () => setOpen(true),
    /** Reloads the list when the sidebar is open. */
    refresh,
  };
}
