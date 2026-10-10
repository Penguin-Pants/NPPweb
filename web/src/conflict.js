// Conflict and deleted-elsewhere dialogs (CON-1, EDGE-1, T23). Autosave holds
// the document until the user chooses. Dialogs run one at a time. Each choice
// runs while its dialog stays open, so nothing can be typed in between, and a
// failed step shows its error in the dialog instead of losing text.
import { choose } from './dialogs.js';
import { on } from './events.js';

const COPY_SUFFIX = ' (conflict copy)';

/** "<name> (conflict copy)", shortened so it fits the 255-character name rule. */
export function conflictCopyName(name) {
  return [...name].slice(0, 255 - COPY_SUFFIX.length).join('') + COPY_SUFFIX;
}

/** @param {number} status */
function failureText(status) {
  if (status === 401) return 'Your session ended. Sign in, then choose again.';
  if (status === 0) return 'Cannot connect to the server. Try again.';
  return 'That did not work. Try again.';
}

/**
 * @param {object} deps
 * @param {typeof import('./api.js').api} deps.api
 * @param {ReturnType<typeof import('./autosave.js').createAutosave>} deps.autosave
 * @param {ReturnType<typeof import('./tabs.js').createTabs>} deps.tabs
 */
export function setupConflictHandling({ api, autosave, tabs }) {
  let queue = Promise.resolve();
  const enqueue = (task) => {
    queue = queue.then(task, task);
  };

  async function resolveConflict(id, currentVersion) {
    const tab = tabs.get(id);
    if (!tab) return;
    await tabs.activate(id);
    // After the copy exists, a retry only reloads the original.
    let copied = false;
    await choose({
      title: 'This document changed on another device.',
      message: 'Your text was not saved. Choose what to do.',
      choices: [
        { value: 'copy', label: 'Save mine as a new document', kind: 'primary' },
        { value: 'load', label: 'Load the other version' },
        { value: 'overwrite', label: 'Overwrite with mine', kind: 'danger' },
      ],
      // The safe choice: Enter or Space while typing keeps both versions.
      defaultValue: 'copy',
      onChoose: async (choice) => {
        if (!tabs.get(id)) return null;
        if (choice === 'overwrite') {
          // Another conflict emits doc-conflict again, which queues this dialog again.
          await autosave.resume(id, { version: currentVersion });
          return null;
        }
        if (choice === 'copy' && !copied) {
          const mine = tabs.content(id);
          // The suffix hides the name extension, so the copy stores the language in use.
          const { status, data, stale } = await api.createDocument(mine, conflictCopyName(tab.name), tabs.languageOf(id));
          if (stale) return null;
          if (status !== 201) return failureText(status);
          copied = true;
          await tabs.addDocument(data, mine);
        }
        const status = await tabs.reloadFromServer(id);
        if (status === 200) return null;
        if (status === 404 && copied) {
          // The other version is gone too. My text is safe in the copy.
          tabs.removeTab(id);
          return null;
        }
        return status === 404 ? 'The other version was deleted. Save yours as a new document.' : failureText(status);
      },
    });
  }

  async function resolveDeleted(id) {
    const tab = tabs.get(id);
    if (!tab) return;
    await tabs.activate(id);
    await choose({
      title: 'This document was deleted on another device.',
      message: 'Your text is still here. Choose what to do.',
      choices: [
        { value: 'save', label: 'Save mine as a new document', kind: 'primary' },
        { value: 'discard', label: 'Discard and close', kind: 'danger' },
      ],
      defaultValue: 'save',
      onChoose: async (choice) => {
        if (!tabs.get(id)) return null;
        if (choice === 'discard') {
          tabs.removeTab(id);
          return null;
        }
        const mine = tabs.content(id);
        const { status, data, stale } = await api.createDocument(mine, tab.name, tab.language);
        if (stale) return null;
        if (status !== 201) return failureText(status);
        // The old tab closes only after the new document exists.
        await tabs.addDocument(data, mine);
        tabs.removeTab(id);
        return null;
      },
    });
  }

  on('doc-conflict', ({ id, currentVersion }) => enqueue(() => resolveConflict(id, currentVersion)));
  on('doc-deleted-remote', ({ id }) => enqueue(() => resolveDeleted(id)));
}
