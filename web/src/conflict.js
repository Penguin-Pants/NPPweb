// Conflict and deleted-elsewhere dialogs (CON-1, EDGE-1, T23). Autosave holds
// the document until the user chooses. Dialogs run one at a time.
import { choose } from './dialogs.js';
import { on } from './events.js';

const COPY_SUFFIX = ' (conflict copy)';

/** "<name> (conflict copy)", shortened so it fits the 255-character name rule. */
export function conflictCopyName(name) {
  return [...name].slice(0, 255 - COPY_SUFFIX.length).join('') + COPY_SUFFIX;
}

/**
 * @param {object} deps
 * @param {typeof import('./api.js').api} deps.api
 * @param {ReturnType<typeof import('./autosave.js').createAutosave>} deps.autosave
 * @param {ReturnType<typeof import('./tabs.js').createTabs>} deps.tabs
 * @param {(text: string) => void} deps.showMessage
 */
export function setupConflictHandling({ api, autosave, tabs, showMessage }) {
  let queue = Promise.resolve();
  const enqueue = (task) => {
    queue = queue.then(task, task);
  };

  /** Creates a document with my text and opens it in a new active tab. */
  async function saveAsNew(content, name) {
    const { status, data } = await api.createDocument(content, name);
    if (status !== 201) {
      showMessage('Could not save a new document. Try again.');
      return false;
    }
    await tabs.addDocument(data, content);
    return true;
  }

  async function resolveConflict(id, currentVersion) {
    const tab = tabs.get(id);
    if (!tab) return;
    await tabs.activate(id);
    const answer = await choose({
      title: 'This document changed on another device.',
      message: 'Your text was not saved. Choose what to do.',
      choices: [
        { value: 'overwrite', label: 'Overwrite with mine', kind: 'primary' },
        { value: 'load', label: 'Load the other version' },
        { value: 'copy', label: 'Save mine as a new document' },
      ],
      defaultValue: 'overwrite',
    });
    if (answer === 'overwrite') {
      // Another conflict emits doc-conflict again, which shows this dialog again.
      await autosave.resume(id, { version: currentVersion });
    } else if (answer === 'load') {
      if (!(await tabs.reloadFromServer(id))) enqueue(() => resolveConflict(id, currentVersion));
    } else if (await saveAsNew(tabs.content(id), conflictCopyName(tab.name))) {
      await tabs.reloadFromServer(id);
    } else {
      enqueue(() => resolveConflict(id, currentVersion));
    }
  }

  async function resolveDeleted(id) {
    const tab = tabs.get(id);
    if (!tab) return;
    await tabs.activate(id);
    const answer = await choose({
      title: 'This document was deleted on another device.',
      message: 'Your text is still here. Choose what to do.',
      choices: [
        { value: 'save', label: 'Save mine as a new document', kind: 'primary' },
        { value: 'discard', label: 'Discard and close', kind: 'danger' },
      ],
      defaultValue: 'save',
    });
    if (answer === 'discard') {
      tabs.removeTab(id);
      return;
    }
    // The old tab closes only after the new document is saved, so a failed
    // create keeps the text and asks again.
    if (await saveAsNew(tabs.content(id), tab.name)) tabs.removeTab(id);
    else enqueue(() => resolveDeleted(id));
  }

  on('doc-conflict', ({ id, currentVersion }) => enqueue(() => resolveConflict(id, currentVersion)));
  on('doc-deleted-remote', ({ id }) => enqueue(() => resolveDeleted(id)));
}
